import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateEgyptCorporateRoleScope, EGYPT_SCOPE_RULE, EGYPT_SCOPE_GUIDANCE } from '../src/egypt-corporate-role-scope.mjs';
import { routeGlobalGreenLane } from '../src/global-green-lane-router.mjs';
import { invitedBusinessSenderSideClear, createOutreachRouteEvidence, evaluateOutreachGovernance } from '../src/outreach-governance.mjs';
import { preparedRecipientUnsubscribeUrls, verifyUnsubscribeToken, createUnsubscribeToken } from '../src/unsubscribe.mjs';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runProspectPreflight } from '../src/prospect-preflight.mjs';
import { powerhouseRecord, POWERHOUSE_SLOTS } from './fixtures/outreach/powerhouse.fixture.mjs';
import { freshPolicyRegistry, usCorporateInput, egyptSenderSide, HASH, DAY } from './fixtures/outreach/global-green-lane.fixture.mjs';
const now = new Date('2026-10-03T18:00:00Z');
const proposal = { subject: 'Integration QA note', body: 'Your published workflow sends approved runs into WMS systems. I prepared a company-level integration QA note. Want me to send it?', preworkDigest: HASH };
const text = 'PARTNERSHIP OPPORTUNITIES. Integration partners and collaboration. Technology partners and consulting firms working with retail clients. Integration QA proposals welcome.';
function input() {
  const i = usCorporateInput(now);
  i.candidate = { company: 'Acme Integration', website: 'https://acme-integration.example/' };
  i.objective = { offerId: 'AI_AGENT_RELEASE_GATE', offerFamily: 'AI' };
  i.contact = { email: 'partnerships@acme-integration.example', namedPersonEvidence: { present: false }, source: { ...i.contact.source, url: 'https://acme-integration.example/contact', excerpt: `${text} partnerships@acme-integration.example` } };
  i.invitationEvidence = [{ sourceUrl: i.contact.source.url, capturedAt: now.toISOString(), pageContext: 'PARTNERSHIP_OPPORTUNITIES', excerpt: text }];
  i.offerRelevance = { relatedToRecipientRole: true, rationale: 'AI Agent Production Release Gate integration QA collaboration.' };
  i.sender.senderSide = egyptSenderSide;
  i.policyRegistry = freshPolicyRegistry(now, { override: { [EGYPT_SCOPE_RULE]: { ruleParameters: { materialScope: 'NATURAL_PERSON_PERSONAL_DATA' } }, [EGYPT_SCOPE_GUIDANCE]: { ruleParameters: { dataSubject: 'NATURAL_PERSON' } } } });
  i.corporateRoleScope = { schemaVersion: 'uberbond.egypt-corporate-role-scope.v1', companyLevelEvidenceOnly: true, naturalPersonIdentified: false, namedPersonTargeting: false, personalDataEnrichment: false, personLinkedMailbox: false, employeeLinkedInFacts: false, individualBehavioralData: false, personalPhoneNumber: false, egyptianCitizenDataSubject: false, egyptResidentDataSubject: false, reviewedAt: now.toISOString(), reviewRef: 'review/company-only', offerId: i.objective.offerId, preworkRef: 'company-level-qa.md', reviewedProposal: proposal, recipientEntity: { type: 'CORPORATION', jurisdiction: 'US', legalName: 'Acme Integration, Inc.', sourceUrl: i.contact.source.url, capturedAt: now.toISOString(), excerpt: '©2026 Acme Integration, Inc. United States offices.' } };
  return i;
}
const decision = () => routeGlobalGreenLane(input());
const proof = () => structuredClone(decision().providerRouteEvidence);
const check = p => evaluateEgyptCorporateRoleScope({ senderSide: egyptSenderSide, proof: p, now });
test('company-only material scope is outside PDPL, not an Egyptian territorial exemption or send authority', () => {
  const d = decision(), s = check(proof());
  assert.equal(s.ok, true); assert.equal(s.materialScope, 'OUTSIDE_SCOPE');
  assert.equal(s.edmLicenseGate, 'NOT_APPLICABLE_BY_MATERIAL_SCOPE');
  assert.equal(s.territorialScope, 'EGYPTIAN_ACTOR_NEXUS_PRESERVED_MATERIAL_ELEMENTS_ABSENT');
  assert.equal(d.routeClass, 'INVITED_GREEN'); assert.equal(d.senderSide.clear, true);
  assert.equal(d.effectBinding.senderMaterialScope.evidenceDigest, s.evidenceDigest);
  assert.equal(d.sendReady, false); assert.equal(d.sendAuthority, false);
  assert.equal(invitedBusinessSenderSideClear(egyptSenderSide, { invitedBusinessContact: proof(), now, message: proposal }), true);
});
const hostile = [
  ['named email', p => { p.contact.address = 'john.smith@acme-integration.example'; }],
  ['personal Gmail', p => { p.contact.address = 'person@gmail.com'; }],
  ['CEO publicly associated with a person', p => { p.contact.address = 'ceo@acme-integration.example'; p.namedPersonEvidence = { present: true, name: 'Jane Doe' }; }],
  ['published forwarding to a named person', p => { p.namedPersonEvidence = { present: true, name: 'Jane Doe', relation: 'explicitly published forwarding' }; }],
  ['guessed mailbox', p => { p.source.guessed = true; }],
  ['Egypt corporate recipient', p => { p.recipientJurisdiction = 'EG'; p.corporateRoleScope.recipientEntity.jurisdiction = 'EG'; }],
  ['ambiguous corporate identity', p => { p.corporateRoleScope.recipientEntity.type = 'UNKNOWN'; }],
  ['third-party entity evidence', p => { p.corporateRoleScope.recipientEntity.sourceUrl = 'https://directory.example/entity'; }],
  ['stale inventory', p => { p.corporateRoleScope.reviewedAt = new Date(+now - 31 * DAY).toISOString(); }],
  ['stale law evidence', p => { p.scopePolicyEvidence[0].retrievedAt = new Date(+now - 400 * DAY).toISOString(); p.scopePolicyEvidence[0].lastVerifiedAt = p.scopePolicyEvidence[0].retrievedAt; }],
  ['missing natural-person guidance', p => { p.scopePolicyEvidence = []; }],
  ['unsupported policy scope', p => { p.scopePolicyEvidence[0].ruleParameters = {}; }],
  ['no solicitation', p => { p.notices.noSolicitationFound = true; }],
  ['invitation removed', p => { p.invitationEvidence[0].excerpt = 'Contact us'; }],
  ['out-of-scope offer', p => { p.message.proposedContactPurpose = 'Sell lawn mowing'; }],
  ['reviewed offer changed', p => { p.corporateRoleScope.offerId = 'OTHER'; }],
  ['unreviewed prework', p => { p.corporateRoleScope.reviewedProposal.preworkDigest = ''; }],
  ...['naturalPersonIdentified', 'namedPersonTargeting', 'personalDataEnrichment', 'personLinkedMailbox', 'employeeLinkedInFacts', 'individualBehavioralData', 'personalPhoneNumber', 'egyptianCitizenDataSubject', 'egyptResidentDataSubject'].map(k => [k, p => { p.corporateRoleScope[k] = true; }]),
  ['missing personal-data inventory field', p => { delete p.corporateRoleScope.personalDataEnrichment; }],
  ['company-only unproven', p => { p.corporateRoleScope.companyLevelEvidenceOnly = false; }]
];
for (const [name, edit] of hostile) test(`outside-scope denied: ${name}`, () => { const p = proof(); edit(p); assert.equal(check(p).ok, false); });
test('a modified proposal loses company-only clearance and every inventory change alters route binding', () => {
  assert.equal(evaluateEgyptCorporateRoleScope({ senderSide: egyptSenderSide, proof: proof(), now, message: { ...proposal, body: proposal.body + ' Jane, I saw your LinkedIn activity.' } }).ok, false);
  const i = input(); const old = routeGlobalGreenLane(i); i.corporateRoleScope.reviewRef += '-revised';
  assert.notEqual(routeGlobalGreenLane(i).effectBinding.invitedBusinessEvidenceDigest, old.effectBinding.invitedBusinessEvidenceDigest);
});
test('send path still requires exact approval after material-scope clearance', () => {
  const p = proof(); const r = createOutreachRouteEvidence({ routeType: 'INVITED_BUSINESS_CONTACT', recipientEmail: p.contact.address, sourceUrl: p.source.url, sourceExcerpt: p.source.excerpt, sourceObservedAt: p.source.observedAt, jurisdiction: 'US', permissionScope: 'COMMERCIAL_OUTREACH', relevantToRecipientRole: true, provider: 'smtp-relay', invitedBusinessContact: p, senderSide: egyptSenderSide }, now);
  const d = evaluateOutreachGovernance({ prospect: { contact: { email: p.contact.address }, outreachRoute: r }, cfg: { outbound: { provider: 'smtp-relay', launchPhase: 'canary' } }, subject: proposal.subject, body: proposal.body, date: now });
  assert.equal(d.ok, false); assert.equal(d.reason, 'outreach-approval-missing');
});
test('prepared opt-out is signed, exact-recipient-only, tamper/expiry closed, and never an approval', () => {
  const secret = 's'.repeat(40), expiry = +now + DAY;
  const urls = preparedRecipientUnsubscribeUrls('https://control.example', 'Partnerships@acme-integration.example', secret, expiry);
  const token = new URL(urls.unsubscribeUrl).searchParams.get('token');
  assert.equal(new URL(urls.oneClickUnsubscribeUrl).searchParams.get('token'), token);
  assert.deepEqual(verifyUnsubscribeToken(token, secret, +now), { prospectId: 'prepared-effect', recipientEmail: 'partnerships@acme-integration.example', expiresAt: expiry });
  assert.equal(verifyUnsubscribeToken(token + 'x', secret, +now), null);
  assert.equal(verifyUnsubscribeToken(token, 'wrong', +now), null);
  assert.equal(verifyUnsubscribeToken(token, secret, expiry + 1), null);
  assert.equal(verifyUnsubscribeToken(createUnsubscribeToken('old-prospect', secret, expiry), secret, +now).prospectId, 'old-prospect');
  for (const [base, email, key] of [['http://control.example', 'info@x.example', secret], ['https://control.example', 'invalid', secret], ['https://control.example', 'info@x.example', 'short']]) assert.deepEqual(preparedRecipientUnsubscribeUrls(base, email, key, expiry), {});
});

test('canonical preflight composes company-only scope, exact prework, signed opt-out and zero-authority digest', async () => {
  const i = input(), record = powerhouseRecord();
  Object.assign(record, { company: 'Acme Integration', website: i.candidate.website, hqCountry: 'US', offerFit: { buildsProductionAgents: true, servesHomeServiceClients: false, evidenceUrl: 'https://acme-integration.example/workflow' }, offerRoute: { offerId: 'AI_AGENT_RELEASE_GATE', rationale: i.offerRelevance.rationale }, invitationEvidence: i.invitationEvidence });
  record.recipient = { ...record.recipient, email: i.contact.email, sourceUrl: i.contact.source.url, excerpt: i.contact.source.excerpt, observedAt: i.contact.source.observedAt };
  record.clientEvidence = { clientName: record.company, clientSiteUrl: record.website, observation: { verifiable: true, text: 'Planner approval to WMS execution is a testing boundary, not a proven defect.', sourceUrl: record.offerFit.evidenceUrl, observedAt: now.toISOString(), excerpt: 'Planners adjust quantities, exclude items, override store selections. Approved runs flow into WMS systems. Scope expands into initial allocation.' } };
  const slots = { ...POWERHOUSE_SLOTS, subjectNoun: 'release review', observationClause: 'lets planners adjust quantities, exclude items, and override store selections before release, then sends approved runs into production WMS systems', corroborationSentence: 'The same article describes expansion from replenishment into initial allocation once approved runs flow to production systems.', groundingPhrases: ['adjust quantities', 'exclude items', 'override store selections', 'approved runs', 'initial allocation'], artifactPhrase: 'a one-page integration QA note', altitudePhrase: 'release review' };
  const account = { id: 'a', slot: 'nadia', email: 'nadia@sender.example', provider: 'smtp-relay', connected: true, tokens: { enc: 'fixture' }, plannedDailyCap: 2, smtpRoute: { authorized: true, termsCompatible: true, evidenceRef: 'fixture' } };
  const store = { list: async n => n === 'accounts' ? [account] : [] };
  const artifactRef = 'tests/egypt-corporate-role-scope.test.mjs';
  const args = { store, record, slots, artifactRef, artifactExists: () => true, identity: i.sender.identity, senderSide: egyptSenderSide, campaign: { campaignId: 'existing-test-campaign', effectExpiresAt: new Date(+now + 3600000).toISOString() }, policyRegistry: i.policyRegistry, now };
  const held = await runProspectPreflight(args);
  assert.equal(held.state, 'BLOCKED_LEGAL_AUTHORITY', JSON.stringify(held.blockerCodes));
  record.corporateRoleScope = { ...structuredClone(i.corporateRoleScope), preworkRef: artifactRef, reviewedProposal: { subject: held.message.winner.subject, body: held.message.winner.body, preworkDigest: createHash('sha256').update(readFileSync(new URL('./egypt-corporate-role-scope.test.mjs', import.meta.url))).digest('hex') } };
  let calls = 0;
  const prepared = { ...args, prepareEffect: true, unsubscribeFactory: email => { calls++; return preparedRecipientUnsubscribeUrls('https://control.example', email, 's'.repeat(40), +now + DAY); } };
  const r = await runProspectPreflight(prepared);
  assert.equal(r.state, 'READY_FOR_AUTHORIZATION'); assert.equal(calls, 1);
  assert.match(r.effectPackage.finalEffectDigest, /^[a-f0-9]{64}$/);
  assert.equal(r.effectPackage.preview.containsPlaceholders, false);
  assert.equal(r.oneButton.gates.providerAllowed.status, 'PASS'); assert.equal(r.oneButton.gates.effectComplete.status, 'PASS');
  assert.equal(r.oneButton.sendAuthority, false); assert.equal(r.sendAuthority, false);
  record.corporateRoleScope.reviewedProposal.preworkDigest = 'a'.repeat(64);
  const changed = await runProspectPreflight(prepared); assert.equal(changed.state, 'BLOCKED_LEGAL_AUTHORITY'); assert.equal(calls, 1);
  record.corporateRoleScope.reviewedProposal.preworkDigest = createHash('sha256').update(readFileSync(new URL('./egypt-corporate-role-scope.test.mjs', import.meta.url))).digest('hex');
  record.corporateRoleScope.personalDataEnrichment = true;
  const personal = await runProspectPreflight(prepared);
  assert.equal(personal.state, 'BLOCKED_LEGAL_AUTHORITY');
  // Pure unsubscribe preparation is permitted while an independent legal hold remains.
  assert.equal(calls, 2);
  assert.equal(personal.effectPackage.finalEffectDigest, null);
  assert.equal(personal.sendAuthority, false);
  assert.equal(personal.externalEffects, 0);
  record.corporateRoleScope.personalDataEnrichment = false;
  assert.equal((await runProspectPreflight({ ...prepared, campaign: { campaignId: 'existing-test-campaign' } })).state, 'BLOCKED_EXTERNAL_FACT'); assert.equal(calls, 2);
});
