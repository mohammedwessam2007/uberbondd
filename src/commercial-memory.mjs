// Durable experiment/learning memory. Reuses the existing auditLog writer
// -- no new collection. A query layer over what was already being
// recorded, plus contradiction detection so one lucky outcome can never
// silently become universal doctrine.
export const COMMERCIAL_MEMORY_POLICY_VERSION = 'commercial-memory-1.0.0';
const MEMORY_AUDIT_TYPE = 'commercial_memory_entry';

export async function recordCommercialMemory(store, {
  hypothesis, context = {}, action, outcomeType, isSynthetic = false, confidence = null,
  sampleSize = 1, conditions = [], date = new Date()
} = {}) {
  if (!store || typeof store.log !== 'function' || !hypothesis) return { ok: false, reason: 'malformed-input' };
  const referenceDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const receipt = await store.log(MEMORY_AUDIT_TYPE, {
    hypothesis, context, action: action || null, outcomeType: outcomeType || null,
    isSynthetic: Boolean(isSynthetic), confidence, sampleSize: Math.max(1, Number(sampleSize) || 1),
    conditions, recordedAt: referenceDate.toISOString()
  });
  return { ok: true, policyVersion: COMMERCIAL_MEMORY_POLICY_VERSION, receipt };
}

export async function queryCommercialMemory(store, { hypothesis, segment, channel, limit = 200 } = {}) {
  if (!store || typeof store.list !== 'function') return [];
  const entries = await store.list('auditLog', { filters: { type: MEMORY_AUDIT_TYPE }, orderBy: 'createdAt', direction: 'desc', limit });
  return entries
    .map(entry => entry.detail)
    .filter(detail => !hypothesis || detail.hypothesis === hypothesis)
    .filter(detail => !segment || detail.context?.segment === segment)
    .filter(detail => !channel || detail.context?.channel === channel);
}

// A "positive" outcome is one whose hierarchy weight would be positive
// (CLEARED_PAYMENT, ACCEPTED_DELIVERY, etc.); the sign is derived from the
// outcome type itself, not asserted by the caller, so a contradiction
// can't be hidden by mislabeling. Records with no outcomeType are ignored
// (nothing to contradict yet).
const POSITIVE_OUTCOMES = new Set(['CLEARED_RECURRING_CONTRIBUTION_MARGIN', 'CLEARED_PAYMENT', 'ACCEPTED_DELIVERY', 'QUALIFIED_OPPORTUNITY', 'POSITIVE_REPLY']);
const NEGATIVE_OUTCOMES = new Set(['FAILED', 'REJECTED', 'NO_RESPONSE', 'REFUND_OR_DISPUTE']);

// Groups memory records by identical hypothesis text and flags any group
// containing both a positive and a negative outcome as contradictory --
// these must be surfaced, never silently resolved by picking the newer or
// more numerous side.
export function detectContradictions(records = []) {
  const byHypothesis = new Map();
  for (const record of records) {
    if (!record?.hypothesis || !record.outcomeType) continue;
    const list = byHypothesis.get(record.hypothesis) || [];
    list.push(record);
    byHypothesis.set(record.hypothesis, list);
  }
  const contradictions = [];
  for (const [hypothesis, list] of byHypothesis) {
    const hasPositive = list.some(r => POSITIVE_OUTCOMES.has(r.outcomeType));
    const hasNegative = list.some(r => NEGATIVE_OUTCOMES.has(r.outcomeType));
    if (hasPositive && hasNegative) {
      contradictions.push({ hypothesis, records: list, note: 'This hypothesis has both positive and negative real outcomes on record -- do not treat either side as settled.' });
    }
  }
  return contradictions;
}
