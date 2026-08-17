// Converts an outcome into a weighted learning record. Cleared money must
// always outrank engagement signals -- opens must never outrank money.
// Synthetic outcomes are tracked in a completely separate aggregate from
// real ones; they can never blend into or inflate real commercial truth,
// no matter how many synthetic runs accumulate.
export const REVENUE_WEIGHTED_LEARNING_POLICY_VERSION = 'revenue-weighted-learning-1.0.0';

// Ordered highest to lowest weight. Index position IS the ranking --
// tested directly so a future edit can't silently invert the hierarchy.
export const OUTCOME_HIERARCHY = Object.freeze([
  'CLEARED_RECURRING_CONTRIBUTION_MARGIN',
  'CLEARED_PAYMENT',
  'ACCEPTED_DELIVERY',
  'QUALIFIED_OPPORTUNITY',
  'POSITIVE_REPLY',
  'CLICK_OPEN'
]);

const BASE_WEIGHT = Object.fromEntries(OUTCOME_HIERARCHY.map((type, index) => [type, OUTCOME_HIERARCHY.length - index]));

export function deriveLearningRecord({ outcomeType, isSynthetic = false, magnitude = 1, date = new Date() } = {}) {
  const referenceDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  if (!OUTCOME_HIERARCHY.includes(outcomeType)) {
    return { ok: false, reason: `unknown-outcome-type:${outcomeType}`, policyVersion: REVENUE_WEIGHTED_LEARNING_POLICY_VERSION };
  }
  const boundedMagnitude = Number.isFinite(Number(magnitude)) ? Math.max(0, Number(magnitude)) : 1;
  const weight = BASE_WEIGHT[outcomeType] * boundedMagnitude;
  return {
    ok: true, policyVersion: REVENUE_WEIGHTED_LEARNING_POLICY_VERSION, timestamp: referenceDate.toISOString(),
    outcomeType, weight, isSynthetic: Boolean(isSynthetic),
    // A synthetic record's weight is real (needed to test the pipeline's
    // own math) but it is TAGGED so aggregateLearning can never mix it
    // into the real total -- see below.
    truthClass: isSynthetic ? 'SYNTHETIC_TEST_FIXTURE' : 'REAL'
  };
}

// Never returns a single blended number. `real` and `synthetic` are always
// reported separately -- a caller who only reads `.real` can never
// accidentally include synthetic weight, structurally, not by convention.
export function aggregateLearning(records = []) {
  const valid = records.filter(r => r?.ok);
  const real = valid.filter(r => r.truthClass === 'REAL');
  const synthetic = valid.filter(r => r.truthClass === 'SYNTHETIC_TEST_FIXTURE');
  const sum = list => list.reduce((total, r) => total + r.weight, 0);
  return {
    policyVersion: REVENUE_WEIGHTED_LEARNING_POLICY_VERSION,
    real: { totalWeight: sum(real), count: real.length },
    synthetic: { totalWeight: sum(synthetic), count: synthetic.length }
  };
}
