import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';
import { compileFrontierCognitivePlan } from '../src/frontier-cognitive-fabric.mjs';

const NOW = new Date('2026-09-04T20:00:00.000Z');
const FRESH = '2026-09-04T19:00:00.000Z';

function contextArtifacts() {
  return [{
    id: 'constitution', kind: 'CONSTITUTION', contentRef: 'repo://constitution',
    tags: ['frontier'], dependencies: [], estimatedTokens: 100, priority: 100, immutable: true
  }];
}

test('raw frontier compiler cannot bypass canonical 120-char model identity boundary', () => {
  const model = 'm'.repeat(121);
  const profile = {
    id: 'raw-boundary-bypass', provider: 'google', model, revision: 'rev-1',
    transportProvider: 'ai-gateway', transportModel: `google/${'m'.repeat(113)}`,
    transportSourceRef: 'official://gateway', transportVerifiedAt: FRESH, transportEvidenceClass: 'OFFICIAL_SOURCE',
    taskClasses: ['general'], roles: ['general'], allowedDataClasses: ['INTERNAL_NON_SECRET'],
    reasoningBindings: {
      FRONTIER_MAX: { settingRef: 'ai-gateway:reasoning=xhigh', sourceRef: 'official://reasoning', verifiedAt: FRESH, evidenceClass: 'OFFICIAL_SOURCE' }
    },
    pricingVerifiedAt: FRESH, pricingSourceRef: 'official://pricing', pricingEvidenceClass: 'OFFICIAL_SOURCE',
    maxContextTokens: 200000, maxOutputTokens: 32000,
    centsPerMillionInputTokens: 10, centsPerMillionOutputTokens: 20,
    identityAliases: [model], enabled: true
  };
  const callability = {
    profileId: profile.id, status: 'CALLABLE_NOW', observedProvider: profile.provider,
    observedModel: model, observedRevision: profile.revision,
    observedTransportProvider: profile.transportProvider, observedTransportModel: profile.transportModel,
    observedAt: FRESH, sourceRef: 'runtime://caller-shaped', evidenceClass: 'OBSERVED_RUNTIME', identityVerification: 'OBSERVED'
  };
  const benchmark = normalizeModelBenchmark({
    provider: profile.provider, model, taskClasses: ['general'], taskClass: 'general',
    quality: 0.99, reliability: 0.99, latencyScore: 0.8, economicImpact: 0.9,
    evidenceConfidence: 0.99, costEfficiency: 0.5
  }, new Date(FRESH));
  benchmark.observedRevision = 'rev-1';
  benchmark.evidenceRef = 'benchmark://raw-boundary';

  const result = compileFrontierCognitivePlan({
    task: {
      missionId: 'raw-boundary', taskId: 'raw-boundary', objective: 'Attempt a raw compiler identity truncation bypass.',
      taskClass: 'general', role: 'general', dataClass: 'INTERNAL_NON_SECRET', reasoningTier: 'FRONTIER_MAX',
      requiredTags: ['frontier'], contextTokenBudget: 1000, minCouncilSize: 2, maxCouncilSize: 2
    },
    profiles: [profile], callability: [callability], benchmarks: [benchmark],
    contextArtifacts: contextArtifacts(), now: NOW
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'FRONTIER_PROFILE_SET_INVALID');
  assert.ok(result.reasonCodes.some(code => code.includes('model-identity')));
});
