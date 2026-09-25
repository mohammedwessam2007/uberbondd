import test from 'node:test';
import assert from 'node:assert/strict';
import { routeProspect, routeCohort } from '../src/lawful-channel-router.mjs';
import { compileRecipientEligibility } from '../src/uberoutbound-recipient-eligibility.mjs';
import { compileUberPostalIdentity } from '../src/uberpostal-identity.mjs';

const NOW = new Date('2026-09-26T00:00:00Z');
const postal = compileUberPostalIdentity({ legalName: 'Example LLC', line1: '1 Example St', city: 'Example', country: 'US', ownerAuthorized: true, publicFooterAuthorized: true, evidenceRef: 'owner:test', now: NOW });
const eligibility = (jurisdiction, senderJurisdiction = 'US', transport = 'ALLOWED') => compileRecipientEligibility({
  recipient: { email: 'info@firm.example', type: 'CORPORATE', jurisdiction },
  source: { kind: 'PUBLISHED_BUSINESS_CONTACT', ref: 'https://firm.example/contact', observedAt: '2026-09-20T00:00:00Z', collectionMethod: 'MANUAL', noSolicitationNoticePresent: false, noHarvestNoticePresent: false },
  offerRelevance: { relatedToRecipientRole: true, rationale: 'owns the lead path' },
  senderJurisdiction,
  senderCompliance: { truthfulFromAndReplyTo: true, nonDeceptiveSubject: true, advertisementDisclosure: true, unsubscribeMechanism: true, unsubscribeHonoredWithinBusinessDays: 2, contactMethod: 'https://x.example' },
  postalIdentity: postal,
  transportColdB2BRule: transport,
  now: NOW
});
const ctx = (overrides = {}) => ({
  senderJurisdiction: 'US', postalIdentityReady: true, budgetRemainingCents: 10000, founderMinuteValueCents: 100,
  channels: { postal: { authorized: true, costCentsPerLetter: 150 } }, ...overrides
});
const business = (overrides = {}) => ({ ref: 'p1', jurisdiction: 'US', recipientType: 'CORPORATE', postalAddressRef: 'osm:node/1', ...overrides });

test('a lawful cold-email recipient takes the free automated route', () => {
  const r = routeProspect({ prospect: business(), eligibility: eligibility('US'), context: ctx() });
  assert.equal(r.selected.channel, 'COLD_EMAIL');
  assert.equal(r.state, 'ROUTED');
  assert.equal(r.routes.find(x => x.channel === 'POSTAL_LETTER').state, 'ALLOW');
});

test('when cold email holds, a consent-creating letter is chosen instead of dropping the prospect', () => {
  const r = routeProspect({ prospect: business(), eligibility: eligibility('US', 'US', 'UNKNOWN'), context: ctx() });
  assert.equal(r.routes[0].state, 'HOLD');
  assert.equal(r.selected.channel, 'POSTAL_LETTER');
  assert.equal(r.selected.createsConsent, true);
  assert.equal(r.selected.costCents, 150);
});

test('an Egypt-based sender unlocks letters only after a recorded counsel confirmation', () => {
  const held = eligibility('US', 'EG');
  assert.equal(held.legal.status, 'HOLD');
  const without = routeProspect({ prospect: business(), eligibility: held, context: ctx({ senderJurisdiction: 'EG' }) });
  assert.equal(without.selected.channel, 'INBOUND_CONTENT');
  assert.equal(without.state, 'UNTARGETED_ONLY');
  assert.deepEqual(without.unlockableBy, [{ channel: 'POSTAL_LETTER', unmet: ['SENDER_JURISDICTION_COUNSEL_ATTESTATION'] }]);
  const withCounsel = routeProspect({ prospect: business(), eligibility: held, context: ctx({ senderJurisdiction: 'EG', counselAttestationRef: 'counsel-memo:2026-10-01' }) });
  assert.equal(withCounsel.selected.channel, 'POSTAL_LETTER');
});

test('a German recipient is never cold-emailed and falls back to a partner or inbound route', () => {
  const de = eligibility('DE');
  assert.equal(de.decision, 'REJECT');
  const alone = routeProspect({ prospect: business({ jurisdiction: 'DE' }), eligibility: de, context: ctx() });
  assert.equal(alone.routes[0].state, 'REJECT');
  assert.equal(alone.routes.find(x => x.channel === 'POSTAL_LETTER').state, 'HOLD');
  assert.equal(alone.selected.channel, 'INBOUND_CONTENT');
  const agreementOnly = routeProspect({ prospect: business({ jurisdiction: 'DE', partnerAgreementRef: 'partner:agency-7' }), eligibility: de, context: ctx() });
  assert.deepEqual(agreementOnly.routes.find(x => x.channel === 'PARTNER_INTRODUCTION').reasons, ['partner-must-attest-its-own-relationship-with-the-prospect']);
  assert.equal(agreementOnly.selected.channel, 'INBOUND_CONTENT');
  const viaPartner = routeProspect({ prospect: business({ jurisdiction: 'DE', partnerAgreementRef: 'partner:agency-7', partnerRelationshipRef: 'partner-attests:client' }), eligibility: de, context: ctx() });
  assert.equal(viaPartner.selected.channel, 'PARTNER_INTRODUCTION');
  assert.equal(viaPartner.selected.createsConsent, true);
});

test('letters go to businesses only, with a founder authorization, a known cost and a provenance-backed address', () => {
  const noAuth = routeProspect({ prospect: business(), eligibility: null, context: ctx({ channels: { postal: { authorized: false, costCentsPerLetter: 150 } } }) });
  assert.deepEqual(noAuth.routes.find(x => x.channel === 'POSTAL_LETTER').reasons, ['postal-channel-not-authorized-by-founder']);
  assert.deepEqual(routeProspect({ prospect: business({ recipientType: 'SOLE_TRADER_OR_PARTNERSHIP' }), eligibility: null, context: ctx() }).routes.find(x => x.channel === 'POSTAL_LETTER').reasons, ['letter-must-be-addressed-to-a-business-not-a-person']);
  assert.deepEqual(routeProspect({ prospect: business({ postalAddressRef: '' }), eligibility: null, context: ctx() }).routes.find(x => x.channel === 'POSTAL_LETTER').reasons, ['business-postal-address-with-provenance-required']);
  assert.deepEqual(routeProspect({ prospect: business(), eligibility: null, context: ctx({ postalIdentityReady: false }) }).routes.find(x => x.channel === 'POSTAL_LETTER').unmet, ['SENDER_IDENTITY_ON_LETTER']);
});

test('suppression dominates every channel', () => {
  const r = routeProspect({ prospect: business({ suppressed: true, partnerAgreementRef: 'p', partnerRelationshipRef: 'q' }), eligibility: eligibility('US'), context: ctx() });
  assert.equal(r.state, 'SUPPRESSED');
  assert.equal(r.selected, null);
});

test('a cohort spends no more than its postal budget and reports channel monoculture', () => {
  const heldEligibility = eligibility('US', 'US', 'UNKNOWN');
  const cohort = routeCohort({
    prospects: [1, 2, 3].map(i => ({ prospect: business({ ref: `p${i}` }), eligibility: heldEligibility })),
    context: ctx({ budgetRemainingCents: 300 })
  });
  assert.deepEqual(cohort.byChannel, { POSTAL_LETTER: 2, INBOUND_CONTENT: 1 });
  assert.equal(cohort.plannedSpendCents, 300);
  assert.equal(cohort.decisions[2].routes.find(x => x.channel === 'POSTAL_LETTER').reasons[0], 'postal-budget-exhausted');

  const mono = routeCohort({ prospects: Array.from({ length: 10 }, (_, i) => ({ prospect: business({ ref: `m${i}` }), eligibility: eligibility('US') })), context: ctx() });
  assert.equal(mono.byChannel.COLD_EMAIL, 10);
  assert.deepEqual(mono.monoculture, { maxTargetedChannelShare: 1, warning: true });
  assert.equal(mono.sendAuthority, false);
  assert.ok(Object.values(mono.externalEffectLedger).every(v => v === 0));
});
