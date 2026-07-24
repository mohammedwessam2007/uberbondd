// Provider-neutral outbound handoff (workstream 6). "The system must never send by itself" --
// there is no real-send code path anywhere in this module, structurally: every mode either writes
// a local export artifact (dry-run, export-only, draft-only, manual-copy) or hands a message to a
// fake in-memory provider (fake-replay) that only records the call. Sending, if it ever happens,
// happens outside this codebase, by a human, using the exported handoff.
import { id, now } from './store.mjs';
import { sha256Hex } from './utils.mjs';

export const OUTBOUND_MODES = Object.freeze(['dry-run', 'export-only', 'draft-only', 'manual-copy', 'fake-replay']);

export class OutboundError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'OutboundError';
    this.code = code;
  }
}

export function recipientMessageHash(organizationDomain, messageHash) {
  return sha256Hex(`${organizationDomain}|${messageHash}`);
}

/** Creates a provider the send-handoff path can call -- purely in-memory, records every "send" it
 * is asked to perform without doing anything real, and is the only implementation OUTBOUND_MODES's
 * 'fake-replay' mode is ever wired to. */
export function createFakeReplayOutboundProvider() {
  const calls = [];
  return {
    name: 'fake-replay',
    async handoff({ organizationDomain, channel, subject, body }) {
      const record = { id: id('fakehandoff'), organizationDomain, channel, subject, body, at: now() };
      calls.push(record);
      return { ok: true, ...record };
    },
    _debug: { calls }
  };
}

/**
 * Pre-send revalidation: re-checks everything that could have changed between approval and
 * send-time -- the approval is still `approved` and unexpired, the message wasn't tampered with
 * (hash still matches), the organization is not (newly) suppressed, and this exact
 * recipient+message pair was not already sent. Returns every blocker found, not just the first.
 */
export async function revalidateBeforeSend(store, { approval, draft, opportunity }, nowMs = Date.now()) {
  const blockers = [];
  if (!approval || approval.status !== 'approved') blockers.push({ code: 'approval-not-approved', detail: approval?.status || 'missing' });
  if (approval && Date.parse(approval.expiresAt) <= nowMs) blockers.push({ code: 'approval-expired' });
  if (approval && draft && approval.data?.messageHash !== draft.messageHash) blockers.push({ code: 'message-changed-since-approval' });
  const suppressions = await store.list('suppressions');
  if (opportunity && suppressions.some(item => item.data?.organizationDomain === opportunity.organizationDomain)) blockers.push({ code: 'organization-suppressed' });
  if (draft && opportunity) {
    const rmHash = recipientMessageHash(opportunity.organizationDomain, draft.messageHash);
    const existingSend = await store.findOne('sendRecords', { recipientMessageHash: rmHash });
    if (existingSend) blockers.push({ code: 'duplicate-send', detail: existingSend.id });
  }
  return { blocked: blockers.length > 0, blockers };
}

/** Daily + rolling caps, computed from already-persisted sendRecords -- never an in-memory counter
 * that would reset on restart. */
export async function checkSendCaps(store, { dailyCap, rollingCap, rollingWindowDays }, nowMs = Date.now()) {
  const all = await store.list('sendRecords');
  const dayStart = new Date(nowMs); dayStart.setUTCHours(0, 0, 0, 0);
  const sentToday = all.filter(record => Date.parse(record.createdAt) >= dayStart.getTime()).length;
  const windowStart = nowMs - rollingWindowDays * 86400000;
  const sentInWindow = all.filter(record => Date.parse(record.createdAt) >= windowStart).length;
  const blockers = [];
  if (sentToday >= dailyCap) blockers.push({ code: 'daily-cap-reached', detail: `${sentToday}/${dailyCap}` });
  if (sentInWindow >= rollingCap) blockers.push({ code: 'rolling-cap-reached', detail: `${sentInWindow}/${rollingCap}` });
  return { blocked: blockers.length > 0, blockers, sentToday, sentInWindow };
}

/**
 * The one function that produces a send handoff. Every mode is idempotent on
 * (organizationDomain, messageHash) via `recipientMessageHash` as the store's unique key -- a
 * second call for the same approval either returns the already-created record (idempotent) or is
 * refused by revalidateBeforeSend's duplicate-send check, never creates a second handoff.
 * `mode: 'fake-replay'` is the only mode that calls a provider at all, and that provider is always
 * the in-memory fake above -- there is no branch anywhere that could reach a real network call.
 */
export async function createSendHandoff(store, { approval, draft, opportunity, mode, provider = null, config } = {}) {
  if (!OUTBOUND_MODES.includes(mode)) throw new OutboundError('invalid-mode', mode);
  const revalidation = await revalidateBeforeSend(store, { approval, draft, opportunity });
  if (revalidation.blocked) throw new OutboundError('revalidation-failed', JSON.stringify(revalidation.blockers));
  const caps = await checkSendCaps(store, config);
  if (caps.blocked) throw new OutboundError('cap-reached', JSON.stringify(caps.blockers));

  const rmHash = recipientMessageHash(opportunity.organizationDomain, draft.messageHash);
  let providerResult = null;
  let status = 'exported';
  if (mode === 'fake-replay') {
    if (!provider) throw new OutboundError('provider-required-for-fake-replay');
    providerResult = await provider.handoff({ organizationDomain: opportunity.organizationDomain, channel: draft.channel, subject: draft.subject, body: draft.body });
    status = 'fake-sent';
  } else if (mode === 'draft-only' || mode === 'manual-copy') {
    status = 'awaiting-external-send';
  }

  const record = await store.add('sendRecords', {
    id: id('send'), approvalId: approval.id, mode, idempotencyKey: rmHash, recipientMessageHash: rmHash,
    status, data: {
      organizationDomain: opportunity.organizationDomain, channel: draft.channel, subject: draft.subject, body: draft.body,
      messageHash: draft.messageHash, providerResult,
      externallyPerformedSend: false, // flipped only by recordExternalSend below, never automatically
      postalOptOutPlaceholder: '[Physical mailing address / one-click opt-out link would appear here]'
    }
  });
  await store.log('send_handoff_created', { sendRecordId: record.id, mode, organizationDomain: opportunity.organizationDomain });
  return record;
}

/** The explicit record that a human performed a send *outside* this system, using an
 * export/draft/manual-copy handoff -- the only way `externallyPerformedSend` ever becomes true,
 * and it is always a deliberate, separately-audited call, never inferred. */
export async function recordExternalSend(store, sendRecordId, { performedBy, performedAt, evidenceNote } = {}) {
  if (!performedBy) throw new OutboundError('performed-by-required');
  const record = await store.get('sendRecords', sendRecordId);
  if (!record) throw new OutboundError('send-record-not-found', sendRecordId);
  const updated = await store.patch('sendRecords', sendRecordId, {
    status: 'externally-sent',
    data: { ...record.data, externallyPerformedSend: true, performedBy, performedAt: performedAt || now(), evidenceNote: evidenceNote || '' }
  });
  await store.log('external_send_recorded', { sendRecordId, performedBy });
  return updated;
}

/** A send whose external outcome is unknown (e.g. an operator reports "I think I sent it but I'm
 * not sure") is quarantined rather than assumed either way -- it blocks nothing else, but it is
 * visible and distinct from a confirmed send. */
export async function quarantineUncertainSend(store, sendRecordId, reason) {
  const record = await store.get('sendRecords', sendRecordId);
  if (!record) throw new OutboundError('send-record-not-found', sendRecordId);
  const updated = await store.patch('sendRecords', sendRecordId, { status: 'uncertain-quarantined', data: { ...record.data, uncertainReason: reason } });
  await store.log('send_quarantined_uncertain', { sendRecordId, reason });
  return updated;
}
