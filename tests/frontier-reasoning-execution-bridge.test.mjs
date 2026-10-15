import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';
import { buildFrontierAdmissionBundle, compileAdmittedFrontierPlan } from '../src/frontier-cognitive-admission.mjs';
import { buildFrontierCallabilityProbeReceipt } from '../src/frontier-callability-provenance.mjs';
import { createFrontierSimulationExecutorFactory } from '../src/frontier-simulation-executor.mjs';
import { compileFrontierExecutorWorker, executeFrontierMember } from '../src/frontier-reasoning-runtime.mjs';
import { qualityInvariantAttestation } from '../src/absolute-frontier-quality-invariant.mjs';

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
const contextArtifacts = [{ id: 'constitution', kind: 'CONSTITUTION', contentRef: 'repo://AGENTS.md', tags: [], dependencies: [], estimatedTokens: 100, priority: 100, immutable: true }, {
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
  assert.ok(out.reasonCodes.includes('member-object-does-not-match-admitted-plan'));
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

// The runtime's only check of a FRONTIER_MAX member's absoluteQualityInvariant is
// in compileFrontierExecutorWorker. executeFrontierMember reaches that boundary only
// after the member is proven identical to the process-bound admitted plan member, so
// a tampered or missing attestation on that path is refused earlier as an identity
// mismatch. The attestation reason codes are therefore asserted at the direct
// compile boundary, and the top-level path is asserted to never build an executor.

const FRONTIER_MAX_MEMBER = Object.freeze({
  profileId: profile.id,
  provider: profile.provider,
  model: profile.model,
  revision: profile.revision,
  transportProvider: profile.transportProvider,
  transportModel: profile.transportModel,
  reasoningTier: 'FRONTIER_MAX',
  reasoningSettingRef: profile.reasoningBindings.FRONTIER_MAX.settingRef
});

function memberWithAttestation(attestation) {
  const member = { ...FRONTIER_MAX_MEMBER };
  if (attestation !== undefined) member.absoluteQualityInvariant = attestation;
  return member;
}

// Everything the canonical validator reports for an attestation that is absent or
// not an object at all.
const ABSENT_ATTESTATION_CODES = [
  'absolute-frontier-quality-policy-version-mismatch',
  'absolute-frontier-quality-policy-digest-mismatch',
  'absolute-frontier-quality-delta-must-be-zero',
  'absolute-frontier-evidence-confidence-attestation-mismatch',
  'absolute-frontier-degraded-council-prohibited',
  'absolute-frontier-uncertainty-fallback-required'
];

test('frontier runtime refuses a FRONTIER_MAX member whose quality attestation is missing or tampered', () => {
  const canonical = qualityInvariantAttestation();
  const refusals = [
    ['missing attestation', undefined, ABSENT_ATTESTATION_CODES],
    ['null attestation', null, ABSENT_ATTESTATION_CODES],
    ['tampered quality delta', { ...canonical, qualityDelta: 0.01 }, ['absolute-frontier-quality-delta-must-be-zero']],
    ['tampered degraded-council permission', { ...canonical, degradedCouncilAllowed: true }, ['absolute-frontier-degraded-council-prohibited']],
    ['tampered policy digest', { ...canonical, policyDigest: 'f'.repeat(64) }, ['absolute-frontier-quality-policy-digest-mismatch']]
  ];
  for (const [label, attestation, expectedCodes] of refusals) {
    const out = compileFrontierExecutorWorker(memberWithAttestation(attestation));
    assert.equal(out.ok, false, label);
    assert.equal(out.status, 'FRONTIER_REASONING_RUNTIME_BLOCKED', label);
    assert.equal(out.worker, undefined, `${label}: no executor worker may be compiled`);
    assert.equal(out.absoluteQualityInvariant, undefined, `${label}: refused attestation must not be echoed`);
    for (const code of expectedCodes) {
      assert.ok(out.reasonCodes.includes(code), `${label}: expected ${code} in ${JSON.stringify(out.reasonCodes)}`);
    }
    assert.ok(
      out.reasonCodes.every(code => code.startsWith('absolute-frontier-')),
      `${label}: only attestation reasons may appear, got ${JSON.stringify(out.reasonCodes)}`
    );
  }
});

test('frontier runtime still compiles the same FRONTIER_MAX member when its quality attestation is valid', () => {
  const out = compileFrontierExecutorWorker(memberWithAttestation(qualityInvariantAttestation()));
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.status, 'FRONTIER_EXECUTOR_WORKER_READY');
  assert.deepEqual(out.worker, { provider: 'ai-gateway', model: 'google/gemini-frontier', reasoningEffort: 'xhigh' });
  assert.deepEqual(out.absoluteQualityInvariant, qualityInvariantAttestation());
});

test('admitted plan never builds an executor for a member whose quality attestation is missing or tampered', async () => {
  const plan = admittedPlan();
  const withoutAttestation = { ...plan.plan.selected };
  delete withoutAttestation.absoluteQualityInvariant;
  const tampered = {
    ...plan.plan.selected,
    absoluteQualityInvariant: { ...plan.plan.selected.absoluteQualityInvariant, degradedCouncilAllowed: true }
  };
  for (const [label, member] of [['missing attestation', withoutAttestation], ['tampered attestation', tampered]]) {
    const out = await executeFrontierMember({
      planResult: plan,
      member,
      task: workerTask(plan),
      modelExecutorFactory: createFrontierSimulationExecutorFactory({
        responses: [{ taskId: task.taskId, model: profile.transportModel, costCents: 0, result: { answer: 'x' } }]
      }),
      callabilityEvidence: callability,
      maxTokens: 100,
      costCeilingCents: 10
    });
    assert.equal(out.ok, false, label);
    assert.equal(out.execution, undefined, `${label}: no execution may be attested`);
    assert.equal(out.ephemeralResult, undefined, `${label}: no result may be returned`);
    assert.ok(
      out.reasonCodes.includes('member-object-does-not-match-admitted-plan'),
      `${label}: expected identity refusal, got ${JSON.stringify(out.reasonCodes)}`
    );
  }
});
