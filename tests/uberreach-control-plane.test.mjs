import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberReachReadiness } from '../src/uberreach-control-plane.mjs';

const NOW = new Date('2026-09-14T18:00:00Z');

const mailbox = {
  mailboxId: 'mbx-1',
  address: 'mohamed@uberbond.cloud',
  authenticationStatus: 'AUTHENTICATED',
  warmupStatus: 'WARMUP_COMPLETE',
  paused: false,
  currentDailyCap: 10
};

const observations = {
  warmupDays: 21,
  observedDeliveries: 100,
  complaintRate: 0,
  hardBounceRate: 0.01,
  inboxPlacementRate: 0.95,
  providerDailyCap: 40
};

const contact = {
  email: 'buyer@example.com',
  sourceEvidence: [{
    value: 'buyer@example.com',
    sourceType: 'public_website',
    sourceUrl: 'https://example.com/team',
    evidenceClass: 'DIRECT_PUBLIC',
    confidence: 0.95,
    exact: true,
    inferred: false,
    observedAt: NOW.toISOString()
  }],
  verifications: [{
    route: 'buyer@example.com',
    state: 'VALID',
    provider: 'licensed-test-provider',
    evidenceClass: 'LICENSED_PROVIDER',
    checkedAt: NOW.toISOString(),
    confidence: 0.95
  }]
};

const genomeInputs = overrides => ({
  prospect: {
    accountId: 'acct-1',
    seniority: 'CFO',
    safeForOutreach: true,
    verificationStatus: 'VERIFIED',
    suppressed: false,
    unsubscribed: false,
    problemEvidenceScore: 0.9,
    roleOwnershipScore: 0.9,
    accountValueScore: 0.8,
    contactabilityScore: 0.95,
    trigger: { type: 'EXPLICIT_PRIORITY', confidence: 0.9, freshness: 0.9, problemLinked: true }
  },
  sender: {
    status: 'GREEN',
    authenticationReady: true,
    providerBudgetAvailable: true
  },
  authorization: { outreachAuthorized: true },
  legalDecision: {
    status: 'PASSED',
    jurisdiction: 'US',
    basis: 'TEST_RECORDED_BASIS',
    policyVersion: 'test-v1',
    evidenceId: 'legal-1',
    recipientType: 'CORPORATE'
  },
  messageCandidates: [{
    candidateId: 'offer-short',
    wordCount: 80,
    sentenceCount: 4,
    subjectWordCount: 3,
    ctaType: 'OFFER',
    personalizationClass: 'COMPANY',
    problemAltitude: 'STRATEGIC',
    problemBeforeProduct: true,
    relevantProof: true,
    sequencePosition: 1
  }],
  experiment: {
    experimentId: 'cta-v1',
    primaryMetric: 'QUALIFIED_POSITIVE_REPLY',
    arms: ['OFFER', 'MEETING']
  },
  ...overrides
});

test('UberReach composes healthy supplied evidence but still grants zero external authority', () => {
  const result = compileUberReachReadiness({
    mailboxes: [mailbox],
    mailboxObservations: { 'mbx-1': observations },
    contacts: [contact],
    lookalikeSeeds: [{ accountId: 'seed', tags: ['hvac'], features: { region: 'gcc' }, confidence: 1 }],
    accountCandidates: [{ accountId: 'candidate', tags: ['hvac'], features: { region: 'gcc' }, confidence: 1 }],
    now: NOW
  });
  assert.equal(result.state, 'READY_FOR_SEPARATE_AUTHORIZATION_REVIEW');
  assert.equal(result.externalEffectAuthority, 'NONE');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.messagesSent, 0);
  assert.equal(result.providerCalls, 0);
  assert.equal(result.accountExpansion.candidates[0].requiresIndependentQualification, true);
});

test('UberReach fails closed when sender or source-backed contact evidence is absent', () => {
  const result = compileUberReachReadiness({ now: NOW });
  assert.equal(result.state, 'PREPARATION_BLOCKED');
  assert.ok(result.blockers.includes('no-evidence-ready-sender'));
  assert.ok(result.blockers.includes('no-source-backed-verified-contact-route'));
  assert.equal(result.externalEffectAuthority, 'NONE');
});

test('UberReach can compose the outbound genome without granting send authority', () => {
  const result = compileUberReachReadiness({
    mailboxes: [mailbox],
    mailboxObservations: { 'mbx-1': observations },
    contacts: [contact],
    genomeInputs: genomeInputs(),
    now: NOW
  });
  assert.equal(result.outboundGenome.recommendedAction, 'SEND_CANDIDATE');
  assert.equal(result.outboundGenome.recommendedCandidateId, 'offer-short');
  assert.equal(result.outboundGenome.externalEffectAuthority, 'NONE');
  assert.equal(result.messagesSent, 0);
  assert.equal(result.providerCalls, 0);
});

test('optional enforced genome blocks readiness when suppression says abstain', () => {
  const blockedGenome = genomeInputs();
  blockedGenome.enforce = true;
  blockedGenome.prospect = { ...blockedGenome.prospect, suppressed: true };
  const result = compileUberReachReadiness({
    mailboxes: [mailbox],
    mailboxObservations: { 'mbx-1': observations },
    contacts: [contact],
    genomeInputs: blockedGenome,
    now: NOW
  });
  assert.equal(result.outboundGenome.recommendedAction, 'ABSTAIN');
  assert.ok(result.blockers.includes('outbound-genome-not-send-candidate'));
  assert.equal(result.state, 'PREPARATION_BLOCKED');
  assert.equal(result.messagesSent, 0);
});
