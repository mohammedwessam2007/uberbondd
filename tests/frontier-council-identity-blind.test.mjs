import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';
import { executeFrontierCouncil } from '../src/frontier-council-runtime.mjs';
import { buildFrontierAdmissionBundle, compileAdmittedFrontierPlan } from '../src/frontier-cognitive-admission.mjs';
import { buildFrontierCallabilityProbeReceipt } from '../src/frontier-callability-provenance.mjs';
import { createFrontierSimulationExecutorFactory } from '../src/frontier-simulation-executor.mjs';

const NOW = new Date('2026-09-29T00:00:00.000Z');
const FRESH = '2026-09-28T23:00:00.000Z';

function profile(id, provider, model, quality) {
  return {
    id, provider, model, revision: 'rev-1', quality,
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
    quality: p.quality, reliability: 0.99, latencyScore: 0.8, economicImpact: 0.9,
    evidenceConfidence: 0.99, costEfficiency: 0.5
  }, new Date(FRESH));
  out.observedRevision = p.revision;
  out.evidenceRef = `benchmark://${p.id}`;
  return out;
}

test('frontier council hides responder and reviewer identities from critique and adjudication prompts', async () => {
  const profiles = [
    profile('alpha-profile', 'openai', 'alpha-model', 1),
    profile('beta-profile', 'anthropic', 'beta-model', 1),
    profile('gamma-profile', 'google', 'gamma-model', 1)
  ];
  const calls = profiles.map(callability);
  const probe = buildFrontierCallabilityProbeReceipt({
    observations: calls.map((item, index) => ({ ...item, providerRequestId: `blind-probe-${index}` })),
    sourceRef: 'synthetic://identity-blind-council',
    observedAt: FRESH
  });
  assert.equal(probe.ok, true);
  const admission = buildFrontierAdmissionBundle({
    profiles,
    callability: calls,
    benchmarks: profiles.map(benchmark),
    contextArtifacts: [{
      id: 'frontier',
      kind: 'CONSTITUTION',
      contentRef: 'repo://frontier',
      tags: ['frontier'],
      dependencies: [],
      estimatedTokens: 100,
      priority: 100,
      immutable: true
    }],
    source: { kind: 'TEST', ref: 'test://identity-blind-council', observedAt: FRESH },
    callabilityProvenance: { receipt: probe.receipt, receiptDigest: probe.receiptDigest }
  });
  assert.equal(admission.ok, true);
  const plan = compileAdmittedFrontierPlan({
    task: {
      missionId: 'blind-council',
      taskId: 'blind-council',
      objective: 'Choose the strongest evidence-bound answer.',
      taskClass: 'general',
      role: 'general',
      dataClass: 'INTERNAL_NON_SECRET',
      reasoningTier: 'COUNCIL_MAX',
      requiredTags: ['frontier'],
      contextTokenBudget: 1000,
      minCouncilSize: 2,
      maxCouncilSize: 2
    },
    admissionBundle: admission.bundle,
    now: NOW
  });

  assert.equal(plan.ok, true, JSON.stringify(plan));
  const responses = [];
  for (const member of plan.plan.responders) {
    responses.push({
      taskId: `blind-council:independent-${member.profileId}`,
      model: member.transportModel,
      costCents: 1,
      result: JSON.stringify({ decision: 'bounded answer', confidence: 0.7 })
    });
    responses.push({
      taskId: `blind-council:cross-critique-${member.profileId}`,
      model: member.transportModel,
      costCents: 1,
      result: JSON.stringify({ contradictions: [], evidenceGaps: [], confidence: 0.8 })
    });
  }
  responses.push({
    taskId: 'blind-council:independent-adjudication',
    model: plan.plan.adjudicator.transportModel,
    costCents: 1,
    result: JSON.stringify({ decision: 'candidate_01 survives', unresolved: [] })
  });
  const scriptedFactory = createFrontierSimulationExecutorFactory({ responses });
  let tick = 1000;
  const result = await executeFrontierCouncil({
    planResult: plan,
    callability: calls,
    modelExecutorFactory: scriptedFactory,
    maxTokens: 1000,
    costCeilingCents: 100,
    clock: () => tick++,
    now: NOW
  });

  assert.equal(result.ok, true);
  assert.equal(result.receipt.identityBlindCouncil, true);
  assert.equal(result.receipt.modelVisibleIdentityMap, false);
  assert.match(result.receipt.independentIdentityMapDigest, /^[a-f0-9]{64}$/);
  assert.match(result.receipt.critiqueIdentityMapDigest, /^[a-f0-9]{64}$/);

  const reviewNodes = plan.plan.graph.nodes.filter(node =>
    node.id.includes('cross_critique') || node.id === 'independent_adjudication'
  );
  assert.ok(reviewNodes.length >= 3);
  for (const node of reviewNodes) {
    assert.match(node.purpose, /critique|adjudicat/i);
    for (const p of profiles) {
      assert.equal(node.purpose.includes(p.model), false);
      assert.equal(node.purpose.includes(p.provider), false);
    }
  }
});
