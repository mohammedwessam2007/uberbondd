/**
 * Protected Winnr-to-UberWarm2 runtime composition.
 * Reuses existing signed sender-health and seed-consent suppliers.
 * No token handling, outgoing mail, receiver assumptions or write access.
 */
import { createUberWarm2WinnrReadOnlyObservationDonor } from './uberwarm2-winnr-readonly-observation-donor.mjs';
import { createUberWarm2ProtectedActivationWiring } from './uberwarm2-protected-activation-wiring-donor.mjs';

export const UBERWARM2_WINNR_PROTECTED_RUNTIME_VERSION = 'uberbond.uberwarm2-winnr-protected-runtime.v1';

export function createUberWarm2ProtectedWinnrRuntime({ client, trustedReaders = {}, clock, maxAgeMs = 300000, transportMode = 'SMTP' } = {}) {
  const vendor = createUberWarm2WinnrReadOnlyObservationDonor({ client, clock, maxAgeMs });
  const readers = trustedReaders && typeof trustedReaders === 'object' && !Array.isArray(trustedReaders)
    ? trustedReaders : {};
  const wiring = createUberWarm2ProtectedActivationWiring({
    readProviderMailbox: vendor.readProviderMailbox,
    readProviderDomainDns: vendor.readProviderDomainDns,
    readVerifiedSmtp: readers.readVerifiedSmtp,
    readVerifiedHttpsTransport: readers.readVerifiedHttpsTransport,
    transportMode,
    readLocalHold: readers.readLocalHold,
    readVerifiedDnsAlignment: readers.readVerifiedDnsAlignment,
    readAuthenticatedConsent: readers.readAuthenticatedConsent,
    readCurrentReceiveReady: readers.readCurrentReceiveReady,
    readSuppression: readers.readSuppression,
    clock, maxAgeMs
  });
  return Object.freeze({
    version: UBERWARM2_WINNR_PROTECTED_RUNTIME_VERSION,
    configured: vendor.ok === true && wiring.configured === true,
    ready: false,
    sendAuthority: 'NONE',
    providerVerified: false,
    reasonCodes: Object.freeze([...(vendor.reasonCodes || []), ...(wiring.reasonCodes || [])]),
    inspectProviderReadOnly: vendor.inspect,
    verifyCurrentSenderHealth: wiring.verifyCurrentSenderHealth,
    verifyCurrentSeedConsent: wiring.verifyCurrentSeedConsent,
    externalEffectAuthority: 'READ_ONLY_WINNR_GET'
  });
}
