// Evidence-grade consent receipts (founder moonshot #161, THE CONSENT PROTOCOL).
//
// The public intake stored consent as a bare boolean. A boolean cannot show
// what the person agreed to, when, through which surface, for which purpose,
// or whether they later withdrew — and under CASL the sender carries the burden
// of proving consent, while UK/EU GDPR requires the controller to be able to
// demonstrate it. A receipt binds all of that to the exact wording shown.
//
// Receipts are the only way a recipient reaches a permissioned relationship in
// src/uberoutbound-recipient-eligibility.mjs: consentRelationshipFor() returns
// the relationship and evidence reference that engine accepts, and refuses
// when the purpose is not covered, the subject differs, the receipt was
// revoked or tampered with, or marketing consent was never confirmed.

import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const CONSENT_RECEIPT_VERSION = 'uberbond.consent-receipt.v1';
export const CONSENT_PURPOSES = Object.freeze(['REPORT_DELIVERY', 'SERVICE_FOLLOW_UP', 'MARKETING_EMAIL']);
export const CONSENT_STATES = Object.freeze(['ACTIVE', 'PENDING_CONFIRMATION', 'REVOKED']);
export const CONFIRMATION_WINDOW_HOURS = 168;
export const DEFAULT_MAX_CONSENT_AGE_DAYS = 730;

// Versioned wording. A receipt stores the hash of the exact text shown; changing
// the text requires a new id so old receipts keep proving what was agreed.
export const CONSENT_WORDINGS = Object.freeze({
  'public-intake-v1': Object.freeze({
    text: 'I authorize UberBond to analyse publicly accessible pages on this website and email me the private report link.',
    purposes: Object.freeze(['REPORT_DELIVERY']),
    relationship: 'USER_INITIATED',
    requiresConfirmation: false
  }),
  'report-follow-up-v1': Object.freeze({
    text: 'Yes, UberBond may email me about the findings in this report and how to fix them. I can stop these emails with one click at any time.',
    purposes: Object.freeze(['SERVICE_FOLLOW_UP']),
    relationship: 'USER_INITIATED',
    requiresConfirmation: false
  }),
  'marketing-opt-in-v1': Object.freeze({
    text: 'Yes, email me occasional UberBond findings and offers. I can unsubscribe with one click at any time.',
    purposes: Object.freeze(['MARKETING_EMAIL']),
    relationship: 'EXPLICIT_OPT_IN',
    requiresConfirmation: true
  })
});

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const sha256 = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
const hmac = (secret, value) => crypto.createHmac('sha256', String(secret)).update(String(value)).digest('base64url');
const email = value => clean(value, 320).toLowerCase();
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const iso = value => (Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null);
const refuse = reasonCodes => ({ ok: false, version: CONSENT_RECEIPT_VERSION, reasonCodes: [...new Set(reasonCodes.filter(Boolean))], externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS) });

// The digest is tamper evidence for partial or accidental edits and for a
// wording registry that changed after capture. It is not a keyed signature:
// anyone able to rewrite stored receipts can also rewrite this digest, which is
// the same trust boundary as every other store record.
function receiptCore(receipt) {
  const { receiptDigest, ...core } = receipt;
  return core;
}
function seal(receipt) {
  return { ...receipt, receiptDigest: sha256(JSON.stringify(receiptCore(receipt))) };
}
export function verifyConsentReceiptIntegrity(receipt) {
  if (!receipt || receipt.version !== CONSENT_RECEIPT_VERSION) return false;
  const wording = CONSENT_WORDINGS[receipt.wordingId];
  if (!wording || receipt.wordingHash !== sha256(wording.text)) return false;
  return receipt.receiptDigest === sha256(JSON.stringify(receiptCore(receipt)));
}

/**
 * Record that a person agreed to one versioned wording. A wording that needs
 * confirmation (marketing) starts PENDING_CONFIRMATION and returns a one-time
 * confirmation token to deliver transactionally; only its digest is stored.
 */
export function compileConsentReceipt({ subjectEmail, wordingId, channel, sourceRef, capturedAt = new Date(), ipAddress = '', secret = '' } = {}) {
  const subject = email(subjectEmail);
  const wording = CONSENT_WORDINGS[clean(wordingId, 80)];
  const at = iso(capturedAt);
  const reasons = [];
  if (!validEmail(subject)) reasons.push('valid-subject-email-required');
  if (!wording) reasons.push('registered-consent-wording-required');
  if (!clean(channel, 80)) reasons.push('capture-channel-required');
  if (!clean(sourceRef, 240)) reasons.push('capture-source-reference-required');
  if (!at) reasons.push('capture-time-required');
  if (wording?.requiresConfirmation && String(secret).length < 32) reasons.push('confirmation-secret-of-32-chars-required');
  if (reasons.length) return refuse(reasons);

  const receiptId = `ubconsent_${sha256([subject, wordingId, channel, sourceRef, at].join('|')).slice(0, 32)}`;
  const confirmationToken = wording.requiresConfirmation ? hmac(secret, `${receiptId}|${sha256(subject)}`) : null;
  const receipt = seal({
    version: CONSENT_RECEIPT_VERSION,
    receiptId,
    subjectDigest: sha256(subject),
    wordingId: clean(wordingId, 80),
    wordingHash: sha256(wording.text),
    purposes: [...wording.purposes],
    relationship: wording.relationship,
    channel: clean(channel, 80),
    sourceRef: clean(sourceRef, 240),
    capturedAt: at,
    // A salted digest proves which network the request came from without
    // retaining the raw IP address.
    ipDigest: clean(ipAddress, 80) ? sha256(`${receiptId}|${clean(ipAddress, 80)}`) : null,
    state: wording.requiresConfirmation ? 'PENDING_CONFIRMATION' : 'ACTIVE',
    confirmationTokenDigest: confirmationToken ? sha256(confirmationToken) : null,
    confirmedAt: null,
    revokedAt: null,
    revocationReason: null
  });
  return { ok: true, version: CONSENT_RECEIPT_VERSION, receipt, confirmationToken, externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS) };
}

export function confirmConsentReceipt({ receipt, token, secret = '', now = new Date() } = {}) {
  if (!verifyConsentReceiptIntegrity(receipt)) return refuse(['consent-receipt-integrity-failed']);
  if (receipt.state === 'REVOKED') return refuse(['consent-receipt-revoked']);
  if (receipt.state === 'ACTIVE') return { ok: true, version: CONSENT_RECEIPT_VERSION, receipt, alreadyConfirmed: true, externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS) };
  const presented = clean(token, 200);
  if (!presented || !receipt.confirmationTokenDigest) return refuse(['confirmation-token-required']);
  const a = Buffer.from(sha256(presented));
  const b = Buffer.from(receipt.confirmationTokenDigest);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return refuse(['confirmation-token-mismatch']);
  if (String(secret).length < 32 || hmac(secret, `${receipt.receiptId}|${receipt.subjectDigest}`) !== presented) return refuse(['confirmation-token-not-issued-by-this-secret']);
  const at = new Date(now);
  if (at.getTime() - Date.parse(receipt.capturedAt) > CONFIRMATION_WINDOW_HOURS * 3600000) return refuse(['confirmation-window-expired']);
  return { ok: true, version: CONSENT_RECEIPT_VERSION, receipt: seal({ ...receiptCore(receipt), state: 'ACTIVE', confirmedAt: at.toISOString() }), externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS) };
}

export function revokeConsentReceipt({ receipt, reason = 'SUBJECT_WITHDREW', now = new Date() } = {}) {
  if (!verifyConsentReceiptIntegrity(receipt)) return refuse(['consent-receipt-integrity-failed']);
  if (receipt.state === 'REVOKED') return { ok: true, version: CONSENT_RECEIPT_VERSION, receipt, alreadyRevoked: true, externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS) };
  return { ok: true, version: CONSENT_RECEIPT_VERSION, receipt: seal({ ...receiptCore(receipt), state: 'REVOKED', revokedAt: new Date(now).toISOString(), revocationReason: clean(reason, 120) }), externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS) };
}

/**
 * The relationship and evidence reference the recipient-eligibility engine
 * accepts for one recipient and one purpose, or the reasons it is refused.
 */
export function consentRelationshipFor({ receipts = [], recipientEmail, purpose, now = new Date(), maxAgeDays = DEFAULT_MAX_CONSENT_AGE_DAYS } = {}) {
  const want = clean(purpose, 40).toUpperCase();
  if (!CONSENT_PURPOSES.includes(want)) return refuse(['known-consent-purpose-required']);
  const subjectDigest = sha256(email(recipientEmail));
  const reasons = new Set();
  const candidates = (Array.isArray(receipts) ? receipts : []).filter(r => r?.subjectDigest === subjectDigest);
  if (!candidates.length) return refuse(['no-consent-receipt-for-this-recipient']);
  const covering = candidates.filter(r => Array.isArray(r.purposes) && r.purposes.includes(want));
  if (!covering.length) return refuse([`consent-does-not-cover-${want.toLowerCase()}`]);
  // A withdrawal outranks every grant made before it; only a fresh grant made
  // after the latest withdrawal can be used again.
  const latestRevocation = Math.max(-Infinity, ...covering
    .filter(r => r.state === 'REVOKED' && verifyConsentReceiptIntegrity(r))
    .map(r => Date.parse(r.revokedAt)));
  const at = new Date(now).getTime();
  const usable = covering.filter(r => {
    if (!verifyConsentReceiptIntegrity(r)) { reasons.add('consent-receipt-integrity-failed'); return false; }
    if (r.state === 'REVOKED') { reasons.add('consent-revoked-for-this-purpose'); return false; }
    if (r.state === 'PENDING_CONFIRMATION') { reasons.add('consent-awaiting-double-opt-in-confirmation'); return false; }
    if (r.state !== 'ACTIVE') { reasons.add('consent-receipt-not-active'); return false; }
    if (Date.parse(r.confirmedAt || r.capturedAt) <= latestRevocation) { reasons.add('consent-revoked-for-this-purpose'); return false; }
    const age = (at - Date.parse(r.confirmedAt || r.capturedAt)) / 86400000;
    if (age < 0) { reasons.add('consent-captured-in-future'); return false; }
    if (age > Math.max(1, Number(maxAgeDays) || DEFAULT_MAX_CONSENT_AGE_DAYS)) { reasons.add('consent-stale'); return false; }
    return true;
  }).sort((a, b) => Date.parse(b.confirmedAt || b.capturedAt) - Date.parse(a.confirmedAt || a.capturedAt));
  if (!usable.length) return refuse([...reasons]);
  const best = usable[0];
  return {
    ok: true,
    version: CONSENT_RECEIPT_VERSION,
    purpose: want,
    relationship: best.relationship,
    relationshipEvidenceRef: `${best.receiptId}#${best.receiptDigest.slice(0, 16)}`,
    receiptId: best.receiptId,
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
}
