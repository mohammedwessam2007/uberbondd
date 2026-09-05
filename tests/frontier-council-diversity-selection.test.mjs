import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';
import { compileFrontierCognitivePlan } from '../src/frontier-cognitive-fabric.mjs';
import { buildFrontierCallabilityProbeReceipt } from '../src/frontier-callability-provenance.mjs';

const NOW = new Date('2026-09-04T20:00:00.000Z');
const FRESH = '2026-09-04T19:00:00.000Z';
function p(id, provider, model, quality) {
  return {
    id, provider, model, revision: 'rev-1', quality,
    transportProvider: 'ai-gateway', transportModel: `${provider}/${model}`,
    transportSourceRef: 'official://transport', transportVerifiedAt: FRESH, transportEvidenceClass: 'OFFICIAL_SOURCE',
    taskClasses: ['general'], roles: ['general'], allowedDataClasses: ['INTERNAL_NON_SECRET'],
    reasoningBindings: { FRONTIER_MAX: { settingRef: 'ai-gateway:reasoning=xhigh', sourceRef: 'official://reasoning', verifiedAt: FRESH, evidenceClass: 'OFFICIAL_SOURCE' } },
    pricingVerifiedAt: FRESH, pricingSourceRef: 'official://pricing', pricingEvidenceClass: 'OFFICIAL_SOURCE',
    maxContextTokens: 200000, maxOutputTokens: 32000, centsPerMillionInputTokens: 100, centsPerMillionOutputTokens: 500,
    identityAliases: [model], enabled: true
  };
}
function c(profile) {
  return {
    profileId: profile.id, status: 'CALLABLE_NOW', evidenceClass: 'OBSERVED_RUNTIME', identityVerification: 'OBSERVED',
    observedProvider: profile.provider, observedModel: profile.model, observedRevision: profile.revision,
    observedTransportProvider: profile.transportProvider, observedTransportModel: profile.transportModel,
    observedAt: FRESH, sourceRef: `runtime://probe-${profile.id}`
  };
}
function b(profile) {
  const out = normalizeModelBenchmark({
    provider: profile.provider, model: profile.model, taskClasses: ['general'], taskClass: 'general',
    quality: profile.quality, reliability: 0.99, latencyScore: 0.8, economicImpact: 0.9, evidenceConfidence: 0.99, costEfficiency: 0.5
  }, new Date(FRESH));
  out.observedRevision = profile.revision;
  out.evidenceRef = `benchmark://${profile.id}`;
  return out;
}
function provenance(calls) {
  const built = buildFrontierCallabilityProbeReceipt({ observations: calls.map(item => ({ ...item, providerRequestId: `probe-${item.profileId}` })), sourceRef: 'simulation://diversity-selection', observedAt: FRESH });
  assert.equal(built.ok, true);
  return { receipt: built.receipt, receiptDigest: built.receiptDigest };
}

test('COUNCIL_MAX does not greedily consume two same-provider seats when a diverse eligible candidate exists', () => {
  const profiles = [
    p('openai-a', 'openai', 'frontier-a', 0.99),
    p('openai-b', 'openai', 'frontier-b', 0.985),
    p('anthropic-c', 'anthropic', 'frontier-c', 0.98),
    p('google-adjudicator', 'google', 'frontier-d', 0.975)
  ];
  const calls = profiles.map(c);
  const out = compileFrontierCognitivePlan({
    task: {
      missionId: 'diversity', taskId: 'diversity', objective: 'Select a genuinely diverse bounded council.',
      taskClass: 'general', role: 'general', dataClass: 'INTERNAL_NON_SECRET', reasoningTier: 'COUNCIL_MAX',
      requiredTags: ['frontier'], contextTokenBudget: 1000, minCouncilSize: 2, maxCouncilSize: 2
    },
    profiles, callability: calls, callabilityProvenance: provenance(calls), benchmarks: profiles.map(b),
    contextArtifacts: [{ id: 'constitution', kind: 'CONSTITUTION', contentRef: 'repo://constitution', tags: ['frontier'], dependencies: [], estimatedTokens: 100, priority: 100, immutable: true }],
    now: NOW
  });
  assert.equal(out.ok, true);
  assert.equal(out.plan.status, 'COUNCIL_PLAN_READY');
  assert.equal(out.plan.responders.length, 2);
  assert.equal(new Set(out.plan.responders.map(item => item.provider)).size, 2);
  assert.equal(out.plan.responders.some(item => item.profileId === out.plan.adjudicator.profileId), false);
});
