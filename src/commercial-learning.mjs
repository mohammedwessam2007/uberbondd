// Evidence-gated commercial learning over normalized outcome receipts.
//
// This is an aggregation and memory layer, not a revenue ledger, allocator,
// or promotion engine. It only gives economic weight to receipts that have
// already passed commercial-outcome.mjs and the existing payment truth policy.
// Observations remain useful for counts, but never become revenue by inference.

import crypto from 'node:crypto';

export const COMMERCIAL_LEARNING_POLICY_VERSION = 'commercial-learning-1.0.0';

const MAX_OUTCOMES = 500;
const MAX_GROUPS = 100;
const ZERO_EXTERNAL_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

function referenceDate(value) {
  const candidate = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function integerCents(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function lineageOf(outcome = {}) {
  const lineage = outcome.lineage && typeof outcome.lineage === 'object' ? outcome.lineage : {};
  return {
    signalId: String(lineage.signalId || outcome.signalId || '').trim() || null,
    opportunityId: String(lineage.opportunityId || outcome.opportunityId || '').trim() || null,
    experimentId: String(lineage.experimentId || outcome.experimentId || '').trim() || null,
    channelId: String(lineage.channelId || outcome.channelId || '').trim() || null
  };
}

function outcomeKey(outcome = {}) {
  return String(outcome.outcomeId || outcome.eventId || '').trim();
}

function comparableOutcome(outcome = {}) {
  const lineage = lineageOf(outcome);
  return {
    key: outcomeKey(outcome),
    status: String(outcome.status || '').trim(),
    truthLevel: String(outcome.truthLevel || '').trim(),
    outcomeType: String(outcome.outcomeType || '').trim(),
    occurredAt: String(outcome.occurredAt || '').trim(),
    lineage,
    paymentProof: outcome.paymentProof ? {
      providerEventId: String(outcome.paymentProof.providerEventId || '').trim(),
      amountCents: integerCents(outcome.paymentProof.amountCents),
      currency: String(outcome.paymentProof.currency || '').trim().toUpperCase()
    } : null,
    contributionMarginCents: integerCents(outcome.contributionMarginCents),
    ownerMinutes: finiteNumber(outcome.ownerMinutes),
    economicImpactCents: integerCents(outcome.economicImpactCents)
  };
}

function isVerifiedReceipt(outcome = {}) {
  if (!outcome || typeof outcome !== 'object' || outcome.ok === false) return false;
  const truthLevel = String(outcome.truthLevel || '').trim();
  const paymentProof = outcome.paymentProof;
  const amountCents = integerCents(paymentProof?.amountCents);
  const currency = String(paymentProof?.currency || '').trim().toUpperCase();
  const providerEventId = String(paymentProof?.providerEventId || '').trim();
  if (!paymentProof || amountCents == null || amountCents <= 0 || !/^[A-Z]{3}$/.test(currency) || !providerEventId) return false;
  if (truthLevel === 'CLEARED_PAYMENT') {
    return ['RECORDED_CLEARED_PAYMENT', 'RECORDED_PAYMENT'].includes(String(outcome.status || '').trim()) || !outcome.status;
  }
  if (truthLevel === 'REFUND_OR_DISPUTE') {
    const impact = integerCents(outcome.economicImpactCents);
    return impact != null && impact < 0 && ['RECORDED_REFUND_OR_DISPUTE', 'RECORDED_REFUND', 'RECORDED_DISPUTE'].includes(String(outcome.status || '').trim());
  }
  return false;
}

function matchesScope(lineage, scope = {}) {
  for (const field of ['opportunityId', 'experimentId', 'channelId']) {
    if (scope[field] != null && String(scope[field]) !== String(lineage[field] || '')) return false;
  }
  return true;
}

function groupKey(lineage) {
  return ['opportunityId', 'experimentId', 'channelId']
    .map(field => `${field}=${lineage[field] || '-'}`)
    .join('|');
}

function blankAccumulator(lineage = {}) {
  return {
    lineage: {
      opportunityId: lineage.opportunityId || null,
      experimentId: lineage.experimentId || null,
      channelId: lineage.channelId || null
    },
    observedOutcomeCount: 0,
    verifiedOutcomeCount: 0,
    clearedPaymentCount: 0,
    refundOrDisputeCount: 0,
    ignoredObservationCount: 0,
    rejectedOutcomeCount: 0,
    grossClearedRevenueCents: 0,
    refundOrDisputeCents: 0,
    netCashImpactCents: 0,
    knownContributionMarginCents: 0,
    knownContributionMarginCount: 0,
    unknownContributionMarginCount: 0,
    knownOwnerMinutes: 0,
    knownOwnerMinutesCount: 0,
    unknownOwnerMinutesCount: 0,
    contributionProfitPerOwnerMinuteCents: null,
    contributionMarginStatus: 'UNKNOWN',
    quality: 'NO_VERIFIED_OUTCOMES'
  };
}

function finalizeAccumulator(accumulator) {
  const hasVerified = accumulator.verifiedOutcomeCount > 0;
  const hasRefundOrDispute = accumulator.refundOrDisputeCount > 0;
  const allClearedHaveMargin = accumulator.clearedPaymentCount > 0
    && accumulator.unknownContributionMarginCount === 0
    && accumulator.knownContributionMarginCount === accumulator.clearedPaymentCount;
  const allClearedHaveMinutes = accumulator.clearedPaymentCount > 0
    && accumulator.unknownOwnerMinutesCount === 0
    && accumulator.knownOwnerMinutesCount === accumulator.clearedPaymentCount;

  accumulator.quality = hasVerified ? 'MEASURED_LOCAL_RECEIPTS' : 'NO_VERIFIED_OUTCOMES';
  if (!hasVerified) {
    accumulator.contributionMarginStatus = 'UNKNOWN';
    return accumulator;
  }
  if (hasRefundOrDispute) {
    accumulator.contributionMarginStatus = allClearedHaveMargin
      ? 'KNOWN_BEFORE_REFUNDS_UNKNOWN_AFTER_REFUNDS'
      : 'UNKNOWN_AFTER_REFUND_OR_DISPUTE';
  } else if (allClearedHaveMargin) {
    accumulator.contributionMarginStatus = 'KNOWN_FOR_CLEARED_PAYMENTS';
  } else {
    accumulator.contributionMarginStatus = 'PARTIAL_OR_UNKNOWN';
  }

  // A ratio is only emitted when refunds/disputes cannot make the supplied
  // margin stale and every cleared payment has measured owner time.
  if (!hasRefundOrDispute && allClearedHaveMargin && allClearedHaveMinutes && accumulator.knownOwnerMinutes > 0) {
    accumulator.contributionProfitPerOwnerMinuteCents = Math.round(
      (accumulator.knownContributionMarginCents / accumulator.knownOwnerMinutes) * 100
    ) / 100;
  }
  return accumulator;
}

function addReceipt(accumulator, outcome) {
  accumulator.observedOutcomeCount += 1;
  if (!isVerifiedReceipt(outcome)) {
    const truthLevel = String(outcome?.truthLevel || '').trim();
    if (truthLevel === 'OBSERVED_OUTCOME' || !truthLevel) accumulator.ignoredObservationCount += 1;
    else accumulator.rejectedOutcomeCount += 1;
    return;
  }

  const truthLevel = String(outcome.truthLevel).trim();
  const amountCents = integerCents(outcome.paymentProof.amountCents);
  accumulator.verifiedOutcomeCount += 1;
  if (truthLevel === 'CLEARED_PAYMENT') {
    accumulator.clearedPaymentCount += 1;
    accumulator.grossClearedRevenueCents += amountCents;
    accumulator.netCashImpactCents += amountCents;
    const margin = integerCents(outcome.contributionMarginCents);
    if (margin == null) accumulator.unknownContributionMarginCount += 1;
    else {
      accumulator.knownContributionMarginCents += margin;
      accumulator.knownContributionMarginCount += 1;
    }
    const minutes = finiteNumber(outcome.ownerMinutes);
    if (minutes == null || minutes < 0) accumulator.unknownOwnerMinutesCount += 1;
    else {
      accumulator.knownOwnerMinutes += minutes;
      accumulator.knownOwnerMinutesCount += 1;
    }
  } else {
    accumulator.refundOrDisputeCount += 1;
    accumulator.refundOrDisputeCents += amountCents;
    accumulator.netCashImpactCents -= amountCents;
  }
}

function publicMetrics(accumulator) {
  return {
    observedOutcomeCount: accumulator.observedOutcomeCount,
    verifiedOutcomeCount: accumulator.verifiedOutcomeCount,
    clearedPaymentCount: accumulator.clearedPaymentCount,
    refundOrDisputeCount: accumulator.refundOrDisputeCount,
    ignoredObservationCount: accumulator.ignoredObservationCount,
    rejectedOutcomeCount: accumulator.rejectedOutcomeCount,
    grossClearedRevenueCents: accumulator.grossClearedRevenueCents,
    refundOrDisputeCents: accumulator.refundOrDisputeCents,
    netCashImpactCents: accumulator.netCashImpactCents,
    knownContributionMarginCents: accumulator.knownContributionMarginCents,
    knownContributionMarginCount: accumulator.knownContributionMarginCount,
    unknownContributionMarginCount: accumulator.unknownContributionMarginCount,
    knownOwnerMinutes: accumulator.knownOwnerMinutes,
    knownOwnerMinutesCount: accumulator.knownOwnerMinutesCount,
    unknownOwnerMinutesCount: accumulator.unknownOwnerMinutesCount,
    contributionProfitPerOwnerMinuteCents: accumulator.contributionProfitPerOwnerMinuteCents,
    contributionMarginStatus: accumulator.contributionMarginStatus,
    quality: accumulator.quality
  };
}

function failed(reasonCodes, timestamp) {
  return {
    ok: false,
    policyVersion: COMMERCIAL_LEARNING_POLICY_VERSION,
    status: 'DENIED',
    timestamp,
    reasonCodes: unique(reasonCodes),
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

// Pure, deterministic aggregation. It consumes normalized outcome receipts;
// it does not call providers, infer private data, create revenue, advance a
// promotion stage, or authorize allocation/spend.
export function summarizeCommercialLearning({ outcomes = [], scope = {}, date = new Date(), maxOutcomes = MAX_OUTCOMES } = {}) {
  const at = referenceDate(date);
  const timestamp = at.toISOString();
  if (!Array.isArray(outcomes)) return failed(['outcomes-array-required'], timestamp);
  const limit = Number.isInteger(maxOutcomes) ? Math.max(0, Math.min(MAX_OUTCOMES, maxOutcomes)) : MAX_OUTCOMES;
  const selected = outcomes.slice(0, limit).filter(outcome => matchesScope(lineageOf(outcome), scope));
  const dedupe = new Map();
  const duplicateOutcomeCount = { value: 0 };
  const contradictionKeys = new Set();
  for (const outcome of selected) {
    const key = outcomeKey(outcome);
    if (!key) continue;
    const fingerprint = digest(comparableOutcome(outcome));
    const prior = dedupe.get(key);
    if (!prior) {
      dedupe.set(key, { outcome, fingerprint });
    } else if (prior.fingerprint === fingerprint) {
      duplicateOutcomeCount.value += 1;
    } else {
      contradictionKeys.add(key);
    }
  }

  const total = blankAccumulator({});
  const groups = new Map();
  for (const [key, record] of dedupe.entries()) {
    if (contradictionKeys.has(key)) continue;
    const outcome = record.outcome;
    const lineage = lineageOf(outcome);
    const group = groups.get(groupKey(lineage)) || blankAccumulator(lineage);
    addReceipt(group, outcome);
    groups.set(groupKey(lineage), group);
    addReceipt(total, outcome);
  }
  total.observedOutcomeCount += contradictionKeys.size;
  total.rejectedOutcomeCount += contradictionKeys.size;
  const finalizedTotal = finalizeAccumulator(total);
  const sortedGroups = [...groups.values()]
    .map(finalizeAccumulator)
    .sort((a, b) => groupKey(a.lineage).localeCompare(groupKey(b.lineage)))
    .slice(0, MAX_GROUPS)
    .map(group => ({ ...group.lineage, ...publicMetrics(group) }));

  return {
    ok: true,
    policyVersion: COMMERCIAL_LEARNING_POLICY_VERSION,
    learningId: `learn_${digest({ policyVersion: COMMERCIAL_LEARNING_POLICY_VERSION, timestamp, scope, outcomes: [...dedupe.keys()].sort() }).slice(0, 24)}`,
    status: finalizedTotal.verifiedOutcomeCount > 0 ? 'LOCAL_OUTCOME_SUMMARY' : 'NO_VERIFIED_OUTCOMES',
    timestamp,
    scope: {
      opportunityId: String(scope.opportunityId || '').trim() || null,
      experimentId: String(scope.experimentId || '').trim() || null,
      channelId: String(scope.channelId || '').trim() || null
    },
    source: {
      suppliedCount: outcomes.length,
      selectedCount: selected.length,
      boundedCount: Math.min(outcomes.length, limit),
      uniqueCount: dedupe.size,
      duplicateOutcomeCount: duplicateOutcomeCount.value,
      contradictionCount: contradictionKeys.size,
      maxOutcomes: limit
    },
    metrics: publicMetrics(finalizedTotal),
    groups: sortedGroups,
    evidenceRule: 'Only normalized receipts with truthLevel=CLEARED_PAYMENT or REFUND_OR_DISPUTE and provider payment proof receive economic weight; observations never become revenue.',
    authorization: {
      externalActions: 'OWNER_REQUIRED',
      providerCalls: 'DISABLED',
      messages: 'DISABLED',
      spend: 'DISABLED',
      promotionAdvance: 'DISABLED'
    },
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

// Read only the existing commercial_outcome audit receipts. This is the
// durable-memory bridge; it deliberately does not create a new collection.
export async function loadCommercialOutcomeReceipts(store, { limit = MAX_OUTCOMES, orderBy = 'createdAt' } = {}) {
  if (!store || typeof store.list !== 'function') return [];
  const rows = await store.list('auditLog', {
    filters: { type: 'commercial_outcome' },
    orderBy,
    direction: 'asc',
    limit: Number.isInteger(limit) ? Math.max(0, Math.min(MAX_OUTCOMES, limit)) : MAX_OUTCOMES
  });
  return rows.map(row => row?.detail).filter(detail => detail && typeof detail === 'object').map(detail => ({
    ok: true,
    outcomeId: detail.outcomeId || null,
    status: detail.status,
    truthLevel: detail.truthLevel,
    outcomeType: detail.outcomeType,
    eventId: detail.eventId,
    occurredAt: detail.occurredAt,
    lineage: detail.lineage,
    paymentProof: detail.paymentProof,
    contributionMarginCents: detail.contributionMarginCents,
    ownerMinutes: detail.ownerMinutes,
    policyVersion: detail.policyVersion
  }));
}

export async function logCommercialLearning(store, summary) {
  if (!store || typeof store.log !== 'function' || !summary?.ok) return null;
  return store.log('commercial_learning', {
    learningId: summary.learningId,
    status: summary.status,
    scope: summary.scope,
    source: summary.source,
    metrics: summary.metrics,
    groups: summary.groups,
    policyVersion: summary.policyVersion,
    timestamp: summary.timestamp,
    externalEffectLedger: summary.externalEffectLedger
  });
}

export const COMMERCIAL_LEARNING_EXTERNAL_EFFECTS = ZERO_EXTERNAL_EFFECTS;
