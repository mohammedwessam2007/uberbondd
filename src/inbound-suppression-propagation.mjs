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
  'THREAD_LINKED_HUMAN_REPLY', 'UNLINKED_HUMAN_REPLY', 'UNSUBSCRIBE_INTENT', 'COMPLAINT_SIGNAL', 'MACHINE_FEEDBACK_REPORT',
  'DELIVERY_NOTICE_COMPLAINT', 'UNLINKED_SENDER', 'UNLINKED_FEEDBACK_REPORT'
]);
const CORRELATIONS = Object.freeze(['thread', 'sender-address', 'none']);

export function digestOf(value = '') {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function suppressionId(value) {
  return `sup_${digestOf(`suppression|${value}`).slice(0, 32)}`;
}

// Gmail ignores dots in the local part and treats googlemail.com as the same mailbox. Dots are significant elsewhere.
const DOT_INSENSITIVE_DOMAINS = Object.freeze(['gmail.com', 'googlemail.com']);

// The canonical form of a recipient address for suppression: lower-case, the plus tag removed from the local part, the
// domain lower-cased, and dots folded only for the Gmail domains. An unparseable value is returned lower-cased, unchanged.
export function suppressionKeyOf(email = '') {
  const raw = String(email ?? '').trim().toLowerCase();
  const at = raw.lastIndexOf('@');
  if (at <= 0 || at === raw.length - 1) return raw;
  let local = raw.slice(0, at).split('+')[0];
  let domain = raw.slice(at + 1);
  if (DOT_INSENSITIVE_DOMAINS.includes(domain)) {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return local ? `${local}@${domain}` : raw;
}

// True when a candidate address names the same mailbox as any stored suppression value, under the canonical form above.
export function suppressionMatches(candidate = '', storedValues = []) {
  const key = suppressionKeyOf(candidate);
  if (!key) return false;
  return (Array.isArray(storedValues) ? storedValues : []).some(value => suppressionKeyOf(value) === key);
}

// Suppression is keyed by recipient address, not by sender slot, so one opt-out blocks every slot. The canonical key is
// written alongside the exact spelling, so an address matched by exact value is still blocked after canonical matching lands.
export async function propagateSuppression(store, { email = '', reason = 'optout', sourceId = '', at = now() } = {}) {
  const exact = String(email || '').trim().toLowerCase();
  if (!exact) return { ok: false, status: 'RECIPIENT_MISSING' };
  const values = [...new Set([suppressionKeyOf(exact), exact])];
  let written = 0;
  for (const value of values) {
    try {
      await store.add('suppressions', {
        id: suppressionId(value), value, reason: String(reason || 'optout').slice(0, 40),
        scope: 'all-slots', sourceDigest: digestOf(sourceId).slice(0, 32), createdAt: at
      });
      written += 1;
    } catch (error) {
      if (!(error instanceof ConflictError)) throw error;
    }
  }
  return written > 0
    ? { ok: true, status: 'SUPPRESSED', scope: 'all-slots' }
    : { ok: true, status: 'ALREADY_SUPPRESSED', scope: 'all-slots' };
}

// A hard bounce or complaint charged to the slot that sent the original message. A complaint always places that slot
// on hold, even when the configured complaint threshold has not been reached. A replay re-asserts the hold if an earlier
// run stopped before it was written.
export async function recordInboundHealthEvent(store, { eventType, inbox = '', prospectId = null, recipientEmail = '', externalId = '', thresholds = {} } = {}) {
  if (!['hard_bounce', 'complaint'].includes(eventType)) return { ok: false, status: 'EVENT_TYPE_REFUSED' };
  const slot = String(inbox || '');
  const eventId = `inbound-health:${eventType}:${digestOf(externalId)}`;
  // setSenderPaused overwrites the pause reason, so it is never called on a sender that is already paused. The health
  // view returned by the event write can be stale, so the live row is re-read first. A pause set by an owner or a
  // threshold keeps its reason.
  const hold = async health => {
    if (eventType !== 'complaint') return { held: false, holdStatus: 'NOT_APPLICABLE' };
    if (health?.paused === true) return { held: false, holdStatus: 'SENDER_ALREADY_PAUSED' };
    const live = await store.findOne('senderHealth', { inbox: slot });
    if (live?.paused === true) return { held: false, holdStatus: 'SENDER_ALREADY_PAUSED' };
    await store.setSenderPaused(slot, true, 'inbound-complaint-hold');
    return { held: true, holdStatus: 'HOLD_APPLIED' };
  };
  try {
    const health = await store.recordOutboundEvent({
      id: eventId, inbox: slot, eventType, prospectId, recipientEmail,
      detail: { inboundDigest: digestOf(externalId).slice(0, 32) }
    }, thresholds);
    const { held, holdStatus } = await hold(health);
    return { ok: true, status: 'RECORDED', held, holdStatus };
  } catch (error) {
    if (!(error instanceof ConflictError)) throw error;
    const existing = await store.findOne('senderHealth', { inbox: slot });
    const { held, holdStatus } = await hold(existing);
    return { ok: true, status: 'ALREADY_RECORDED', held, holdStatus };
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

// A human reply that no sent message links to. Nothing is sent, suppressed or health-charged for it; the owner reads it.
export function buildUnlinkedHumanReplyEscalation({ externalId = '', replyId = '', slot = '', at = now() } = {}) {
  return buildOperatorEscalation({
    kind: 'human_response', externalId, replyId, prospectId: '', slot, correlation: 'none',
    label: 'unlinked', reasonCode: 'UNLINKED_HUMAN_REPLY', at
  });
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
