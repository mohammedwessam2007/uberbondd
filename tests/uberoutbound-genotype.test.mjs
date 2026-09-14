import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileUberOutboundGenomeDecision,
  compileUberOutboundMessageGenotype,
  compileUberOutboundOutcomeReceipt,
  compileUberOutboundLearningPacket
} from '../src/uberoutbound-genome.mjs';

const prospect = {
  accountId: 'acct-genotype-1',
  industry: 'SaaS',
  department: 'Finance',
  seniority: 'CFO',
  safeForOutreach: true,
  verificationStatus: 'VERIFIED',
  suppressed: false,
  unsubscribed: false,
  problemEvidenceScore: 0.9,
  roleOwnershipScore: 0.95,
  accountValueScore: 0.8,
  contactabilityScore: 0.95,
  trigger: { type: 'EXPLICIT_PRIORITY', confidence: 0.9, freshness: 0.9, problemLinked: true }
};

const message = {
  candidateId: 'offer-short',
  wordCount: 82,
  sentenceCount: 4,
  subjectWordCount: 3,
  subject: 'margin benchmark',
  body: 'Body fixture only',
  subjectArchitecture: 'PRIORITY',
  openingArchitecture: 'TRIGGER_PROBLEM',
  problemArchitecture: 'COST_OF_INACTION',
  ctaType: 'OFFER',
  offerType: 'BENCHMARK',
  tone: 'PLAIN',
  personalizationClass: 'COMPANY',
  problemAltitude: 'STRATEGIC',
  problemBeforeProduct: true,
  productHeavy: false,
  relevantProof: true,
  proofType: 'PEER_OUTCOME',
  proofSimilarityDimension: 'INDUSTRY',
  triggerMentioned: true,
  sequencePosition: 1,
  modelId: 'fixture-model',
  modelVersion: 'fixture-v1',
  promptOrPolicyVersion: 'outbound-policy-v1',
  researchDepth: 'DEEP',
  sourceCount: 4,
  sourceFreshness: 0.9,
  factCheckStatus: 'PASSED',
  generationCostCents: 2,
  researchMinutes: 1.5,
  contentReceiptId: 'content-receipt-1',
  evidenceSnapshotDigest: 'evidence-digest-1'
};

const sender = {
  senderId: 'sender-1',
  status: 'GREEN',
  authenticationReady: true,
  providerBudgetAvailable: true
};

const legalDecision = {
  status: 'PASSED',
  jurisdiction: 'US',
  basis: 'TEST_FIXTURE_ONLY',
  policyVersion: 'legal-v1',
  evidenceId: 'legal-evidence-1',
  recipientType: 'CORPORATE'
};

const experiment = {
  experimentId: 'trigger-mention-v1',
  primaryMetric: 'QUALIFIED_POSITIVE_REPLY',
  treatmentDimension: 'TRIGGER_MENTION',
  causalQuestion: 'Does mentioning an already-selected trigger improve qualified positive reply?',
  arms: ['MENTION', 'NO_MENTION'],
  holdoutRate: 0
};

test('message genotype is deterministic and content-addressed', () => {
  const a = compileUberOutboundMessageGenotype(message, prospect);
  const b = compileUberOutboundMessageGenotype({ ...message }, { ...prospect });
  assert.equal(a.genotypeId, b.genotypeId);
  assert.ok(a.genotypeId.startsWith('ubog_'));
  assert.equal(a.atoms.segment.problemAltitude, 'STRATEGIC');
  assert.equal(a.atoms.trigger.triggerMentioned, true);
  assert.equal(a.atoms.generation.modelVersion, 'fixture-v1');
  assert.ok(a.atoms.subject.contentDigest);
  assert.ok(a.atoms.contentReceipt.bodyDigest);
});

test('genotype changes when a causal strategy atom changes', () => {
  const mention = compileUberOutboundMessageGenotype(message, prospect);
  const noMention = compileUberOutboundMessageGenotype({ ...message, triggerMentioned: false }, prospect);
  const meeting = compileUberOutboundMessageGenotype({ ...message, ctaType: 'MEETING' }, prospect);
  assert.notEqual(mention.genotypeId, noMention.genotypeId);
  assert.notEqual(mention.genotypeId, meeting.genotypeId);
});

test('raw subject and body are represented by digests rather than copied into genotype atoms', () => {
  const genotype = compileUberOutboundMessageGenotype(message, prospect);
  const serialized = JSON.stringify(genotype.atoms);
  assert.equal(serialized.includes(message.body), false);
  assert.equal(serialized.includes(message.subject), false);
  assert.equal(genotype.atoms.contentReceipt.contentReceiptId, 'content-receipt-1');
});

test('decision is content-addressed to chosen genotype, legal evidence, sender, experiment and policy', () => {
  const args = {
    prospect,
    sender,
    authorization: { outreachAuthorized: true },
    legalDecision,
    messageCandidates: [message],
    experiment,
    policy: { policyVersion: 'policy-v1' }
  };
  const a = compileUberOutboundGenomeDecision(args);
  const b = compileUberOutboundGenomeDecision(args);
  assert.equal(a.decisionId, b.decisionId);
  assert.ok(a.decisionId.startsWith('ubod_'));
  assert.equal(a.recommendedGenotypeId, a.messageCandidates[0].genotypeId);
  assert.equal(a.experimentAssignment.treatmentDimension, 'TRIGGER_MENTION');
  assert.match(a.experimentAssignment.causalQuestion, /mentioning/i);
});

test('decision id changes when selected strategy genotype changes', () => {
  const base = {
    prospect,
    sender,
    authorization: { outreachAuthorized: true },
    legalDecision,
    experiment,
    policy: { policyVersion: 'policy-v1' }
  };
  const offer = compileUberOutboundGenomeDecision({ ...base, messageCandidates: [message] });
  const meeting = compileUberOutboundGenomeDecision({ ...base, messageCandidates: [{ ...message, ctaType: 'MEETING' }] });
  assert.notEqual(offer.recommendedGenotypeId, meeting.recommendedGenotypeId);
  assert.notEqual(offer.decisionId, meeting.decisionId);
});

test('outcome receipt carries decision and genotype lineage into learning packet', () => {
  const decision = compileUberOutboundGenomeDecision({
    prospect,
    sender,
    authorization: { outreachAuthorized: true },
    legalDecision,
    messageCandidates: [message],
    experiment,
    policy: { policyVersion: 'policy-v1' }
  });
  const outcomes = [
    compileUberOutboundOutcomeReceipt({
      decisionId: decision.decisionId,
      genotypeId: decision.recommendedGenotypeId,
      experimentAssignment: { ...decision.experimentAssignment, arm: 'MENTION' },
      outcome: { qualifiedPositiveReply: true },
      economics: { clearedContributionCents: 100, reputationDamageCents: 0, complianceRiskCostCents: 0, opportunityCostCents: 0 }
    }),
    compileUberOutboundOutcomeReceipt({
      decisionId: decision.decisionId,
      genotypeId: decision.recommendedGenotypeId,
      experimentAssignment: { ...decision.experimentAssignment, arm: 'NO_MENTION' },
      outcome: { qualifiedPositiveReply: false },
      economics: { clearedContributionCents: 0, reputationDamageCents: 0, complianceRiskCostCents: 0, opportunityCostCents: 0 }
    })
  ];
  const packet = compileUberOutboundLearningPacket({ outcomes, policy: { minSamplesPerArm: 1 } });
  assert.equal(packet.arms.length, 2);
  assert.ok(packet.arms.every(arm => arm.uniqueGenotypeCount === 1));
  assert.equal(packet.automaticWinner, null);
});
