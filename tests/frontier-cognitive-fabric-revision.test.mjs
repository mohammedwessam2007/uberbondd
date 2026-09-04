import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';
import { compileFrontierCognitivePlan } from '../src/frontier-cognitive-fabric.mjs';

const NOW = new Date('2026-09-04T20:00:00.000Z');
const FRESH = '2026-09-04T19:00:00.000Z';

function profile(revision) {
  return {
    id: `elite-${revision}`,
    provider: 'openai',
    model: 'same-marketing-name',
    revision,
    transportProvider: 'ai-gateway',
    transportModel: 'openai/same-marketing-name',
    transportSourceRef: 'official://transport',
    transportVerifiedAt: FRESH,
    transportEvidenceClass: 'OFFICIAL_SOURCE',
    taskClasses: ['general'],
    roles: ['general'],
    allowedDataClasses: ['INTERNAL_NON_SECRET'],
    reasoningBindings: {
      FRONTIER_MAX: {
        settingRef: 'ai-gateway:reasoning=xhigh',
        sourceRef: 'official://reasoning',
        verifiedAt: FRESH,
        evidenceClass: 'OFFICIAL_SOURCE'
      }
    },
    pricingVerifiedAt: FRESH,
    pricingSourceRef: 'official://pricing',
    pricingEvidenceClass: 'OFFICIAL_SOURCE',
    maxContextTokens: 200000,
    maxOutputTokens: 32000,
    centsPerMillionInputTokens: 100,
    centsPerMillionOutputTokens: 500,
    identityAliases: ['same-marketing-name'],
    enabled: true
  };
}

function callability(p) {
  return {
    profileId: p.id,
    status: 'CALLABLE_NOW',
    observedProvider: p.provider,
    observedModel: p.model,
    observedRevision: p.revision,
    observedTransportProvider: p.transportProvider,
    observedTransportModel: p.transportModel,
    observedAt: FRESH,
    sourceRef: 'runtime://identity-probe',
    evidenceClass: 'OBSERVED_RUNTIME',
    identityVerification: 'OBSERVED'
  };
}

function contextArtifacts() {
  return [{
    id: 'constitution', kind: 'CONSTITUTION', contentRef: 'repo://constitution',
    tags: ['frontier'], dependencies: [], estimatedTokens: 1000, priority: 100, immutable: true
  }];
}

function task() {
  return {
    missionId: 'revision-binding', taskId: 'revision-binding', objective: 'Prove exact revision binding.',
    taskClass: 'general', role: 'general', dataClass: 'INTERNAL_NON_SECRET', reasoningTier: 'FRONTIER_MAX',
    requiredTags: ['frontier'], contextTokenBudget: 10000, minCouncilSize: 2, maxCouncilSize: 2
  };
}

test('FRONTIER_MAX refuses a benchmark whose evidence belongs to another revision of the same provider/model identity', () => {
  const old = profile('rev-old');
  const current = profile('rev-current');
  const oldBenchmark = normalizeModelBenchmark({
    provider: old.provider,
    model: old.model,
    taskClasses: old.taskClasses,
    taskClass: 'general',
    quality: 0.99,
    reliability: 0.99,
    latencyScore: 0.9,
    economicImpact: 0.9,
    evidenceConfidence: 0.99,
    costEfficiency: 0.7,
    observedRevision: old.revision
  }, new Date(FRESH));
  // Frontier evidence must carry revision identity outside the legacy router's provider/model candidate id.
  oldBenchmark.observedRevision = old.revision;

  const out = compileFrontierCognitivePlan({
    task: task(), profiles: [current], callability: [callability(current)], benchmarks: [oldBenchmark],
    contextArtifacts: contextArtifacts(), now: NOW
  });

  assert.equal(out.ok, false);
  assert.equal(out.status, 'CAPACITY_BLOCKED');
  assert.ok(out.reasonCodes.includes('frontier-tier-requires-fresh-quality-evidence'));
});
