import test from 'node:test';
import assert from 'node:assert/strict';
import { routeGlobalGreenLane, verifyRouteEffectBinding } from '../src/global-green-lane-router.mjs';
import { providerRoutePolicy, createOutreachRouteEvidence, verifyOutreachRouteEvidence, evaluateOutreachGovernance, createOutreachApproval, verifyOutreachApproval } from '../src/outreach-governance.mjs';
import { runProspectPreflight } from '../src/prospect-preflight.mjs';
import { compileEffectPackage } from '../src/prospect-effect-package.mjs';
import { usCorporateInput, freshPolicyRegistry, egyptSenderSide, mergeDeep, HASH, DAY } from './fixtures/outreach/global-green-lane.fixture.mjs';
import { powerhouseRecord, POWERHOUSE_SLOTS, POWERHOUSE_ARTIFACT_REF } from './fixtures/outreach/powerhouse.fixture.mjs';

const now = new Date('2026-10-03T13:00:00Z');
const invitationText = "PARTNERSHIP OPPORTUNITIES. Integration partners and collaboration. System integrators, technology partners, and consulting firms working with retail clients. Let's compare notes on how Intelo fits in your stack.";
const input = (over = {}) => usCorporateInput(now, mergeDeep({
  objective: { offerId: 'AI_AGENT_RELEASE_GATE', offerFamily: 'AI' },
  candidate: { company: 'Intelo.ai', legalName: 'Intelo.ai', website: 'https://www.intelo.ai/' },
  contact: { email: 'partnerships@intelo.ai', source: { url: 'https://www.intelo.ai/contact', excerpt: `${invitationText} partnerships@intelo.ai` } },
  offerRelevance: { relatedToRecipientRole: true, rationale: 'AI Agent Production Release Gate: an integration QA collaboration for approved WMS writes.' },
  invitationEvidence: [{ sourceUrl: 'https://www.intelo.ai/contact', capturedAt: now.toISOString(), pageContext: 'PARTNERSHIP_OPPORTUNITIES', excerpt: invitationText }],
  sender: { senderSide: egyptSenderSide }
}, over));
const decision = over => routeGlobalGreenLane(input(over));
const proof = () => structuredClone(decision().providerRouteEvidence);
const route = (p = proof(), senderSide = egyptSenderSide) => createOutreachRouteEvidence({
  routeType: 'INVITED_BUSINESS_CONTACT', recipientEmail: p.contact.address,
  sourceUrl: p.source.url, sourceExcerpt: p.source.excerpt, sourceObservedAt: p.source.observedAt,
  jurisdiction: 'US', permissionScope: 'COMMERCIAL_OUTREACH', relevantToRecipientRole: true,
  provider: 'smtp-relay', invitedBusinessContact: p, senderSide
}, now);

test('qualified Intelo invitation uses its own canonical class, passes provider policy, and retains the Egypt hold', () => {
  const d = decision();
  assert.equal(d.routeClass, 'INVITED_GREEN');
  assert.equal(d.governanceGate.routeType, 'INVITED_BUSINESS_CONTACT');
  assert.equal(d.governanceGate.refused, false);
  assert.equal(d.sendPrerequisites.providerAllowed.status, 'PASS');
  assert.equal(d.senderSide.clear, false);
  assert.equal(d.senderSide.state, 'HOLD_CONSERVATIVE_POLICY');
  assert.equal(d.sendReady, false);
  assert.equal(d.sendAuthority, false);
  assert.equal(d.invitation.invitationIsLegalConsent, false);
  assert.equal(d.effectBinding.providerRouteType, 'INVITED_BUSINESS_CONTACT');
  assert.ok(d.effectBinding.invitationScope.includes('PARTNERSHIP'));
  assert.equal(verifyOutreachRouteEvidence({ route: route(), recipientEmail: 'partnerships@intelo.ai', provider: 'smtp-relay', now }).ok, true);
});

test('new class cannot be asserted by label, or transferred to an unreviewed provider; cold classes stay closed', () => {
  assert.equal(providerRoutePolicy('smtp-relay', 'INVITED_BUSINESS_CONTACT').ok, false);
  assert.equal(providerRoutePolicy('gmail-api', 'INVITED_BUSINESS_CONTACT', { invitedBusinessContact: proof(), now }).ok, false);
  for (const type of ['PUBLIC_BUSINESS_CONTACT', 'CONSPICUOUS_PUBLICATION']) assert.equal(providerRoutePolicy('smtp-relay', type, { invitedBusinessContact: proof(), now }).ok, false);
  for (const type of ['SOLICITED_APPLICATION', 'REQUESTED_INFORMATION', 'EXPLICIT_CONSENT']) assert.equal(providerRoutePolicy('smtp-relay', type).ok, true);
  const cold = routeGlobalGreenLane(usCorporateInput(now));
  assert.equal(cold.routeClass, 'US_CANSPAM_GREEN');
  assert.equal(cold.governanceGate.routeType, 'PUBLIC_BUSINESS_CONTACT');
  assert.equal(cold.governanceGate.refused, true);
});

test('the send-path provider verifier re-derives hostile evidence rather than trusting labels or a router snapshot', () => {
  const check = p => providerRoutePolicy('smtp-relay', 'INVITED_BUSINESS_CONTACT', { invitedBusinessContact: p, now });
  for (const edit of [
    p => { p.invitationEvidence[0].excerpt = 'Contact us'; },
    p => { p.message.proposedContactPurpose = 'Sell office cleaning subscriptions'; },
    p => { p.invitationEvidence[0].capturedAt = new Date(+now - 91 * DAY).toISOString(); },
    p => { p.invitationEvidence[0].sourceUrl = 'https://directory.example/contact'; p.invitationEvidence[0].excerpt += ' partnerships@intelo.ai'; },
    p => { p.notices.noSolicitationFound = true; },
    p => { p.source.excerpt += ' No unsolicited sales emails.'; },
    p => { p.source.guessed = true; },
    p => { p.companyWebsite = 'https://directory.example'; p.source.url = 'https://directory.example/contact'; p.invitationEvidence[0].sourceUrl = p.source.url; },
    p => { p.providerPolicyEvidence.retrievedAt = new Date(+now - 31 * DAY).toISOString(); p.providerPolicyEvidence.lastVerifiedAt = p.providerPolicyEvidence.retrievedAt; },
    p => { p.providerPolicyEvidence.ruleParameters.coldB2BRule = 'CONSENT_REQUIRED'; },
    p => { p.providerPolicyEvidence.sourceUrl = 'https://directory.example/provider-terms'; }
  ]) { const p = proof(); edit(p); assert.equal(check(p).ok, false); }
  assert.equal(check(proof()).ok, true);
});

const ev = excerpt => [{ sourceUrl: 'https://www.intelo.ai/contact', capturedAt: now.toISOString(), pageContext: 'CONTACT_PAGE', excerpt }];
const negatives = [
  ['generic info and Contact Us', { contact: { email: 'info@intelo.ai', source: { excerpt: 'Contact us: info@intelo.ai' } }, invitationEvidence: ev('Contact Us') }],
  ['public address without invitation', { invitationEvidence: [] }],
  ['stale invitation', { invitationEvidence: [{ ...ev(invitationText)[0], capturedAt: new Date(+now - 91 * DAY).toISOString() }] }],
  ['third-party invitation', { invitationEvidence: [{ ...ev(invitationText)[0], sourceUrl: 'https://directory.example/intelo' }] }],
  ['careers invitation', { invitationEvidence: ev('Partnership opportunities: technology careers and job applications welcome.') }],
  ['customer-support invitation', { invitationEvidence: ev('Integration partnership opportunities for existing customers needing customer support.') }],
  ['affiliate invitation', { invitationEvidence: ev('AI affiliate partnership opportunities. Earn commissions by referring buyers.') }],
  ['unrelated partnership scope', { invitationEvidence: ev('Partnership opportunities for gardening and lawn maintenance suppliers.') }],
  ['unrelated proposed purpose', { offerRelevance: { rationale: 'Sell office cleaning subscriptions.' } }],
  ['invitation removed after capture', { invitationEvidence: ev('Contact us for product information.') }],
  ['no-solicitation banner', { notices: { noSolicitationFound: true } }],
  ['no-solicit in invitation', { invitationEvidence: ev(`${invitationText} No unsolicited sales emails.`) }],
  ['directory contact source', { contact: { source: { publicationType: 'THIRD_PARTY_DIRECTORY', url: 'https://directory.example/intelo' } } }],
  ['guessed contact', { contact: { source: { guessed: true } } }],
  ['stale provider policy', { policyRegistry: freshPolicyRegistry(new Date(+now - 31 * DAY)) }]
];
for (const [name, over] of negatives) test(`hostile: ${name} cannot admit the invited SMTP route`, () => {
  const d = decision(over);
  assert.notEqual(d.governanceGate?.routeType, 'INVITED_BUSINESS_CONTACT');
  assert.notEqual(d.sendPrerequisites?.providerAllowed?.status, 'PASS');
  assert.equal(d.sendAuthority, false);
});

test('qualified provider route is not send authorization, and claimed resolution does not clear Egypt in dispatch governance', () => {
  const r = route(proof(), { ...egyptSenderSide, resolved: true, resolutionRef: 'not-a-legal-clearance' });
  const cfg = { outbound: { provider: 'smtp-relay', launchPhase: 'canary' } };
  const prospect = { contact: { email: 'partnerships@intelo.ai' }, outreachRoute: r };
  assert.equal(evaluateOutreachGovernance({ prospect, cfg, date: now }).reason, 'invited-business-sender-side-legal-authority-hold');
  const us = { operatorLocation: 'US', senderEntityJurisdiction: 'US', controllerJurisdiction: 'US' };
  const allowed = evaluateOutreachGovernance({ prospect: { ...prospect, outreachRoute: route(proof(), us) }, cfg, date: now });
  assert.equal(allowed.ok, false);
  assert.equal(allowed.reason, 'outreach-approval-missing');
});

test('invitation source/hash/capture/scope/purpose and provider evidence all invalidate the bound effect after change', () => {
  const old = decision();
  for (const over of [
    { invitationEvidence: [{ ...ev(invitationText)[0], sourceUrl: 'https://www.intelo.ai/partners' }] },
    { invitationEvidence: ev(`${invitationText} AI integration proposals welcome.`) },
    { invitationEvidence: [{ ...ev(invitationText)[0], capturedAt: new Date(+now - 1000).toISOString() }] },
    { invitationEvidence: ev('AI agency proposals welcome: integration QA collaboration.') },
    { offerRelevance: { rationale: 'AI integration testing partnership proposal for planner edits.' } },
    { policyRegistry: freshPolicyRegistry(now, { override: { 'provider:smtp-relay:winnr:cold-b2b-lawful-use': { evidenceHash: 'a'.repeat(64) } } }) }
  ]) {
    const current = decision(over);
    assert.equal(verifyRouteEffectBinding({ bound: old.effectBinding, current }).ok, false);
    assert.notEqual(current.routeDigest, old.routeDigest);
  }
  assert.equal(verifyRouteEffectBinding({ bound: old.effectBinding, current: decision({ invitationEvidence: [] }) }).ok, false);
});

test('signed approval cannot be replayed against changed invitation evidence', () => {
  const old = route(); const secret = 'fixture-approval-secret'.repeat(3);
  const exact = { approvalId: 'approval-1', prospectId: 'p', campaignId: 'c', recipientEmail: old.recipientEmail, provider: 'smtp-relay', inbox: 'nadia', followup: 0, routeDigest: old.routeDigest, messageDigest: HASH, effectPayloadDigest: HASH, approvedBy: 'owner', approvedAt: now.toISOString(), expiresAt: new Date(+now + 3600_000).toISOString() };
  const approval = createOutreachApproval(exact, secret);
  assert.equal(verifyOutreachApproval({ ...exact, approval, secret, now }).ok, true);
  const changed = proof(); changed.invitationEvidence[0].excerpt += ' AI testing proposals welcome.';
  assert.equal(verifyOutreachApproval({ ...exact, approval, secret, now, routeDigest: route(changed).routeDigest }).ok, false);
});

test('canonical preflight, effect and one-button agree on invited provider PASS but independent legal HOLD', async () => {
  const rec = powerhouseRecord(); const i = input();
  Object.assign(rec, { company: 'Intelo.ai', website: i.candidate.website, offerFit: { buildsProductionAgents: true, servesHomeServiceClients: false, evidenceUrl: 'https://www.intelo.ai/blog/field-trial-to-live-execution' }, offerRoute: { offerId: 'AI_AGENT_RELEASE_GATE', rationale: i.offerRelevance.rationale }, invitationEvidence: i.invitationEvidence });
  rec.recipient = { ...rec.recipient, email: i.contact.email, sourceUrl: i.contact.source.url, excerpt: i.contact.source.excerpt, observedAt: i.contact.source.observedAt };
  const slots = { ...POWERHOUSE_SLOTS, subjectNoun: 'release review', observationClause: 'lets planners adjust quantities, exclude items, and override store selections before release, then sends approved runs into production WMS systems', corroborationSentence: 'The same article describes expansion from replenishment into initial allocation once approved runs flow to production systems.', groundingPhrases: ['adjust quantities', 'exclude items', 'override store selections', 'approved runs', 'initial allocation'], artifactPhrase: 'a one-page integration QA note', altitudePhrase: 'release review' };
  rec.clientEvidence = { clientName: rec.company, clientSiteUrl: rec.website, observation: { verifiable: true, text: 'Planner approval to WMS execution: proposed release tests, not an alleged defect.', sourceUrl: rec.offerFit.evidenceUrl, observedAt: now.toISOString(), excerpt: 'Planners adjust quantities, exclude items, override store selections. Approved runs flow into WMS systems. Scope expands into initial allocation.' } };
  const account = { id: 'a', slot: 'nadia', email: 'nadia@sender.example', provider: 'smtp-relay', connected: true, tokens: { enc: 'fixture' }, plannedDailyCap: 2, smtpRoute: { authorized: true, termsCompatible: true, evidenceRef: 'fixture' } };
  const store = { list: async name => name === 'accounts' ? [account] : [] };
  const identity = i.sender.identity;
  const r = await runProspectPreflight({ store, record: rec, slots, artifactRef: POWERHOUSE_ARTIFACT_REF, artifactExists: () => true, identity, senderSide: egyptSenderSide, policyRegistry: freshPolicyRegistry(now), now });
  assert.equal(r.state, 'BLOCKED_LEGAL_AUTHORITY');
  assert.equal(r.globalRoute.governanceGate.routeType, 'INVITED_BUSINESS_CONTACT');
  assert.equal(r.globalRoute.sendPrerequisites.providerAllowed.status, 'PASS');
  assert.equal(r.invitedRoute.envelopeOk, true);
  assert.equal(r.coldRoute.status, 'NOT_APPLICABLE_SCOPED_INVITED_BUSINESS_CONTACT');
  assert.equal(r.tournament.status, 'WINNER_SELECTED');
  assert.equal(r.effectPackage.state, 'READY_EXCEPT_AUTHORITY');
  assert.equal(r.effectPackage.finalEffectDigest, null);
  assert.equal(r.oneButton.gates.providerAllowed.status, 'PASS');
  assert.equal(r.oneButton.activationBlocked, true);
  assert.equal(r.sendAuthority, false);
  const invalid = proof(); invalid.invitationEvidence = [];
  const effect = compileEffectPackage({ routeBinding: decision().effectBinding, invitedBusinessContact: invalid, now });
  assert.ok(effect.blockers.some(b => b.code === 'invited-business-effect-evidence-invalid-or-changed'));
  const changed = proof(); changed.message.proposedContactPurpose += ' and AI testing';
  const changedEffect = compileEffectPackage({ routeBinding: decision().effectBinding, invitedBusinessContact: changed, now });
  assert.ok(changedEffect.blockers.some(b => b.code === 'invited-business-effect-evidence-invalid-or-changed'));
  const claimed = await runProspectPreflight({ store, record: rec, slots, artifactRef: POWERHOUSE_ARTIFACT_REF, artifactExists: () => true, identity, senderSide: { ...egyptSenderSide, resolved: true, resolutionRef: 'self-asserted' }, policyRegistry: freshPolicyRegistry(now), now });
  assert.equal(claimed.state, 'BLOCKED_LEGAL_AUTHORITY');
  assert.equal(claimed.effectPackage.finalEffectDigest, null);
});
