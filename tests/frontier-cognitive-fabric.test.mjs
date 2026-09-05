import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';
import { buildFrontierCognitiveReceipt } from '../src/frontier-cognitive-fabric.mjs';
import { compileSyntheticFrontierPlan as compileFrontierCognitivePlan } from './helpers/frontier-synthetic-provenance.mjs';

const NOW = new Date('2026-09-04T20:00:00.000Z');
const FRESH = '2026-09-04T19:00:00.000Z';

function profile(overrides = {}) {
  const provider = overrides.provider ?? 'openai';
  const model = overrides.model ?? 'frontier-a';
  const transportProvider = overrides.transportProvider ?? (provider === 'anthropic' ? 'anthropic' : 'ai-gateway');
  const transportModel = overrides.transportModel ?? (transportProvider === 'ai-gateway' ? `${provider}/${model}` : model);
  return {
    id: overrides.id ?? `${provider}-${model}`.replace(/[^a-z0-9._-]/gi, '-').toLowerCase(),
    provider,
    model,
    revision: overrides.revision ?? 'rev-1',
    transportProvider,
    transportModel,
    transportSourceRef: overrides.transportSourceRef ?? 'official://transport',
    transportVerifiedAt: overrides.transportVerifiedAt ?? FRESH,
    transportEvidenceClass: overrides.transportEvidenceClass ?? 'OFFICIAL_SOURCE',
    taskClasses: overrides.taskClasses ?? ['general', 'coding', 'research'],
    roles: overrides.roles ?? ['general', 'builder', 'researcher', 'critic', 'adjudicator'],
    allowedDataClasses: overrides.allowedDataClasses ?? ['PUBLIC', 'INTERNAL_NON_SECRET', 'SOURCE_CODE'],
    reasoningBindings: overrides.reasoningBindings ?? {
      FAST: { settingRef: `${provider}:fast:v1`, sourceRef: 'official://reasoning', verifiedAt: FRESH, evidenceClass: 'OFFICIAL_SOURCE' },
      STANDARD: { settingRef: `${provider}:standard:v1`, sourceRef: 'official://reasoning', verifiedAt: FRESH, evidenceClass: 'OFFICIAL_SOURCE' },
      DEEP: { settingRef: `${provider}:deep:v1`, sourceRef: 'official://reasoning', verifiedAt: FRESH, evidenceClass: 'OFFICIAL_SOURCE' },
      FRONTIER_MAX: { settingRef: `${provider}:frontier-max:v1`, sourceRef: 'official://reasoning', verifiedAt: FRESH, evidenceClass: 'OFFICIAL_SOURCE' }
    },
    pricingVerifiedAt: overrides.pricingVerifiedAt ?? FRESH,
    pricingSourceRef: overrides.pricingSourceRef ?? 'official://pricing',
    pricingEvidenceClass: overrides.pricingEvidenceClass ?? 'OFFICIAL_SOURCE',
    maxContextTokens: overrides.maxContextTokens ?? 200000,
    maxOutputTokens: overrides.maxOutputTokens ?? 32000,
    centsPerMillionInputTokens: overrides.centsPerMillionInputTokens ?? 100,
    centsPerMillionOutputTokens: overrides.centsPerMillionOutputTokens ?? 500,
    identityAliases: overrides.identityAliases ?? [model],
    capabilities: overrides.capabilities ?? { toolUse: true, structuredOutput: true, longContext: true },
    enabled: overrides.enabled ?? true,
    ...overrides
  };
}

function callability(p, overrides = {}) {
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
    identityVerification: 'OBSERVED',
    ...overrides
  };
}

function benchmark(p, overrides = {}) {
  const out = normalizeModelBenchmark({
    provider: p.provider,
    model: p.model,
    taskClasses: p.taskClasses,
    taskClass: overrides.taskClass ?? 'general',
    quality: overrides.quality ?? 0.95,
    reliability: overrides.reliability ?? 0.95,
    latencyScore: overrides.latencyScore ?? 0.7,
    economicImpact: overrides.economicImpact ?? 0.8,
    evidenceConfidence: overrides.evidenceConfidence ?? 0.95,
    costEfficiency: overrides.costEfficiency ?? 0.5
  }, new Date(overrides.observedAt ?? FRESH));
  out.observedRevision = overrides.observedRevision ?? p.revision;
  out.evidenceRef = overrides.evidenceRef ?? `benchmark://${p.id}`;
  return out;
}

function contextArtifacts() {
  return [
    {
      id: 'constitution',
      kind: 'CONSTITUTION',
      contentRef: 'repo://constitution',
      tags: ['core'],
      dependencies: [],
      estimatedTokens: 1000,
      priority: 100,
      immutable: true
    },
    {
      id: 'frontier-task-evidence',
      kind: 'EVIDENCE',
      contentRef: 'repo://frontier-evidence',
      tags: ['frontier'],
      dependencies: ['constitution'],
      estimatedTokens: 1200,
      priority: 90
    },
    {
      id: 'irrelevant-history',
      kind: 'HISTORY',
      contentRef: 'repo://history',
      tags: ['history'],
      dependencies: ['constitution'],
      estimatedTokens: 50000,
      priority: 10
    }
  ];
}

function task(overrides = {}) {
  return {
    missionId: 'frontier-fabric-test',
    taskId: 'solve-frontier-task',
    objective: 'Solve one high-value bounded problem.',
    taskClass: 'general',
    role: 'general',
    dataClass: 'INTERNAL_NON_SECRET',
    reasoningTier: 'FRONTIER_MAX',
    requiredTags: ['frontier'],
    contextTokenBudget: 10000,
    minCouncilSize: 2,
    maxCouncilSize: 3,
    ...overrides
  };
}

function singlePlan(p, overrides = {}) {
  return compileFrontierCognitivePlan({
    task: task(overrides.task ?? {}),
    profiles: [p],
    callability: [callability(p)],
    benchmarks: [benchmark(p)],
    contextArtifacts: contextArtifacts(),
    now: NOW,
    ...overrides
  });
}

function executionFor(member, overrides = {}) {
  return {
    profileId: member.profileId,
    ok: true,
    observedProvider: member.provider,
    observedModel: member.model,
    observedRevision: member.revision,
    observedTransportProvider: member.transportProvider,
    observedTransportModel: member.transportModel,
    identityVerification: 'OBSERVED',
    appliedReasoningSettingRef: member.reasoningSettingRef,
    latencyMs: 100,
    costCents: 1,
    resultRef: `receipt://${member.profileId}`,
    claims: ['bounded claim'],
    ...overrides
  };
}

test('FRONTIER_MAX keeps materially stronger frontier model ahead of free cheaper model', () => {
  const elite = profile({ id: 'elite', provider: 'openai', model: 'elite-model', centsPerMillionInputTokens: 1000, centsPerMillionOutputTokens: 5000 });
  const cheap = profile({ id: 'cheap', provider: 'qwen', model: 'cheap-model', centsPerMillionInputTokens: 0, centsPerMillionOutputTokens: 0 });
  const result = compileFrontierCognitivePlan({
    task: task(), profiles: [elite, cheap], callability: [callability(elite), callability(cheap)],
    benchmarks: [benchmark(elite, { quality: 0.98, costEfficiency: 0.1 }), benchmark(cheap, { quality: 0.82, costEfficiency: 1 })],
    contextArtifacts: contextArtifacts(), now: NOW
  });
  assert.equal(result.ok, true);
  assert.equal(result.plan.selected.profileId, 'elite');
  assert.equal(result.plan.task.reasoningTier, 'FRONTIER_MAX');
});

test('caller cannot widen frontier quality delta enough to turn FRONTIER_MAX into cost-first routing', () => {
  const p = profile({ id: 'p' });
  const result = singlePlan(p, { frontierQualityDelta: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'FRONTIER_POLICY_INVALID');
  assert.ok(result.reasonCodes.includes('bounded-frontier-policy-parameters-required'));
});

test('frontier routing ignores task-supplied arbitrary model or endpoint injection', () => {
  const elite = profile({ id: 'elite', provider: 'openai', model: 'elite-model' });
  const result = compileFrontierCognitivePlan({
    task: task({ model: 'attacker/forced-model', endpoint: 'https://attacker.example' }),
    profiles: [elite], callability: [callability(elite)], benchmarks: [benchmark(elite)], contextArtifacts: contextArtifacts(), now: NOW
  });
  assert.equal(result.ok, true);
  assert.equal(result.plan.selected.model, 'elite-model');
  assert.equal(result.plan.selected.transportModel, 'openai/elite-model');
});

test('profile carrying endpoint or secret material is rejected before routing', () => {
  const bad = profile({ id: 'bad', apiKey: 'sk-secret-value', endpoint: 'https://attacker.example' });
  const result = compileFrontierCognitivePlan({ task: task(), profiles: [bad], callability: [], benchmarks: [], contextArtifacts: contextArtifacts(), now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'FRONTIER_PROFILE_SET_INVALID');
  assert.ok(result.reasonCodes.some(code => code.includes('secret-or-endpoint-bearing-profile-prohibited')));
});

test('same cognitive model cannot occupy multiple Avengers chairs under different profile IDs', () => {
  const a = profile({ id: 'a', provider: 'openai', model: 'same', revision: 'r1' });
  const b = profile({ id: 'b', provider: 'openai', model: 'same', revision: 'r1' });
  const result = compileFrontierCognitivePlan({ task: task(), profiles: [a, b], callability: [callability(a), callability(b)], benchmarks: [benchmark(a)], contextArtifacts: contextArtifacts(), now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'FRONTIER_PROFILE_SET_INVALID');
  assert.ok(result.reasonCodes.some(code => code.startsWith('duplicate-cognitive-identity:')));
});

test('FRONTIER_MAX refuses unsupported or stale reasoning bindings', () => {
  const unsupported = profile({ id: 'unsupported', reasoningBindings: { STANDARD: { settingRef: 'x', sourceRef: 'official://reasoning', verifiedAt: FRESH, evidenceClass: 'OFFICIAL_SOURCE' } } });
  const stale = profile({
    id: 'stale', provider: 'anthropic', model: 'stale-model',
    reasoningBindings: {
      FRONTIER_MAX: { settingRef: 'anthropic:max:v1', sourceRef: 'official://reasoning', verifiedAt: '2025-01-01T00:00:00.000Z', evidenceClass: 'OFFICIAL_SOURCE' }
    }
  });
  const result = compileFrontierCognitivePlan({
    task: task(), profiles: [unsupported, stale], callability: [callability(unsupported), callability(stale)],
    benchmarks: [benchmark(unsupported), benchmark(stale)], contextArtifacts: contextArtifacts(), now: NOW
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'CAPACITY_BLOCKED');
  assert.ok(result.blocked.some(item => item.reasonCodes.some(code => code.includes('reasoning-tier-not-supported'))));
  assert.ok(result.blocked.some(item => item.reasonCodes.some(code => code.includes('reasoning-binding-stale'))));
});

test('CALLABLE_NOW requires fresh OBSERVED_RUNTIME evidence and exact transport identity', () => {
  const p = profile({ id: 'p' });
  const selfDeclared = compileFrontierCognitivePlan({
    task: task(), profiles: [p], callability: [callability(p, { evidenceClass: 'CONFIGURED', identityVerification: 'UNVERIFIED' })], benchmarks: [benchmark(p)], contextArtifacts: contextArtifacts(), now: NOW
  });
  assert.equal(selfDeclared.ok, false);
  assert.ok(selfDeclared.blocked[0].reasonCodes.includes('callability-provenance-not-trusted'));

  const transportMismatch = compileFrontierCognitivePlan({
    task: task(), profiles: [p], callability: [callability(p, { observedTransportModel: 'openai/other-model' })], benchmarks: [benchmark(p)], contextArtifacts: contextArtifacts(), now: NOW
  });
  assert.equal(transportMismatch.ok, false);
  assert.ok(transportMismatch.blocked[0].reasonCodes.includes('callability-identity-mismatch'));

  const stale = compileFrontierCognitivePlan({
    task: task(), profiles: [p], callability: [callability(p, { observedAt: '2026-08-01T00:00:00.000Z' })], benchmarks: [benchmark(p)], contextArtifacts: contextArtifacts(), now: NOW
  });
  assert.equal(stale.ok, false);
  assert.ok(stale.blocked[0].reasonCodes.includes('callability-evidence-stale-or-incomplete'));
});

test('normalized benchmark objects are revalidated instead of trusted because ok=true', () => {
  const p = profile({ id: 'p' });
  const forged = {
    ok: true,
    candidate: { provider: p.provider, model: p.model, candidateId: 'attacker-id', taskClasses: ['general'] },
    taskClass: 'general',
    quality: 1,
    reliability: 1,
    latencyScore: 1,
    economicImpact: 1,
    evidenceConfidence: 1,
    costEfficiency: 1,
    observedAt: FRESH,
    observedRevision: p.revision,
    evidenceRef: 'benchmark://forged-revalidated',
    benchmarkId: 'forged'
  };
  const result = compileFrontierCognitivePlan({ task: task(), profiles: [p], callability: [callability(p)], benchmarks: [forged], contextArtifacts: contextArtifacts(), now: NOW });
  assert.equal(result.ok, true);
  assert.notEqual(result.plan.candidateEvidence[0].benchmarkId, 'forged');
});

test('minimum context packet includes constitution and task evidence, not unrelated history', () => {
  const p = profile({ id: 'p' });
  const result = singlePlan(p);
  assert.equal(result.ok, true);
  assert.deepEqual(new Set(result.plan.contextPacket.contextArtifactIds), new Set(['constitution', 'frontier-task-evidence']));
  assert.equal(result.plan.contextPacket.contextArtifactIds.includes('irrelevant-history'), false);
  assert.equal(result.plan.contextPacket.invariants.includes('provider-session-state-is-not-canonical-memory'), true);
});

test('remote frontier route cannot receive a data class profile policy did not allow', () => {
  const p = profile({ id: 'p', allowedDataClasses: ['PUBLIC', 'INTERNAL_NON_SECRET'] });
  const result = compileFrontierCognitivePlan({
    task: task({ dataClass: 'SOURCE_CODE' }), profiles: [p], callability: [callability(p)], benchmarks: [benchmark(p)], contextArtifacts: contextArtifacts(), now: NOW
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'CAPACITY_BLOCKED');
  assert.ok(result.blocked[0].reasonCodes.includes('data-class-not-allowed'));
});

test('COUNCIL_MAX uses independent first-pass responders and a distinct adjudicator', () => {
  const a = profile({ id: 'a', provider: 'openai', model: 'a' });
  const b = profile({ id: 'b', provider: 'anthropic', model: 'b' });
  const c = profile({ id: 'c', provider: 'google', model: 'c' });
  const result = compileFrontierCognitivePlan({
    task: task({ reasoningTier: 'COUNCIL_MAX', minCouncilSize: 2, maxCouncilSize: 2 }),
    profiles: [a, b, c], callability: [callability(a), callability(b), callability(c)],
    benchmarks: [benchmark(a, { quality: 0.98 }), benchmark(b, { quality: 0.97 }), benchmark(c, { quality: 0.96 })],
    contextArtifacts: contextArtifacts(), now: NOW
  });
  assert.equal(result.ok, true);
  assert.equal(result.plan.mode, 'COUNCIL_MAX');
  assert.equal(result.plan.status, 'COUNCIL_PLAN_READY');
  assert.equal(result.plan.responders.length, 2);
  assert.equal(result.plan.responders.some(item => item.profileId === result.plan.adjudicator.profileId), false);
  const independent = result.plan.graph.nodes.filter(node => node.id.startsWith('independent_') && node.id !== 'independent_adjudication');
  assert.equal(independent.length, 2);
  assert.ok(independent.every(node => node.dependencies.length === 0));
  assert.ok(result.plan.graph.nodes.find(node => node.id === 'independent_adjudication').workerRequirement.endsWith(result.plan.adjudicator.profileId));
});

test('COUNCIL_MAX fails closed if an independent adjudicator is unavailable by default', () => {
  const a = profile({ id: 'a', provider: 'openai', model: 'a' });
  const b = profile({ id: 'b', provider: 'anthropic', model: 'b' });
  const result = compileFrontierCognitivePlan({
    task: task({ reasoningTier: 'COUNCIL_MAX', minCouncilSize: 2, maxCouncilSize: 2 }),
    profiles: [a, b], callability: [callability(a), callability(b)], benchmarks: [benchmark(a), benchmark(b, { quality: 0.96 })], contextArtifacts: contextArtifacts(), now: NOW
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'CAPACITY_BLOCKED');
  assert.ok(result.reasonCodes.includes('council-minimum-cardinality-unavailable'));
});

test('degraded council requires an explicit policy reference and reports degradation', () => {
  const a = profile({ id: 'a', provider: 'openai', model: 'a' });
  const b = profile({ id: 'b', provider: 'openai', model: 'b' });
  const c = profile({ id: 'c', provider: 'openai', model: 'c' });
  const base = {
    task: task({ reasoningTier: 'COUNCIL_MAX', minCouncilSize: 2, maxCouncilSize: 2 }),
    profiles: [a, b, c], callability: [callability(a), callability(b), callability(c)],
    benchmarks: [benchmark(a), benchmark(b, { quality: 0.96 }), benchmark(c, { quality: 0.95 })], contextArtifacts: contextArtifacts(), now: NOW
  };
  const noPolicy = compileFrontierCognitivePlan({ ...base, allowDegradedCouncil: true });
  assert.equal(noPolicy.ok, false);
  assert.equal(noPolicy.status, 'FRONTIER_POLICY_INVALID');
  const degraded = compileFrontierCognitivePlan({ ...base, allowDegradedCouncil: true, degradationPolicyRef: 'policy://explicit-same-provider-degradation' });
  assert.equal(degraded.ok, true);
  assert.equal(degraded.status, 'COUNCIL_DEGRADED');
  assert.ok(degraded.plan.degradationReasonCodes.length > 0);
});

test('stale pricing or benchmark evidence cannot route FRONTIER_MAX', () => {
  const p = profile({ id: 'p', pricingVerifiedAt: '2025-01-01T00:00:00.000Z' });
  const result = compileFrontierCognitivePlan({ task: task(), profiles: [p], callability: [callability(p)], benchmarks: [benchmark(p)], contextArtifacts: contextArtifacts(), now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.blocked[0].reasonCodes.includes('pricing-evidence-stale'));

  const fresh = profile({ id: 'fresh' });
  const result2 = compileFrontierCognitivePlan({ task: task(), profiles: [fresh], callability: [callability(fresh)], benchmarks: [benchmark(fresh, { observedAt: '2025-01-01T00:00:00.000Z' })], contextArtifacts: contextArtifacts(), now: NOW });
  assert.equal(result2.ok, false);
  assert.equal(result2.status, 'CAPACITY_BLOCKED');
  assert.ok(result2.reasonCodes.includes('frontier-tier-requires-fresh-quality-evidence'));
});

test('single execution receipt requires success, exact identity and exact applied reasoning setting', () => {
  const p = profile({ id: 'p' });
  const plan = singlePlan(p);
  assert.equal(plan.ok, true);
  const failed = buildFrontierCognitiveReceipt({ planResult: plan, executions: [executionFor(plan.plan.selected, { ok: false })], now: NOW });
  assert.equal(failed.ok, false);
  assert.ok(failed.reasonCodes.includes('execution-not-successful:p'));

  const drift = buildFrontierCognitiveReceipt({ planResult: plan, executions: [executionFor(plan.plan.selected, { observedModel: 'wrong-model' })], now: NOW });
  assert.equal(drift.ok, false);
  assert.ok(drift.reasonCodes.includes('execution-identity-mismatch:p'));

  const notMax = buildFrontierCognitiveReceipt({ planResult: plan, executions: [executionFor(plan.plan.selected, { appliedReasoningSettingRef: 'provider:standard:v1' })], now: NOW });
  assert.equal(notMax.ok, false);
  assert.ok(notMax.reasonCodes.includes('reasoning-setting-not-proven:p'));

  const good = buildFrontierCognitiveReceipt({ planResult: plan, executions: [executionFor(plan.plan.selected)], now: NOW });
  assert.equal(good.ok, true);
});

test('duplicate execution cannot fake council cardinality or verification', () => {
  const a = profile({ id: 'a', provider: 'openai', model: 'a' });
  const b = profile({ id: 'b', provider: 'anthropic', model: 'b' });
  const c = profile({ id: 'c', provider: 'google', model: 'c' });
  const plan = compileFrontierCognitivePlan({
    task: task({ reasoningTier: 'COUNCIL_MAX', minCouncilSize: 2, maxCouncilSize: 2 }), profiles: [a, b, c], callability: [callability(a), callability(b), callability(c)],
    benchmarks: [benchmark(a), benchmark(b, { quality: 0.96 }), benchmark(c, { quality: 0.95 })], contextArtifacts: contextArtifacts(), now: NOW
  });
  assert.equal(plan.ok, true);
  const duplicate = buildFrontierCognitiveReceipt({
    planResult: plan,
    executions: [executionFor(plan.plan.responders[0]), executionFor(plan.plan.responders[0]), executionFor(plan.plan.adjudicator)],
    verifierEvidenceRefs: ['proof://verifier'],
    adjudication: { decision: 'x', decisionBasis: 'EVIDENCE_WEIGHTED', adjudicatorProfileId: plan.plan.adjudicator.profileId, independentFromResponders: true },
    now: NOW
  });
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.reasonCodes.some(code => code.startsWith('duplicate-execution-profile:')));
  assert.ok(duplicate.reasonCodes.some(code => code.startsWith('missing-execution-profile:')));
});

test('council receipt requires independent verifier evidence and rejects majority-only adjudication', () => {
  const a = profile({ id: 'a', provider: 'openai', model: 'a' });
  const b = profile({ id: 'b', provider: 'anthropic', model: 'b' });
  const c = profile({ id: 'c', provider: 'google', model: 'c' });
  const plan = compileFrontierCognitivePlan({
    task: task({ reasoningTier: 'COUNCIL_MAX', minCouncilSize: 2, maxCouncilSize: 2 }), profiles: [a, b, c], callability: [callability(a), callability(b), callability(c)],
    benchmarks: [benchmark(a), benchmark(b, { quality: 0.96 }), benchmark(c, { quality: 0.95 })], contextArtifacts: contextArtifacts(), now: NOW
  });
  assert.equal(plan.ok, true);
  const executions = plan.plan.members.map(executionFor);
  const baseAdjudication = { decision: 'x', adjudicatorProfileId: plan.plan.adjudicator.profileId, independentFromResponders: true };

  const noVerifier = buildFrontierCognitiveReceipt({ planResult: plan, executions, adjudication: { ...baseAdjudication, decisionBasis: 'EVIDENCE_WEIGHTED' }, now: NOW });
  assert.equal(noVerifier.ok, false);
  assert.ok(noVerifier.reasonCodes.includes('independent-verifier-evidence-required'));

  const majority = buildFrontierCognitiveReceipt({ planResult: plan, executions, verifierEvidenceRefs: ['proof://verifier'], adjudication: { ...baseAdjudication, decisionBasis: 'MAJORITY_ONLY' }, now: NOW });
  assert.equal(majority.ok, false);
  assert.ok(majority.reasonCodes.includes('majority-only-adjudication-prohibited'));

  const wrongAdjudicator = buildFrontierCognitiveReceipt({ planResult: plan, executions, verifierEvidenceRefs: ['proof://verifier'], adjudication: { ...baseAdjudication, decisionBasis: 'EVIDENCE_WEIGHTED', adjudicatorProfileId: plan.plan.responders[0].profileId }, now: NOW });
  assert.equal(wrongAdjudicator.ok, false);
  assert.ok(wrongAdjudicator.reasonCodes.includes('adjudicator-identity-mismatch'));

  const good = buildFrontierCognitiveReceipt({ planResult: plan, executions, verifierEvidenceRefs: ['proof://verifier'], adjudication: { ...baseAdjudication, decisionBasis: 'EVIDENCE_WEIGHTED', unresolved: ['minor dissent'] }, now: NOW });
  assert.equal(good.ok, true);
  assert.equal(good.receipt.providerSessionStateCanonical, false);
});

test('secret-bearing receipt fields fail closed instead of being durably stored', () => {
  const p = profile({ id: 'p' });
  const plan = singlePlan(p);
  const receipt = buildFrontierCognitiveReceipt({
    planResult: plan,
    executions: [executionFor(plan.plan.selected, { claims: ['Authorization: Bearer sk-abcdefghijklmnopqrstuvwxyz'] })],
    now: NOW
  });
  assert.equal(receipt.ok, false);
  assert.ok(receipt.reasonCodes.includes('secret-bearing-claim:p'));
});