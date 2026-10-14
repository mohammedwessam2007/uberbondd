// Retention for inbound reply records. The planner is pure: given records and a window, it returns the ids that fall outside
// the window and a digest receipt. It never deletes, writes, or reads a store, so a purge is always a separate, reviewed step.
// Records under a hold, records without a usable date, and records with an open operator escalation are always retained.
// The control setter is the only write here. It sets a hold or an escalation status on one existing record, with a reason
// and an actor, and it never removes a record.
import crypto from 'node:crypto';

export const INBOUND_RETENTION_POLICY_VERSION = 'inbound-retention-1.0.0';
export const INBOUND_RETENTION_LIMITS = Object.freeze({ minWindowDays: 1, maxWindowDays: 3650, maxRecords: 100000 });
export const INBOUND_RETENTION_CONTROLS = Object.freeze(['legalHold', 'retentionHold', 'escalationStatus']);
export const INBOUND_RETENTION_COLLECTIONS = Object.freeze(['unlinkedReplies', 'replies']);
const ESCALATION_STATUSES = Object.freeze(['open', 'closed']);
const CONTROL_REASON_CHARS = 200;
const CONTROL_ACTOR_CHARS = 120;
const RETAIN_REASONS = Object.freeze(['hold', 'open-escalation', 'undated', 'missing-id', 'within-window']);
const FLAG_CLEAR_VALUES = Object.freeze(['', 'false', '0', 'no', 'off', 'null', 'undefined']);

function refusal(reasonCodes) {
  return {
    ok: false, status: 'RETENTION_POLICY_REFUSED', reasonCodes, purgeIds: [], purgeCount: 0,
    retainedCount: 0, deletesPerformed: 0, providerCalls: 0, policyVersion: INBOUND_RETENTION_POLICY_VERSION
  };
}

// A hold flag is set unless it is an explicit clear value. A stored 'TRUE', 'yes' or object still holds: fail closed.
function flagSet(value) {
  if (value === undefined || value === null || value === false) return false;
  return !FLAG_CLEAR_VALUES.includes(String(value).trim().toLowerCase());
}

// An escalation is open unless it is absent or explicitly closed. Any other status keeps the record.
function escalationOpen(value) {
  if (value === undefined || value === null || value === false) return false;
  const text = String(value).trim().toLowerCase();
  return text !== '' && text !== 'closed';
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
    if (holds.has(id) || flagSet(record.legalHold) || flagSet(record.retentionHold)) { retained.hold += 1; continue; }
    if (escalationOpen(record.escalationStatus)) { retained['open-escalation'] += 1; continue; }
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

function boundedText(value, maxChars) {
  return Array.from(String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim()).slice(0, maxChars).join('');
}

// Sets one retention control on one existing record: a legal hold, a retention hold (true or false), or an escalation
// status ('open' or 'closed'). Every write needs a reason and an actor, and is recorded in the audit log. A release is an
// explicit false with the same reason and actor. Nothing here deletes a record, and the planner above never purges a held one.
export async function setInboundRetentionControl(store, {
  collection = 'unlinkedReplies', id = '', control = '', value, reason = '', actor = '', at = new Date().toISOString()
} = {}) {
  const refuse = reasonCodes => ({
    ok: false, status: 'RETENTION_CONTROL_REFUSED', reasonCodes, deletesPerformed: 0, policyVersion: INBOUND_RETENTION_POLICY_VERSION
  });
  if (!INBOUND_RETENTION_CONTROLS.includes(control)) return refuse(['control-invalid']);
  if (!INBOUND_RETENTION_COLLECTIONS.includes(collection)) return refuse(['collection-invalid']);
  if (typeof id !== 'string' || !id.trim()) return refuse(['record-id-required']);
  const reasonText = boundedText(reason, CONTROL_REASON_CHARS);
  if (!reasonText) return refuse(['reason-required']);
  const actorText = boundedText(actor, CONTROL_ACTOR_CHARS);
  if (!actorText) return refuse(['actor-required']);
  if (control === 'escalationStatus') {
    if (!ESCALATION_STATUSES.includes(value)) return refuse(['escalation-status-invalid']);
  } else if (typeof value !== 'boolean') {
    return refuse(['hold-value-invalid']);
  }
  if (!store || typeof store.get !== 'function' || typeof store.patch !== 'function' || typeof store.log !== 'function') {
    return refuse(['store-unavailable']);
  }
  const record = await store.get(collection, id);
  if (!record) return refuse(['record-not-found']);
  await store.patch(collection, id, { [control]: value, retentionControlAt: at, retentionControlActor: actorText });
  await store.log('inbound_retention_control', { collection, id: id.slice(0, 200), control, value, actor: actorText, reason: reasonText, at });
  return { ok: true, status: 'RETENTION_CONTROL_SET', collection, control, value, deletesPerformed: 0, policyVersion: INBOUND_RETENTION_POLICY_VERSION };
}
