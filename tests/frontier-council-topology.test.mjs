import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';
import { compileFrontierCognitivePlan } from '../src/frontier-cognitive-fabric.mjs';
import { buildFrontierCallabilityProbeReceipt } from '../src/frontier-callability-provenance.mjs';

const NOW = new Date('2026-09-04T20:00:00.000Z');
const FRESH = '2026-09-04T19:00:00.000Z';

function profile(id, provider, model, quality) {
  return {
    id, provider, model, revision: 'rev-1', _quality: quality,
    transportProvider: 'ai-gateway', transportModel: `${provider}/${model}`,
    transportSourceRef: 'official://transport', transportVerifiedAt: FRESH, transportEvidenceClass: 'OFFICIAL_SOURCE',
    taskClasses: ['general'], roles: ['general', 'critic', 'adjudicator'], allowedDataClasses: ['INTERNAL_NON_SECRET'],
    reasoningBindings: {
      FRONTIER_MAX: { settingRef: 'ai-gateway:reasoning=xhigh', sourceRef: 'official://reasoning', verifiedAt: FRESH, evidenceClass: 'OFFICIAL_SOURCE' }
    },
    pricingVerifiedAt: FRESH, pricingSourceRef: 'official://pricing', pricingEvidenceClass: 'OFFICIAL_SOURCE',
    maxContextTokens: 200000, maxOutputTokens: 32000,
    centsPerMillionInputTokens: 100, centsPerMillionOutputTokens: 500,
    identityAliases: [model], enabled: true
  };
}
function callability(p) {
  return {
    profileId: p.id, status: 'CALLABLE_NOW', evidenceClass: 'OBSERVED_RUNTIME', identityVerification: 'OBSERVED',
    observedProvider: p.provider, observedModel: p.model, observedRevision: p.revision,
    observedTransportProvider: p.transportProvider, observedTransportModel: p.transportModel,
    observedAt: FRESH, sourceRef: `runtime://probe-${p.id}`
  };
}
function benchmark(p) {
  const out = normalizeModelBenchmark({
    provider: p.provider, model: p.model, taskClasses: ['general'], taskClass: 'general',
    quality: p._quality, reliability: 0.99, latencyScore: 0.8, economicImpact: 0.9,
    evidenceConfidence: 0.99, costEfficiency: 0.5
  }, new Date(FRESH));
  out.observedRevision = p.revision;
  out.evidenceRef = `benchmark://${p.id}`;
  return out;
}
function provenance(calls) {
  const built = buildFrontierCallabilityProbeReceipt({
    observations: calls.map(item => ({ ...item, providerRequestId: `probe-${item.profileId}` })),
    sourceRef: 'simulation://frontier-council-topology', observedAt: FRESH
  });
  assert.equal(built.ok, true);
  assert.equal(built.simulationOnly, true);
  return { receipt: built.receipt, receiptDigest: built.receiptDigest };
}

const contextArtifacts = [
  { id: 'constitution', kind: 'CONSTITUTION', contentRef: 'repo://constitution', tags: ['frontier'], dependencies: [], estimatedTokens: 100, priority: 100, immutable: true }
];

test('COUNCIL_MAX graph is sealed first passes -> one responder critique each -> distinct adjudicator', () => {
  const profiles = [
    profile('google', 'google', 'gemini-frontier', 0.99),
    profile('openai', 'openai', 'gpt-frontier', 0.98),
    profile('anthropic', 'anthropic', 'claude-frontier', 0.97)
  ];
  const calls = profiles.map(callability);
  const out = compileFrontierCognitivePlan({
    task: {
      missionId: 'council-topology', taskId: 'council-topology', objective: 'Solve a bounded frontier problem.',
      taskClass: 'general', role: 'general', dataClass: 'INTERNAL_NON_SECRET', reasoningTier: 'COUNCIL_MAX',
      requiredTags: ['frontier'], contextTokenBudget: 1000, minCouncilSize: 2, maxCouncilSize: 2
    },
    profiles, callability: calls, callabilityProvenance: provenance(calls), benchmarks: profiles.map(benchmark),
    contextArtifacts, now: NOW
  });

  assert.equal(out.ok, true);
  assert.equal(out.simulationOnly, true);
  assert.equal(out.plan.mode, 'COUNCIL_MAX');
  assert.equal(out.plan.responders.length, 2);
  assert.equal(out.plan.responders.some(item => item.profileId === out.plan.adjudicator.profileId), false);

  const independent = out.plan.graph.nodes.filter(node => node.id.startsWith('independent_') && node.id !== 'independent_adjudication');
  const critiques = out.plan.graph.nodes.filter(node => node.id.startsWith('cross_critique_'));
  const adjudication = out.plan.graph.nodes.find(node => node.id === 'independent_adjudication');
  const independentIds = independent.map(node => node.id).sort();
  const critiqueIds = critiques.map(node => node.id).sort();
  const responderIds = out.plan.responders.map(item => item.profileId).sort();

  assert.equal(independent.length, 2);
  assert.ok(independent.every(node => node.dependencies.length === 0));
  assert.equal(critiques.length, 2);
  assert.deepEqual(critiques.map(node => node.workerRequirement.replace('frontier-profile:', '')).sort(), responderIds);
  assert.ok(critiques.every(node => JSON.stringify([...node.dependencies].sort()) === JSON.stringify(independentIds)));
  assert.ok(critiques.every(node => node.inputs.every(input => !input.startsWith('provider-session:'))));

  assert.ok(adjudication);
  assert.equal(adjudication.workerRequirement, `frontier-profile:${out.plan.adjudicator.profileId}`);
  assert.deepEqual([...adjudication.dependencies].sort(), [...independentIds, ...critiqueIds].sort());
  assert.equal(out.plan.responders.some(item => adjudication.workerRequirement === `frontier-profile:${item.profileId}`), false);
});
