/**
 * UberWarm² protected activation wiring donor.
 *
 * Composes the existing protected trusted suppliers into the two exact live
 * preflight closures the UberWarm² executor consumes. This donor establishes
 * no consent, loads no credential, opens no provider/SMTP socket and never
 * transmits mail. Every dependency is an injected CURRENT read callback, re-read
 * by the suppliers on each call.
 *
 * Fail-closed contract: if any typed reader is absent, untyped, bounded-clock or
 * age inputs are invalid, or composition throws, the factory returns falsy
 * (always-false) closures and ready:false. It never emits a synthetic true or a
 * stale cached verdict. Absence is denial.
 */
// Only the read-only preflight composer is imported here. The SMTP send bridge
// exported by the same module is deliberately never referenced, imported as a
// value, or called: this donor has no send capability and performs no retries.
import { createUberWarm2LivePreflight } from './uberwarm2-smtp-seed-bridge.mjs';
import { createUberWarm2TrustedHealthSupplier } from './uberwarm2-trusted-health-supplier.mjs';
import { createUberWarm2TrustedSeedConsentSupplier } from './uberwarm2-trusted-seed-consent-supplier.mjs';

export const UBERWARM2_PROTECTED_ACTIVATION_WIRING_VERSION =
  'uberbond.uberwarm2-protected-activation-wiring.v1';

// The exact typed readers required to reconcile sender health.
const HEALTH_READERS = Object.freeze([
  'readProviderMailbox', 'readProviderDomainDns', 'readVerifiedSmtp',
  'readLocalHold', 'readVerifiedDnsAlignment'
]);
// The exact typed readers required to reconcile seed consent.
const CONSENT_READERS = Object.freeze([
  'readAuthenticatedConsent', 'readCurrentReceiveReady', 'readSuppression'
]);

const MAX_AGE_MS = 300000;
// A denied result still hands back callable closures so a caller cannot mistake
// a missing function for authority; they always answer false.
const deniedClosure = async () => false;

function denied(reasonCodes) {
  return Object.freeze({
    ready: false,
    authorized: false,
    version: UBERWARM2_PROTECTED_ACTIVATION_WIRING_VERSION,
    reasonCodes: Object.freeze(reasonCodes.slice()),
    missingDependencies: Object.freeze(reasonCodes.filter(r => r.startsWith('missing-'))),
    // No live send authority is granted by this wiring; the production
    // credential provider does not exist in the donor and must be externally
    // authenticated before any transport is ever built.
    productionCredentialProvider: 'external-authentication-required',
    verifyCurrentSenderHealth: deniedClosure,
    verifyCurrentSeedConsent: deniedClosure,
    configured: false
  });
}

/**
 * Build the protected activation wiring from injected, current, trusted readers.
 * Success yields the exact verifyCurrentSenderHealth(email, now) and
 * verifyCurrentSeedConsent(email, probeId, now) closures plus a release-readiness
 * result. Any missing dependency yields falsy closures and ready:false.
 */
export function createUberWarm2ProtectedActivationWiring(dependencies = {}) {
  try {
    const deps = dependencies && typeof dependencies === 'object' && !Array.isArray(dependencies)
      ? dependencies : {};
    const transportMode = deps.transportMode ?? 'SMTP';
    if (!['SMTP', 'WINNR_INBOX_HTTPS_API'].includes(transportMode))
      return denied(['unsupported-transport-mode']);
    const required = [...HEALTH_READERS.filter(x => x !== 'readVerifiedSmtp'),
      transportMode === 'SMTP' ? 'readVerifiedSmtp' : 'readVerifiedHttpsTransport', ...CONSENT_READERS];
    const missing = required.filter(key => typeof deps[key] !== 'function');
    if (missing.length) return denied(missing.map(key => `missing-${key}`));

    const clock = typeof deps.clock === 'function' ? deps.clock : () => Date.now();
    const maxAgeMs = deps.maxAgeMs === undefined ? MAX_AGE_MS : deps.maxAgeMs;
    // The live preflight only accepts a bounded positive freshness window; an
    // unbounded or non-integer window cannot be treated as live evidence.
    if (!Number.isInteger(maxAgeMs) || maxAgeMs <= 0 || maxAgeMs > MAX_AGE_MS)
      return denied(['max-age-not-bounded']);

    const health = createUberWarm2TrustedHealthSupplier({
      readProviderMailbox: deps.readProviderMailbox,
      readProviderDomainDns: deps.readProviderDomainDns,
      readVerifiedSmtp: deps.readVerifiedSmtp,
      readVerifiedHttpsTransport: deps.readVerifiedHttpsTransport,
      transportMode,
      readLocalHold: deps.readLocalHold,
      readVerifiedDnsAlignment: deps.readVerifiedDnsAlignment,
      clock
    });
    const consent = createUberWarm2TrustedSeedConsentSupplier({
      readAuthenticatedConsent: deps.readAuthenticatedConsent,
      readCurrentReceiveReady: deps.readCurrentReceiveReady,
      readSuppression: deps.readSuppression,
      clock
    });
    const preflight = createUberWarm2LivePreflight({
      readSenderHealth: health.readSenderHealth,
      readSeedConsent: consent.readSeedConsent,
      clock,
      maxAgeMs
    });
    const { verifyCurrentSenderHealth, verifyCurrentSeedConsent } = preflight;
    if (typeof verifyCurrentSenderHealth !== 'function' || typeof verifyCurrentSeedConsent !== 'function')
      return denied(['preflight-composition-incomplete']);

    return Object.freeze({
      // Wiring composition is not live authentication or owner send authority.
      ready: false,
      authorized: false,
      configured: true,
      version: UBERWARM2_PROTECTED_ACTIVATION_WIRING_VERSION,
      reasonCodes: Object.freeze([]),
      missingDependencies: Object.freeze([]),
      // Activation readiness only. The production credential provider is not
      // present in the donor; a real authenticated provider is required before
      // any send path, and this wiring never builds a transport or sends.
      productionCredentialProvider: 'external-authentication-required',
      verifyCurrentSenderHealth,
      verifyCurrentSeedConsent
    });
  } catch {
    // Any unreadable dependency or factory failure denies; never promote.
    return denied(['wiring-state-unreadable']);
  }
}
