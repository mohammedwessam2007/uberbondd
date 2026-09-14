import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UBEROUTBOUND_ACTIONS,
  assignUberOutboundExperiment,
  compileOutboundLegalEvidence,
  compileUberOutboundLearningPacket,
  compileUberOutboundOutcomeReceipt,
  compileOutboundTriggerPrior,
  compileOutboundOpportunityScore,
  compileUberOutboundGenomeDecision,
  outboundProblemAltitude,
  outboundPersonalizationPrior
} from '../src/uberoutbound-genome.mjs';

const legal = () => ({
  status: 'PASSED',
  jurisdiction: 'US',
  basis: 'CAN_SPAM_ELIGIBLE_COMMERCIAL_B2B_WITH_REQUIRED_FIELDS',
  policyVersion: 'legal-policy-test-v1',
  evidenceId: 'legal-evidence-1',
  recipientType: 'CORPORATE'
});

const prospect = overrides => ({
  accountId: 'acct-1',
  seniority: 'CFO',
  safeForOutreach: true,
  verificationStatus: 'VERIFIED',
  suppressed: false,
  unsubscribed: false,
  problemEvidenceScore: 0.9,
  roleOwnershipScore: 0.95,
  accountValueScore: 0.8,
  contactabilityScore: 0.95,
  trigger: {
    type: 'EXPLICIT_PRIORITY',
    confidence: 0.9,
    freshness: 0.9,
    problemLinked: true
  },
  ...overrides
});

const sender = overrides => ({
  status: 'GREEN',
  authenticationReady: true,
  providerBudgetAvailable: true,
  ...overrides
});

const authorization = overrides => ({ outreachAuthorized: true, ...overrides });

const experiment = overrides => ({
  experimentId: 'cta-v1',
  primaryMetric: 'QUALIFIED_POSITIVE_REPLY',
  arms: ['OFFER', 'MEETING'],
  holdoutRate: 0.1,
  ...overrides
});

const candidates = [
  {
    candidateId: 'offer-short',
    wordCount: 82,
    sentenceCount: 4,
    subjectWordCount: 3,
    ctaType: 'OFFER',
    personalizationClass: 'COMPANY',
    problemAltitude: 'STRATEGIC',
    problemBeforeProduct: true,
    productHeavy: false,
    relevantProof: true,
    sequencePosition: 1
  },
  {
    candidateId: 'meeting-heavy',
    wordCount: 165,
    sentenceCount: 7,
    subjectWordCount: 8,
    ctaType: 'MEETING',
    personalizationClass: 'INDIVIDUAL',
    problemAltitude: 'TASK',
    problemBeforeProduct: false,
    productHeavy: true,
    relevantProof: false,
    sequencePosition: 1
  }
];

test('legal evidence refuses ungrounded passed status', () => {
  const evidence = compileOutboundLegalEvidence({ status: 'PASSED', jurisdiction: 'US' });
  assert.equal(evidence.passed, false);
  assert.ok(evidence.reasonCodes.includes('legal-basis-required'));
  assert.ok(evidence.reasonCodes.includes('legal-policy-version-required'));
  assert.ok(evidence.reasonCodes.includes('legal-evidence-id-required'));
});

test('seniority selects problem altitude and personalization priors', () => {
  assert.equal(outboundProblemAltitude('CFO'), 'STRATEGIC');
  assert.equal(outboundProblemAltitude('Manager'), 'WORKFLOW');
  assert.deepEqual(outboundPersonalizationPrior('CFO'), ['COMPANY', 'ACTIVITY', 'EXECUTIVE_PRIORITY']);
  assert.deepEqual(outboundPersonalizationPrior('Account Manager'), ['WORKFLOW', 'ROLE', 'COMPANY']);
});

test('trigger prior preserves uncertainty rather than claiming universal causal truth', () => {
  const direct = compileOutboundTriggerPrior({ type: 'OBSERVED_PROBLEM', confidence: 1, freshness: 1, problemLinked: true });
  const trivia = compileOutboundTriggerPrior({ type: 'TRIVIA', confidence: 1, freshness: 1, problemLinked: false });
  assert.equal(direct.tier, 'A');
  assert.equal(trivia.tier, 'D');
  assert.ok(direct.score > trivia.score);
  assert.match(direct.truthBoundary, /not universal causal truth/i);
});

test('opportunity score collapses when legal eligibility is absent', () => {
  const goodLegal = compileOutboundLegalEvidence(legal());
  const badLegal = compileOutboundLegalEvidence({ status: 'UNKNOWN' });
  const good = compileOutboundOpportunityScore({ prospect: prospect(), sender: sender(), legalEvidence: goodLegal });
  const bad = compileOutboundOpportunityScore({ prospect: prospect(), sender: sender(), legalEvidence: badLegal });
  assert.ok(good.score > 0);
  assert.equal(bad.score, 0);
});

test('experiment assignment is deterministic and creates no treatment authority', () => {
  const first = assignUberOutboundExperiment({ prospect: prospect(), experiment: experiment() });
  const second = assignUberOutboundExperiment({ prospect: prospect(), experiment: experiment() });
  assert.deepEqual(first, second);
  assert.equal(first.treatmentAuthorityCreated, false);
  assert.equal(first.primaryMetric, 'QUALIFIED_POSITIVE_REPLY');
});

test('genome prefers evidence-backed first-touch candidate without treating it as causal truth', () => {
  const result = compileUberOutboundGenomeDecision({
    prospect: prospect(),
    sender: sender(),
    authorization: authorization(),
    legalDecision: legal(),
    messageCandidates: candidates,
    experiment: experiment(),
    policy: { requireExperimentAssignment: true }
  });
  assert.equal(result.state, 'READY_FOR_GOVERNED_SEND_REVIEW');
  assert.equal(result.recommendedAction, UBEROUTBOUND_ACTIONS.SEND_CANDIDATE);
  assert.equal(result.recommendedCandidateId, 'offer-short');
  assert.equal(result.externalEffectAuthority, 'NONE');
  assert.equal(result.messagesSent, 0);
  assert.equal(result.providerCalls, 0);
});

test('suppression dominates every strategy prior', () => {
  const result = compileUberOutboundGenomeDecision({
    prospect: prospect({ suppressed: true }),
    sender: sender(),
    authorization: authorization(),
    legalDecision: legal(),
    messageCandidates: candidates,
    experiment: experiment()
  });
  assert.equal(result.recommendedAction, UBEROUTBOUND_ACTIONS.ABSTAIN);
  assert.ok(result.blockers.includes('suppression-dominates'));
  assert.equal(result.recommendedCandidateId, 'offer-short');
  assert.equal(result.messagesSent, 0);
});

test('failed legal eligibility routes elsewhere instead of widening email authority', () => {
  const result = compileUberOutboundGenomeDecision({
    prospect: prospect(),
    sender: sender(),
    authorization: authorization(),
    legalDecision: { status: 'DENIED', jurisdiction: 'CA', basis: 'NONE', policyVersion: 'v1', evidenceId: 'deny-1' },
    messageCandidates: candidates,
    experiment: experiment()
  });
  assert.equal(result.recommendedAction, UBEROUTBOUND_ACTIONS.ROUTE_ELSEWHERE);
  assert.equal(result.externalEffectAuthority, 'NONE');
});

test('sender or provider health failure waits rather than pretending capacity', () => {
  const result = compileUberOutboundGenomeDecision({
    prospect: prospect(),
    sender: sender({ status: 'HOLD', providerBudgetAvailable: false }),
    authorization: authorization(),
    legalDecision: legal(),
    messageCandidates: candidates,
    experiment: experiment()
  });
  assert.equal(result.recommendedAction, UBEROUTBOUND_ACTIONS.WAIT);
  assert.ok(result.blockers.includes('healthy-sender-required'));
  assert.ok(result.blockers.includes('recipient-provider-budget-required'));
});

test('missing experiment assignment blocks governed send review', () => {
  const result = compileUberOutboundGenomeDecision({
    prospect: prospect(),
    sender: sender(),
    authorization: authorization(),
    legalDecision: legal(),
    messageCandidates: candidates
  });
  assert.equal(result.recommendedAction, UBEROUTBOUND_ACTIONS.WAIT);
  assert.ok(result.blockers.includes('experiment-assignment-required'));
});

test('outcome receipt keeps economics unknown when costs are missing', () => {
  const receipt = compileUberOutboundOutcomeReceipt({
    decisionId: 'd1',
    experimentAssignment: { arm: 'OFFER' },
    outcome: { qualifiedPositiveReply: true, clearedRevenueCents: 10000 },
    economics: { clearedContributionCents: 7000 }
  });
  assert.equal(receipt.commercial.qualifiedPositiveReply, true);
  assert.equal(receipt.economics.marginalSendValueCents, null);
  assert.equal(receipt.economics.state, 'PARTIAL_UNKNOWN');
});

test('outcome receipt computes marginal send value only when all terms are observed', () => {
  const receipt = compileUberOutboundOutcomeReceipt({
    outcome: { closedWon: true },
    economics: {
      clearedContributionCents: 10000,
      reputationDamageCents: 500,
      complianceRiskCostCents: 200,
      opportunityCostCents: 300
    }
  });
  assert.equal(receipt.economics.marginalSendValueCents, 9000);
  assert.equal(receipt.economics.state, 'OBSERVED_ENOUGH_TO_COMPUTE');
});

test('learning packet refuses to auto-declare a causal winner', () => {
  const outcomes = [];
  for (let i = 0; i < 120; i += 1) {
    outcomes.push(compileUberOutboundOutcomeReceipt({
      experimentAssignment: { arm: 'OFFER' },
      outcome: { qualifiedPositiveReply: i < 12, complaint: false },
      economics: { clearedContributionCents: 10, reputationDamageCents: 0, complianceRiskCostCents: 0, opportunityCostCents: 0 }
    }));
    outcomes.push(compileUberOutboundOutcomeReceipt({
      experimentAssignment: { arm: 'MEETING' },
      outcome: { qualifiedPositiveReply: i < 6, complaint: false },
      economics: { clearedContributionCents: 5, reputationDamageCents: 0, complianceRiskCostCents: 0, opportunityCostCents: 0 }
    }));
  }
  const packet = compileUberOutboundLearningPacket({ outcomes, policy: { minSamplesPerArm: 100 } });
  assert.equal(packet.eligibleForCausalAnalysis, true);
  assert.equal(packet.promotionState, 'READY_FOR_INDEPENDENT_CAUSAL_ANALYSIS');
  assert.equal(packet.automaticWinner, null);
});

test('complaint guardrail blocks promotion readiness', () => {
  const outcomes = [];
  for (let i = 0; i < 100; i += 1) {
    outcomes.push(compileUberOutboundOutcomeReceipt({ experimentAssignment: { arm: 'A' }, outcome: { complaint: i === 0 } }));
    outcomes.push(compileUberOutboundOutcomeReceipt({ experimentAssignment: { arm: 'B' }, outcome: { complaint: false } }));
  }
  const packet = compileUberOutboundLearningPacket({ outcomes, policy: { minSamplesPerArm: 100, maxComplaintRate: 0.001 } });
  assert.equal(packet.eligibleForCausalAnalysis, false);
  assert.equal(packet.arms.find(arm => arm.arm === 'A').guardrailsPassed, false);
});
