import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileUberOutboundPromotionDecision,
  compileUberOutboundDegradationDecision
} from '../src/uberoutbound-promotion-gate.mjs';

const strongEvidence = {
  candidate: { genotypeId: 'ubog_fixture' },
  experimentEvidence: {
    causalState: 'CAUSAL_SUPPORTED',
    primaryMetric: 'QUALIFIED_POSITIVE_REPLY',
    samplePerArm: 50000,
    minimumSamplePerArm: 42607,
    effectDirection: 'POSITIVE',
    uncertaintyState: 'NARROW',
    independentAnalysis: true,
    randomized: true,
    holdoutProtected: true
  },
  validationEvidence: {
    untouchedValidationPassed: true,
    sampleSize: 12000,
    minimumSampleSize: 10000
  },
  reputationEvidence: {
    complaintRate: 0.0005,
    complaintCeiling: 0.001,
    hardBounceRate: 0.01,
    hardBounceCeiling: 0.03,
    legalIncidentCount: 0,
    providerPolicyIncidentCount: 0
  },
  economicEvidence: {
    incrementalClearedContributionCents: 50000,
    downFunnelObserved: true
  }
};

test('strong causal and validation evidence reaches policy review but never auto-promotes runtime', () => {
  const result = compileUberOutboundPromotionDecision(strongEvidence);
  assert.equal(result.state, 'APPROVED_POLICY_CANDIDATE');
  assert.equal(result.eligibleForPolicyReview, true);
  assert.equal(result.automaticRuntimePromotionAuthorized, false);
  assert.equal(result.externalEffectAuthority, 'NONE');
});

test('observational or undersampled evidence remains in randomized trial state', () => {
  const result = compileUberOutboundPromotionDecision({
    ...strongEvidence,
    experimentEvidence: {
      ...strongEvidence.experimentEvidence,
      randomized: false,
      causalState: 'ASSOCIATION_ONLY',
      samplePerArm: 1000
    }
  });
  assert.equal(result.state, 'RANDOMIZED_TRIAL');
  assert.ok(result.pendingReasonCodes.includes('randomized-trial-required'));
  assert.ok(result.pendingReasonCodes.includes('causal-support-not-established'));
  assert.equal(result.eligibleForPolicyReview, false);
});

test('open rate cannot be used to promote a policy', () => {
  const result = compileUberOutboundPromotionDecision({
    ...strongEvidence,
    experimentEvidence: { ...strongEvidence.experimentEvidence, primaryMetric: 'OPEN_RATE' }
  });
  assert.equal(result.state, 'REVOKED');
  assert.ok(result.fatalReasonCodes.includes('vanity-metric-cannot-promote-policy'));
});

test('complaint or legal incidents revoke even a statistically positive candidate', () => {
  const result = compileUberOutboundPromotionDecision({
    ...strongEvidence,
    reputationEvidence: {
      ...strongEvidence.reputationEvidence,
      complaintRate: 0.001,
      legalIncidentCount: 1
    }
  });
  assert.equal(result.state, 'REVOKED');
  assert.ok(result.fatalReasonCodes.includes('complaint-ceiling-reached'));
  assert.ok(result.fatalReasonCodes.includes('legal-incident-observed'));
});

test('negative incremental cleared contribution blocks promotion', () => {
  const result = compileUberOutboundPromotionDecision({
    ...strongEvidence,
    economicEvidence: { incrementalClearedContributionCents: -1, downFunnelObserved: true }
  });
  assert.equal(result.state, 'REVOKED');
  assert.ok(result.fatalReasonCodes.includes('negative-incremental-cleared-contribution'));
});

test('degradation gate recommends revocation on severe provider or complaint harm', () => {
  const result = compileUberOutboundDegradationDecision({
    currentState: 'APPROVED_POLICY_CANDIDATE',
    complaintRate: 0.002,
    complaintCeiling: 0.001,
    providerPolicyIncidentCount: 1
  });
  assert.equal(result.nextState, 'REVOKED');
  assert.equal(result.externalEffectAuthority, 'NONE');
});

test('non-severe negative effect degrades rather than inventing permanent approval', () => {
  const result = compileUberOutboundDegradationDecision({
    currentState: 'APPROVED_POLICY_CANDIDATE',
    recentEffectDirection: 'NEGATIVE'
  });
  assert.equal(result.nextState, 'DEGRADED');
});
