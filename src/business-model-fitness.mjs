// Evidence-gated business-model fitness and death-detector review.
//
// The detector is deliberately conservative: it can recommend HOLD, EXPAND
// REVIEW, or SHRINK/KILL REVIEW, but it never kills a model, reallocates
// capital, changes an offer, or treats a missing metric as failure. It consumes
// only normalized commercial-learning summaries.

import crypto from 'node:crypto';

export const BUSINESS_FITNESS_POLICY_VERSION = 'business-fitness-1.0.0';
export const BUSINESS_FITNESS_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

function atDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function number(value) {
  if (value == null || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function integer(value) {
  if (value == null || value === '') return null;
  const result = Number(value);
  return Number.isInteger(result) ? result : null;
}

function failed(reasonCodes, timestamp) {
  return {
    ok: false,
    policyVersion: BUSINESS_FITNESS_POLICY_VERSION,
    status: 'REVIEW_REQUIRED',
    timestamp,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    externalEffectLedger: { ...BUSINESS_FITNESS_EXTERNAL_EFFECTS }
  };
}

export function evaluateBusinessModelFitness({
  modelId,
  learningSummary,
  sampleSizeMin = 3,
  thresholds = {},
  date = new Date()
} = {}) {
  const reference = atDate(date);
  const timestamp = reference.toISOString();
  const cleanModelId = text(modelId, 120);
  if (!cleanModelId) return failed(['model-id-required'], timestamp);
  const metrics = learningSummary?.metrics;
  if (!metrics || typeof metrics !== 'object') return {
    ok: true,
    policyVersion: BUSINESS_FITNESS_POLICY_VERSION,
    fitnessId: `fitness_${digest({ cleanModelId, timestamp }).slice(0, 24)}`,
    modelId: cleanModelId,
    status: 'NOT_MEASURED',
    decision: 'HOLD_FOR_EVIDENCE',
    reasonCodes: ['learning-summary-required'],
    sample: { verifiedPayments: 0, minimum: Math.max(1, Number(sampleSizeMin) || 3) },
    metrics: {},
    kill: { status: 'NOT_ELIGIBLE', automatic: false },
    externalEffectLedger: { ...BUSINESS_FITNESS_EXTERNAL_EFFECTS }
  };

  const minimum = Math.max(1, Math.min(100, Number.isInteger(sampleSizeMin) ? sampleSizeMin : 3));
  const clearedPayments = Math.max(0, integer(metrics.clearedPaymentCount) || 0);
  const netCashImpactCents = integer(metrics.netCashImpactCents);
  const marginPerMinute = number(metrics.contributionProfitPerOwnerMinuteCents);
  const minMarginPerMinute = number(thresholds.minContributionProfitPerOwnerMinuteCents) ?? null;
  const knownMargin = integer(metrics.knownContributionMarginCents);
  const flags = [];
  if (clearedPayments >= minimum && netCashImpactCents != null && netCashImpactCents < 0) flags.push('negative-net-cash-impact');
  if (clearedPayments >= minimum && knownMargin != null && knownMargin < 0) flags.push('negative-known-contribution-margin');
  if (clearedPayments >= minimum && minMarginPerMinute != null && marginPerMinute != null && marginPerMinute < minMarginPerMinute) flags.push('below-owner-efficiency-threshold');
  const enoughEvidence = clearedPayments >= minimum;
  const decision = !enoughEvidence
    ? 'HOLD_FOR_EVIDENCE'
    : flags.length ? 'SHRINK_OR_KILL_REVIEW' : 'EXPAND_REVIEW';
  return {
    ok: true,
    policyVersion: BUSINESS_FITNESS_POLICY_VERSION,
    fitnessId: `fitness_${digest({ cleanModelId, timestamp, metrics, thresholds }).slice(0, 24)}`,
    modelId: cleanModelId,
    timestamp,
    status: enoughEvidence ? 'MEASURED_LOCAL_OUTCOMES' : 'INSUFFICIENT_SAMPLE',
    decision,
    reasonCodes: flags.length ? flags : ['no-measured-failure-flag'],
    sample: { verifiedPayments: clearedPayments, minimum, sufficient: enoughEvidence },
    metrics: {
      netCashImpactCents,
      knownContributionMarginCents: knownMargin,
      contributionProfitPerOwnerMinuteCents: marginPerMinute,
      contributionMarginStatus: text(metrics.contributionMarginStatus, 100) || 'UNKNOWN',
      recurringEvidence: metrics.recurringEvidence ?? 'UNKNOWN'
    },
    kill: {
      status: flags.length && enoughEvidence ? 'KILL_CANDIDATE_REQUIRES_OWNER_REVIEW' : 'NOT_ELIGIBLE',
      automatic: false,
      reason: flags.length ? 'Measured negative or below-threshold evidence exists, but no automatic kill is authorized.' : 'No sufficiently supported kill signal.'
    },
    capital: { allocation: 'NOT_AUTHORIZED', spendCents: 0 },
    externalEffectLedger: { ...BUSINESS_FITNESS_EXTERNAL_EFFECTS }
  };
}

export function compilePortfolioReview({ fitnessResults = [], date = new Date() } = {}) {
  const reference = atDate(date);
  const timestamp = reference.toISOString();
  if (!Array.isArray(fitnessResults)) return failed(['fitness-results-array-required'], timestamp);
  const selected = fitnessResults.filter(item => item?.ok === true && item.modelId).slice(0, 100);
  return {
    ok: true,
    policyVersion: BUSINESS_FITNESS_POLICY_VERSION,
    reviewId: `portfolio_${digest({ timestamp, ids: selected.map(item => item.modelId).sort() }).slice(0, 24)}`,
    timestamp,
    status: selected.length ? 'REVIEW_READY' : 'NO_MEASURED_MODELS',
    rows: selected.map(item => ({ modelId: item.modelId, status: item.status, decision: item.decision, reasonCodes: item.reasonCodes, automaticAction: 'NONE' })),
    ownerAuthority: 'REQUIRED_FOR_EXPAND_SHRINK_KILL',
    externalEffectLedger: { ...BUSINESS_FITNESS_EXTERNAL_EFFECTS }
  };
}

export async function logBusinessFitnessReceipt(store, type, detail) {
  if (!store || typeof store.log !== 'function' || !detail?.ok) return null;
  return store.log(type, {
    policyVersion: detail.policyVersion,
    fitnessId: detail.fitnessId || null,
    reviewId: detail.reviewId || null,
    modelId: detail.modelId || null,
    status: detail.status,
    decision: detail.decision || null,
    reasonCodes: detail.reasonCodes || [],
    sample: detail.sample || null,
    metrics: detail.metrics || null,
    kill: detail.kill || null,
    rows: detail.rows || [],
    timestamp: detail.timestamp || null,
    externalEffectLedger: detail.externalEffectLedger
  });
}
