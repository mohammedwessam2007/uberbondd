import crypto from 'node:crypto';

export const COMMAND_CENTER_UI_EVOLUTION_POLICY = 'uberbond.command-center-ui-evolution.v1';
export const COMMAND_CENTER_UI_PROMOTION_AUTHORITY = 'REVIEW_PR_ONLY';

const METRICS = Object.freeze(['usability', 'performance', 'accessibility', 'truthIntegrity']);
const HARD_FLOORS = Object.freeze({ usability: 0.72, performance: 0.70, accessibility: 0.86, truthIntegrity: 1 });
const WEIGHTS = Object.freeze({ usability: 0.32, performance: 0.18, accessibility: 0.20, truthIntegrity: 0.30 });

function finite01(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

export function uiEvolutionFingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

export function normalizeUiBenchmark(input = {}) {
  const out = {};
  for (const metric of METRICS) out[metric] = finite01(input?.[metric]);
  return out;
}

export function scoreUiBenchmark(input = {}) {
  const metrics = normalizeUiBenchmark(input);
  if (METRICS.some(metric => metrics[metric] === null)) return null;
  return Number(METRICS.reduce((sum, metric) => sum + metrics[metric] * WEIGHTS[metric], 0).toFixed(4));
}

export function evaluateUiCandidate({ baseline, candidate, candidateId, evidenceRefs = [] } = {}) {
  const base = normalizeUiBenchmark(baseline);
  const next = normalizeUiBenchmark(candidate);
  const reasonCodes = [];
  if (!candidateId || typeof candidateId !== 'string') reasonCodes.push('candidate-id-required');
  for (const metric of METRICS) {
    if (base[metric] === null) reasonCodes.push(`baseline-metric-invalid:${metric}`);
    if (next[metric] === null) reasonCodes.push(`candidate-metric-invalid:${metric}`);
    if (next[metric] !== null && next[metric] < HARD_FLOORS[metric]) reasonCodes.push(`hard-floor-failed:${metric}`);
  }
  if (base.truthIntegrity !== null && next.truthIntegrity !== null && next.truthIntegrity < base.truthIntegrity) reasonCodes.push('truth-integrity-regression');
  if (base.accessibility !== null && next.accessibility !== null && next.accessibility < base.accessibility - 0.02) reasonCodes.push('accessibility-regression');
  const baselineScore = scoreUiBenchmark(base);
  const candidateScore = scoreUiBenchmark(next);
  if (baselineScore !== null && candidateScore !== null && candidateScore < baselineScore) reasonCodes.push('weighted-score-regression');
  const accepted = reasonCodes.length === 0;
  const decision = accepted ? 'ELIGIBLE_FOR_REVIEW_PR' : 'REJECTED';
  const receipt = {
    schemaVersion: COMMAND_CENTER_UI_EVOLUTION_POLICY,
    candidateId: typeof candidateId === 'string' ? candidateId : null,
    decision,
    promotionAuthority: COMMAND_CENTER_UI_PROMOTION_AUTHORITY,
    baseline: base,
    candidate: next,
    baselineScore,
    candidateScore,
    evidenceRefs: Array.isArray(evidenceRefs) ? evidenceRefs.filter(ref => typeof ref === 'string').slice(0, 32) : [],
    reasonCodes,
    baselineFingerprint: uiEvolutionFingerprint(base),
    candidateFingerprint: uiEvolutionFingerprint(next),
    rollback: {
      required: accepted,
      strategy: accepted ? 'REVERT_REVIEWED_SOURCE_CHANGE_AND_RESTORE_BASELINE_FINGERPRINT' : 'NONE',
      targetFingerprint: accepted ? uiEvolutionFingerprint(base) : null
    },
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE'
  };
  return Object.freeze(receipt);
}

export function assertReviewOnlyPromotion(receipt) {
  return Boolean(receipt && receipt.decision === 'ELIGIBLE_FOR_REVIEW_PR' && receipt.promotionAuthority === COMMAND_CENTER_UI_PROMOTION_AUTHORITY && receipt.rollback?.required === true);
}
