import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFrontierCognitivePlan } from '../src/frontier-cognitive-fabric.mjs';

const NOW = new Date('2026-09-04T20:00:00.000Z');
const FRESH = '2026-09-04T19:00:00.000Z';

function contextArtifacts() {
  return [{ id: 'constitution', kind: 'CONSTITUTION', contentRef: 'repo://constitution', tags: ['frontier'], dependencies: [], estimatedTokens: 100, priority: 100, immutable: true }];
}

// The inherited canonical router accepts model identity up to 120 chars. The frontier profile must
// reject a wider identity at normalization time instead of admitting it and later failing mysteriously.
test('frontier profile fails closed at the canonical router model identity boundary', () => {
  const longModel = 'm'.repeat(121);
  const p = {
    id: 'too-long-model', provider: 'openai', model: longModel, revision: 'rev-1',
    transportProvider: 'ai-gateway', transportModel: `openai/${longModel}`,
    transportSourceRef: 'official://transport', transportVerifiedAt: FRESH, transportEvidenceClass: 'OFFICIAL_SOURCE',
    taskClasses: ['general'], roles: ['general'], allowedDataClasses: ['INTERNAL_NON_SECRET'],
    reasoningBindings: { FRONTIER_MAX: { settingRef: 'ai-gateway:reasoning=xhigh', sourceRef: 'official://reasoning', verifiedAt: FRESH, evidenceClass: 'OFFICIAL_SOURCE' } },
    pricingVerifiedAt: FRESH, pricingSourceRef: 'official://pricing', pricingEvidenceClass: 'OFFICIAL_SOURCE',
    maxContextTokens: 200000, maxOutputTokens: 32000, centsPerMillionInputTokens: 100, centsPerMillionOutputTokens: 500,
    identityAliases: [longModel], enabled: true
  };
  const out = compileFrontierCognitivePlan({
    task: { missionId: 'router-boundary', taskId: 'router-boundary', objective: 'Prove normalization boundary.', taskClass: 'general', role: 'general', dataClass: 'INTERNAL_NON_SECRET', reasoningTier: 'FRONTIER_MAX', requiredTags: ['frontier'], contextTokenBudget: 1000, minCouncilSize: 2, maxCouncilSize: 2 },
    profiles: [p], callability: [], benchmarks: [], contextArtifacts: contextArtifacts(), now: NOW
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'FRONTIER_PROFILE_SET_INVALID');
  assert.ok(out.reasonCodes.some(code => code.includes('model-required') || code.includes('model-identity')));
});
