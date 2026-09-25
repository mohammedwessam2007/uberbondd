// Founder launch facts: the one owner-supplied input the outreach gates need.
//
// Several gates each wait on a fact only the founder can supply: the legal
// sender name and postal address (UberPostal / CAN-SPAM / CASL), the sender's
// own jurisdiction (recipient eligibility), which fleet domains carry cold
// traffic (mail-cell bootstrap), which offer lineage launches, and whether a
// bounded canary is authorized. Collecting them in one file keeps the founder
// to one action and lets the machine say exactly what is still missing.
//
// This compiles facts; it verifies none of them and authorizes nothing by
// itself. Campaign dispatch still needs its own separate authorization receipt.

import crypto from 'node:crypto';
import { compileUberPostalIdentity } from './uberpostal-identity.mjs';
import { isOutreachFleetDomain } from './outreach-domain-fleet.mjs';
import { recipientEligibilityCoverage } from './uberoutbound-recipient-eligibility.mjs';

export const OUTREACH_LAUNCH_FACTS_VERSION = 'uberbond.outreach-launch-facts.v1';
export const OFFER_LINEAGES = Object.freeze({
  CURRENT_FOUR_OFFER_GENOME: 'src/uberreply-four-offer-genome.mjs (USD 450 / 900 / 950 / 750 pilot hypotheses)',
  HIGH_TICKET_LINEAGE: 'Proven Business Genome 2026-08-05 pilot lanes (USD 1,000-4,000 hypotheses; see PR #993 frontier note)'
});

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const sha256 = value => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');

export const LAUNCH_FACTS_TEMPLATE = Object.freeze({
  legalName: '',
  postal: { line1: '', line2: '', city: '', region: '', postalCode: '', country: '' },
  postalEvidenceRef: 'founder-attestation:YYYY-MM-DD',
  postalAddressAuthorized: false,
  publicFooterAuthorized: false,
  senderJurisdiction: '',
  senderDomains: ['uberbondhq.site'],
  replyToAddress: '',
  offerLineage: '',
  canary: { authorized: false, maxRecipients: 20, recipientJurisdictions: ['US'], expiresAt: '' }
});

export function compileOutreachLaunchFacts(facts = {}, { now = new Date() } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const missing = [];
  const warnings = [];

  const postal = facts.postal && typeof facts.postal === 'object' ? facts.postal : {};
  const postalIdentity = compileUberPostalIdentity({
    legalName: facts.legalName,
    line1: postal.line1, line2: postal.line2, city: postal.city, region: postal.region, postalCode: postal.postalCode, country: postal.country,
    ownerAuthorized: facts.postalAddressAuthorized === true,
    publicFooterAuthorized: facts.publicFooterAuthorized === true,
    evidenceRef: /YYYY-MM-DD/.test(clean(facts.postalEvidenceRef, 1000)) ? '' : facts.postalEvidenceRef,
    now: at
  });
  if (!postalIdentity.ok) missing.push(...postalIdentity.blockers.map(code => `postal:${code}`));

  const coverage = recipientEligibilityCoverage();
  const senderJurisdiction = clean(facts.senderJurisdiction, 8).toUpperCase().replace(/^UK$/, 'GB');
  if (!/^[A-Z]{2}$/.test(senderJurisdiction)) missing.push('sender-jurisdiction-iso2-required');
  else if (coverage.senderJurisdictions[senderJurisdiction] !== 'RECIPIENT_RULES_GOVERN') {
    warnings.push(`sender-jurisdiction-${senderJurisdiction.toLowerCase()}-holds-every-cold-recipient-for-legal-review`);
  }

  const domains = (Array.isArray(facts.senderDomains) ? facts.senderDomains : []).map(d => clean(d, 253).toLowerCase().replace(/\.$/, '')).filter(Boolean);
  const unknownDomains = domains.filter(d => !isOutreachFleetDomain(d));
  if (!domains.length) missing.push('at-least-one-outreach-fleet-sender-domain-required');
  if (unknownDomains.length) missing.push(...unknownDomains.map(d => `sender-domain-not-in-verified-fleet:${d}`));
  if (new Set(domains).size !== domains.length) missing.push('duplicate-sender-domain');

  const replyTo = clean(facts.replyToAddress, 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) missing.push('monitored-reply-to-address-required');

  const offerLineage = clean(facts.offerLineage, 80).toUpperCase();
  if (!OFFER_LINEAGES[offerLineage]) missing.push('offer-lineage-decision-required');

  const canary = facts.canary && typeof facts.canary === 'object' ? facts.canary : {};
  const maxRecipients = Number(canary.maxRecipients);
  const recipientJurisdictions = (Array.isArray(canary.recipientJurisdictions) ? canary.recipientJurisdictions : []).map(j => clean(j, 8).toUpperCase().replace(/^UK$/, 'GB'));
  if (canary.authorized !== true) missing.push('canary-authorization-required');
  if (!Number.isInteger(maxRecipients) || maxRecipients < 1 || maxRecipients > 200) missing.push('canary-max-recipients-integer-1-to-200-required');
  if (!Number.isFinite(Date.parse(canary.expiresAt)) || Date.parse(canary.expiresAt) <= at.getTime()) missing.push('canary-future-expiry-required');
  for (const j of recipientJurisdictions) {
    if (!coverage.coldRecipientJurisdictionsEncoded.includes(j)) warnings.push(`recipient-jurisdiction-${j.toLowerCase()}-not-encoded-cold-recipients-will-hold`);
  }
  if (!recipientJurisdictions.length) missing.push('canary-recipient-jurisdictions-required');

  const ready = missing.length === 0;
  const compiled = {
    version: OUTREACH_LAUNCH_FACTS_VERSION,
    compiledAt: at.toISOString(),
    status: ready ? 'LAUNCH_FACTS_COMPLETE' : 'LAUNCH_FACTS_INCOMPLETE',
    missing,
    warnings,
    postalIdentity: postalIdentity.ok ? { status: postalIdentity.status, identityDigest: postalIdentity.identityDigest, footer: postalIdentity.identity.footer } : { status: postalIdentity.status },
    mailCellBootstrapEnv: domains.length && !unknownDomains.length ? `UBERDOSO_POSTAL_SENDER_DOMAINS=${domains.join(',')}` : null,
    eligibilityContext: {
      senderJurisdiction: senderJurisdiction || null,
      postalIdentityDigest: postalIdentity.ok ? postalIdentity.identityDigest : null
    },
    offerLineage: OFFER_LINEAGES[offerLineage] ? offerLineage : null,
    canary: {
      authorized: canary.authorized === true,
      maxRecipients: Number.isInteger(maxRecipients) ? maxRecipients : null,
      recipientJurisdictions,
      expiresAt: Number.isFinite(Date.parse(canary.expiresAt)) ? new Date(canary.expiresAt).toISOString() : null
    },
    replyToDigest: replyTo ? sha256(replyTo) : null,
    sendAuthority: false,
    truthBoundary: 'Founder-supplied facts compiled for the existing gates. Nothing here is verified against the outside world, and a complete facts file still needs the separate per-campaign dispatch authorization, a live mail cell, published DNS and per-recipient eligibility before any message may be sent.'
  };
  compiled.factsDigest = sha256(JSON.stringify({ ...compiled, compiledAt: null }));
  return compiled;
}
