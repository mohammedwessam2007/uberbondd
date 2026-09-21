import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { normalizeComputeOffer } from './compute-sovereignty.mjs';

export const UBERWATT_SCHEMA = 'uberbond.uberwatt.v0.1.0';
export const DEFAULT_JOULES_PER_OUTPUT_TOKEN = Object.freeze({ conservative: 0.40, efficient: 0.15 });

const clone = value => structuredClone(value);
const zeroEffects = () => clone(ZERO_EXTERNAL_EFFECTS);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const finite = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const text = (value, max = 1000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
function fail(reasonCodes, status = 'UBERWATT_OBSERVATION_REJECTED', extra = {}) {
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

export function compileEnergyInterval({
  startKwh,
  endKwh,
  startAt,
  endAt,
  sourceRef = 'manual:official-meter-display',
  periodClass = 'other',
  occupants = null,
  acSetpointsC = [],
  notes = null
} = {}) {
  const start = finite(startKwh, 0, 10_000_000);
  const end = finite(endKwh, 0, 10_000_000);
  const startMs = Date.parse(String(startAt || ''));
  const endMs = Date.parse(String(endAt || ''));
  const source = text(sourceRef, 1500);
  const klass = text(periodClass, 80)?.toLowerCase();
  const people = occupants == null ? null : finite(occupants, 0, 100);
  const setpoints = Array.isArray(acSetpointsC)
    ? acSetpointsC.map(value => finite(value, 10, 40)).filter(value => value != null).slice(0, 16)
    : [];
  const reasons = [];
  if (start == null || end == null) reasons.push('finite-meter-readings-required');
  if (start != null && end != null && end < start) reasons.push('meter-reading-must-not-decrease');
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) reasons.push('valid-increasing-observation-times-required');
  if (!source) reasons.push('meter-source-reference-required');
  if (!klass) reasons.push('period-class-required');
  if (occupants != null && people == null) reasons.push('valid-occupant-count-required');
  if (reasons.length) return fail(reasons);
  const elapsedHours = (endMs - startMs) / 3_600_000;
  if (elapsedHours > 168) return fail(['interval-too-long-for-v0']);
  const consumedKwh = end - start;
  const core = {
    startKwh: start,
    endKwh: end,
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(endMs).toISOString(),
    elapsedHours,
    consumedKwh,
    averageKw: elapsedHours > 0 ? consumedKwh / elapsedHours : 0,
    sourceRef: source,
    periodClass: klass,
    occupants: people,
    acSetpointsC: setpoints,
    notes: text(notes, 2000)
  };
  return {
    ok: true,
    schemaVersion: UBERWATT_SCHEMA,
    status: 'UBERWATT_INTERVAL_OBSERVED',
    observationId: `uberwatt_interval_${digest(core).slice(0, 24)}`,
    ...core,
    truthBoundary: 'OBSERVED KWH IS METER-DIFFERENCE EVIDENCE ONLY. APPLIANCE ATTRIBUTION REQUIRES SEPARATE EVIDENCE.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function compileVerifiedSavings({ interval, baselineKwh = null, baselineRef = null } = {}) {
  if (!interval?.ok || interval.status !== 'UBERWATT_INTERVAL_OBSERVED') return fail(['valid-observed-interval-required'], 'UBERWATT_SAVINGS_BLOCKED');
  if (baselineKwh == null) {
    return {
      ok: true,
      schemaVersion: UBERWATT_SCHEMA,
      status: 'UBERWATT_BASELINE_NOT_ESTABLISHED',
      intervalId: interval.observationId,
      consumedKwh: interval.consumedKwh,
      baselineKwh: null,
      savedKwh: null,
      truthBoundary: 'NO BASELINE MEANS NO SAVINGS CLAIM. OBSERVATION CONTINUES WITHOUT INVENTING A COUNTERFACTUAL.',
      businessEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects()
    };
  }
  const baseline = finite(baselineKwh, 0, 100_000);
  const ref = text(baselineRef, 1500);
  if (baseline == null || !ref) return fail(['finite-baseline-and-provenance-required'], 'UBERWATT_SAVINGS_BLOCKED');
  const rawDelta = baseline - interval.consumedKwh;
  const savedKwh = Math.max(0, rawDelta);
  return {
    ok: true,
    schemaVersion: UBERWATT_SCHEMA,
    status: 'UBERWATT_SAVINGS_COMPILED',
    intervalId: interval.observationId,
    consumedKwh: interval.consumedKwh,
    baselineKwh: baseline,
    baselineRef: ref,
    savedKwh,
    aboveBaselineKwh: Math.max(0, -rawDelta),
    truthBoundary: 'SAVED_KWH IS A BASELINE-RELATIVE COUNTERFACTUAL. BASELINE QUALITY MUST BE REVIEWED BEFORE ECONOMIC OR COMPUTE CLAIMS.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function compileEnergyEquivalentCompute({
  savedKwh,
  conservativeJoulesPerOutputToken = DEFAULT_JOULES_PER_OUTPUT_TOKEN.conservative,
  efficientJoulesPerOutputToken = DEFAULT_JOULES_PER_OUTPUT_TOKEN.efficient,
  evidenceRef = null
} = {}) {
  const energy = finite(savedKwh, 0, 1_000_000);
  const conservative = finite(conservativeJoulesPerOutputToken, 0.000001, 1_000_000);
  const efficient = finite(efficientJoulesPerOutputToken, 0.000001, 1_000_000);
  const ref = text(evidenceRef, 1500);
  const reasons = [];
  if (energy == null) reasons.push('finite-saved-kwh-required');
  if (conservative == null || efficient == null || efficient > conservative) reasons.push('valid-joules-per-token-range-required');
  if (!ref) reasons.push('energy-model-evidence-reference-required');
  if (reasons.length) return fail(reasons, 'UBERWATT_ENERGY_EQUIVALENCE_BLOCKED');
  const joules = energy * 3_600_000;
  const lowerOutputTokens = Math.floor(joules / conservative);
  const upperOutputTokens = Math.floor(joules / efficient);
  return {
    ok: true,
    schemaVersion: UBERWATT_SCHEMA,
    status: 'UBERWATT_ENERGY_EQUIVALENCE_COMPILED',
    savedKwh: energy,
    joules,
    lowerOutputTokens,
    upperOutputTokens,
    conservativeJoulesPerOutputToken: conservative,
    efficientJoulesPerOutputToken: efficient,
    evidenceRef: ref,
    actualLocalTokens: null,
    providerCredits: null,
    truthBoundary: 'ENERGY-EQUIVALENT TOKENS ARE A PHYSICS COMPARISON ONLY. THEY ARE NOT API CREDITS, PROVIDER QUOTA, OR MEASURED LOCAL INFERENCE.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function compileMeasuredLocalInference({
  model,
  revision,
  outputTokens,
  inputTokens = 0,
  energyKwh,
  durationSeconds,
  sourceRef
} = {}) {
  const m = text(model, 200);
  const rev = text(revision, 300);
  const out = Number(outputTokens);
  const input = Number(inputTokens);
  const energy = finite(energyKwh, 0.000001, 1_000_000);
  const duration = finite(durationSeconds, 0.001, 365 * 24 * 3600);
  const ref = text(sourceRef, 1500);
  const reasons = [];
  if (!m || !rev) reasons.push('model-and-revision-required');
  if (!Number.isSafeInteger(out) || out <= 0 || !Number.isSafeInteger(input) || input < 0) reasons.push('measured-token-counts-required');
  if (energy == null || duration == null) reasons.push('measured-energy-and-duration-required');
  if (!ref) reasons.push('runtime-measurement-source-required');
  if (reasons.length) return fail(reasons, 'UBERWATT_LOCAL_INFERENCE_REJECTED');
  const joules = energy * 3_600_000;
  return {
    ok: true,
    schemaVersion: UBERWATT_SCHEMA,
    status: 'UBERWATT_LOCAL_INFERENCE_MEASURED',
    model: m,
    revision: rev,
    inputTokens: input,
    outputTokens: out,
    totalTokens: input + out,
    energyKwh: energy,
    durationSeconds: duration,
    outputTokensPerSecond: out / duration,
    joulesPerOutputToken: joules / out,
    averageWatts: joules / duration,
    sourceRef: ref,
    truthBoundary: 'ACTUAL LOCAL TOKENS REQUIRE RUNTIME COUNTERS PLUS MEASURED ENERGY. ESTIMATES MUST NOT BE PROMOTED INTO THIS RECEIPT.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function compileContinuousPowerBudget({ savedKwh, periodHours } = {}) {
  const energy = finite(savedKwh, 0, 1_000_000);
  const hours = finite(periodHours, 0.001, 10 * 365 * 24);
  if (energy == null || hours == null) return fail(['finite-energy-and-period-required'], 'UBERWATT_POWER_BUDGET_BLOCKED');
  return {
    ok: true,
    schemaVersion: UBERWATT_SCHEMA,
    status: 'UBERWATT_CONTINUOUS_POWER_BUDGET_COMPILED',
    savedKwh: energy,
    periodHours: hours,
    equivalentContinuousWatts: energy * 1000 / hours,
    truthBoundary: 'THIS IS AN ENERGY BUDGET EQUIVALENCE. IT DOES NOT GUARANTEE HARDWARE AVAILABILITY, UPTIME, MODEL SPEED, OR TOKEN OUTPUT.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}


export function compileComparableBaseline({ intervals = [], minimumIntervals = 3 } = {}) {
  const minimum = Number(minimumIntervals);
  if (!Number.isSafeInteger(minimum) || minimum < 3 || minimum > 30) {
    return fail(['baseline-minimum-must-be-integer-3-to-30'], 'UBERWATT_BASELINE_REJECTED');
  }
  if (!Array.isArray(intervals) || intervals.length < minimum) {
    return fail(['at-least-3-observed-intervals-required'], 'UBERWATT_BASELINE_INSUFFICIENT', {
      observedIntervals: Array.isArray(intervals) ? intervals.length : 0,
      requiredIntervals: minimum
    });
  }

  const valid = intervals.filter(item => item?.ok === true && item?.status === 'UBERWATT_INTERVAL_OBSERVED');
  if (valid.length < minimum) {
    return fail(['enough-valid-observed-intervals-required'], 'UBERWATT_BASELINE_INSUFFICIENT', {
      validIntervals: valid.length,
      requiredIntervals: minimum
    });
  }

  const periods = [...new Set(valid.map(item => item.periodClass))];
  const occupants = [...new Set(valid.map(item => item.occupants).filter(value => value != null))];
  if (periods.length !== 1) return fail(['baseline-period-classes-must-match'], 'UBERWATT_BASELINE_NOT_COMPARABLE');
  if (occupants.length > 1) return fail(['baseline-occupancy-must-match'], 'UBERWATT_BASELINE_NOT_COMPARABLE');

  const values = valid.map(item => item.consumedKwh).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const median = values.length % 2
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const core = {
    intervalIds: valid.map(item => item.observationId),
    sourceRefs: [...new Set(valid.map(item => item.sourceRef))],
    intervalCount: valid.length,
    periodClass: periods[0],
    occupants: occupants.length ? occupants[0] : null,
    baselineKwh: median,
    meanKwh: mean,
    method: 'MEDIAN_OF_COMPARABLE_OBSERVED_INTERVALS'
  };

  return {
    ok: true,
    schemaVersion: UBERWATT_SCHEMA,
    status: 'UBERWATT_COMPARABLE_BASELINE_COMPILED',
    baselineId: `uberwatt_baseline_${digest(core).slice(0, 24)}`,
    baselineRef: `uberwatt:baseline:${digest(core).slice(0, 32)}`,
    ...core,
    truthBoundary: 'THIS BASELINE IS A ROBUST COMPARISON REFERENCE, NOT CAUSAL PROOF OF SAVINGS. WEATHER, OCCUPANCY DETAIL AND BEHAVIOR CAN STILL CONFOUND THE DELTA.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function compileEnergyBackedLocalComputeOffer({
  energyEquivalent,
  benchmark,
  taskClasses = ['general'],
  contextTokens = 4096,
  quality = 0.5,
  reliability = 0.5,
  latencyScore = 0.5,
  estimatedIncrementalCostCents = 0
} = {}) {
  if (energyEquivalent?.ok !== true || energyEquivalent?.status !== 'UBERWATT_ENERGY_EQUIVALENCE_COMPILED' || !(energyEquivalent.savedKwh > 0)) {
    return fail(['positive-energy-equivalent-budget-required'], 'UBERWATT_LOCAL_COMPUTE_CAPACITY_NOT_PROVEN');
  }
  if (benchmark?.ok !== true || benchmark?.status !== 'UBERWATT_LOCAL_INFERENCE_MEASURED') {
    return fail(['measured-local-inference-benchmark-required'], 'UBERWATT_LOCAL_COMPUTE_CAPACITY_NOT_PROVEN');
  }

  const tokensPerKwh = benchmark.outputTokens / benchmark.energyKwh;
  if (!Number.isFinite(tokensPerKwh) || tokensPerKwh <= 0) {
    return fail(['valid-measured-output-tokens-per-kwh-required'], 'UBERWATT_LOCAL_COMPUTE_CAPACITY_NOT_PROVEN');
  }
  const usableTokens = Math.floor(tokensPerKwh * energyEquivalent.savedKwh);
  if (usableTokens < 1) {
    return fail(['energy-budget-implies-zero-token-capacity'], 'UBERWATT_LOCAL_COMPUTE_CAPACITY_NOT_PROVEN');
  }

  const normalized = normalizeComputeOffer({
    provider: 'local',
    model: benchmark.model,
    revision: benchmark.revision,
    rightsClass: 'LOCAL_OWNED',
    acquisitionMode: 'LOCAL_OWNED',
    sourceRef: benchmark.sourceRef,
    verifiedAt: new Date().toISOString(),
    contextTokens,
    usableTokens,
    costCents: estimatedIncrementalCostCents,
    quality,
    reliability,
    latencyScore,
    taskClasses
  });

  if (!normalized.ok) {
    return fail(normalized.reasonCodes || ['compute-sovereignty-offer-rejected'], 'UBERWATT_LOCAL_COMPUTE_CAPACITY_NOT_PROVEN', {
      computeSovereignty: normalized
    });
  }

  return {
    ok: true,
    schemaVersion: UBERWATT_SCHEMA,
    status: 'UBERWATT_LOCAL_COMPUTE_CAPACITY_ESTIMATED',
    energyEvidenceRef: energyEquivalent.evidenceRef,
    savedKwh: energyEquivalent.savedKwh,
    benchmarkRef: benchmark.sourceRef,
    benchmarkModel: benchmark.model,
    benchmarkRevision: benchmark.revision,
    benchmarkOutputTokens: benchmark.outputTokens,
    benchmarkEnergyKwh: benchmark.energyKwh,
    measuredOutputTokensPerKwh: tokensPerKwh,
    estimatedUsableTokens: usableTokens,
    computeOffer: normalized,
    truthBoundary: 'THIS IS AN ENERGY-BOUNDED CAPACITY ESTIMATE FROM A REAL LOCAL INFERENCE BENCHMARK. TOKENS ARE NOT PRE-GENERATED. HARDWARE AMORTIZATION, THERMALS, CONTEXT, SETTINGS AND OTHER SYSTEM COSTS MAY CHANGE REAL CAPACITY AND TOTAL COST.',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}
