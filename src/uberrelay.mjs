import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERRELAY_VERSION = 'uberbond.uberrelay.v1';
export const UBERRELAY_TRANSPORTS = Object.freeze(['SMTP', 'HTTP_API']);
export const UBERRELAY_PURPOSES = Object.freeze(['COLD_B2B_OUTREACH', 'TRANSACTIONAL', 'OPT_IN_MARKETING']);

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');

function ageHours(value, now) {
  const observed = Date.parse(String(value || ''));
  const current = now instanceof Date ? now.getTime() : Date.parse(String(now || ''));
  if (!Number.isFinite(observed) || !Number.isFinite(current)) return Infinity;
  return (current - observed) / 3600000;
}

function zero(extra = {}) {
  return {
    version: UBERRELAY_VERSION,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

/**
 * Compile a provider-neutral truth record for a third-party egress route.
 *
 * UberRelay deliberately does not infer permission from product marketing,
 * mailbox count, sender-username count, IP count, or API availability. For
 * cold B2B outreach, explicit provider-policy evidence is required.
 *
 * This module does not dispatch email. It converts observed provider facts
 * into the exact egress evidence UberEgress can admit or reject.
 */
export function compileUberRelayRoute({
  routeId = '',
  provider = '',
  purpose = 'COLD_B2B_OUTREACH',
  transport = '',
  domain = '',
  endpoint = '',
  authorized = false,
  termsCompatible = false,
  coldOutreachAuthorized = false,
  authenticated = false,
  providerReady = false,
  customDomainVerified = false,
  reputationObserved = false,
  senderUsernameCount = 0,
  observedDailyCap = null,
  observedAt = '',
  evidenceSource = '',
  providerTermsUrl = '',
  inboundMode = 'NONE',
  now = new Date(),
  maxEvidenceAgeHours = 72
} = {}) {
  const normalizedPurpose = clean(purpose, 80).toUpperCase();
  const normalizedTransport = clean(transport, 40).toUpperCase();
  const normalizedInbound = clean(inboundMode, 80).toUpperCase();
  const reasons = [];

  if (!clean(routeId, 180)) reasons.push('route-id-required');
  if (!clean(provider, 160)) reasons.push('provider-required');
  if (!UBERRELAY_PURPOSES.includes(normalizedPurpose)) reasons.push('supported-purpose-required');
  if (!UBERRELAY_TRANSPORTS.includes(normalizedTransport)) reasons.push('supported-transport-required');
  if (!clean(domain, 253)) reasons.push('sending-domain-required');
  if (!clean(endpoint, 1000)) reasons.push('provider-endpoint-required');
  if (authorized !== true) reasons.push('route-not-authorized');
  if (termsCompatible !== true) reasons.push('provider-terms-not-confirmed-compatible');
  if (normalizedPurpose === 'COLD_B2B_OUTREACH' && coldOutreachAuthorized !== true) {
    reasons.push('cold-outreach-provider-authorization-required');
  }
  if (authenticated !== true) reasons.push('relay-authentication-not-observed');
  if (providerReady !== true) reasons.push('relay-provider-not-ready');
  if (customDomainVerified !== true) reasons.push('custom-domain-not-verified');
  if (reputationObserved !== true) reasons.push('reputation-not-observed');
  if (!clean(evidenceSource, 1000)) reasons.push('evidence-source-required');
  if (!clean(providerTermsUrl, 1000)) reasons.push('provider-terms-evidence-required');

  const cap = finite(observedDailyCap);
  if (cap == null || cap <= 0) reasons.push('positive-observed-daily-cap-required');

  const maxAge = finite(maxEvidenceAgeHours);
  if (maxAge == null || maxAge <= 0) reasons.push('positive-evidence-age-window-required');
  const observedAgeHours = ageHours(observedAt, now);
  if (!Number.isFinite(observedAgeHours) || observedAgeHours < -0.05 || (maxAge != null && observedAgeHours > maxAge)) {
    reasons.push('route-evidence-stale-or-undated');
  }

  const senderCount = Math.max(0, Math.floor(finite(senderUsernameCount) || 0));
  const ready = reasons.length === 0;
  const routeType = normalizedTransport === 'SMTP' ? 'AUTHORIZED_SMTP_RELAY' : 'AUTHORIZED_HTTP_RELAY';

  const providerProfile = {
    provider: clean(provider, 160) || null,
    purpose: normalizedPurpose || null,
    transport: normalizedTransport || null,
    domain: clean(domain, 253).toLowerCase() || null,
    endpointHost: (() => {
      try { return new URL(String(endpoint)).host; } catch { return null; }
    })(),
    senderUsernameCount: senderCount,
    senderIdentityRule: 'IDENTITY_COUNT_NEVER_MULTIPLIES_OBSERVED_EGRESS_CAPACITY',
    inboundMode: normalizedInbound || 'NONE',
    outboundOnly: normalizedInbound === 'NONE' || normalizedInbound === 'EXTERNAL_REPLY_TO',
    customDomainVerified: customDomainVerified === true,
    reputationObserved: reputationObserved === true,
    providerTermsUrl: clean(providerTermsUrl, 1000) || null,
    observedAt: observedAt || null,
    evidenceSource: clean(evidenceSource, 1000) || null
  };

  const egressRoute = {
    routeId: clean(routeId, 180) || null,
    type: routeType,
    provider: clean(provider, 160) || null,
    status: ready ? 'READY' : 'BLOCKED',
    authorized: authorized === true,
    termsCompatible: termsCompatible === true && (normalizedPurpose !== 'COLD_B2B_OUTREACH' || coldOutreachAuthorized === true),
    relayAuthenticated: authenticated === true,
    providerReady: providerReady === true,
    observedColdDailyCap: ready ? Math.floor(cap) : 0,
    observedAt: observedAt || null,
    evidenceSource: clean(evidenceSource, 1000) || null
  };

  const result = {
    ok: ready,
    status: ready ? 'UBERRELAY_ROUTE_READY' : 'UBERRELAY_BLOCKED',
    reasonCodes: [...new Set(reasons)],
    providerProfile,
    egressRoute,
    truthBoundary: 'UberRelay compiles observed, authorized third-party transport into UberEgress evidence. It does not create provider permission, reputation, inbox placement, quota increases, inbound mailboxes, or send authority.',
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS)
  };
  result.routeDigest = sha(JSON.stringify({ providerProfile, egressRoute }));
  return Object.freeze(result);
}

/**
 * Microsoft ACS fact helper. It records documented ACS topology without
 * pretending sender usernames are Exchange inboxes or independent quotas.
 */
export function compileAzureAcsFacts({
  senderUsernameCount = 0,
  linkedDomainCount = 0,
  defaultHourlyLimit = 100,
  defaultPerMinuteLimit = 30,
  outboundOnly = true
} = {}) {
  return Object.freeze({
    provider: 'azure-communication-services-email',
    senderUsernameCount: Math.max(0, Math.floor(finite(senderUsernameCount) || 0)),
    linkedDomainCount: Math.max(0, Math.floor(finite(linkedDomainCount) || 0)),
    defaultHourlyLimit: Math.max(0, Math.floor(finite(defaultHourlyLimit) || 0)),
    defaultPerMinuteLimit: Math.max(0, Math.floor(finite(defaultPerMinuteLimit) || 0)),
    outboundOnly: outboundOnly === true,
    semantics: Object.freeze({
      senderUsernamesAreMailboxes: false,
      senderUsernamesCreateIndependentQuota: false,
      senderUsernamesCreateIndependentReputation: false,
      quotaMustBeObservedAfterProviderApproval: true
    }),
    externalEffectAuthority: 'NONE'
  });
}
