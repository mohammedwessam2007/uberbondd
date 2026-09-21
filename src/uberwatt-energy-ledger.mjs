import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { normalizeComputeOffer } from './compute-sovereignty.mjs';

export const UBERWATT_SCHEMA = 'uberbond.uberwatt.v0.1.0';
export const KWH_TO_JOULES = 3_600_000;

const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value, max = 1000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const finite = (value, min = -Number.MAX_VALUE, max = Number.MAX_VALUE) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
};
const iso = value => {
  const ms = Date.parse(String(value ?? ''));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};
const round = (value, places = 6) => Number(Number(value).toFixed(places));

function fail(reasonCodes, status = 'UBERWATT_BLOCKED', extra = {}) {
  return {
    ok: false,
    schemaVersion: UBERWATT_SCHEMA,
    status,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

export function compileMeterInterval({
  start = {},
  end = {},
  period = 'other',
  occupants = null,
  acSetpointsC = [],
  outsideTempC = null,
  evidenceRefs = []
} = {}) {
  const startAt = iso(start.at);
  const endAt = iso(end.at);
  const startKWh = finite(start.cumulativeKWh, 0, 10_000_000);
  const endKWh = finite(end.cumulativeKWh, 0, 10_000_000);
  const periodName = text(period, 80)?.toLowerCase();
  const residentCount = occupants == null ? null : integer(occupants, 0, 100);
  const outdoor = outsideTempC == null ? null : finite(outsideTempC, -80, 80);
  const refs = Array.isArray(evidenceRefs)
    ? [...new Set(evidenceRefs.map(ref => text(ref, 1000)).filter(Boolean))].slice(0, 32)
    : [];
  const setpoints = Array.isArray(acSetpointsC)
    ? acSetpointsC.map(value => finite(value, 10, 40)).filter(value => value != null).slice(0, 16)
    : [];

  const reasons = [];
  if (!startAt || !endAt || Date.parse(endAt) <= Date.parse(startAt)) reasons.push('ordered-start-end-times-required');
  if (startKWh == null || endKWh == null) reasons.push('valid-cumulative-meter-readings-required');
  if (startKWh != null && endKWh != null && endKWh < startKWh) reasons.push('meter-reading-regression-refused');
  if (!periodName) reasons.push('period-required');
  if (occupants != null && residentCount == null) reasons.push('valid-occupant-count-required');
  if (!refs.length) reasons.push('meter-evidence-reference-required');
  if (reasons.length) return fail(reasons, 'UBERWATT_INTERVAL_REJECTED');

  const hours = (Date.parse(endAt) - Date.parse(startAt)) / 3_600_000;
  if (hours <= 0 || hours > 72) return fail(['interval-duration-out-of-range'], 'UBERWATT_INTERVAL_REJECTED');

  const consumptionKWh = endKWh - startKWh;
  const core = {
    startAt,
    endAt,
    startKWh,
    endKWh,
    consumptionKWh: round(consumptionKWh),
    hours: round(hours),
    averageWatts: round((consumptionKWh * 1000) / hours, 3),
    period: periodName,
    occupants: residentCount,
    acSetpointsC: setpoints,
    outsideTempC: outdoor,
    evidenceRefs: refs
  };
  return {
    ok: true,
    schemaVersion: UBERWATT_SCHEMA,
    status: 'UBERWATT_INTERVAL_MEASURED',
    intervalId: `uberwatt_interval_${digest(core).slice(0, 24)}`,
    ...core,
    truthBoundary: 'THIS_IS_A_METER_DELTA. IT_MEASURES_HOUSEHOLD_ELECTRICITY_CONSUMPTION; IT_DOES_NOT_IDENTIFY_WHICH_APPLIANCE_CAUSED_IT.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function compileComparableBaseline({ intervals = [], minimumIntervals = 3 } = {}) {
  const minimum = integer(minimumIntervals, 3, 30);
  if (!minimum) return fail(['minimum-baseline-intervals-must-be-at-least-3'], 'UBERWATT_BASELINE_REJECTED');
  if (!Array.isArray(intervals) || intervals.length < minimum) {
    return fail(['at-least-3-measured-intervals-required'], 'UBERWATT_BASELINE_INSUFFICIENT', {
      observedIntervals: Array.isArray(intervals) ? intervals.length : 0,
      requiredIntervals: minimum
    });
  }

  const valid = intervals.filter(item => item?.ok === true && item?.status === 'UBERWATT_INTERVAL_MEASURED');
  if (valid.length < minimum) return fail(['enough-valid-measured-intervals-required'], 'UBERWATT_BASELINE_INSUFFICIENT');

  const periods = [...new Set(valid.map(item => item.period))];
  const occupants = [...new Set(valid.map(item => item.occupants).filter(value => value != null))];
  if (periods.length !== 1) return fail(['baseline-periods-must-match'], 'UBERWATT_BASELINE_NOT_COMPARABLE');
  if (occupants.length > 1) return fail(['baseline-occupancy-must-match'], 'UBERWATT_BASELINE_NOT_COMPARABLE');

  const values = valid.map(item => item.consumptionKWh).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const outdoorValues = valid.map(item => item.outsideTempC).filter(value => value != null);
  const meanOutsideTempC = outdoorValues.length === valid.length
    ? outdoorValues.reduce((sum, value) => sum + value, 0) / outdoorValues.length
    : null;

  const core = {
    intervalIds: valid.map(item => item.intervalId),
    intervalCount: valid.length,
    period: periods[0],
    occupants: occupants.length ? occupants[0] : null,
    baselineKWh: round(median),
    meanKWh: round(mean),
    meanOutsideTempC: meanOutsideTempC == null ? null : round(meanOutsideTempC, 3),
    baselineMethod: 'MEDIAN_OF_COMPARABLE_INTERVALS'
  };
  return {
    ok: true,
    schemaVersion: UBERWATT_SCHEMA,
    status: 'UBERWATT_BASELINE_READY',
    baselineId: `uberwatt_baseline_${digest(core).slice(0, 24)}`,
    ...core,
    truthBoundary: 'THE_BASELINE_IS_A_COMPARISON_REFERENCE_NOT_CAUSAL_PROOF. WEATHER_OCCUPANCY_AND_BEHAVIOR_CAN_CONFOUND_THE_DELTA.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function compileEnergyBackedComputeBudget({
  interval,
  baseline,
  conservativeJoulesPerOutputToken = 0.40,
  efficientJoulesPerOutputToken = 0.15,
  weatherToleranceC = 3
} = {}) {
  if (interval?.ok !== true || interval?.status !== 'UBERWATT_INTERVAL_MEASURED') {
    return fail(['measured-interval-required'], 'UBERWATT_BUDGET_REJECTED');
  }
  if (baseline?.ok !== true || baseline?.status !== 'UBERWATT_BASELINE_READY') {
    return fail(['comparable-baseline-required'], 'UBERWATT_BUDGET_REJECTED');
  }
  if (interval.period !== baseline.period) return fail(['interval-period-must-match-baseline'], 'UBERWATT_BUDGET_NOT_COMPARABLE');
  if (baseline.occupants != null && interval.occupants != null && interval.occupants !== baseline.occupants) {
    return fail(['interval-occupancy-must-match-baseline'], 'UBERWATT_BUDGET_NOT_COMPARABLE');
  }

  const conservative = finite(conservativeJoulesPerOutputToken, 0.000001, 1_000_000);
  const efficient = finite(efficientJoulesPerOutputToken, 0.000001, 1_000_000);
  const tolerance = finite(weatherToleranceC, 0, 20);
  if (conservative == null || efficient == null || tolerance == null || efficient > conservative) {
    return fail(['valid-energy-per-token-range-required'], 'UBERWATT_BUDGET_REJECTED');
  }

  const baselineDeltaKWh = Math.max(0, baseline.baselineKWh - interval.consumptionKWh);
  const joules = baselineDeltaKWh * KWH_TO_JOULES;
  const hasWeatherPair = baseline.meanOutsideTempC != null && interval.outsideTempC != null;
  const weatherDeltaC = hasWeatherPair ? Math.abs(baseline.meanOutsideTempC - interval.outsideTempC) : null;
  const comparisonQuality = !hasWeatherPair
    ? 'PROVISIONAL_NO_WEATHER_CONTROL'
    : weatherDeltaC <= tolerance
      ? 'WEATHER_COMPARABLE'
      : 'PROVISIONAL_WEATHER_MISMATCH';

  const core = {
    intervalId: interval.intervalId,
    baselineId: baseline.baselineId,
    baselineKWh: baseline.baselineKWh,
    observedKWh: interval.consumptionKWh,
    baselineDeltaKWh: round(baselineDeltaKWh),
    energyBudgetKWh: round(baselineDeltaKWh),
    energyBudgetJoules: round(joules, 3),
    conservativeJoulesPerOutputToken: conservative,
    efficientJoulesPerOutputToken: efficient,
    tokenEnergyEquivalentLow: Math.floor(joules / conservative),
    tokenEnergyEquivalentHigh: Math.floor(joules / efficient),
    comparisonQuality,
    weatherDeltaC: weatherDeltaC == null ? null : round(weatherDeltaC, 3)
  };

  return {
    ok: true,
    schemaVersion: UBERWATT_SCHEMA,
    status: baselineDeltaKWh > 0 ? 'UBERWATT_ENERGY_BUDGET_OBSERVED' : 'UBERWATT_NO_POSITIVE_ENERGY_BUDGET',
    budgetId: `uberwatt_budget_${digest(core).slice(0, 24)}`,
    ...core,
    actualLocalInferenceTokens: 0,
    claimClass: 'MEASURED_BASELINE_DELTA_NOT_CAUSAL_SAVINGS_PROOF',
    truthBoundary: 'TOKEN_ENERGY_EQUIVALENTS_ARE_PHYSICS_COMPARISONS_ONLY. THEY_ARE_NOT_API_CREDITS_PROVIDER_QUOTA_OR_GENERATED_TOKENS. ACTUAL_LOCAL_TOKEN_CAPACITY_REQUIRES_A_REAL_HARDWARE_MODEL_ENERGY_BENCHMARK.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function compileEnergyBackedLocalComputeOffer({
  budget,
  benchmark,
  taskClasses = ['general'],
  contextTokens = 4096,
  quality = 0.5,
  reliability = 0.5,
  latencyScore = 0.5
} = {}) {
  if (budget?.ok !== true || budget?.energyBudgetKWh <= 0) {
    return fail(['positive-energy-budget-required'], 'UBERWATT_LOCAL_COMPUTE_NOT_PROVEN');
  }

  const provider = text(benchmark?.provider ?? 'local', 100)?.toLowerCase();
  const model = text(benchmark?.model, 200);
  const revision = text(benchmark?.revision, 300);
  const measuredAt = iso(benchmark?.measuredAt);
  const sourceRef = text(benchmark?.sourceRef, 1000);
  const outputTokens = integer(benchmark?.outputTokens, 1, 100_000_000_000);
  const energyKWh = finite(benchmark?.energyKWh, 0.000001, 1_000_000);

  if (!provider || !model || !revision || !measuredAt || !sourceRef || outputTokens == null || energyKWh == null) {
    return fail(['real-local-inference-benchmark-required'], 'UBERWATT_LOCAL_COMPUTE_NOT_PROVEN');
  }

  const tokensPerKWh = outputTokens / energyKWh;
  const usableTokens = Math.floor(tokensPerKWh * budget.energyBudgetKWh);
  if (usableTokens < 1) return fail(['benchmark-implies-zero-usable-token-capacity'], 'UBERWATT_LOCAL_COMPUTE_NOT_PROVEN');

  const normalized = normalizeComputeOffer({
    provider,
    model,
    revision,
    rightsClass: 'LOCAL_OWNED',
    acquisitionMode: 'LOCAL_OWNED',
    sourceRef: `${sourceRef}#energy-budget:${budget.budgetId}`,
    verifiedAt: measuredAt,
    contextTokens,
    usableTokens,
    costCents: 0,
    quality,
    reliability,
    latencyScore,
    taskClasses
  });

  if (!normalized.ok) {
    return fail(normalized.reasonCodes || ['compute-sovereignty-offer-rejected'], 'UBERWATT_LOCAL_COMPUTE_NOT_PROVEN', {
      computeSovereignty: normalized
    });
  }

  return {
    ok: true,
    schemaVersion: UBERWATT_SCHEMA,
    status: 'UBERWATT_LOCAL_COMPUTE_CAPACITY_ESTIMATED_FROM_MEASURED_BENCHMARK',
    budgetId: budget.budgetId,
    benchmark: {
      provider,
      model,
      revision,
      measuredAt,
      sourceRef,
      outputTokens,
      energyKWh,
      tokensPerKWh: round(tokensPerKWh, 3)
    },
    energyBudgetKWh: budget.energyBudgetKWh,
    estimatedUsableTokens: usableTokens,
    computeOffer: normalized,
    truthBoundary: 'THIS_IS_AN_ENERGY_BOUNDED_CAPACITY_ESTIMATE_FROM_A_MEASURED_LOCAL_BENCHMARK. TOKENS_ARE_NOT_PREGENERATED_AND_REAL_THROUGHPUT_CAN_CHANGE_WITH_CONTEXT_SETTINGS_LOAD_THERMALS_AND_HARDWARE_STATE.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}
