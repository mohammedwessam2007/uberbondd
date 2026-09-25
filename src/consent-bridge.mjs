// Consent Bridge: turn a non-email first touch into the recipient's own request.
//
// Founder moonshots #161 (The Consent Protocol) and #160 (The Authority
// Physics), applied with GENESIS operator "autonomy flip": instead of UberBond
// pushing an unsolicited email, the prospect is handed a short invitation code
// through a channel that is not electronic marketing (a letter to the business,
// an in-person meeting, a partner's own introduction) and chooses whether to
// ask for their report. Their request is what creates the email relationship,
// recorded as a consent receipt, so every later message is permissioned.
//
// Codes are HMAC-derived, carry no personal data, expire, can be revoked, and
// redeem idempotently per subject. Redemption records who asked and where the
// invitation came from; it never sends anything.

import crypto from 'node:crypto';
import { compileConsentReceipt } from './consent-receipt.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const CONSENT_BRIDGE_VERSION = 'uberbond.consent-bridge.v1';
export const BRIDGE_CHANNELS = Object.freeze(['POSTAL_LETTER', 'IN_PERSON', 'PARTNER_INTRODUCTION', 'FOUNDER_NETWORK', 'EVENT', 'INBOUND_CONTENT']);
export const MAX_INVITATION_DAYS = 120;
// Crockford base32 without I, L, O, U so a printed code survives being typed.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const sha256 = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
const hmacBytes = (secret, value) => crypto.createHmac('sha256', String(secret)).update(String(value)).digest();
const zero = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const refuse = reasonCodes => ({ ok: false, version: CONSENT_BRIDGE_VERSION, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], externalEffectLedger: zero() });

function base32(bytes, length) {
  let bits = 0, value = 0, out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5 && out.length < length) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
    if (out.length >= length) break;
  }
  return out;
}
export function normalizeInvitationCode(value) {
  return clean(value, 64).toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
}
function codeFor(secret, invitationId) {
  const code = base32(hmacBytes(secret, `invitation|${invitationId}`), 12);
  return code;
}

/**
 * Issue an invitation for an identified business. The prospect reference is a
 * digest; the printed code is 12 base32 characters (60 bits) shown as XXXX-XXXX-XXXX.
 */
export function issueInvitation({ prospect = {}, campaignId, channel, secret = '', now = new Date(), validDays = 60 } = {}) {
  const company = clean(prospect.company, 240);
  const website = clean(prospect.website, 500).toLowerCase();
  const ch = clean(channel, 40).toUpperCase();
  const days = Number(validDays);
  const reasons = [];
  if (!company || !/^https?:\/\/[^\s/]+\.[^\s/]+/.test(website)) reasons.push('prospect-company-and-public-website-required');
  if (!clean(campaignId, 120)) reasons.push('campaign-id-required');
  if (!BRIDGE_CHANNELS.includes(ch)) reasons.push('non-email-bridge-channel-required');
  if (String(secret).length < 32) reasons.push('invitation-secret-of-32-chars-required');
  if (!Number.isInteger(days) || days < 1 || days > MAX_INVITATION_DAYS) reasons.push(`validity-1-to-${MAX_INVITATION_DAYS}-days-required`);
  if (!Number.isFinite(new Date(now).getTime())) reasons.push('valid-issue-time-required');
  if (reasons.length) return refuse(reasons);

  const issuedAt = new Date(now).toISOString();
  const prospectRef = sha256(`${company.toLowerCase()}|${website}`);
  const invitationId = `ubinv_${sha256([prospectRef, clean(campaignId, 120), ch, issuedAt].join('|')).slice(0, 24)}`;
  const code = codeFor(secret, invitationId);
  const record = {
    version: CONSENT_BRIDGE_VERSION,
    invitationId,
    prospectRef,
    campaignId: clean(campaignId, 120),
    channel: ch,
    issuedAt,
    expiresAt: new Date(Date.parse(issuedAt) + days * 86400000).toISOString(),
    codeDigest: sha256(code),
    state: 'ISSUED',
    redemptions: []
  };
  return {
    ok: true,
    version: CONSENT_BRIDGE_VERSION,
    record,
    code,
    printableCode: `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`,
    // The public intake form reads ?code= and records it as the lead's source.
    landingPath: `/?code=${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`,
    externalEffectLedger: zero()
  };
}

export function revokeInvitation({ record, now = new Date() } = {}) {
  if (record?.version !== CONSENT_BRIDGE_VERSION) return refuse(['invitation-record-required']);
  return { ok: true, version: CONSENT_BRIDGE_VERSION, record: { ...record, state: 'REVOKED', revokedAt: new Date(now).toISOString() }, externalEffectLedger: zero() };
}

/**
 * The prospect presents the code and asks for their report with their own
 * email. Returns the updated record, the consent receipts created, and the
 * attribution that links this relationship to the invitation's channel.
 * Presenting the same code for the same address again returns the same result.
 */
export function redeemInvitation({ record, code, subjectEmail, followUpConsent = false, secret = '', ipAddress = '', now = new Date() } = {}) {
  if (record?.version !== CONSENT_BRIDGE_VERSION) return refuse(['invitation-record-required']);
  const presented = normalizeInvitationCode(code);
  const expected = String(secret).length >= 32 ? codeFor(secret, record.invitationId) : '';
  const a = Buffer.from(sha256(presented));
  const b = Buffer.from(record.codeDigest || '');
  if (!presented || a.length !== b.length || !crypto.timingSafeEqual(a, b) || presented !== expected) return refuse(['invitation-code-invalid']);
  if (record.state === 'REVOKED') return refuse(['invitation-revoked']);
  const at = new Date(now);
  if (at.getTime() > Date.parse(record.expiresAt)) return refuse(['invitation-expired']);

  const subject = clean(subjectEmail, 320).toLowerCase();
  const subjectDigest = sha256(subject);
  const prior = record.redemptions.find(r => r.subjectDigest === subjectDigest);
  if (prior) return { ok: true, version: CONSENT_BRIDGE_VERSION, record, receipts: prior.receipts, attribution: prior.attribution, alreadyRedeemed: true, externalEffectLedger: zero() };
  if (record.redemptions.length >= 5) return refuse(['invitation-redemption-limit-reached']);

  const receipts = [];
  for (const wordingId of ['public-intake-v1', ...(followUpConsent === true ? ['report-follow-up-v1'] : [])]) {
    const r = compileConsentReceipt({ subjectEmail: subject, wordingId, channel: `CONSENT_BRIDGE:${record.channel}`, sourceRef: record.invitationId, capturedAt: at, ipAddress });
    if (!r.ok) return refuse(r.reasonCodes);
    receipts.push(r.receipt);
  }
  const attribution = { invitationId: record.invitationId, campaignId: record.campaignId, channel: record.channel, prospectRef: record.prospectRef, redeemedAt: at.toISOString() };
  const updated = { ...record, state: 'REDEEMED', redemptions: [...record.redemptions, { subjectDigest, redeemedAt: at.toISOString(), receipts, attribution }] };
  return { ok: true, version: CONSENT_BRIDGE_VERSION, record: updated, receipts, attribution, externalEffectLedger: zero() };
}

/**
 * Attribute public-intake leads whose source is `bridge:<code>` to the
 * invitation that printed that code. The lead's own consent receipt, created
 * by the intake form, is the permission; this only answers which channel and
 * campaign produced the request and whether the code was still valid then.
 */
export function attributeBridgeLeads({ leads = [], invitations = [] } = {}) {
  const byDigest = new Map((Array.isArray(invitations) ? invitations : []).filter(r => r?.version === CONSENT_BRIDGE_VERSION).map(r => [r.codeDigest, r]));
  const rows = [];
  for (const lead of Array.isArray(leads) ? leads : []) {
    const match = /^bridge:([0-9A-Z]{12})$/.exec(String(lead?.source || ''));
    if (!match) continue;
    const invitation = byDigest.get(sha256(normalizeInvitationCode(match[1])));
    const createdAt = Date.parse(lead.createdAt);
    let validity = 'UNKNOWN_CODE';
    if (invitation) {
      if (invitation.state === 'REVOKED' && Date.parse(invitation.revokedAt) <= createdAt) validity = 'CODE_REVOKED_BEFORE_REQUEST';
      else if (createdAt > Date.parse(invitation.expiresAt)) validity = 'CODE_EXPIRED_BEFORE_REQUEST';
      else if (createdAt < Date.parse(invitation.issuedAt)) validity = 'REQUEST_PREDATES_CODE';
      else validity = 'VALID_AT_REQUEST';
    }
    rows.push({
      leadId: String(lead.id || ''),
      validity,
      invitationId: invitation?.invitationId || null,
      campaignId: invitation?.campaignId || null,
      channel: invitation?.channel || null,
      hasConsentReceipt: Boolean(lead.consentReceipt?.receiptId)
    });
  }
  const byChannel = {};
  for (const r of rows) if (r.validity === 'VALID_AT_REQUEST') byChannel[r.channel] = (byChannel[r.channel] || 0) + 1;
  return { ok: true, version: CONSENT_BRIDGE_VERSION, attributed: rows.filter(r => r.validity === 'VALID_AT_REQUEST').length, byChannel, rows, externalEffectLedger: zero() };
}
