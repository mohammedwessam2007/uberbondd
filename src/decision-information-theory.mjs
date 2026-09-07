// Decision Information Theory: whether more information is worth buying with
// time, attention, money, compute, or option decay.
//
// The dangerous implementation is a universal life-utility function. UberBond
// does not get to invent an exchange rate between meaning, relationships,
// health, money and freedom. This module therefore performs arithmetic only
// when the caller explicitly states a common unit AND the basis that makes the
// terms commensurable for this decision. Otherwise the value boundary remains
// visible and no scalar answer is produced.
export const DECISION_INFORMATION_THEORY_VERSION = 'uberbond.decision-information-theory.v1';

const ENOUGH = 'ENOUGH__EXPECTED_VALUE_OF_MORE_INFORMATION_IS_LOWER_THAN_ACQUISITION_DELAY_AND_OPTION_DECAY';
const text = (value, max = 300) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const finite = value => Number.isFinite(Number(value));
const nonNegative = value => finite(value) && Number(value) >= 0;
const fail = (reasonCodes, extra = {}) => ({
  ok: false,
  status: 'DECISION_INFORMATION_REFUSED',
  reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
  highestRung: 'RECOMMENDATION',
  businessEffectAuthority: 'NONE',
  ...extra
});

/**
 * Expected value of acquiring one more information tranche.
 *
 * All four quantities must already share one caller-declared unit. The module
 * never performs currency conversion, life-value weighting, or a hidden
 * normalization. `comparabilityBasis` is mandatory because a label such as
 * "points" without an account of what made the terms comparable is precision
 * theatre wearing a unit costume.
 */
export function valueOfInformation({
  expectedDecisionImprovement,
  acquisitionCost = 0,
  delayCost = 0,
  optionDecay = 0,
  unit = null,
  comparabilityBasis = null,
  information = null
} = {}) {
  const reasons = [];
  if (!nonNegative(expectedDecisionImprovement)) reasons.push('expected-decision-improvement-must-be-finite-and-nonnegative');
  if (!nonNegative(acquisitionCost)) reasons.push('acquisition-cost-must-be-finite-and-nonnegative');
  if (!nonNegative(delayCost)) reasons.push('delay-cost-must-be-finite-and-nonnegative');
  if (!nonNegative(optionDecay)) reasons.push('option-decay-must-be-finite-and-nonnegative');
  const commonUnit = text(unit, 80);
  if (!commonUnit) reasons.push('common-comparable-unit-required');
  const basis = text(comparabilityBasis, 500);
  if (!basis) reasons.push('comparability-basis-required');
  if (reasons.length) return fail(reasons);

  const improvement = Number(expectedDecisionImprovement);
  const costs = {
    acquisition: Number(acquisitionCost),
    delay: Number(delayCost),
    optionDecay: Number(optionDecay)
  };
  const totalCost = costs.acquisition + costs.delay + costs.optionDecay;
  const netValue = improvement - totalCost;
  const acquire = netValue > 0;

  return {
    ok: true,
    status: acquire ? 'ACQUIRE_INFORMATION' : 'STOP_INFORMATION_ACQUISITION',
    state: acquire ? 'ANSWERABLE' : ENOUGH,
    information: text(information, 500),
    unit: commonUnit,
    comparabilityBasis: basis,
    expectedDecisionImprovement: improvement,
    costs,
    totalCost,
    netValue,
    recommendation: acquire ? 'ACQUIRE_INFORMATION' : 'ENOUGH',
    highestRung: 'RECOMMENDATION',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'POSITIVE_VOI_IS_A_RECOMMENDATION_TO_GATHER_INFORMATION__NOT_AUTHORITY_TO_SPEND_CALL_ACT_OR_DELAY'
  };
}

/**
 * Prediction Half-Life.
 *
 * This decays the weight deserved by an evidence snapshot as it ages. It does
 * not claim the forecast probability itself halves: probabilities can move in
 * either direction when reality changes. The output is deliberately named
 * `remainingEvidenceWeight` so staleness cannot masquerade as a new forecast.
 */
export function predictionHalfLife({
  initialEvidenceWeight = 1,
  observedAt,
  halfLifeMs,
  now = new Date()
} = {}) {
  const weight = Number(initialEvidenceWeight);
  const halfLife = Number(halfLifeMs);
  const observed = Date.parse(observedAt);
  const current = new Date(now).getTime();
  const reasons = [];
  if (!Number.isFinite(weight) || weight < 0 || weight > 1) reasons.push('initial-evidence-weight-must-be-between-zero-and-one');
  if (!Number.isFinite(halfLife) || halfLife <= 0) reasons.push('positive-half-life-required');
  if (!Number.isFinite(observed)) reasons.push('valid-observed-at-required');
  if (!Number.isFinite(current)) reasons.push('valid-now-required');
  if (Number.isFinite(observed) && Number.isFinite(current) && current < observed) reasons.push('now-cannot-precede-observation');
  if (reasons.length) return fail(reasons);

  const ageMs = current - observed;
  const elapsedHalfLives = ageMs / halfLife;
  const remainingEvidenceWeight = weight * Math.pow(0.5, elapsedHalfLives);
  return {
    ok: true,
    status: 'PREDICTION_HALF_LIFE_ASSESSED',
    observedAt: new Date(observed).toISOString(),
    at: new Date(current).toISOString(),
    ageMs,
    halfLifeMs: halfLife,
    elapsedHalfLives,
    initialEvidenceWeight: weight,
    remainingEvidenceWeight,
    businessEffectAuthority: 'NONE',
    truthBoundary: 'EVIDENCE_WEIGHT_DECAY_IS_NOT_A_REVISED_FORECAST_PROBABILITY'
  };
}

/** Decision Shelf Life: whether the decision packet itself is still timely. */
export function decisionShelfLife({ validFrom, expiresAt, now = new Date() } = {}) {
  const start = Date.parse(validFrom);
  const end = Date.parse(expiresAt);
  const current = new Date(now).getTime();
  const reasons = [];
  if (!Number.isFinite(start)) reasons.push('valid-from-required');
  if (!Number.isFinite(end)) reasons.push('expires-at-required');
  if (!Number.isFinite(current)) reasons.push('valid-now-required');
  if (Number.isFinite(start) && Number.isFinite(end) && end <= start) reasons.push('expiry-must-follow-valid-from');
  if (reasons.length) return fail(reasons);

  const status = current < start ? 'NOT_YET_VALID' : current >= end ? 'EXPIRED' : 'ACTIVE';
  return {
    ok: true,
    status: 'DECISION_SHELF_LIFE_ASSESSED',
    freshness: status,
    validFrom: new Date(start).toISOString(),
    expiresAt: new Date(end).toISOString(),
    at: new Date(current).toISOString(),
    remainingMs: status === 'ACTIVE' ? end - current : 0,
    ageMs: current > start ? current - start : 0,
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Compose the three checks without converting any recommendation into choice or
 * authority. Expired decisions must be rebuilt before VOI can license waiting;
 * stale evidence can be explicitly refreshed when the caller supplies the
 * minimum evidence weight its decision requires.
 */
export function compileDecisionInformation({ voi = null, prediction = null, shelfLife = null, minimumEvidenceWeight = null } = {}) {
  if (!voi?.ok) return fail(['valid-value-of-information-required']);
  if (shelfLife && !shelfLife.ok) return fail(['valid-decision-shelf-life-required']);
  if (prediction && !prediction.ok) return fail(['valid-prediction-half-life-required']);

  if (shelfLife?.freshness === 'EXPIRED') {
    return {
      ok: true, status: 'REBUILD_DECISION', state: 'DECISION_SHELF_LIFE_EXPIRED',
      voi, prediction, shelfLife,
      recommendation: 'REBUILD_DECISION_BEFORE_ACTING',
      highestRung: 'RECOMMENDATION', businessEffectAuthority: 'NONE'
    };
  }

  if (prediction && minimumEvidenceWeight !== null) {
    const minimum = Number(minimumEvidenceWeight);
    if (!Number.isFinite(minimum) || minimum < 0 || minimum > 1) return fail(['minimum-evidence-weight-must-be-between-zero-and-one']);
    if (prediction.remainingEvidenceWeight < minimum) {
      return {
        ok: true, status: 'REFRESH_EVIDENCE', state: 'PREDICTION_EVIDENCE_STALE',
        voi, prediction, shelfLife,
        minimumEvidenceWeight: minimum,
        recommendation: 'REFRESH_EVIDENCE_BEFORE_RELYING_ON_FORECAST',
        highestRung: 'RECOMMENDATION', businessEffectAuthority: 'NONE'
      };
    }
  }

  return {
    ok: true,
    status: 'DECISION_INFORMATION_COMPILED',
    state: voi.state,
    voi,
    prediction,
    shelfLife,
    recommendation: voi.recommendation,
    highestRung: 'RECOMMENDATION',
    businessEffectAuthority: 'NONE'
  };
}
