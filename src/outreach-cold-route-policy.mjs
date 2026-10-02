// SMTP_RELAY_PUBLIC_BUSINESS_CONTACT_V1 — a deliberately narrow, fail-closed
// cold first-touch route for the existing Winnr smtp-relay substrate.
//
// It does NOT add PUBLIC_BUSINESS_CONTACT to the generic smtp-relay allow-list
// (src/outreach-governance.mjs still refuses it by default). Every condition
// below must hold at once, and the legal decision is recomputed here from
// facts via the existing recipient-eligibility compiler rather than trusted
// from a caller-supplied result. Capability never creates authority: nothing
// is allowed until the founder records a signed, expiring authorization, and
// that authorization is bound to the exact published postal address.

import crypto from 'node:crypto';
import { compileRecipientEligibility, classifyRecipientAddress, recipientEligibilityCoverage } from './uberoutbound-recipient-eligibility.mjs';

export const COLD_ROUTE_POLICY_ID = 'SMTP_RELAY_PUBLIC_BUSINESS_CONTACT_V1';
export const COLD_ROUTE_RECIPIENT_JURISDICTIONS = Object.freeze(['US']);
export const COLD_ROUTE_MAX_MESSAGES_CEILING = 5;
export const COLD_ROUTE_MAX_AUTHORIZATION_DAYS = 7;
export const COLD_POLICY_FIELDS = new Set([
  'policyId', 'contactSource', 'collectionMethod', 'recipientType',
  'noSolicitationNoticeChecked', 'noHarvestNoticeChecked', 'addressGuessed', 'roleRationale'
]);
const AUTHORIZATION_FIELDS = new Set([
  'schemaVersion', 'policyId', 'authorizedBy', 'authorizedAt', 'expiresAt', 'maxMessagesTotal',
  'recipientJurisdictions', 'senderJurisdiction', 'providerTermsEvidenceRef',
  'postalAddressDigest', 'postalAddressPublicationAuthorized', 'authorizationDigest', 'signature'
]);
// Required-at-send disclosure that the message is a commercial solicitation.
export const COLD_AD_DISCLOSURE_PATTERN = /\bthis is (an? )?(advertisement|commercial (message|email|solicitation)|solicitation)\b/i;

const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const sha256 = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const SHA256_HEX = /^[a-f0-9]{64}$/;

export const addressDigest = address => sha256(text(address, 500).toLowerCase().replace(/\s+/g, ' '));

function hmac(secret, digest) {
  const key = String(secret || '');
  if (key.length < 32) throw new Error('approval secret must contain at least 32 characters');
  return crypto.createHmac('sha256', key).update(String(digest), 'utf8').digest('hex');
}

/** Founder authorization, minted only by code that holds the approval secret. */
export function createColdRouteAuthorization(input = {}, secret, now = new Date()) {
  const authorizedAt = now.toISOString();
  const requestedDays = Number(input.expiresInDays ?? COLD_ROUTE_MAX_AUTHORIZATION_DAYS);
  const days = Math.min(COLD_ROUTE_MAX_AUTHORIZATION_DAYS, Math.max(1, Number.isFinite(requestedDays) ? requestedDays : COLD_ROUTE_MAX_AUTHORIZATION_DAYS));
  const base = {
    schemaVersion: 'uberbond.cold-route-authorization.v1',
    policyId: COLD_ROUTE_POLICY_ID,
    authorizedBy: text(input.authorizedBy, 120),
    authorizedAt,
    expiresAt: new Date(now.getTime() + days * 86400000).toISOString(),
    maxMessagesTotal: Math.min(COLD_ROUTE_MAX_MESSAGES_CEILING, Math.max(1, Math.trunc(Number(input.maxMessagesTotal) || 1))),
    recipientJurisdictions: [...COLD_ROUTE_RECIPIENT_JURISDICTIONS],
    senderJurisdiction: text(input.senderJurisdiction, 8).toUpperCase().replace(/^UK$/, 'GB'),
    providerTermsEvidenceRef: text(input.providerTermsEvidenceRef, 500),
    postalAddressDigest: text(input.postalAddressDigest, 64).toLowerCase(),
    postalAddressPublicationAuthorized: input.postalAddressPublicationAuthorized === true
  };
  const authorizationDigest = sha256(base);
  return { ...base, authorizationDigest, signature: hmac(secret, authorizationDigest) };
}

export function verifyColdRouteAuthorization({ authorization, secret, postalAddress = '', now = new Date() } = {}) {
  const a = authorization;
  if (!a || typeof a !== 'object' || Array.isArray(a)) return { ok: false, reason: 'cold-route-not-authorized-by-founder' };
  const unknown = Object.keys(a).find(key => !AUTHORIZATION_FIELDS.has(key));
  if (unknown) return { ok: false, reason: `cold-route-authorization-unknown-field:${unknown}` };
  if (a.schemaVersion !== 'uberbond.cold-route-authorization.v1' || a.policyId !== COLD_ROUTE_POLICY_ID) return { ok: false, reason: 'cold-route-authorization-policy-mismatch' };
  if (!SHA256_HEX.test(String(a.authorizationDigest || '')) || !SHA256_HEX.test(String(a.signature || ''))) return { ok: false, reason: 'cold-route-authorization-digest-invalid' };
  const { authorizationDigest, signature, ...base } = a;
  if (sha256(base) !== authorizationDigest) return { ok: false, reason: 'cold-route-authorization-digest-mismatch' };
  let expected;
  try { expected = hmac(secret, authorizationDigest); } catch { return { ok: false, reason: 'cold-route-authorization-secret-invalid' }; }
  if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) return { ok: false, reason: 'cold-route-authorization-signature-invalid' };
  const at = Date.parse(a.authorizedAt);
  const until = Date.parse(a.expiresAt);
  if (!Number.isFinite(at) || !Number.isFinite(until) || until <= at || until - at > COLD_ROUTE_MAX_AUTHORIZATION_DAYS * 86400000) return { ok: false, reason: 'cold-route-authorization-time-invalid' };
  if (at > now.getTime() + 5 * 60_000) return { ok: false, reason: 'cold-route-authorization-issued-in-future' };
  if (until <= now.getTime()) return { ok: false, reason: 'cold-route-authorization-expired' };
  if (!text(a.authorizedBy)) return { ok: false, reason: 'cold-route-authorization-approver-missing' };
  if (!Number.isInteger(a.maxMessagesTotal) || a.maxMessagesTotal < 1 || a.maxMessagesTotal > COLD_ROUTE_MAX_MESSAGES_CEILING) return { ok: false, reason: 'cold-route-authorization-cap-invalid' };
  if (JSON.stringify(a.recipientJurisdictions) !== JSON.stringify(COLD_ROUTE_RECIPIENT_JURISDICTIONS)) return { ok: false, reason: 'cold-route-authorization-recipient-jurisdiction-invalid' };
  if (!text(a.providerTermsEvidenceRef)) return { ok: false, reason: 'cold-route-provider-terms-evidence-missing' };
  if (a.postalAddressPublicationAuthorized !== true) return { ok: false, reason: 'cold-route-postal-publication-not-authorized' };
  if (!text(postalAddress, 500) || a.postalAddressDigest !== addressDigest(postalAddress)) return { ok: false, reason: 'cold-route-postal-address-changed-since-authorization' };
  // The sender's own jurisdiction is a separate legal question from the
  // recipient's. Only senders the eligibility compiler encodes as adding no
  // restriction may use this route; others hold (e.g. an Egypt sender).
  const coverage = recipientEligibilityCoverage();
  if (coverage.senderJurisdictions[a.senderJurisdiction] !== 'RECIPIENT_RULES_GOVERN') return { ok: false, reason: `cold-route-sender-jurisdiction-${text(a.senderJurisdiction, 8).toLowerCase() || 'unknown'}-held-for-legal-review` };
  return { ok: true, authorizationDigest, maxMessagesTotal: a.maxMessagesTotal, senderJurisdiction: a.senderJurisdiction };
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
 * Evaluate the cold route for one exact recipient and message.
 * Returns { ok:true, ... } only when every condition holds.
 */
export function evaluateColdRoutePolicyV1({
  route, recipientEmail, provider, now = new Date(),
  authorization, secret, sender = {}, prospect = {}, subject = '', body = '', suppression = {}
} = {}) {
  const deny = reason => ({ ok: false, reason });
  if (text(provider).toLowerCase() !== 'smtp-relay') return deny('cold-route-requires-smtp-relay-provider');
  const auth = verifyColdRouteAuthorization({ authorization, secret, postalAddress: sender.address, now });
  if (!auth.ok) return auth;

  if (route?.routeType !== 'PUBLIC_BUSINESS_CONTACT') return deny('cold-route-type-invalid');
  if (route.permissionScope !== 'COMMERCIAL_OUTREACH') return deny('cold-route-permission-scope-invalid');
  if (!COLD_ROUTE_RECIPIENT_JURISDICTIONS.includes(route.jurisdiction)) return deny('cold-route-recipient-jurisdiction-not-authorized');
  if (route.relevantToRecipientRole !== true) return deny('cold-route-role-relevance-unproven');
  if (route.noUnsolicitedStatementPresent !== false) return deny('cold-route-no-solicitation-statement-not-verified-absent');

  const cp = route.coldPolicy;
  if (!cp || typeof cp !== 'object' || Array.isArray(cp)) return deny('cold-route-policy-evidence-missing');
  const unknown = Object.keys(cp).find(key => !COLD_POLICY_FIELDS.has(key));
  if (unknown) return deny(`cold-route-policy-evidence-unknown-field:${unknown}`);
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
    senderJurisdiction: auth.senderJurisdiction,
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
    authorizationDigest: auth.authorizationDigest,
    maxMessagesTotal: auth.maxMessagesTotal,
    eligibilityEvidenceId: eligibility.evidenceId
  };
}
