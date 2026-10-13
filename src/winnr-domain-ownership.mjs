// Ownership classification for a Winnr-managed domain, derived from the provider's own domain record.
//
// Two different things can both show up as "a domain Winnr manages":
//   1. A pre-warmed domain leased from Winnr (provider tag `pre-warmed`). Winnr controls registration.
//   2. A customer-owned domain registered elsewhere whose DNS Winnr hosts. The customer controls registration.
// A registrar of `external` is NOT enough to call a domain pre-warmed, and a pre-warmed tag is NOT evidence
// that the customer owns a domain. Each class is decided only from its own explicit evidence.
//
// Customer-owned domains become OWNER_CONFIRMED only when the caller supplies an owner attestation for that
// domain's registrar. Without it they stay UNVERIFIED, which the sending registry already treats as not
// control-confirmed. Nothing here contacts a registrar or changes provider state.

export const WINNR_DOMAIN_OWNERSHIP_VERSION = 'uberbond.winnr-domain-ownership.v1';

export const WINNR_PREWARMED_CLASS = 'WINNR_PREWARMED_LEASED';
export const WINNR_CUSTOMER_OWNED_CLASS = 'CUSTOMER_OWNED_WINNR_DNS';

const PREWARMED_TAG = 'pre-warmed';

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const lower = (value, max = 200) => clean(value, max).toLowerCase();

// The pilot domain was bought from Winnr as a pre-warmed domain. Keep that exact identity for the legacy pilot path.
export const WINNR_PILOT_PREWARMED_OWNERSHIP = Object.freeze({
  ok: true,
  classification: WINNR_PREWARMED_CLASS,
  ownershipStatus: 'PROVIDER_CONTROL_CONFIRMED',
  registrar: 'winnr-managed',
  provider: 'winnr-prewarmed',
  mailboxProvider: 'winnr-prewarmed',
  reasonCodes: []
});

export function classifyWinnrDomainOwnership({ providerDomain = null, ownerAttestedRegistrar = '', ownerAttestationRef = '' } = {}) {
  const domain = lower(providerDomain?.name, 253);
  if (!domain) return Object.freeze({ ok: false, version: WINNR_DOMAIN_OWNERSHIP_VERSION, reasonCodes: ['provider-domain-record-required'] });

  const tags = Array.isArray(providerDomain.tags) ? providerDomain.tags.map(tag => lower(tag, 80)) : [];
  if (tags.includes(PREWARMED_TAG)) {
    return Object.freeze({
      ok: true,
      version: WINNR_DOMAIN_OWNERSHIP_VERSION,
      domain,
      classification: WINNR_PREWARMED_CLASS,
      ownershipStatus: 'PROVIDER_CONTROL_CONFIRMED',
      registrar: 'winnr-managed',
      provider: 'winnr-prewarmed',
      mailboxProvider: 'winnr-prewarmed',
      reasonCodes: []
    });
  }

  const registrar = lower(providerDomain.registrar, 80);
  const dnsProvider = lower(providerDomain.dns_provider, 80);
  if (registrar === 'external' && dnsProvider.startsWith('winnr')) {
    const attested = lower(ownerAttestedRegistrar, 80);
    const attestationRef = clean(ownerAttestationRef, 300);
    const confirmed = Boolean(attested) && Boolean(attestationRef);
    return Object.freeze({
      ok: true,
      version: WINNR_DOMAIN_OWNERSHIP_VERSION,
      domain,
      classification: WINNR_CUSTOMER_OWNED_CLASS,
      ownershipStatus: confirmed ? 'OWNER_CONFIRMED' : 'UNVERIFIED',
      registrar: confirmed ? attested : 'external',
      provider: 'winnr-dns-hosted',
      mailboxProvider: 'winnr-customer-domain',
      ownerAttestationRef: confirmed ? attestationRef : null,
      reasonCodes: confirmed ? [] : ['owner-attestation-missing']
    });
  }

  return Object.freeze({ ok: false, version: WINNR_DOMAIN_OWNERSHIP_VERSION, domain, reasonCodes: ['domain-ownership-unclassifiable'] });
}
