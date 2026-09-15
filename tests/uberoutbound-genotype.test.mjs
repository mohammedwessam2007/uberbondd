import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileUberOutboundGenomeDecision,
  compileUberOutboundMessageGenotype,
  compileUberOutboundRenderedMessageReceipt,
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
  generationCostBand: 'LOW',
  researchEffortBand: 'DEEP',
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

test('message genotype is deterministic and strategy-addressed', () => {
  const a = compileUberOutboundMessageGenotype(message, prospect);
  const b = compileUberOutboundMessageGenotype({ ...message }, { ...prospect });
  assert.equal(a.genotypeId, b.genotypeId);
  assert.ok(a.genotypeId.startsWith('ubog_'));
  assert.equal(a.atoms.segment.problemAltitude, 'STRATEGIC');
  assert.equal(a.atoms.trigger.triggerMentioned, true);
  assert.equal(a.atoms.generation.modelVersion, 'fixture-v1');
});

test('genotype changes when a causal strategy atom changes', () => {
  const mention = compileUberOutboundMessageGenotype(message, prospect);
  const noMention = compileUberOutboundMessageGenotype({ ...message, triggerMentioned: false }, prospect);
  const meeting = compileUberOutboundMessageGenotype({ ...message, ctaType: 'MEETING' }, prospect);
  assert.notEqual(mention.genotypeId, noMention.genotypeId);
  assert.notEqual(mention.genotypeId, meeting.genotypeId);
});

test('creative copy variation does not create a fake new strategy genotype', () => {
  const a = compileUberOutboundMessageGenotype(message, prospect);
  const b = compileUberOutboundMessageGenotype({
    ...message,
    subject: 'different exact subject',
    body: 'Different prospect-specific body.',
    contentReceiptId: 'content-receipt-2',
    evidenceSnapshotDigest: 'evidence-digest-2'
  }, prospect);
  assert.equal(a.genotypeId, b.genotypeId);
  assert.equal(JSON.stringify(a.atoms).includes(message.body), false);
  assert.equal(JSON.stringify(a.atoms).includes(message.subject), false);
});

test('rendered-message receipt separates exact exposure from reusable strategy genotype', () => {
  const genotype = compileUberOutboundMessageGenotype(message, prospect);
  const first = compileUberOutboundRenderedMessageReceipt(message, genotype);
  const second = compileUberOutboundRenderedMessageReceipt({
    ...message,
    subject: 'different exact subject',
    body: 'Different prospect-specific body.',
    contentReceiptId: 'content-receipt-2',
    evidenceSnapshotDigest: 'evidence-digest-2'
  }, genotype);
  assert.equal(first.genotypeId, second.genotypeId);
  assert.notEqual(first.renderedMessageId, second.renderedMessageId);
  assert.ok(first.renderedMessageId.startsWith('ubom_'));
  assert.ok(first.contentReceipt.subjectDigest);
  assert.ok(first.contentReceipt.bodyDigest);
});

test('decision is content-addressed to exact rendered exposure and causal lineage', () => {
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
  assert.equal(a.recommendedRenderedMessageId, a.messageCandidates[0].renderedMessageId);
  assert.equal(a.experimentAssignment.treatmentDimension, 'TRIGGER_MENTION');
  assert.match(a.experimentAssignment.causalQuestion, /mentioning/i);
});

test('decision id changes when exact exposure changes even if strategy genotype stays constant', () => {
  const base = {
    prospect,
    sender,
    authorization: { outreachAuthorized: true },
    legalDecision,
    experiment,
    policy: { policyVersion: 'policy-v1' }
  };
  const first = compileUberOutboundGenomeDecision({ ...base, messageCandidates: [message] });
  const second = compileUberOutboundGenomeDecision({
    ...base,
    messageCandidates: [{ ...message, subject: 'new subject', body: 'new body', contentReceiptId: 'r2' }]
  });
  assert.equal(first.recommendedGenotypeId, second.recommendedGenotypeId);
  assert.notEqual(first.recommendedRenderedMessageId, second.recommendedRenderedMessageId);
  assert.notEqual(first.decisionId, second.decisionId);
});

test('decision id and genotype both change when a strategy atom changes', () => {
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

test('outcome and learning preserve strategy vs creative diversity separately', () => {
  const decision = compileUberOutboundGenomeDecision({
    prospect,
    sender,
    authorization: { outreachAuthorized: true },
    legalDecision,
    messageCandidates: [message],
    experiment,
    policy: { policyVersion: 'policy-v1' }
  });
  const variantReceipt = compileUberOutboundRenderedMessageReceipt({
    ...message,
    subject: 'another exact subject',
    body: 'another exact body',
    contentReceiptId: 'content-receipt-variant'
  }, compileUberOutboundMessageGenotype(message, prospect));
  const outcomes = [
    compileUberOutboundOutcomeReceipt({
      decisionId: decision.decisionId,
      genotypeId: decision.recommendedGenotypeId,
      renderedMessageId: decision.recommendedRenderedMessageId,
      experimentAssignment: { ...decision.experimentAssignment, arm: 'MENTION' },
      outcome: { qualifiedPositiveReply: true },
      economics: { clearedContributionCents: 100, reputationDamageCents: 0, complianceRiskCostCents: 0, opportunityCostCents: 0 }
    }),
    compileUberOutboundOutcomeReceipt({
      decisionId: decision.decisionId,
      genotypeId: decision.recommendedGenotypeId,
      renderedMessageId: variantReceipt.renderedMessageId,
      experimentAssignment: { ...decision.experimentAssignment, arm: 'MENTION' },
      outcome: { qualifiedPositiveReply: false },
      economics: { clearedContributionCents: 0, reputationDamageCents: 0, complianceRiskCostCents: 0, opportunityCostCents: 0 }
    }),
    compileUberOutboundOutcomeReceipt({
      decisionId: decision.decisionId,
      genotypeId: decision.recommendedGenotypeId,
      renderedMessageId: decision.recommendedRenderedMessageId,
      experimentAssignment: { ...decision.experimentAssignment, arm: 'NO_MENTION' },
      outcome: { qualifiedPositiveReply: false },
      economics: { clearedContributionCents: 0, reputationDamageCents: 0, complianceRiskCostCents: 0, opportunityCostCents: 0 }
    })
  ];
  const packet = compileUberOutboundLearningPacket({ outcomes, policy: { minSamplesPerArm: 1 } });
  const mention = packet.arms.find(arm => arm.arm === 'MENTION');
  assert.equal(mention.uniqueGenotypeCount, 1);
  assert.equal(mention.uniqueRenderedMessageCount, 2);
  assert.equal(packet.automaticWinner, null);
});
