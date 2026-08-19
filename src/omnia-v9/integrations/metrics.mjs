import { COMPARISON_CATEGORIES, isCriticalDisagreement } from './compare.mjs';

/**
 * Pure aggregation over already-fetched audit records. Never queries the
 * store itself (callers fetch with store.list('auditLog', { filters: { type
 * : '...' } }) and pass the array in), so this stays trivially testable and
 * cannot accidentally double-count anything the caller didn't include.
 *
 * Idempotent replays share a reservationId with their original attempt; this
 * module deduplicates by reservationId (keeping the earliest observation) so
 * a retried send cannot inflate the confusion matrix or founder-burden counts.
 */
function dedupeByReservation(records) {
  const seen = new Map();
  for (const record of records) {
    const key = record?.reservationId || record?.detail?.reservationId;
    if (!key) continue;
    const existingAt = seen.get(key)?.observedAt || seen.get(key)?.detail?.observedAt;
    const candidateAt = record.observedAt || record.detail?.observedAt;
    if (!seen.has(key) || (candidateAt && existingAt && candidateAt < existingAt)) {
      seen.set(key, record);
    }
  }
  return [...seen.values()];
}

export function buildConfusionMatrix(compareRecords) {
  const rows = dedupeByReservation(compareRecords.map(row => row.detail || row));
  const counts = Object.fromEntries(COMPARISON_CATEGORIES.map(category => [category, 0]));
  const criticalCases = [];
  for (const row of rows) {
    const category = row.category;
    if (Object.prototype.hasOwnProperty.call(counts, category)) counts[category] += 1;
    if (isCriticalDisagreement(category)) criticalCases.push(row);
  }
  return {
    total: rows.length,
    counts,
    disagreementRate: rows.length ? (counts.LEGACY_ALLOW_V9_DENY + counts.LEGACY_DENY_V9_ALLOW) / rows.length : 0,
    criticalDisagreementCount: criticalCases.length,
    criticalCases
  };
}

export function buildShadowReliabilityMetrics(shadowRecords) {
  const rows = dedupeByReservation(shadowRecords.map(row => row.detail || row));
  const byStatus = { OBSERVED: 0, NO_HOOK: 0, SHADOW_ERROR: 0 };
  for (const row of rows) {
    const status = row.status;
    if (Object.prototype.hasOwnProperty.call(byStatus, status)) byStatus[status] += 1;
  }
  const total = rows.length;
  return {
    total,
    byStatus,
    errorRate: total ? byStatus.SHADOW_ERROR / total : 0,
    noHookRate: total ? byStatus.NO_HOOK / total : 0,
    proofResolutionFailureRate: total
      ? rows.filter(row => row.status === 'OBSERVED' && row.decision === 'REVIEW').length / total
      : 0
  };
}

export function buildFounderBurdenEstimate({ confusionMatrix, avoidableReviewMinutes = 3 }) {
  const governedActions = confusionMatrix.total || 0;
  // Only genuine ambiguity requires a human: V9/legacy disagreements and any
  // case V9 could not resolve to a decision at all. Agreements never do.
  const reviewsRequired = confusionMatrix.counts.LEGACY_ALLOW_V9_DENY
    + confusionMatrix.counts.LEGACY_DENY_V9_ALLOW
    + confusionMatrix.counts.V9_INCOMPLETE
    + confusionMatrix.counts.V9_ERROR;
  const founderMinutes = reviewsRequired * avoidableReviewMinutes;
  return {
    governedActions,
    reviewsRequired,
    reviewsPer100GovernedActions: governedActions ? (reviewsRequired / governedActions) * 100 : 0,
    founderMinutesPer100GovernedActions: governedActions ? (founderMinutes / governedActions) * 100 : 0,
    ownerExceptionsPer100GovernedActions: governedActions ? (confusionMatrix.criticalDisagreementCount / governedActions) * 100 : 0
  };
}

export function summarizeLatencyMs(latenciesMs) {
  const sorted = [...latenciesMs].filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return { p50: null, p95: null, p99: null, count: 0 };
  const at = percentile => sorted[Math.min(sorted.length - 1, Math.floor((percentile / 100) * sorted.length))];
  return { p50: at(50), p95: at(95), p99: at(99), count: sorted.length };
}
