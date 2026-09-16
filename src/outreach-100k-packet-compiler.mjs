import crypto from 'node:crypto';

export const OUTREACH_100K_PACKET_COMPILER_VERSION = 'uberbond.outreach-100k-packet-compiler.v1';

const clean = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const email = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value, 320));
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

function fail(reasonCodes, extra = {}) {
  return Object.freeze({
    ok: false,
    status: 'OUTREACH_100K_PACKET_COMPILATION_REFUSED',
    version: OUTREACH_100K_PACKET_COMPILER_VERSION,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    messagesSent: 0,
    providerCalls: 0,
    externalEffectsAuthorized: false,
    ...extra
  });
}

export function compileOutreach100kPacket({
  recipient = {},
  legal = {},
  suppression = {},
  campaign = {},
  message = {},
  dispatchAuthorization = {},
  accountKey = '',
  idempotencyKey = ''
} = {}, { now = new Date() } = {}) {
  const reasons = [];
  const campaignId = clean(campaign.id, 240);
  const recipientId = clean(recipient.id || recipient.recipientId, 240);
  const to = clean(recipient.email || message.to, 320).toLowerCase();
  const providerId = clean(recipient.providerId || recipient.recipientProviderId, 120).toLowerCase();
  const timeZone = clean(recipient.timeZone || recipient.recipientTimeZone, 120);
  const subject = clean(message.subject, 998);
  const body = clean(message.body, 100_000);
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(String(now || ''));

  if (!campaignId) reasons.push('campaign-id-required');
  if (!recipientId) reasons.push('recipient-id-required');
  if (!email(to)) reasons.push('valid-recipient-email-required');
  if (!providerId) reasons.push('recipient-provider-required');
  if (!timeZone) reasons.push('recipient-time-zone-required');
  if (!subject || !body) reasons.push('complete-message-required');
  if (recipient.verified !== true || recipient.safeForOutreach !== true || !clean(recipient.verificationEvidenceRef, 1500)) reasons.push('recipient-verification-evidence-required');
  if (legal.eligible !== true || String(legal.status || '').toUpperCase() !== 'PASSED' || !clean(legal.evidenceId, 1000) || !clean(legal.policyVersion, 160)) reasons.push('recipient-legal-evidence-required');
  if (suppression.checked !== true || suppression.suppressed === true || suppression.unsubscribeRequested === true || suppression.unsubscribed === true) reasons.push('recipient-suppression-gate-not-precleared');
  if (dispatchAuthorization.authorized !== true || !clean(dispatchAuthorization.receiptId, 240) || !clean(dispatchAuthorization.authorizedBy, 240) || clean(dispatchAuthorization.recipientEmail, 320).toLowerCase() !== to || clean(dispatchAuthorization.campaignId, 240) !== campaignId) reasons.push('exact-dispatch-authorization-required');
  const expiresAt = Date.parse(String(dispatchAuthorization.expiresAt || ''));
  if (!Number.isFinite(nowMs)) reasons.push('valid-reference-time-required');
  if (!Number.isFinite(expiresAt) || (Number.isFinite(nowMs) && expiresAt <= nowMs)) reasons.push('dispatch-authorization-expired');

  if (reasons.length) return fail(reasons, { recipientId: recipientId || null, recipientEmail: to || null });

  const canonical = {
    recipientId,
    accountKey: clean(accountKey || recipient.accountKey, 500),
    recipientProviderId: providerId,
    recipientTimeZone: timeZone,
    campaignId,
    message: { to, subject, body },
    dispatchAuthorization: {
      authorized: true,
      receiptId: clean(dispatchAuthorization.receiptId, 240),
      authorizedBy: clean(dispatchAuthorization.authorizedBy, 240),
      recipientEmail: to,
      campaignId,
      expiresAt: new Date(expiresAt).toISOString()
    },
    launchInput: {
      recipient: {
        email: to,
        verified: true,
        safeForOutreach: true,
        verificationEvidenceRef: clean(recipient.verificationEvidenceRef, 1500)
      },
      campaign: { id: campaignId },
      legal: {
        eligible: true,
        status: 'PASSED',
        evidenceId: clean(legal.evidenceId, 1000),
        policyVersion: clean(legal.policyVersion, 160)
      },
      suppression: {
        checked: true,
        suppressed: false,
        unsubscribeRequested: false,
        unsubscribed: false
      }
    }
  };

  return Object.freeze({
    ok: true,
    status: 'OUTREACH_100K_PACKET_COMPILED',
    version: OUTREACH_100K_PACKET_COMPILER_VERSION,
    packet: Object.freeze({
      ...canonical,
      idempotencyKey: clean(idempotencyKey, 500) || `ub100k:${campaignId}:${digest({ recipientId, to, authorization: canonical.dispatchAuthorization.receiptId }).slice(0, 32)}`
    }),
    messagesSent: 0,
    providerCalls: 0,
    externalEffectsAuthorized: false,
    truthBoundary: 'COMPILED means caller-supplied recipient verification, legal eligibility, suppression clearance, message content, campaign identity, and exact dispatch authorization were structurally bound into the canonical 100K packet schema. It does not create or independently verify any of those authorities or facts.'
  });
}

export function compileOutreach100kPackets(records = [], options = {}) {
  if (!Array.isArray(records) || !records.length) return fail(['packet-records-required']);
  const packets = [];
  const rejected = [];
  for (let index = 0; index < records.length; index += 1) {
    const result = compileOutreach100kPacket(records[index], options);
    if (!result.ok) {
      rejected.push({ index, reasonCodes: result.reasonCodes, recipientId: result.recipientId || null, recipientEmail: result.recipientEmail || null });
      continue;
    }
    packets.push(result.packet);
  }
  return Object.freeze({
    ok: rejected.length === 0,
    status: rejected.length ? 'OUTREACH_100K_PACKET_BATCH_PARTIAL' : 'OUTREACH_100K_PACKET_BATCH_COMPILED',
    version: OUTREACH_100K_PACKET_COMPILER_VERSION,
    packets: Object.freeze(packets),
    rejected: Object.freeze(rejected),
    compiledCount: packets.length,
    rejectedCount: rejected.length,
    messagesSent: 0,
    providerCalls: 0,
    externalEffectsAuthorized: false
  });
}
