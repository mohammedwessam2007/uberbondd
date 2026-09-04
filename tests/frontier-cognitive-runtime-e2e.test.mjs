import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';
import { buildFrontierCognitiveReceipt } from '../src/frontier-cognitive-fabric.mjs';
import { buildFrontierAdmissionBundle, compileAdmittedFrontierPlan } from '../src/frontier-cognitive-admission.mjs';
import { executeFrontierMember } from '../src/frontier-reasoning-runtime.mjs';

const NOW = new Date('2026-09-04T20:00:00.000Z');
const FRESH = '2026-09-04T19:00:00.000Z';
const profile = {
  id: 'google-gemini-frontier', provider: 'google', model: 'gemini-frontier', revision: 'rev-2026-09',
  transportProvider: 'ai-gateway', transportModel: 'google/gemini-frontier',
  transportSourceRef: 'official://gateway', transportVerifiedAt: FRESH, transportEvidenceClass: 'OFFICIAL_SOURCE',
  taskClasses: ['general'], roles: ['general'], allowedDataClasses: ['INTERNAL_NON_SECRET'],
  reasoningBindings: {
    FRONTIER_MAX: { settingRef: 'ai-gateway:reasoning=xhigh', sourceRef: 'official://gateway-reasoning', verifiedAt: FRESH, evidenceClass: 'OFFICIAL_SOURCE' }
  },
  pricingVerifiedAt: FRESH, pricingSourceRef: 'official://pricing', pricingEvidenceClass: 'OFFICIAL_SOURCE',
  maxContextTokens: 200000, maxOutputTokens: 32000, centsPerMillionInputTokens: 100, centsPerMillionOutputTokens: 500,
  identityAliases: ['gemini-frontier'], enabled: true
};
const callability = {
  profileId: profile.id, status: 'CALLABLE_NOW', evidenceClass: 'OBSERVED_RUNTIME', identityVerification: 'OBSERVED',
  observedProvider: profile.provider, observedModel: profile.model, observedRevision: profile.revision,
  observedTransportProvider: profile.transportProvider, observedTransportModel: profile.transportModel,
  observedAt: FRESH, sourceRef: 'runtime://probe-google-gemini-frontier'
};
const benchmark = normalizeModelBenchmark({
  provider: profile.provider, model: profile.model, taskClasses: profile.taskClasses, taskClass: 'general',
  quality: 0.98, reliability: 0.97, latencyScore: 0.8, economicImpact: 0.9, evidenceConfidence: 0.99, costEfficiency: 0.7
}, new Date(FRESH));
benchmark.observedRevision = profile.revision;
benchmark.evidenceRef = 'benchmark://google-gemini-frontier-rev-2026-09';
const task = {
  missionId: 'frontier-e2e', taskId: 'frontier-e2e', objective: 'Solve one bounded frontier task.',
  taskClass: 'general', role: 'general', dataClass: 'INTERNAL_NON_SECRET', reasoningTier: 'FRONTIER_MAX',
  requiredTags: ['frontier'], contextTokenBudget: 5000, minCouncilSize: 2, maxCouncilSize: 2
};
const contextArtifacts = [
  { id: 'constitution', kind: 'CONSTITUTION', contentRef: 'repo://constitution', tags: ['core'], dependencies: [], estimatedTokens: 500, priority: 100, immutable: true },
  { id: 'frontier-evidence', kind: 'EVIDENCE', contentRef: 'repo://frontier-evidence', tags: ['frontier'], dependencies: ['constitution'], estimatedTokens: 700, priority: 90 }
];

test('admitted frontier plan executes through canonical runtime and produces an exact-revision reasoning/cost/latency chain', async () => {
  const admission = buildFrontierAdmissionBundle({
    profiles: [profile],
    callability: [callability],
    benchmarks: [benchmark],
    contextArtifacts,
    source: { kind: 'RUNTIME_PROBE_LEDGER', ref: 'proof://frontier-e2e-admission', observedAt: FRESH }
  });
  assert.equal(admission.ok, true);
  const plan = compileAdmittedFrontierPlan({ task, admissionBundle: admission.bundle, now: NOW });
  assert.equal(plan.ok, true);
  assert.equal(plan.plan.selected.profileId, profile.id);
  assert.equal(plan.plan.selected.reasoningSettingRef, 'ai-gateway:reasoning=xhigh');
  assert.match(plan.admissionDigest, /^[a-f0-9]{64}$/);

  const workerTask = {
    taskId: task.taskId,
    objective: task.objective,
    consequenceClass: 'LOCAL_PREPARATION',
    contextRefs: plan.plan.contextPacket.contextRefs,
    evidenceRefs: ['runtime://probe-google-gemini-frontier', plan.admissionDigest]
  };
  const factory = worker => async args => {
    assert.deepEqual(worker, { provider: 'ai-gateway', model: profile.transportModel, reasoningEffort: 'xhigh' });
    assert.equal(args.model, profile.transportModel);
    return {
      ok: true, providerRequestId: 'req_e2e', model: profile.transportModel, identityVerification: 'OBSERVED',
      appliedReasoningEffort: 'xhigh', appliedReasoningEvidence: 'REQUEST_BODY_ATTESTED', usage: { costCents: 4 }
    };
  };
  const times = [100, 131];
  const execution = await executeFrontierMember({
    member: plan.plan.selected,
    task: workerTask,
    modelExecutorFactory: factory,
    callabilityEvidence: callability,
    maxTokens: 1000,
    costCeilingCents: 50,
    clock: () => times.shift()
  });
  assert.equal(execution.ok, true);
  assert.equal(execution.execution.latencyMs, 31);
  assert.equal(execution.execution.appliedReasoningSettingRef, 'ai-gateway:reasoning=xhigh');

  const receipt = buildFrontierCognitiveReceipt({ planResult: plan, executions: [execution.execution], now: NOW });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.receipt.reasoningTier, 'FRONTIER_MAX');
  assert.equal(receipt.receipt.executions[0].observedRevision, profile.revision);
  assert.equal(receipt.receipt.executions[0].costCents, 4);
});
