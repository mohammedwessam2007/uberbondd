// SMTP_RELAY_PUBLIC_BUSINESS_CONTACT_V1 — a deliberately narrow, fail-closed
// cold first-touch route for the existing Winnr smtp-relay substrate.
//
// STATUS: INERT. Nothing imports this module. It does not change
// src/outreach-governance.mjs, which still refuses PUBLIC_BUSINESS_CONTACT on
// smtp-relay by default. Wiring it is a separate, human-authorized step.
//
// Design rules (architecture review 2026-10-02):
//  * Cold routes use their own versioned envelope, `uberbond.outreach-route.cold-v1`.
//    The legacy `uberbond.outreach-route.v1` closed record has no `coldPolicy`
//    field, so it rejects this envelope (fail closed) and every legacy route
//    digest is unchanged.
//  * The legal decision is recomputed from facts by the existing
//    recipient-eligibility compiler; a caller-supplied "PASSED" is never trusted.
//  * Founder authority is a signed, expiring, capped record bound to the exact
//    published postal address.
//  * "Sender jurisdiction" is not one concept. The compiler's single
//    `senderJurisdiction` means "the sender's home law". Until an authoritative
//    scope interpretation says which facts matter, every candidate home-law fact
//    must clear independently. Holding is conservative policy, not proven law.

import crypto from 'node:crypto';
import { canonicalize, sha256 as canonicalSha256 } from './omnia-v9/canonical.mjs';
import { compileRecipientEligibility, classifyRecipientAddress, recipientEligibilityCoverage } from './uberoutbound-recipient-eligibility.mjs';

export const COLD_ROUTE_POLICY_ID = 'SMTP_RELAY_PUBLIC_BUSINESS_CONTACT_V1';
export const COLD_ROUTE_SCHEMA_VERSION = 'uberbond.outreach-route.cold-v1';
export const COLD_ROUTE_RECIPIENT_JURISDICTIONS = Object.freeze(['US']);
export const COLD_ROUTE_MAX_MESSAGES_CEILING = 5;
export const COLD_ROUTE_MAX_AUTHORIZATION_DAYS = 7;
export const COLD_ROUTE_MAX_EVIDENCE_AGE_DAYS = 7;

// The Egypt (and similar) sender-side rule is a conservative policy hold. It
// is NOT proven to prohibit B2B email to foreign corporate recipients: the
// Egyptian PDPC's published scope focuses on personal data of Egyptian
// citizens and of non-citizens residing in Egypt. Keep the hold until an
// authoritative interpretation resolves the scope.
export const SENDER_SIDE_HOLD_CLASSIFICATION = 'CONSERVATIVE_POLICY_HOLD_PENDING_AUTHORITATIVE_SCOPE_INTERPRETATION';

// Candidate "sender home law" facts. All must clear. `transportRegion` is
// recorded but does not gate: no evidence says relay location controls the
// lawfulness of a business email, and gating on it would hold every message
// sent through an EU-hosted relay without a legal basis.
export const SENDER_SIDE_GATING_FIELDS = Object.freeze(['operatorLocation', 'senderEntityJurisdiction', 'controllerJurisdiction']);

export const COLD_POLICY_FIELDS = new Set([
  'policyId', 'contactSource', 'collectionMethod', 'recipientType',
  'noSolicitationNoticeChecked', 'noHarvestNoticeChecked', 'addressGuessed', 'roleRationale'
]);
export const COLD_ROUTE_FIELDS = new Set([
  'schemaVersion', 'routeType', 'recipientEmail', 'sourceUrl', 'sourceExcerptDigest',
  'sourceObservedAt', 'sourceExpiresAt', 'jurisdiction', 'permissionScope',
  'relevantToRecipientRole', 'noUnsolicitedStatementPresent', 'provider',
  'evidenceNote', 'coldPolicy', 'routeDigest'
]);
const AUTHORIZATION_FIELDS = new Set([
  'schemaVersion', 'policyId', 'authorizedBy', 'authorizedAt', 'expiresAt', 'maxMessagesTotal',
  'recipientJurisdictions', 'operatorLocation', 'senderEntityJurisdiction', 'controllerJurisdiction',
  'transportRegion', 'providerTermsEvidenceRef', 'postalAddressDigest',
  'postalAddressPublicationAuthorized', 'authorizationDigest', 'signature'
]);
// Required-at-send disclosure that the message is a commercial solicitation.
export const COLD_AD_DISCLOSURE_PATTERN = /\bthis is (an? )?(advertisement|commercial (message|email|solicitation)|solicitation)\b/i;

const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const SHA256_HEX = /^[a-f0-9]{64}$/;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const iso2 = value => {
  const v = text(value, 8).toUpperCase();
  return v === 'UK' ? 'GB' : v;
};
const plainSha256 = value => crypto.createHash('sha256').update(String(value)).digest('hex');

export const addressDigest = address => plainSha256(text(address, 500).toLowerCase().replace(/\s+/g, ' '));

function hmac(secret, digest) {
  const key = String(secret || '');
  if (key.length < 32) throw new Error('approval secret must contain at least 32 characters');
  return crypto.createHmac('sha256', key).update(String(digest), 'utf8').digest('hex');
}

/* ------------------------------------------------------------------ */
/* Versioned cold-route envelope                                       */
/* ------------------------------------------------------------------ */

export function createColdRouteEvidence(input = {}, now = new Date()) {
  const excerpt = String(input.sourceExcerpt || '').trim();
  const sourceExcerptDigest = excerpt ? plainSha256(excerpt) : text(input.sourceExcerptDigest, 64).toLowerCase();
  const base = {
    schemaVersion: COLD_ROUTE_SCHEMA_VERSION,
    routeType: 'PUBLIC_BUSINESS_CONTACT',
    recipientEmail: text(input.recipientEmail, 320).toLowerCase(),
    sourceUrl: text(input.sourceUrl, 1000),
    sourceExcerptDigest,
    sourceObservedAt: text(input.sourceObservedAt || now.toISOString()),
    sourceExpiresAt: text(input.sourceExpiresAt || new Date(now.getTime() + COLD_ROUTE_MAX_EVIDENCE_AGE_DAYS * 86400000).toISOString()),
    jurisdiction: iso2(input.jurisdiction),
    permissionScope: 'COMMERCIAL_OUTREACH',
    relevantToRecipientRole: input.relevantToRecipientRole === true,
    noUnsolicitedStatementPresent: input.noUnsolicitedStatementPresent === true,
    provider: 'smtp-relay',
    evidenceNote: text(input.evidenceNote, 1000),
    // JSON round-trip drops `undefined` so a missing field is absent, not an unhashable value.
    coldPolicy: input.coldPolicy && typeof input.coldPolicy === 'object' && !Array.isArray(input.coldPolicy) ? JSON.parse(JSON.stringify(input.coldPolicy)) : null
  };
  return { ...base, routeDigest: canonicalSha256(base) };
}

export function verifyColdRouteEnvelope({ route, recipientEmail, now = new Date() } = {}) {
  const deny = reason => ({ ok: false, reason });
  if (!route || typeof route !== 'object' || Array.isArray(route)) return deny('cold-route-envelope-not-object');
  const unknown = Object.keys(route).find(key => !COLD_ROUTE_FIELDS.has(key));
  if (unknown) return deny(`cold-route-envelope-unknown-field:${unknown}`);
  if (route.schemaVersion !== COLD_ROUTE_SCHEMA_VERSION) return deny('cold-route-envelope-version-invalid');
  if (route.routeType !== 'PUBLIC_BUSINESS_CONTACT') return deny('cold-route-type-invalid');
  if (route.provider !== 'smtp-relay') return deny('cold-route-requires-smtp-relay-provider');
  if (!SHA256_HEX.test(String(route.routeDigest || ''))) return deny('cold-route-digest-invalid');
  const { routeDigest, ...base } = route;
  let recomputed;
  try { recomputed = canonicalSha256(base); } catch { return deny('cold-route-canonicalization-failed'); }
  if (recomputed !== routeDigest) return deny('cold-route-digest-mismatch');
  if (!EMAIL_RE.test(route.recipientEmail) || route.recipientEmail !== text(recipientEmail, 320).toLowerCase()) return deny('cold-route-recipient-mismatch');
  try {
    const url = new URL(route.sourceUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return deny('cold-route-source-url-invalid');
  } catch { return deny('cold-route-source-url-invalid'); }
  if (!SHA256_HEX.test(String(route.sourceExcerptDigest || '')) || route.sourceExcerptDigest === plainSha256('')) return deny('cold-route-source-digest-invalid');
  const observed = Date.parse(route.sourceObservedAt);
  const expires = Date.parse(route.sourceExpiresAt);
  if (!Number.isFinite(observed) || !Number.isFinite(expires) || observed > expires) return deny('cold-route-time-invalid');
  if (observed > now.getTime() + 5 * 60_000) return deny('cold-route-observed-in-future');
  if (expires <= now.getTime()) return deny('cold-route-expired');
  if (now.getTime() - observed > COLD_ROUTE_MAX_EVIDENCE_AGE_DAYS * 86400000) return deny('cold-route-evidence-stale');
  return { ok: true, routeDigest };
}

/* ------------------------------------------------------------------ */
/* Founder authorization                                               */
/* ------------------------------------------------------------------ */

/** Minted only by code that holds the approval secret. */
export function createColdRouteAuthorization(input = {}, secret, now = new Date()) {
  const requestedDays = Number(input.expiresInDays ?? COLD_ROUTE_MAX_AUTHORIZATION_DAYS);
  const days = Math.min(COLD_ROUTE_MAX_AUTHORIZATION_DAYS, Math.max(1, Number.isFinite(requestedDays) ? requestedDays : COLD_ROUTE_MAX_AUTHORIZATION_DAYS));
  const base = {
    schemaVersion: 'uberbond.cold-route-authorization.v1',
    policyId: COLD_ROUTE_POLICY_ID,
    authorizedBy: text(input.authorizedBy, 120),
    authorizedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + days * 86400000).toISOString(),
    maxMessagesTotal: Math.min(COLD_ROUTE_MAX_MESSAGES_CEILING, Math.max(1, Math.trunc(Number(input.maxMessagesTotal) || 1))),
    recipientJurisdictions: [...COLD_ROUTE_RECIPIENT_JURISDICTIONS],
    operatorLocation: iso2(input.operatorLocation),
    senderEntityJurisdiction: iso2(input.senderEntityJurisdiction),
    controllerJurisdiction: iso2(input.controllerJurisdiction),
    transportRegion: iso2(input.transportRegion),
    providerTermsEvidenceRef: text(input.providerTermsEvidenceRef, 500),
    postalAddressDigest: text(input.postalAddressDigest, 64).toLowerCase(),
    postalAddressPublicationAuthorized: input.postalAddressPublicationAuthorized === true
  };
  const authorizationDigest = canonicalSha256(base);
  return { ...base, authorizationDigest, signature: hmac(secret, authorizationDigest) };
}

export function verifyColdRouteAuthorization({ authorization, secret, postalAddress = '', now = new Date() } = {}) {
  const a = authorization;
  const deny = reason => ({ ok: false, reason });
  if (!a || typeof a !== 'object' || Array.isArray(a)) return deny('cold-route-not-authorized-by-founder');
  const unknown = Object.keys(a).find(key => !AUTHORIZATION_FIELDS.has(key));
  if (unknown) return deny(`cold-route-authorization-unknown-field:${unknown}`);
  if (a.schemaVersion !== 'uberbond.cold-route-authorization.v1' || a.policyId !== COLD_ROUTE_POLICY_ID) return deny('cold-route-authorization-policy-mismatch');
  if (!SHA256_HEX.test(String(a.authorizationDigest || '')) || !SHA256_HEX.test(String(a.signature || ''))) return deny('cold-route-authorization-digest-invalid');
  const { authorizationDigest, signature, ...base } = a;
  let recomputed;
  try { recomputed = canonicalSha256(base); } catch { return deny('cold-route-authorization-canonicalization-failed'); }
  if (recomputed !== authorizationDigest) return deny('cold-route-authorization-digest-mismatch');
  let expected;
  try { expected = hmac(secret, authorizationDigest); } catch { return deny('cold-route-authorization-secret-invalid'); }
  if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) return deny('cold-route-authorization-signature-invalid');
  const at = Date.parse(a.authorizedAt);
  const until = Date.parse(a.expiresAt);
  if (!Number.isFinite(at) || !Number.isFinite(until) || until <= at || until - at > COLD_ROUTE_MAX_AUTHORIZATION_DAYS * 86400000) return deny('cold-route-authorization-time-invalid');
  if (at > now.getTime() + 5 * 60_000) return deny('cold-route-authorization-issued-in-future');
  if (until <= now.getTime()) return deny('cold-route-authorization-expired');
  if (!text(a.authorizedBy)) return deny('cold-route-authorization-approver-missing');
  if (!Number.isInteger(a.maxMessagesTotal) || a.maxMessagesTotal < 1 || a.maxMessagesTotal > COLD_ROUTE_MAX_MESSAGES_CEILING) return deny('cold-route-authorization-cap-invalid');
  if (JSON.stringify(a.recipientJurisdictions) !== JSON.stringify(COLD_ROUTE_RECIPIENT_JURISDICTIONS)) return deny('cold-route-authorization-recipient-jurisdiction-invalid');
  if (!text(a.providerTermsEvidenceRef)) return deny('cold-route-provider-terms-evidence-missing');
  if (a.postalAddressPublicationAuthorized !== true) return deny('cold-route-postal-publication-not-authorized');
  if (!text(postalAddress, 500) || a.postalAddressDigest !== addressDigest(postalAddress)) return deny('cold-route-postal-address-changed-since-authorization');

  // Sender-side facts. Every candidate home-law fact must clear on its own.
  const coverage = recipientEligibilityCoverage();
  for (const field of SENDER_SIDE_GATING_FIELDS) {
    const code = iso2(a[field]);
    if (coverage.senderJurisdictions[code] !== 'RECIPIENT_RULES_GOVERN') {
      return deny(`cold-route-sender-side-hold:${SENDER_SIDE_HOLD_CLASSIFICATION}:${field}=${code ? code.toLowerCase() : 'unknown'}`);
    }
  }
  return { ok: true, authorizationDigest, maxMessagesTotal: a.maxMessagesTotal, senderEntityJurisdiction: iso2(a.senderEntityJurisdiction) };
}

function subjectProblem(subject) {
  const s = text(subject, 300);
  if (!s) return 'cold-route-subject-missing';
  if (s.length > 100) return 'cold-route-subject-too-long';
  if (/^\s*(re|fw|fwd)\s*:/i.test(s)) return 'cold-route-subject-simulates-existing-thread';
  if (s.length >= 8 && s === s.toUpperCase() && /[A-Z]/.test(s)) return 'cold-route-subject-all-caps';
  return null;
}

/**
 * Evaluate the cold route for one exact recipient, sender and message.
 *  - senderAllocation: the result of selectFleetMailbox() for this prospect;
 *    the stored draft's sender slot must be the exact allocated, healthy,
 *    non-paused mailbox. A paused or quarantined ordinal is never allocated.
 *  - priorColdSends: count of cold-route messages already approved or sent
 *    under the current authorization.
 * Returns { ok:true, ... } only when every condition holds.
 */
export function evaluateColdRoutePolicyV1({
  route, recipientEmail, provider, now = new Date(),
  authorization, secret, sender = {}, prospect = {}, subject = '', body = '', suppression = {},
  senderAllocation = null, priorColdSends = 0
} = {}) {
  const deny = reason => ({ ok: false, reason });
  if (text(provider).toLowerCase() !== 'smtp-relay') return deny('cold-route-requires-smtp-relay-provider');
  const auth = verifyColdRouteAuthorization({ authorization, secret, postalAddress: sender.address, now });
  if (!auth.ok) return auth;
  if (!Number.isInteger(priorColdSends) || priorColdSends < 0) return deny('cold-route-prior-send-count-invalid');
  if (priorColdSends >= auth.maxMessagesTotal) return deny('cold-route-authorization-message-cap-reached');

  const envelope = verifyColdRouteEnvelope({ route, recipientEmail, now });
  if (!envelope.ok) return envelope;
  if (route.permissionScope !== 'COMMERCIAL_OUTREACH') return deny('cold-route-permission-scope-invalid');
  if (!COLD_ROUTE_RECIPIENT_JURISDICTIONS.includes(route.jurisdiction)) return deny('cold-route-recipient-jurisdiction-not-authorized');
  if (route.relevantToRecipientRole !== true) return deny('cold-route-role-relevance-unproven');
  if (route.noUnsolicitedStatementPresent !== false) return deny('cold-route-no-solicitation-statement-not-verified-absent');

  const cp = route.coldPolicy;
  if (!cp || typeof cp !== 'object' || Array.isArray(cp)) return deny('cold-route-policy-evidence-missing');
  const unknownField = Object.keys(cp).find(key => !COLD_POLICY_FIELDS.has(key));
  if (unknownField) return deny(`cold-route-policy-evidence-unknown-field:${unknownField}`);
  if (cp.policyId !== COLD_ROUTE_POLICY_ID) return deny('cold-route-policy-id-mismatch');
  if (cp.contactSource !== 'PUBLISHED_BUSINESS_CONTACT') return deny('cold-route-contact-must-be-published-business-contact');
  if (cp.collectionMethod !== 'MANUAL') return deny('cold-route-collection-must-be-manual');
  if (cp.recipientType !== 'CORPORATE') return deny('cold-route-recipient-must-be-corporate');
  if (cp.addressGuessed !== false) return deny('cold-route-address-guessing-forbidden');
  if (cp.noSolicitationNoticeChecked !== true) return deny('cold-route-no-solicitation-notice-check-missing');
  if (cp.noHarvestNoticeChecked !== true) return deny('cold-route-no-harvest-notice-check-missing');
  if (text(cp.roleRationale, 600).length < 20) return deny('cold-route-role-rationale-required');

  const address = classifyRecipientAddress(recipientEmail);
  if (!address.valid) return deny('cold-route-recipient-address-invalid');
  if (address.addressClass === 'PERSONAL_MAILBOX_PROVIDER') return deny('cold-route-personal-mailbox-not-business-recipient');
  if (address.addressClass === 'SYSTEM_ADDRESS') return deny('cold-route-system-address-not-a-recipient');

  // Exact sender: the stored draft's slot must be the mailbox the fleet allocator
  // currently considers healthy. This is what keeps a quarantined ordinal at zero.
  if (!senderAllocation?.ok || !text(prospect.inbox) || String(senderAllocation.slot) !== String(prospect.inbox)) return deny('cold-route-sender-not-the-allocated-healthy-mailbox');

  const postal = text(sender.address, 500);
  if (postal.length < 12) return deny('cold-route-postal-identity-missing');
  if (!text(sender.name) || !text(sender.company)) return deny('cold-route-sender-identity-incomplete');
  const subjectIssue = subjectProblem(subject);
  if (subjectIssue) return deny(subjectIssue);
  const messageBody = String(body || '');
  if (!COLD_AD_DISCLOSURE_PATTERN.test(messageBody)) return deny('cold-route-advertisement-disclosure-missing');
  if (!messageBody.includes(postal)) return deny('cold-route-postal-address-missing-from-body');
  const stopUrl = text(prospect.unsubscribeUrl, 1000);
  if (!stopUrl.startsWith('https://') || !messageBody.includes(stopUrl)) return deny('cold-route-unsubscribe-link-missing-from-body');
  if (!text(prospect.oneClickUnsubscribeUrl).startsWith('https://')) return deny('cold-route-one-click-unsubscribe-missing');

  const eligibility = compileRecipientEligibility({
    recipient: { email: recipientEmail, type: cp.recipientType, jurisdiction: route.jurisdiction },
    relationship: 'NONE',
    source: {
      kind: cp.contactSource, ref: route.sourceUrl, observedAt: route.sourceObservedAt,
      collectionMethod: cp.collectionMethod, noSolicitationNoticePresent: false, noHarvestNoticePresent: false
    },
    offerRelevance: { relatedToRecipientRole: true, rationale: cp.roleRationale },
    senderJurisdiction: auth.senderEntityJurisdiction,
    senderCompliance: {
      truthfulFromAndReplyTo: true,
      nonDeceptiveSubject: true,
      advertisementDisclosure: true,
      unsubscribeMechanism: true,
      // The unsubscribe endpoint suppresses on click; no deferred processing.
      unsubscribeHonoredWithinBusinessDays: 0
    },
    postalIdentity: { ok: true, status: 'UBERPOSTAL_IDENTITY_READY', identityDigest: addressDigest(postal) },
    transportColdB2BRule: 'ALLOWED',
    suppression,
    now
  });
  if (eligibility.legal.status !== 'PASSED') return deny(`cold-route-recipient-eligibility-${eligibility.legal.status.toLowerCase()}:${(eligibility.reasonCodes[0] || eligibility.requirementsUnmet[0] || 'unspecified')}`);
  if (eligibility.basis !== 'US_CAN_SPAM_OPT_OUT_REGIME' || eligibility.recipientJurisdiction !== 'US') return deny('cold-route-eligibility-basis-unexpected');

  return {
    ok: true,
    policyId: COLD_ROUTE_POLICY_ID,
    policyReason: 'smtp-relay-public-business-contact-v1',
    routeDigest: envelope.routeDigest,
    authorizationDigest: auth.authorizationDigest,
    maxMessagesTotal: auth.maxMessagesTotal,
    eligibilityEvidenceId: eligibility.evidenceId,
    canonicalForm: canonicalize({ policyId: COLD_ROUTE_POLICY_ID, routeDigest: envelope.routeDigest, authorizationDigest: auth.authorizationDigest })
  };
}
