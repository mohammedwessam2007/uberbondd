import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UBERREPLY_OFFER_PORTFOLIO,
  UBERREPLY_DAILY_PORTFOLIO_TARGET,
  UBERREPLY_DAILY_LANE_TARGET,
  compileUberReplyPortfolioAllocation,
  selectUberReplyOffer,
  compileUberReplyCampaignDecision,
  compileUberReplyMessagePolicy,
  validateUberReplyRenderedMessage,
  compareUberReplyFitness,
  compileUberReplyOfferLifecycle,
  compileUberReplyStrategyLifecycle
} from '../src/uberreply-four-offer-genome.mjs';

const evidenceProspect = overrides => ({
  seniority: 'Founder',
  problemAltitude: 'FUNCTION_OPERATIONAL',
  problemEvidenceScore: 0.9,
  fitEvidenceConfidence: 0.9,
  sourceCount: 3,
  sourceFreshness: 1,
  trigger: { type: 'OBSERVED_PROBLEM' },
  ...overrides
});

test('portfolio is exactly four distinct 25k lanes targeting 100k total', () => {
  assert.equal(UBERREPLY_OFFER_PORTFOLIO.length, 4);
  assert.equal(new Set(UBERREPLY_OFFER_PORTFOLIO.map(row => row.offerId)).size, 4);
  assert.equal(new Set(UBERREPLY_OFFER_PORTFOLIO.map(row => row.lane)).size, 4);
  assert.equal(UBERREPLY_DAILY_LANE_TARGET, 25_000);
  assert.equal(UBERREPLY_OFFER_PORTFOLIO.reduce((sum, row) => sum + row.dailyTarget, 0), UBERREPLY_DAILY_PORTFOLIO_TARGET);
  assert.equal(UBERREPLY_DAILY_PORTFOLIO_TARGET, 100_000);
});

test('allocation refuses silent cross-lane concentration when one lane lacks inventory', () => {
  const allocation = compileUberReplyPortfolioAllocation({
    eligibleByOffer: {
      LEAD_TO_BOOKING_LEAK_AUDIT: 100_000,
      AI_AGENT_RELEASE_GATE: 25_000,
      CLIENT_ROI_PROOF_SPRINT: 25_000,
      BILINGUAL_BOOKING_LEAK_AUDIT: 5_000
    }
  });
  assert.equal(allocation.targetTotal, 100_000);
  assert.equal(allocation.allocatedTotal, 80_000);
  assert.equal(allocation.shortfall, 20_000);
  assert.equal(allocation.automaticCrossLaneReallocationAuthorized, false);
  assert.ok(allocation.lanes.every(row => row.allocated <= 25_000 && row.spilloverToOtherLaneAuthorized === false));
});

test('fit selection routes distinct economic pain classes to distinct offers', () => {
  const home = selectUberReplyOffer(evidenceProspect({ tags: ['agency', 'HVAC', 'ServiceTitan', 'booking'] }));
  const ai = selectUberReplyOffer(evidenceProspect({ tags: ['AI agent', 'SaaS', 'release eval'] }));
  const roi = selectUberReplyOffer(evidenceProspect({ tags: ['PPC agency', 'attribution', 'ROI', 'CRM'] }));
  const gcc = selectUberReplyOffer(evidenceProspect({ tags: ['UAE', 'dental clinic', 'Arabic', 'WhatsApp booking'] }));
  assert.equal(home.offer.offerId, 'LEAD_TO_BOOKING_LEAK_AUDIT');
  assert.equal(ai.offer.offerId, 'AI_AGENT_RELEASE_GATE');
  assert.equal(roi.offer.offerId, 'CLIENT_ROI_PROOF_SPRINT');
  assert.equal(gcc.offer.offerId, 'BILINGUAL_BOOKING_LEAK_AUDIT');
});

test('weak fit abstains instead of forcing a quota', () => {
  const result = selectUberReplyOffer({ tags: ['unrelated'], fitEvidenceConfidence: 0.1 }, { minimumFit: 0.55 });
  assert.equal(result.selected, false);
  assert.equal(result.state, 'ABSTAIN_NO_STRONG_OFFER_FIT');
});

test('first touch compiles UBERREPLY signal tension gift tiny-ask genotype', () => {
  const policy = compileUberReplyMessagePolicy({
    offerId: 'LEAD_TO_BOOKING_LEAK_AUDIT',
    prospect: evidenceProspect({ industry: 'HOME_SERVICES', tags: ['agency', 'HVAC'] }),
    research: { accountValueScore: 0.8, signalStrength: 0.9, artifactFeasibility: 1, evidenceDensity: 0.8, estimatedResearchMinutes: 8 },
    sequencePosition: 1
  });
  assert.equal(policy.ok, true);
  assert.match(policy.genotype.genotypeId, /^ubog_[a-f0-9]{64}$/);
  assert.match(policy.experimentCellId, /^ubrx_[a-f0-9]{64}$/);
  assert.equal(policy.messageCandidate.openingArchitecture, 'SIGNAL');
  assert.equal(policy.messageCandidate.problemArchitecture, 'TENSION_QUESTION');
  assert.equal(policy.messageCandidate.problemBeforeProduct, true);
  assert.equal(policy.messageCandidate.ctaType, 'SEND_ASSET');
  assert.equal(policy.constraints.directMeetingAskFirstTouchAllowed, false);
});

test('a pinned final offer lane compiles only when the researched prospect fits it', () => {
  const ready = compileUberReplyCampaignDecision({
    offerId: 'LEAD_TO_BOOKING_LEAK_AUDIT',
    prospect: evidenceProspect({ industry: 'HOME_SERVICES', tags: ['agency', 'HVAC', 'booking'] }),
    research: { accountValueScore: 0.8, signalStrength: 0.9, artifactFeasibility: 1, evidenceDensity: 0.8, estimatedResearchMinutes: 8 }
  });
  assert.equal(ready.ok, true);
  assert.equal(ready.offer.offerId, 'LEAD_TO_BOOKING_LEAK_AUDIT');
  const refused = compileUberReplyCampaignDecision({
    offerId: 'AI_AGENT_RELEASE_GATE',
    prospect: evidenceProspect({ tags: ['unrelated'], fitEvidenceConfidence: 0.1 }),
    research: { accountValueScore: 0.2, signalStrength: 0.2, artifactFeasibility: 0.2, evidenceDensity: 0.2 }
  });
  assert.equal(refused.ok, false);
  assert.ok(refused.reasonCodes.includes('pinned-offer-fit-below-threshold'));
});

test('render validator refuses meeting asks, fake artifact claims and generic bump language', () => {
  const policy = compileUberReplyMessagePolicy({
    offerId: 'AI_AGENT_RELEASE_GATE',
    prospect: evidenceProspect({ tags: ['AI agent', 'SaaS'] }),
    research: { accountValueScore: 0.5, signalStrength: 0.7, artifactFeasibility: 0.8, evidenceDensity: 0.7 },
    sequencePosition: 1
  });
  const body = 'Noticed your agent launch. I mapped a failure pattern that could matter after release. The issue is not model quality alone but whether the agent reaches the right final state. I made three failure scenarios from the public workflow. Can we book 30 min on Tuesday?';
  const result = validateUberReplyRenderedMessage({ policy, subject: 'agent release', body, evidenceRefs: ['public:workflow'], primaryAskCount: 1, artifactPrepared: false });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('first-touch-direct-meeting-ask-disallowed'));
  assert.ok(result.reasonCodes.includes('claimed-artifact-must-exist-before-send'));
});

test('economic fitness beats seductive raw reply rate', () => {
  const highReplyNoMoney = {
    providerConfirmedSends: 1000,
    qualifiedPositiveReplies: 180,
    qualifiedConversations: 40,
    paidSprints: 0,
    acceptedDeliveries: 0,
    clearedContributionCents: 0
  };
  const lowerReplyProfitable = {
    providerConfirmedSends: 1000,
    qualifiedPositiveReplies: 40,
    qualifiedConversations: 12,
    paidSprints: 4,
    acceptedDeliveries: 3,
    clearedContributionCents: 220000
  };
  const comparison = compareUberReplyFitness(highReplyNoMoney, lowerReplyProfitable);
  assert.equal(comparison.winner, 'B');
  assert.ok(comparison.b.contributionPer1000Cents > comparison.a.contributionPer1000Cents);
});

test('offer canary forces rethink after five qualified conversations and zero paid pilots', () => {
  const decision = compileUberReplyOfferLifecycle({
    offerId: 'LEAD_TO_BOOKING_LEAK_AUDIT',
    outcome: { providerConfirmedSends: 300, qualifiedPositiveReplies: 20, qualifiedConversations: 5, paidSprints: 0, clearedContributionCents: 0 }
  });
  assert.equal(decision.state, 'RETHINK_OFFER');
  assert.ok(decision.reasonCodes.includes('five-qualified-conversations-with-zero-paid-pilots'));
});

test('strategy lifecycle cannot promote on raw reply vanity evidence', () => {
  const policy = compileUberReplyMessagePolicy({
    offerId: 'CLIENT_ROI_PROOF_SPRINT',
    prospect: evidenceProspect({ tags: ['PPC agency', 'ROI'] }),
    research: { accountValueScore: 0.8, signalStrength: 0.8, artifactFeasibility: 0.8, evidenceDensity: 0.8 }
  });
  const lifecycle = compileUberReplyStrategyLifecycle({
    genotype: policy.genotype,
    experimentEvidence: {
      primaryMetric: 'RAW_REPLY_RATE', causalState: 'CAUSAL_SUPPORTED', samplePerArm: 30000,
      minimumSamplePerArm: 10000, effectDirection: 'POSITIVE', uncertaintyState: 'STABLE',
      independentAnalysis: true, randomized: true, holdoutProtected: true
    },
    validationEvidence: { untouchedValidationPassed: true, sampleSize: 10000, minimumSampleSize: 5000 },
    reputationEvidence: { complaintRate: 0, complaintCeiling: 0.001, hardBounceRate: 0.001, hardBounceCeiling: 0.02 },
    economicEvidence: { incrementalClearedContributionCents: 10000, downFunnelObserved: true }
  });
  assert.equal(lifecycle.rawReplyRateCanPromotePolicy, false);
  assert.equal(lifecycle.promotion.state, 'REVOKED');
  assert.ok(lifecycle.promotion.fatalReasonCodes.includes('vanity-metric-cannot-promote-policy'));
});
