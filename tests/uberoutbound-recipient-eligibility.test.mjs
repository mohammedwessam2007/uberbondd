import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileRecipientEligibility,
  compileRecipientEligibilityPortfolio,
  classifyRecipientAddress,
  ELIGIBILITY_DECISIONS as D,
  ELIGIBILITY_REQUIREMENTS as R,
  RECIPIENT_ELIGIBILITY_POLICY_VERSION
} from '../src/uberoutbound-recipient-eligibility.mjs';
import { evaluateOutreachLaunchGate } from '../src/outreach-launch-gate.mjs';
import { compileOutboundLegalEvidence } from '../src/uberoutbound-genome.mjs';
import { compileUberPostalIdentity } from '../src/uberpostal-identity.mjs';

const NOW = new Date('2026-09-25T00:00:00Z');
const postal = compileUberPostalIdentity({
  legalName: 'Example Sender LLC', line1: '1 Example Street', city: 'Example City', country: 'US',
  ownerAuthorized: true, publicFooterAuthorized: true, evidenceRef: 'owner-attestation:test', now: NOW
});
const compliance = {
  truthfulFromAndReplyTo: true,
  nonDeceptiveSubject: true,
  advertisementDisclosure: true,
  unsubscribeMechanism: true,
  unsubscribeHonoredWithinBusinessDays: 2,
  contactMethod: 'https://example.test/contact',
  legitimateInterestsAssessmentRef: 'lia:2026-09-25',
  privacyNoticeUrl: 'https://example.test/privacy'
};
const published = {
  kind: 'PUBLISHED_BUSINESS_CONTACT',
  ref: 'https://agency.example/contact',
  observedAt: '2026-09-20T00:00:00Z',
  collectionMethod: 'MANUAL',
  noSolicitationNoticePresent: false,
  noHarvestNoticePresent: false
};
const relevant = { relatedToRecipientRole: true, rationale: 'Agency owner buys lead-path assurance for client sites' };

function cold(overrides = {}) {
  return compileRecipientEligibility({
    recipient: { email: 'info@agency.example', type: 'CORPORATE', jurisdiction: 'US', ...(overrides.recipient || {}) },
    source: { ...published, ...(overrides.source || {}) },
    offerRelevance: { ...relevant, ...(overrides.offerRelevance || {}) },
    senderJurisdiction: overrides.senderJurisdiction ?? 'US',
    senderCompliance: { ...compliance, ...(overrides.senderCompliance || {}) },
    postalIdentity: 'postalIdentity' in overrides ? overrides.postalIdentity : postal,
    transportColdB2BRule: overrides.transportColdB2BRule ?? 'ALLOWED',
    relationship: overrides.relationship ?? 'NONE',
    relationshipEvidenceRef: overrides.relationshipEvidenceRef ?? '',
    suppression: overrides.suppression ?? {},
    now: NOW
  });
}

test('address classifier separates role, named, personal-mailbox, system and invalid addresses', () => {
  assert.equal(classifyRecipientAddress('info@acme.co').addressClass, 'ROLE_BUSINESS_ADDRESS');
  assert.equal(classifyRecipientAddress('jane.doe@acme.co').addressClass, 'NAMED_OR_UNCLASSIFIED_BUSINESS_ADDRESS');
  assert.equal(classifyRecipientAddress('owner@gmail.com').addressClass, 'PERSONAL_MAILBOX_PROVIDER');
  assert.equal(classifyRecipientAddress('owner@yahoo.co.uk').addressClass, 'PERSONAL_MAILBOX_PROVIDER');
  assert.equal(classifyRecipientAddress('no-reply@acme.co').addressClass, 'SYSTEM_ADDRESS');
  assert.equal(classifyRecipientAddress('postmaster+x@acme.co').addressClass, 'SYSTEM_ADDRESS');
  for (const bad of ['', 'acme.co', 'a@b', '.x@acme.co', 'x..y@acme.co', 'x@acme..co']) assert.equal(classifyRecipientAddress(bad).valid, false, bad);
});

test('US corporate cold email passes only when every CAN-SPAM obligation is evidenced', () => {
  const ok = cold();
  assert.equal(ok.decision, D.ALLOW_WITH_REQUIREMENTS);
  assert.equal(ok.basis, 'US_CAN_SPAM_OPT_OUT_REGIME');
  assert.equal(ok.legal.status, 'PASSED');
  assert.equal(ok.sendable, true);
  assert.deepEqual(ok.requirementsUnmet, []);
  assert.ok(ok.sources.some(s => s.includes('ftc.gov')));

  for (const [field, requirement] of [
    ['truthfulFromAndReplyTo', R.TRUTHFUL_SENDER_HEADERS],
    ['nonDeceptiveSubject', R.NON_DECEPTIVE_SUBJECT],
    ['advertisementDisclosure', R.ADVERTISEMENT_IDENTIFICATION],
    ['unsubscribeMechanism', R.FUNCTIONAL_UNSUBSCRIBE]
  ]) {
    const missing = cold({ senderCompliance: { [field]: false } });
    assert.equal(missing.legal.status, 'REQUIREMENTS_UNMET', field);
    assert.deepEqual(missing.requirementsUnmet, [requirement]);
    assert.equal(missing.sendable, false);
  }
  const noPostal = cold({ postalIdentity: compileUberPostalIdentity({ legalName: 'X' }) });
  assert.deepEqual(noPostal.requirementsUnmet, [R.SENDER_POSTAL_IDENTITY]);
  const slowOptOut = cold({ senderCompliance: { unsubscribeHonoredWithinBusinessDays: 11 } });
  assert.deepEqual(slowOptOut.requirementsUnmet, [R.FUNCTIONAL_UNSUBSCRIBE]);
});

test('the launch gate hard-stops unless the compiled legal status is PASSED', () => {
  const baseline = { recipient: { email: 'info@agency.example', safeForOutreach: true, verificationEvidenceRef: 'v1' }, now: NOW };
  const passed = evaluateOutreachLaunchGate({ ...baseline, legal: cold().legal });
  assert.equal(passed.hardStopReasonCodes.includes('recipient-legal-eligibility-not-passed'), false);
  assert.equal(passed.waitReasonCodes.some(code => code.startsWith('recipient-legal')), false);

  for (const result of [cold({ postalIdentity: null }), cold({ senderJurisdiction: 'EG' }), cold({ recipient: { jurisdiction: 'DE' } })]) {
    const gate = evaluateOutreachLaunchGate({ ...baseline, legal: result.legal });
    assert.equal(gate.state, 'ABSTAIN');
    assert.ok(gate.hardStopReasonCodes.includes('recipient-legal-eligibility-not-passed'));
  }
  // The genome's legal-evidence recorder accepts the same object.
  const recorded = compileOutboundLegalEvidence(cold().legal);
  assert.equal(recorded.passed, true);
  assert.equal(compileOutboundLegalEvidence(cold({ postalIdentity: null }).legal).passed, false);
});

test('hard rejections dominate every other fact', () => {
  assert.deepEqual(cold({ recipient: { email: 'not-an-address' } }).reasonCodes, ['recipient-address-invalid']);
  for (const flag of ['suppressed', 'unsubscribed', 'complained', 'hardBounced']) {
    const r = cold({ suppression: { [flag]: true }, relationship: 'EXPLICIT_OPT_IN', relationshipEvidenceRef: 'optin:1' });
    assert.equal(r.decision, D.REJECT, flag);
    assert.equal(r.legal.status, 'FAILED');
  }
  assert.deepEqual(cold({ recipient: { email: 'noreply@agency.example' } }).reasonCodes, ['system-address-not-a-marketing-recipient']);
  assert.deepEqual(cold({ source: { kind: 'GUESSED_PATTERN' } }).reasonCodes, ['guessed-address-never-promoted-to-fact']);
});

test('provenance must be present, dated and fresh', () => {
  assert.deepEqual(cold({ source: { kind: 'UNKNOWN' } }).reasonCodes, ['contact-provenance-required']);
  assert.deepEqual(cold({ source: { ref: '' } }).reasonCodes, ['contact-provenance-reference-and-observation-time-required']);
  assert.deepEqual(cold({ source: { observedAt: 'yesterday-ish' } }).reasonCodes, ['contact-provenance-reference-and-observation-time-required']);
  assert.deepEqual(cold({ source: { observedAt: '2025-01-01T00:00:00Z' } }).reasonCodes, ['contact-provenance-stale']);
  assert.deepEqual(cold({ source: { observedAt: '2026-10-30T00:00:00Z' } }).reasonCodes, ['contact-provenance-observed-in-future']);
  assert.deepEqual(cold({ recipient: { jurisdiction: '' } }).reasonCodes, ['recipient-jurisdiction-required']);
});

test('cold traffic needs a transport that permits it and an encoded sender jurisdiction', () => {
  assert.equal(cold({ transportColdB2BRule: 'PROHIBITED' }).decision, D.REJECT);
  assert.equal(cold({ transportColdB2BRule: 'CONSENT_REQUIRED' }).decision, D.REJECT);
  assert.deepEqual(cold({ transportColdB2BRule: 'UNKNOWN' }).reasonCodes, ['transport-provider-cold-b2b-rule-unknown']);
  assert.deepEqual(cold({ senderJurisdiction: '' }).reasonCodes, ['sender-jurisdiction-required']);
  assert.deepEqual(cold({ senderJurisdiction: 'IN' }).reasonCodes, ['sender-jurisdiction-rule-not-encoded']);
  const egypt = cold({ senderJurisdiction: 'EG' });
  assert.equal(egypt.decision, D.HOLD_FOR_REVIEW);
  assert.match(egypt.reasonCodes[0], /eg-pdpl/);
  assert.equal(egypt.legal.status, 'HOLD');
  assert.equal(cold({ senderJurisdiction: 'uk' }).senderJurisdiction, 'GB');
});

test('US rules: consumer, unknown context, personal mailbox and harvesting', () => {
  assert.equal(cold({ recipient: { type: 'INDIVIDUAL_CONSUMER' } }).decision, D.REJECT);
  assert.equal(cold({ recipient: { type: 'UNKNOWN' } }).decision, D.HOLD_FOR_REVIEW);
  assert.equal(cold({ recipient: { email: 'owner@gmail.com' } }).decision, D.HOLD_FOR_REVIEW);
  assert.equal(cold({ source: { collectionMethod: 'AUTOMATED_CRAWLER', noHarvestNoticePresent: true } }).decision, D.REJECT);
  assert.equal(cold({ source: { collectionMethod: 'AUTOMATED_CRAWLER', noHarvestNoticePresent: undefined } }).decision, D.HOLD_FOR_REVIEW);
  assert.equal(cold({ source: { collectionMethod: 'AUTOMATED_CRAWLER', noHarvestNoticePresent: false } }).legal.status, 'PASSED');
});

test('UK rules: corporate subscribers only, with UK GDPR duties for named employees', () => {
  const uk = extra => cold({ recipient: { jurisdiction: 'GB', ...extra } });
  assert.equal(uk({ type: 'SOLE_TRADER_OR_PARTNERSHIP' }).decision, D.REJECT);
  assert.equal(uk({ type: 'INDIVIDUAL_CONSUMER' }).decision, D.REJECT);
  assert.equal(uk({ type: 'UNKNOWN' }).decision, D.HOLD_FOR_REVIEW);
  const role = uk({});
  assert.equal(role.basis, 'UK_PECR_CORPORATE_SUBSCRIBER');
  assert.equal(role.requirements.includes(R.LEGITIMATE_INTERESTS_ASSESSMENT), false);
  assert.equal(role.legal.status, 'PASSED');
  const named = compileRecipientEligibility({
    recipient: { email: 'jane.doe@agency.example', type: 'CORPORATE', jurisdiction: 'GB' },
    source: published, offerRelevance: relevant, senderJurisdiction: 'US', postalIdentity: postal, transportColdB2BRule: 'ALLOWED',
    senderCompliance: { ...compliance, legitimateInterestsAssessmentRef: '', privacyNoticeUrl: 'http://insecure.example' }, now: NOW
  });
  assert.deepEqual(named.requirementsUnmet.sort(), [R.LEGITIMATE_INTERESTS_ASSESSMENT, R.PRIVACY_NOTICE].sort());
});

test('Canada and Australia require verified conspicuous publication and role relevance', () => {
  const ca = o => cold({ ...o, recipient: { jurisdiction: 'CA' } });
  assert.equal(ca({}).legal.status, 'PASSED');
  assert.equal(ca({}).basis, 'CASL_IMPLIED_CONSENT_CONSPICUOUS_PUBLICATION');
  assert.equal(ca({ source: { noSolicitationNoticePresent: true } }).decision, D.REJECT);
  assert.equal(ca({ source: { noSolicitationNoticePresent: undefined } }).decision, D.HOLD_FOR_REVIEW);
  assert.equal(ca({ offerRelevance: { relatedToRecipientRole: false } }).decision, D.REJECT);
  assert.equal(ca({ offerRelevance: { rationale: '' } }).decision, D.HOLD_FOR_REVIEW);
  assert.equal(ca({ source: { kind: 'LICENSED_DATA' } }).decision, D.HOLD_FOR_REVIEW);
  assert.deepEqual(ca({ senderCompliance: { contactMethod: '' } }).requirementsUnmet, [R.SENDER_CONTACT_METHOD]);

  const au = o => cold({ ...o, recipient: { jurisdiction: 'AU' } });
  assert.equal(au({}).legal.status, 'PASSED');
  assert.deepEqual(au({ source: { collectionMethod: 'AUTOMATED_CRAWLER' } }).reasonCodes, ['spam-act-address-harvesting-software-prohibited']);
  assert.equal(au({ source: { collectionMethod: 'IMPORTED' } }).decision, D.HOLD_FOR_REVIEW);
  assert.deepEqual(au({ senderCompliance: { unsubscribeHonoredWithinBusinessDays: 6 } }).requirementsUnmet, [R.FUNCTIONAL_UNSUBSCRIBE]);
});

test('strict and unencoded recipient jurisdictions never pass cold traffic', () => {
  for (const code of ['DE', 'CH', 'SA']) assert.equal(cold({ recipient: { jurisdiction: code } }).decision, D.REJECT, code);
  for (const code of ['FR', 'NL', 'IE', 'AE', 'EG', 'JP', 'BR']) {
    const r = cold({ recipient: { jurisdiction: code } });
    assert.equal(r.decision, D.HOLD_FOR_REVIEW, code);
    assert.equal(r.sendable, false);
  }
});

test('permissioned relationships need evidence but not a cold-capable transport', () => {
  const optIn = cold({ relationship: 'EXPLICIT_OPT_IN', relationshipEvidenceRef: 'form:123', transportColdB2BRule: 'PROHIBITED', senderJurisdiction: 'EG', recipient: { jurisdiction: 'DE' } });
  assert.equal(optIn.decision, D.ALLOW_WITH_REQUIREMENTS);
  assert.equal(optIn.basis, 'PERMISSIONED_EXPLICIT_OPT_IN');
  assert.equal(optIn.legal.status, 'PASSED');
  assert.equal(cold({ relationship: 'EXPLICIT_OPT_IN' }).decision, D.HOLD_FOR_REVIEW);
  const transactional = cold({ relationship: 'TRANSACTIONAL', relationshipEvidenceRef: 'order:9', postalIdentity: null });
  assert.deepEqual(transactional.requirements, [R.TRUTHFUL_SENDER_HEADERS]);
  assert.equal(transactional.legal.status, 'PASSED');
});

test('receipts are deterministic, fact-bound, address-free and authority-free', () => {
  const a = cold();
  const b = cold();
  assert.equal(a.evidenceId, b.evidenceId);
  assert.notEqual(a.evidenceId, cold({ source: { ref: 'https://agency.example/team' } }).evidenceId);
  assert.notEqual(a.evidenceId, cold({ senderCompliance: { advertisementDisclosure: false } }).evidenceId);
  assert.equal(a.legal.evidenceId, a.evidenceId);
  assert.equal(a.legal.policyVersion, RECIPIENT_ELIGIBILITY_POLICY_VERSION);
  assert.equal(JSON.stringify(a).includes('info@agency.example'), false);
  assert.equal(a.sendAuthority, false);
  assert.equal(a.externalEffectAuthority, 'NONE');
  assert.ok(Object.values(a.externalEffectLedger).every(v => v === 0));
});

test('portfolio summarizes decisions without raw addresses', () => {
  const portfolio = compileRecipientEligibilityPortfolio({
    context: { senderJurisdiction: 'US', senderCompliance: compliance, postalIdentity: postal, transportColdB2BRule: 'ALLOWED', offerRelevance: relevant, source: published },
    recipients: [
      { recipient: { email: 'info@one.example', type: 'CORPORATE', jurisdiction: 'US' } },
      { recipient: { email: 'info@two.example', type: 'CORPORATE', jurisdiction: 'DE' } },
      { recipient: { email: 'info@three.example', type: 'CORPORATE', jurisdiction: 'FR' } },
      { recipient: { email: 'info@four.example', type: 'CORPORATE', jurisdiction: 'US' }, senderCompliance: { advertisementDisclosure: false } }
    ],
    now: NOW
  });
  assert.equal(portfolio.total, 4);
  assert.equal(portfolio.passed, 1);
  assert.equal(portfolio.rejected, 1);
  assert.equal(portfolio.held, 1);
  assert.equal(portfolio.requirementsUnmet, 1);
  assert.equal(portfolio.reasonHistogram[`unmet:${R.ADVERTISEMENT_IDENTIFICATION}`], 1);
  const serialized = JSON.stringify(portfolio);
  for (const raw of ['info@one.example', 'info@two.example', 'info@three.example', 'info@four.example']) assert.equal(serialized.includes(raw), false, raw);
});

test('eligibility decisions flow through UberProspect into prospect records', async () => {
  const { compileUberProspectPortfolio } = await import('../src/uberprospect-forge.mjs');
  const pass = cold();
  const hold = cold({ recipient: { jurisdiction: 'FR' } });
  const portfolio = compileUberProspectPortfolio({
    records: [
      { email: 'info@agency.example', sourceUrl: published.ref, safeForOutreach: true, legal: pass.legal },
      { email: 'info@agence.example', sourceUrl: 'https://agence.example/contact', safeForOutreach: true, legal: hold.legal }
    ],
    target: 2,
    perOfferTarget: 0
  });
  assert.equal(portfolio.acceptedCount, 1);
  assert.equal(portfolio.records[0].legalEvidenceId, pass.evidenceId);
  assert.equal(portfolio.rejectedCount, 1);
});
