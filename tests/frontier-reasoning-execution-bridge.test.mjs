import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';
import { buildFrontierAdmissionBundle, compileAdmittedFrontierPlan } from '../src/frontier-cognitive-admission.mjs';
import { buildFrontierCallabilityProbeReceipt } from '../src/frontier-callability-provenance.mjs';
import { createFrontierSimulationExecutorFactory } from '../src/frontier-simulation-executor.mjs';
import { executeFrontierMember } from '../src/frontier-reasoning-runtime.mjs';

const NOW = new Date('2026-09-04T20:00:00.000Z');
const FRESH = '2026-09-04T19:00:00.000Z';
const profile = {
  id: 'google-gemini-frontier',
  provider: 'google',
  model: 'gemini-frontier',
  revision: 'rev-2026-09',
  transportProvider: 'ai-gateway',
  transportModel: 'google/gemini-frontier',
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
  identityAliases: ['gemini-frontier'],
  enabled: true
};
const callability = {
  profileId: profile.id,
  status: 'CALLABLE_NOW',
  evidenceClass: 'OBSERVED_RUNTIME',
  identityVerification: 'OBSERVED',
  observedProvider: profile.provider,
  observedModel: profile.model,
  observedRevision: profile.revision,
  observedTransportProvider: profile.transportProvider,
  observedTransportModel: profile.transportModel,
  observedAt: FRESH,
  sourceRef: 'runtime://probe-1'
};
const benchmark = normalizeModelBenchmark({
  provider: profile.provider,
  model: profile.model,
  taskClasses: ['general'],
  taskClass: 'general',
  quality: 1,
  reliability: 1,
  latencyScore: 0.8,
  economicImpact: 0.9,
  evidenceConfidence: 1,
  costEfficiency: 0.5
}, new Date(FRESH));
benchmark.observedRevision = profile.revision;
benchmark.evidenceRef = 'benchmark://bridge';
const task = {
  missionId: 'bridge',
  taskId: 'bridge',
  objective: 'Return bounded result.',
  taskClass: 'general',
  role: 'general',
  dataClass: 'INTERNAL_NON_SECRET',
  reasoningTier: 'FRONTIER_MAX',
  requiredTags: ['frontier'],
  contextTokenBudget: 1000,
  minCouncilSize: 2,
  maxCouncilSize: 2
};
const contextArtifacts = [{
  id: 'frontier',
  kind: 'EVIDENCE',
  contentRef: 'repo://frontier',
  tags: ['frontier'],
  dependencies: [],
  estimatedTokens: 100,
  priority: 100,
  immutable: true
}];

function admittedPlan() {
  const provenance = buildFrontierCallabilityProbeReceipt({
    observations: [{ ...callability, providerRequestId: 'synthetic-bridge-probe' }],
    sourceRef: 'synthetic://bridge',
    observedAt: FRESH
  });
  assert.equal(provenance.ok, true);
  const admission = buildFrontierAdmissionBundle({
    profiles: [profile],
    callability: [callability],
    benchmarks: [benchmark],
    contextArtifacts,
    source: { kind: 'TEST', ref: 'test://bridge-admission', observedAt: FRESH },
    callabilityProvenance: { receipt: provenance.receipt, receiptDigest: provenance.receiptDigest }
  });
  assert.equal(admission.ok, true);
  const plan = compileAdmittedFrontierPlan({ task, admissionBundle: admission.bundle, now: NOW });
  assert.equal(plan.ok, true, JSON.stringify(plan));
  return plan;
}

function workerTask(plan) {
  return {
    taskId: task.taskId,
    objective: task.objective,
    consequenceClass: 'LOCAL_PREPARATION',
    contextRefs: plan.plan.contextPacket.contextRefs,
    evidenceRefs: [callability.sourceRef, `admission://${plan.admissionDigest}`]
  };
}

test('admitted frontier member executes only through branded simulation factory in synthetic mode', async () => {
  const plan = admittedPlan();
  const factory = createFrontierSimulationExecutorFactory({
    responses: [{
      taskId: task.taskId,
      model: profile.transportModel,
      costCents: 3,
      result: { answer: 'bounded' }
    }]
  });
  const times = [1000, 1027];
  const out = await executeFrontierMember({
    planResult: plan,
    member: plan.plan.selected,
    task: workerTask(plan),
    modelExecutorFactory: factory,
    callabilityEvidence: callability,
    maxTokens: 1000,
    costCeilingCents: 50,
    clock: () => times.shift()
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.execution.latencyMs, 27);
  assert.equal(out.execution.costCents, 3);
  assert.equal(out.execution.appliedReasoningSettingRef, 'ai-gateway:reasoning=xhigh');
});

test('hand-built or cloned plan cannot mint executable authority', async () => {
  const plan = admittedPlan();
  const factory = createFrontierSimulationExecutorFactory({
    responses: [{ taskId: task.taskId, model: profile.transportModel, costCents: 0, result: { answer: 'x' } }]
  });
  for (const forged of [
    { ...plan },
    structuredClone(plan),
    JSON.parse(JSON.stringify(plan))
  ]) {
    const out = await executeFrontierMember({
      planResult: forged,
      member: forged.plan.selected,
      task: workerTask(plan),
      modelExecutorFactory: factory,
      callabilityEvidence: callability,
      maxTokens: 100,
      costCeilingCents: 10
    });
    assert.equal(out.ok, false);
    assert.ok(out.reasonCodes.includes('process-bound-admitted-frontier-plan-required'));
  }
});

test('admitted plan rejects arbitrary executor callback before construction or dispatch', async () => {
  const plan = admittedPlan();
  let constructions = 0;
  const out = await executeFrontierMember({
    planResult: plan,
    member: plan.plan.selected,
    task: workerTask(plan),
    modelExecutorFactory: () => {
      constructions += 1;
      return async () => ({ ok: true });
    },
    callabilityEvidence: callability,
    maxTokens: 100,
    costCeilingCents: 10
  });
  assert.equal(out.ok, false);
  assert.equal(constructions, 0);
  assert.ok(out.reasonCodes.includes('synthetic-frontier-plan-requires-branded-no-network-simulation-factory'));
});

test('member mutation after admission cannot execute', async () => {
  const plan = admittedPlan();
  const forgedMember = {
    ...plan.plan.selected,
    absoluteQualityInvariant: {
      ...plan.plan.selected.absoluteQualityInvariant,
      qualityDelta: 0.01
    }
  };
  const factory = createFrontierSimulationExecutorFactory({
    responses: [{ taskId: task.taskId, model: profile.transportModel, costCents: 0, result: { answer: 'x' } }]
  });
  const out = await executeFrontierMember({
    planResult: plan,
    member: forgedMember,
    task: workerTask(plan),
    modelExecutorFactory: factory,
    callabilityEvidence: callability,
    maxTokens: 100,
    costCeilingCents: 10
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('member-object-identity-does-not-match-admitted-plan'));
});

test('actual cost above reserved ceiling remains blocked after provenance passes', async () => {
  const plan = admittedPlan();
  const factory = createFrontierSimulationExecutorFactory({
    responses: [{ taskId: task.taskId, model: profile.transportModel, costCents: 6, result: { answer: 'too expensive' } }]
  });
  const out = await executeFrontierMember({
    planResult: plan,
    member: plan.plan.selected,
    task: workerTask(plan),
    modelExecutorFactory: factory,
    callabilityEvidence: callability,
    maxTokens: 100,
    costCeilingCents: 5,
    clock: (() => { let t = 0; return () => ++t; })()
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'FRONTIER_EXECUTION_BUDGET_EXCEEDED');
  assert.ok(out.reasonCodes.includes('actual-cost-exceeds-frontier-reservation'));
});
