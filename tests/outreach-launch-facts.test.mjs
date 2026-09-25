import test from 'node:test';
import assert from 'node:assert/strict';
import { compileOutreachLaunchFacts, LAUNCH_FACTS_TEMPLATE } from '../src/outreach-launch-facts.mjs';

const NOW = new Date('2026-09-25T00:00:00Z');
const complete = {
  legalName: 'Example Sender LLC',
  postal: { line1: '1 Example Street', city: 'Example City', postalCode: '00000', country: 'US' },
  postalEvidenceRef: 'founder-attestation:2026-09-25',
  postalAddressAuthorized: true,
  publicFooterAuthorized: true,
  senderJurisdiction: 'US',
  senderDomains: ['uberbondhq.site', 'uberbondlabs.site'],
  replyToAddress: 'replies@uberbond.agency',
  offerLineage: 'CURRENT_FOUR_OFFER_GENOME',
  canary: { authorized: true, maxRecipients: 20, recipientJurisdictions: ['US', 'GB'], expiresAt: '2026-10-05T00:00:00Z' }
};

test('the untouched template is incomplete and never ready', () => {
  const r = compileOutreachLaunchFacts(LAUNCH_FACTS_TEMPLATE, { now: NOW });
  assert.equal(r.status, 'LAUNCH_FACTS_INCOMPLETE');
  assert.ok(r.missing.includes('postal:founder-address-authorization-required'));
  assert.ok(r.missing.includes('postal:postal-address-evidence-reference-required'), 'the placeholder evidence ref must not count');
  assert.ok(r.missing.includes('offer-lineage-decision-required'));
  assert.ok(r.missing.includes('canary-authorization-required'));
  assert.equal(r.sendAuthority, false);
});

test('complete facts compile into the objects the gates consume', () => {
  const r = compileOutreachLaunchFacts(complete, { now: NOW });
  assert.equal(r.status, 'LAUNCH_FACTS_COMPLETE', JSON.stringify(r.missing));
  assert.deepEqual(r.warnings, []);
  assert.equal(r.mailCellBootstrapEnv, 'UBERDOSO_POSTAL_SENDER_DOMAINS=uberbondhq.site,uberbondlabs.site');
  assert.match(r.eligibilityContext.postalIdentityDigest, /^[0-9a-f]{64}$/);
  assert.equal(r.eligibilityContext.senderJurisdiction, 'US');
  assert.equal(r.offerLineage, 'CURRENT_FOUR_OFFER_GENOME');
  assert.equal(JSON.stringify(r).includes('replies@uberbond.agency'), false);
  assert.equal(r.sendAuthority, false);
});

test('address fields alone never imply authorization', () => {
  const r = compileOutreachLaunchFacts({ ...complete, postalAddressAuthorized: undefined }, { now: NOW });
  assert.ok(r.missing.includes('postal:founder-address-authorization-required'));
});

test('an Egypt-based sender is warned that cold recipients will hold for legal review', () => {
  const r = compileOutreachLaunchFacts({ ...complete, senderJurisdiction: 'EG' }, { now: NOW });
  assert.ok(r.warnings.includes('sender-jurisdiction-eg-holds-every-cold-recipient-for-legal-review'));
});

test('unowned sender domains, duplicates, unencoded recipient jurisdictions and expired canaries are caught', () => {
  const r = compileOutreachLaunchFacts({
    ...complete,
    senderDomains: ['uberbond.agency', 'uberbondhq.site', 'uberbondhq.site', 'uberbond-fake.site'],
    canary: { ...complete.canary, maxRecipients: 5000, recipientJurisdictions: ['US', 'FR'], expiresAt: '2026-09-01T00:00:00Z' }
  }, { now: NOW });
  assert.ok(r.missing.includes('sender-domain-not-in-verified-fleet:uberbond.agency'), 'brand roots are not cold senders');
  assert.ok(r.missing.includes('sender-domain-not-in-verified-fleet:uberbond-fake.site'));
  assert.ok(r.missing.includes('duplicate-sender-domain'));
  assert.ok(r.missing.includes('canary-max-recipients-integer-1-to-200-required'));
  assert.ok(r.missing.includes('canary-future-expiry-required'));
  assert.ok(r.warnings.includes('recipient-jurisdiction-fr-not-encoded-cold-recipients-will-hold'));
  assert.equal(r.mailCellBootstrapEnv, null);
});
