// Side effects for inbound reply intelligence: suppression that applies to a recipient across every sender slot, sender
// holds after a complaint, and operator escalation records. Every write here is idempotent: a deterministic id is used,
// and a ConflictError from a replay is treated as "already recorded", never as a failure. Records carry fixed reason codes,
// digests and internal ids only. No message body, subject, header value, credential or raw address is persisted here.
import crypto from 'node:crypto';
import { ConflictError } from './store.mjs';
import { now } from './utils.mjs';

export const INBOUND_SUPPRESSION_POLICY_VERSION = 'inbound-suppression-propagation-1.0.0';
export const OPERATOR_ESCALATION_KINDS = Object.freeze(['human_response', 'unsubscribe', 'complaint']);
const ESCALATION_REASON_CODES = Object.freeze([
  'THREAD_LINKED_HUMAN_REPLY', 'UNSUBSCRIBE_INTENT', 'COMPLAINT_SIGNAL', 'MACHINE_FEEDBACK_REPORT',
  'DELIVERY_NOTICE_COMPLAINT', 'UNLINKED_SENDER', 'UNLINKED_FEEDBACK_REPORT'
]);
const CORRELATIONS = Object.freeze(['thread', 'sender-address', 'none']);

export function digestOf(value = '') {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function suppressionId(value) {
  return `sup_${digestOf(`suppression|${value}`).slice(0, 32)}`;
}

// Suppression is keyed by recipient address, not by sender slot, so one opt-out blocks every slot.
export async function propagateSuppression(store, { email = '', reason = 'optout', sourceId = '', at = now() } = {}) {
  const value = String(email || '').trim().toLowerCase();
  if (!value) return { ok: false, status: 'RECIPIENT_MISSING' };
  try {
    await store.add('suppressions', {
      id: suppressionId(value), value, reason: String(reason || 'optout').slice(0, 40),
      scope: 'all-slots', sourceDigest: digestOf(sourceId).slice(0, 32), createdAt: at
    });
    return { ok: true, status: 'SUPPRESSED', scope: 'all-slots' };
  } catch (error) {
    if (error instanceof ConflictError) return { ok: true, status: 'ALREADY_SUPPRESSED', scope: 'all-slots' };
    throw error;
  }
}

// A hard bounce or complaint charged to the slot that sent the original message. A complaint always places that slot
// on hold, even when the configured complaint threshold has not been reached. A replay re-asserts the hold if an earlier
// run stopped before it was written.
export async function recordInboundHealthEvent(store, { eventType, inbox = '', prospectId = null, recipientEmail = '', externalId = '', thresholds = {} } = {}) {
  if (!['hard_bounce', 'complaint'].includes(eventType)) return { ok: false, status: 'EVENT_TYPE_REFUSED' };
  const slot = String(inbox || '');
  const eventId = `inbound-health:${eventType}:${digestOf(externalId)}`;
  const hold = async health => {
    if (eventType === 'complaint' && health?.paused !== true) {
      await store.setSenderPaused(slot, true, 'inbound-complaint-hold');
      return true;
    }
    return false;
  };
  try {
    const health = await store.recordOutboundEvent({
      id: eventId, inbox: slot, eventType, prospectId, recipientEmail,
      detail: { inboundDigest: digestOf(externalId).slice(0, 32) }
    }, thresholds);
    const held = await hold(health);
    return { ok: true, status: 'RECORDED', held };
  } catch (error) {
    if (!(error instanceof ConflictError)) throw error;
    const existing = await store.findOne('senderHealth', { inbox: slot });
    const held = await hold(existing);
    return { ok: true, status: 'ALREADY_RECORDED', held };
  }
}

export function buildOperatorEscalation({
  kind = '', externalId = '', replyId = '', prospectId = '', slot = '', correlation = 'none', label = '', reasonCode = '', at = now()
} = {}) {
  if (!OPERATOR_ESCALATION_KINDS.includes(kind)) throw new Error('operator-escalation-kind-refused');
  const externalDigest = digestOf(externalId);
  return {
    id: `inbound-escalation:${kind}:${externalDigest}`,
    type: 'inbound_operator_escalation',
    createdAt: at,
    detail: {
      policyVersion: INBOUND_SUPPRESSION_POLICY_VERSION,
      kind,
      reasonCode: ESCALATION_REASON_CODES.includes(reasonCode) ? reasonCode : 'UNSPECIFIED',
      replyId: String(replyId || '').slice(0, 80),
      prospectId: String(prospectId || '').slice(0, 80),
      slot: String(slot || '').slice(0, 200),
      correlation: CORRELATIONS.includes(correlation) ? correlation : 'none',
      label: String(label || '').replace(/[^a-z_\-]/gi, '').slice(0, 40),
      externalIdDigest: externalDigest.slice(0, 16),
      actionRequired: 'OWNER_MANUAL_REVIEW'
    }
  };
}

// Escalations are written to the audit log, which the operator already reads. A dedicated collection is an interface
// request (src/store.mjs is outside this track).
export async function recordOperatorEscalation(store, escalation) {
  try {
    await store.add('auditLog', { id: escalation.id, type: escalation.type, detail: escalation.detail, createdAt: escalation.createdAt });
    return { ok: true, status: 'RECORDED' };
  } catch (error) {
    if (error instanceof ConflictError) return { ok: true, status: 'ALREADY_RECORDED' };
    throw error;
  }
}
