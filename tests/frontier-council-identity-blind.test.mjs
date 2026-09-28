import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';
import { executeFrontierCouncil } from '../src/frontier-council-runtime.mjs';
import { compileSyntheticFrontierPlan } from './helpers/frontier-synthetic-provenance.mjs';

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
    profile('alpha-profile', 'openai', 'alpha-model', 0.99),
    profile('beta-profile', 'anthropic', 'beta-model', 0.98),
    profile('gamma-profile', 'google', 'gamma-model', 0.97)
  ];
  const calls = profiles.map(callability);
  const plan = compileSyntheticFrontierPlan({
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
    profiles,
    callability: calls,
    benchmarks: profiles.map(benchmark),
    contextArtifacts: [{
      id: 'frontier',
      kind: 'EVIDENCE',
      contentRef: 'repo://frontier',
      tags: ['frontier'],
      dependencies: [],
      estimatedTokens: 100,
      priority: 100,
      immutable: true
    }],
    now: NOW
  });

  assert.equal(plan.ok, true);
  const seenObjectives = [];
  let requestCounter = 0;
  const factory = worker => async ({ task }) => {
    seenObjectives.push({ model: worker.model, taskId: task.taskId, objective: task.objective });
    requestCounter += 1;
    const result = task.taskId.includes('cross-critique')
      ? JSON.stringify({ contradictions: [], evidenceGaps: [], confidence: 0.8 })
      : task.taskId.includes('independent-adjudication')
        ? JSON.stringify({ decision: 'candidate_01 survives', unresolved: [] })
        : JSON.stringify({ decision: 'bounded answer', confidence: 0.7 });
    return {
      ok: true,
      providerRequestId: `blind-${requestCounter}`,
      model: worker.model,
      identityVerification: 'OBSERVED',
      appliedReasoningEffort: 'xhigh',
      appliedReasoningEvidence: 'REQUEST_BODY_ATTESTED',
      usage: { costCents: 1 },
      result
    };
  };

  let tick = 1000;
  const result = await executeFrontierCouncil({
    planResult: plan,
    callability: calls,
    modelExecutorFactory: factory,
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

  const modelFacingReviewPrompts = seenObjectives.filter(row =>
    row.taskId.includes('cross-critique') || row.taskId.includes('independent-adjudication')
  );
  assert.ok(modelFacingReviewPrompts.length >= 3);
  for (const row of modelFacingReviewPrompts) {
    assert.match(row.objective, /identity-blind|identities are deliberately hidden/i);
    for (const p of profiles) {
      assert.equal(row.objective.includes(p.id), false);
      assert.equal(row.objective.includes(p.model), false);
      assert.equal(row.objective.includes(p.provider), false);
    }
  }
  assert.ok(modelFacingReviewPrompts.some(row => /candidate_0[12]/.test(row.objective)));
});
