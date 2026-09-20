// Live registrar evidence for the scalable outreach fleet.
//
// This is deliberately separate from OWNED_ROOT_DOMAINS in
// src/domain-purpose-plan.mjs. The two canonical roots remain a protected
// architectural invariant; these exact GoDaddy observations describe the
// additional sender-domain inventory without widening root-domain safety
// checks or granting DNS, mailbox, reputation, or send authority.

export const OUTREACH_DOMAIN_FLEET_POLICY_VERSION = 'outreach-domain-fleet-1.0.0';

export const OUTREACH_DOMAIN_FLEET_EVIDENCE = Object.freeze({
  provider: 'GoDaddy',
  surface: 'Authenticated Domain Portfolio',
  observedUrl: 'https://dcc.godaddy.com/control/portfolio',
  observedAt: '2026-09-20T20:11:21.860Z',
  portfolioCountLabel: '1-30 of 30 domains',
  ownershipEvidence: 'VISIBLE_IN_AUTHENTICATED_GODADDY_DOMAIN_PORTFOLIO',
  ownershipDateObserved: '2026-09-20',
  purchaseTimestampObserved: null,
  caveat: 'Portfolio visibility proves current registrar-account inventory; it does not prove DNS, mail authentication, mailbox readiness, reputation, legal eligibility, or send authority.'
});

// These are the 28 non-canonical roots visible alongside the two original
// UberBond roots in the live GoDaddy portfolio. Keep this list exact: an
// unobserved or guessed domain must not enter the sending fleet.
export const OUTREACH_FLEET_DOMAINS = Object.freeze([
  'uberbond.site',
  'uberbondai.shop',
  'uberbondapp.site',
  'uberbondcloud.shop',
  'uberbondconnect.online',
  'uberbondcore.space',
  'uberbondengine.website',
  'uberbondflow.space',
  'uberbondforge.space',
  'uberbondglobal.website',
  'uberbondgrid.space',
  'uberbondgroup.site',
  'uberbondgrowth.online',
  'uberbondhq.site',
  'uberbondinfo.site',
  'uberbondlabs.site',
  'uberbondlaunch.website',
  'uberbondlink.shop',
  'uberbondops.website',
  'uberbondpartners.online',
  'uberbondpilot.website',
  'uberbondpro.shop',
  'uberbondpro.website',
  'uberbondreach.online',
  'uberbondsmail.site',
  'uberbondstack.website',
  'uberbondworks.site',
  'uberbondworks.website'
]);

export const OUTREACH_FLEET_DOMAIN_RECORDS = Object.freeze(
  OUTREACH_FLEET_DOMAINS.map(domain => Object.freeze({
    domain,
    registrar: 'GoDaddy',
    ownershipEvidence: {
      status: 'VERIFIED_BY_AUTHENTICATED_PORTFOLIO_OBSERVATION',
      observedAt: OUTREACH_DOMAIN_FLEET_EVIDENCE.observedAt,
      ownershipDateObserved: OUTREACH_DOMAIN_FLEET_EVIDENCE.ownershipDateObserved,
      evidencePointer: 'godaddy-portfolio-20260920'
    },
    intendedPurpose: 'OUTREACH_FLEET_SENDER_DOMAIN',
    assignedMailCell: null,
    senderIdentityAllocation: {
      plannedPersistentIdentitiesPerDomain: 3,
      allocated: 0,
      state: 'NOT_ALLOCATED'
    },
    dns: { state: 'UNKNOWN_NOT_CONFIGURED_OR_NOT_VERIFIED' },
    spf: { state: 'UNKNOWN_NOT_VERIFIED' },
    dkim: { state: 'UNKNOWN_SELECTOR_AND_KEY_NOT_OBSERVED' },
    dmarc: { state: 'UNKNOWN_NOT_VERIFIED' },
    mx: { state: 'UNKNOWN_NOT_VERIFIED' },
    ptrDependency: { state: 'DEPENDENT_ON_MAIL_HOST_EVIDENCE' },
    tls: { state: 'UNKNOWN_NOT_VERIFIED' },
    reputation: { state: 'UNKNOWN_NO_SENDING_EVIDENCE' },
    campaignEligibility: 'BLOCKED_UNTIL_DNS_MAILBOX_REPUTATION_LEGAL_AND_OWNER_GATES',
    promotionState: 'UNCONFIGURED',
    pauseRevocationState: 'NOT_ACTIVATED',
    evidencePointers: ['godaddy-portfolio-20260920']
  }))
);

export function isOutreachFleetDomain(value) {
  const domain = String(value ?? '').trim().toLowerCase().replace(/\.$/, '');
  return OUTREACH_FLEET_DOMAINS.includes(domain);
}

export function outreachFleetPlan() {
  return {
    policyVersion: OUTREACH_DOMAIN_FLEET_POLICY_VERSION,
    evidence: { ...OUTREACH_DOMAIN_FLEET_EVIDENCE },
    canonicalRootsRemainSeparate: true,
    domains: OUTREACH_FLEET_DOMAIN_RECORDS.map(record => ({
      ...record,
      ownershipEvidence: { ...record.ownershipEvidence },
      senderIdentityAllocation: { ...record.senderIdentityAllocation },
      dns: { ...record.dns },
      spf: { ...record.spf },
      dkim: { ...record.dkim },
      dmarc: { ...record.dmarc },
      mx: { ...record.mx },
      ptrDependency: { ...record.ptrDependency },
      tls: { ...record.tls },
      reputation: { ...record.reputation },
      evidencePointers: [...record.evidencePointers]
    })),
    summary: {
      totalPhysicalDomainsObserved: 30,
      canonicalRootDomains: 2,
      outreachFleetDomains: OUTREACH_FLEET_DOMAINS.length,
      configuredDomains: 0,
      authVerifiedDomains: 0,
      campaignEligibleDomains: 0
    }
  };
}
