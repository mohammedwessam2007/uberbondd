// Pure retention planner for inbound reply records. Given records and a window, it returns the ids that fall outside the
// window and a digest receipt. It never deletes, writes, or reads a store, so a purge is always a separate, reviewed step.
// Records under a hold, records without a usable date, and records with an open operator escalation are always retained.
import crypto from 'node:crypto';

export const INBOUND_RETENTION_POLICY_VERSION = 'inbound-retention-1.0.0';
export const INBOUND_RETENTION_LIMITS = Object.freeze({ minWindowDays: 1, maxWindowDays: 3650, maxRecords: 100000 });
const RETAIN_REASONS = Object.freeze(['hold', 'open-escalation', 'undated', 'missing-id', 'within-window']);

function refusal(reasonCodes) {
  return {
    ok: false, status: 'RETENTION_POLICY_REFUSED', reasonCodes, purgeIds: [], purgeCount: 0,
    retainedCount: 0, deletesPerformed: 0, providerCalls: 0, policyVersion: INBOUND_RETENTION_POLICY_VERSION
  };
}

export function planInboundRetention({
  records = [], windowDays = null, nowMs = Date.now(), dateField = 'receivedAt', collection = 'unlinkedReplies', holdIds = []
} = {}) {
  const days = Number(windowDays);
  if (!Number.isInteger(days) || days < INBOUND_RETENTION_LIMITS.minWindowDays || days > INBOUND_RETENTION_LIMITS.maxWindowDays) {
    return refusal(['window-days-invalid']);
  }
  if (!Number.isFinite(Number(nowMs))) return refusal(['now-invalid']);
  if (!Array.isArray(records)) return refusal(['records-not-array']);
  if (records.length > INBOUND_RETENTION_LIMITS.maxRecords) return refusal(['record-count-exceeds-limit']);

  const cutoffMs = Number(nowMs) - days * 86400000;
  const holds = new Set((Array.isArray(holdIds) ? holdIds : []).map(String));
  const purgeIds = [];
  const retained = Object.fromEntries(RETAIN_REASONS.map(reason => [reason, 0]));

  for (const record of records) {
    const id = typeof record?.id === 'string' ? record.id : '';
    if (!id) { retained['missing-id'] += 1; continue; }
    if (holds.has(id) || record.legalHold === true || record.retentionHold === true) { retained.hold += 1; continue; }
    if (record.escalationStatus === 'open') { retained['open-escalation'] += 1; continue; }
    const timestamp = Date.parse(record[dateField]);
    if (!Number.isFinite(timestamp)) { retained.undated += 1; continue; }
    if (timestamp < cutoffMs) purgeIds.push(id);
    else retained['within-window'] += 1;
  }

  const sortedPurgeIds = [...new Set(purgeIds)].sort();
  const cutoffIso = new Date(cutoffMs).toISOString();
  const digest = crypto.createHash('sha256')
    .update(JSON.stringify({ policy: INBOUND_RETENTION_POLICY_VERSION, collection, windowDays: days, cutoffIso, purgeIds: sortedPurgeIds }))
    .digest('hex');
  const retainedCount = Object.values(retained).reduce((sum, count) => sum + count, 0);
  return {
    ok: true,
    status: 'RETENTION_PLAN_COMPUTED',
    policyVersion: INBOUND_RETENTION_POLICY_VERSION,
    collection,
    windowDays: days,
    cutoffIso,
    scanned: records.length,
    purgeIds: sortedPurgeIds,
    purgeCount: sortedPurgeIds.length,
    retainedCount,
    retainedByReason: retained,
    receipt: { policyVersion: INBOUND_RETENTION_POLICY_VERSION, collection, windowDays: days, cutoffIso, scanned: records.length, purgeCount: sortedPurgeIds.length, retainedCount, digest },
    reasonCodes: [],
    deletesPerformed: 0,
    providerCalls: 0
  };
}
