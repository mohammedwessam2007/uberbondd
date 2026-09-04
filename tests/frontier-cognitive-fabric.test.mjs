import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';
import {
  compileFrontierCognitivePlan,
  buildFrontierCognitiveReceipt
} from '../src/frontier-cognitive-fabric.mjs';

const NOW = new Date('2026-09-04T20:00:00.000Z');
const FRESH = '2026-09-04T19:00:00.000Z';

function profile(overrides = {}) {
  const provider = overrides.provider ?? 'openai';
  const model = overrides.model ?? 'frontier-a';
  return {
    id: overrides.id ?? `${provider}-${model}`.replace(/[^a-z0-9._-]/gi, '-').toLowerCase(),
    provider,
    model,
    revision: overrides.revision ?? 'rev-1',
    transportProvider: overrides.transportProvider ?? (provider === 'anthropic' ? 'anthropic' : 'ai-gateway'),
    transportModel: overrides.transportModel ?? `${provider}/${model}`,
    taskClasses: overrides.taskClasses ?? ['general', 'coding', 'research'],
    roles: overrides.roles ?? ['general', 'builder', 'researcher', 'critic', 'adjudicator'],
    allowedDataClasses: overrides.allowedDataClasses ?? ['PUBLIC', 'INTERNAL_NON_SECRET', 'SOURCE_CODE'],
    reasoningBindings: overrides.reasoningBindings ?? {
      FAST: { settingRef: `${provider}:fast:v1`, sourceRef: 'official://reasoning', verifiedAt: FRESH },
      STANDARD: { settingRef: `${provider}:standard:v1`, sourceRef: 'official://reasoning', verifiedAt: FRESH },
      DEEP: { settingRef: `${provider}:deep:v1`, sourceRef: 'official://reasoning', verifiedAt: FRESH },
      FRONTIER_MAX: { settingRef: `${provider}:frontier-max:v1`, sourceRef: 'official://reasoning', verifiedAt: FRESH }
    },
    pricingVerifiedAt: overrides.pricingVerifiedAt ?? FRESH,
    pricingSourceRef: overrides.pricingSourceRef ?? 'official://pricing',
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
    observedAt: FRESH,
    sourceRef: 'runtime://identity-probe',
    ...overrides
  };
}

function benchmark(p, overrides = {}) {
  return normalizeModelBenchmark({
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
    maxCouncilSize: 4,
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

test('frontier routing ignores task-supplied arbitrary model injection', () => {
  const elite = profile({ id: 'elite', provider: 'openai', model: 'elite-model' });
  const result = compileFrontierCognitivePlan({
    task: task({ model: 'attacker/forced-model', endpoint: 'https://attacker.example' }),
    profiles: [elite], callability: [callability(elite)], benchmarks: [benchmark(elite)], contextArtifacts: contextArtifacts(), now: NOW
  });
  assert.equal(result.ok, true);
  assert.equal(result.plan.selected.model, 'elite-model');
  assert.equal(result.plan.selected.transportProvider, 'ai-gateway');
});

test('profile carrying endpoint or secret material is rejected before routing', () => {
  const bad = profile({ id: 'bad', apiKey: 'secret', endpoint: 'https://attacker.example' });
  const result = compileFrontierCognitivePlan({ task: task(), profiles: [bad], callability: [], benchmarks: [], contextArtifacts: contextArtifacts(), now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'FRONTIER_PROFILE_SET_INVALID');
  assert.ok(result.reasonCodes.some(code => code.includes('secret-or-endpoint-bearing-profile-prohibited')));
});

test('FRONTIER_MAX refuses unsupported or stale reasoning bindings', () => {
  const unsupported = profile({ id: 'unsupported', reasoningBindings: { STANDARD: { settingRef: 'x', sourceRef: 'official://reasoning', verifiedAt: FRESH } } });
  const stale = profile({
    id: 'stale', provider: 'anthropic', model: 'stale-model',
    reasoningBindings: {
      FRONTIER_MAX: { settingRef: 'anthropic:max:v1', sourceRef: 'official://reasoning', verifiedAt: '2025-01-01T00:00:00.000Z' }
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

test('stale or identity-mismatched callability cannot become CALLABLE_NOW routing evidence', () => {
  const p = profile({ id: 'p' });
  const stale = compileFrontierCognitivePlan({
    task: task(), profiles: [p], callability: [callability(p, { observedAt: '2026-08-01T00:00:00.000Z' })], benchmarks: [benchmark(p)], contextArtifacts: contextArtifacts(), now: NOW
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.status, 'CAPACITY_BLOCKED');
  const mismatch = compileFrontierCognitivePlan({
    task: task(), profiles: [p], callability: [callability(p, { observedModel: 'different-model' })], benchmarks: [benchmark(p)], contextArtifacts: contextArtifacts(), now: NOW
  });
  assert.equal(mismatch.ok, false);
  assert.ok(mismatch.blocked[0].reasonCodes.includes('callability-identity-mismatch'));
});

test('minimum context packet includes constitution and relevant evidence but not irrelevant history', () => {
  const p = profile({ id: 'p' });
  const result = compileFrontierCognitivePlan({ task: task(), profiles: [p], callability: [callability(p)], benchmarks: [benchmark(p)], contextArtifacts: contextArtifacts(), now: NOW });
  assert.equal(result.ok, true);
  assert.deepEqual(new Set(result.plan.contextPacket.contextArtifactIds), new Set(['constitution', 'frontier-task-evidence']));
  assert.ok(result.plan.contextPacket.omittedArtifactIds.includes('irrelevant-history') === false || !result.plan.contextPacket.contextArtifactIds.includes('irrelevant-history'));
  assert.equal(result.plan.contextPacket.invariants.includes('provider-session-state-is-not-canonical-memory'), true);
});

test('remote frontier route cannot receive a data class the model profile did not allow', () => {
  const p = profile({ id: 'p', allowedDataClasses: ['PUBLIC', 'INTERNAL_NON_SECRET'] });
  const result = compileFrontierCognitivePlan({
    task: task({ dataClass: 'SOURCE_CODE' }), profiles: [p], callability: [callability(p)], benchmarks: [benchmark(p)], contextArtifacts: contextArtifacts(), now: NOW
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'CAPACITY_BLOCKED');
  assert.ok(result.blocked[0].reasonCodes.includes('data-class-not-allowed'));
});

test('COUNCIL_MAX compiles isolated first pass then explicit critique and adjudication', () => {
  const a = profile({ id: 'a', provider: 'openai', model: 'a' });
  const b = profile({ id: 'b', provider: 'anthropic', model: 'b', transportProvider: 'anthropic', transportModel: 'b' });
  const c = profile({ id: 'c', provider: 'google', model: 'c' });
  const result = compileFrontierCognitivePlan({
    task: task({ reasoningTier: 'COUNCIL_MAX', minCouncilSize: 2, maxCouncilSize: 3 }),
    profiles: [a, b, c], callability: [callability(a), callability(b), callability(c)],
    benchmarks: [benchmark(a, { quality: 0.98 }), benchmark(b, { quality: 0.97 }), benchmark(c, { quality: 0.96 })],
    contextArtifacts: contextArtifacts(), now: NOW
  });
  assert.equal(result.ok, true);
  assert.equal(result.plan.mode, 'COUNCIL_MAX');
  assert.ok(result.plan.providerDiversity >= 2);
  const independent = result.plan.graph.nodes.filter(node => node.id.startsWith('independent_'));
  assert.ok(independent.length >= 2);
  assert.ok(independent.every(node => node.dependencies.length === 0));
  const critique = result.plan.graph.nodes.find(node => node.id === 'cross_critique');
  const adjudication = result.plan.graph.nodes.find(node => node.id === 'independent_adjudication');
  assert.equal(critique.dependencies.length, independent.length);
  assert.ok(adjudication.dependencies.includes('cross_critique'));
});

test('COUNCIL_MAX fails closed when provider diversity collapses unless degradation is explicit', () => {
  const a = profile({ id: 'a', provider: 'openai', model: 'a' });
  const b = profile({ id: 'b', provider: 'openai', model: 'b' });
  const base = {
    task: task({ reasoningTier: 'COUNCIL_MAX' }), profiles: [a, b], callability: [callability(a), callability(b)],
    benchmarks: [benchmark(a), benchmark(b, { quality: 0.94 })], contextArtifacts: contextArtifacts(), now: NOW
  };
  const blocked = compileFrontierCognitivePlan(base);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 'CAPACITY_BLOCKED');
  assert.ok(blocked.reasonCodes.includes('council-provider-diversity-unavailable'));
  const degraded = compileFrontierCognitivePlan({ ...base, allowDegradedCouncil: true });
  assert.equal(degraded.ok, true);
  assert.equal(degraded.status, 'COUNCIL_DEGRADED');
  assert.equal(degraded.plan.providerDiversity, 1);
});

test('fresh benchmark evidence is required for FRONTIER_MAX and stale economics cannot route', () => {
  const p = profile({ id: 'p', pricingVerifiedAt: '2025-01-01T00:00:00.000Z' });
  const result = compileFrontierCognitivePlan({ task: task(), profiles: [p], callability: [callability(p)], benchmarks: [benchmark(p)], contextArtifacts: contextArtifacts(), now: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.blocked[0].reasonCodes.includes('pricing-evidence-stale'));

  const freshProfile = profile({ id: 'fresh' });
  const staleBenchmark = benchmark(freshProfile, { observedAt: '2025-01-01T00:00:00.000Z' });
  const result2 = compileFrontierCognitivePlan({ task: task(), profiles: [freshProfile], callability: [callability(freshProfile)], benchmarks: [staleBenchmark], contextArtifacts: contextArtifacts(), now: NOW });
  assert.equal(result2.ok, false);
  assert.equal(result2.status, 'CAPACITY_BLOCKED');
  assert.ok(result2.reasonCodes.includes('frontier-tier-requires-fresh-quality-evidence'));
});

test('execution receipt rejects provider/model/revision identity drift', () => {
  const p = profile({ id: 'p' });
  const plan = compileFrontierCognitivePlan({ task: task(), profiles: [p], callability: [callability(p)], benchmarks: [benchmark(p)], contextArtifacts: contextArtifacts(), now: NOW });
  assert.equal(plan.ok, true);
  const receipt = buildFrontierCognitiveReceipt({
    planResult: plan,
    executions: [{ profileId: 'p', ok: true, observedProvider: p.provider, observedModel: 'wrong-model', observedRevision: p.revision, identityVerification: 'OBSERVED', resultRef: 'receipt://result' }],
    now: NOW
  });
  assert.equal(receipt.ok, false);
  assert.ok(receipt.reasonCodes.includes('execution-identity-mismatch:p'));
});

test('council receipt requires independent verifier evidence and rejects majority-only adjudication', () => {
  const a = profile({ id: 'a', provider: 'openai', model: 'a' });
  const b = profile({ id: 'b', provider: 'anthropic', model: 'b', transportProvider: 'anthropic', transportModel: 'b' });
  const plan = compileFrontierCognitivePlan({
    task: task({ reasoningTier: 'COUNCIL_MAX', minCouncilSize: 2, maxCouncilSize: 2 }), profiles: [a, b], callability: [callability(a), callability(b)],
    benchmarks: [benchmark(a), benchmark(b, { quality: 0.96 })], contextArtifacts: contextArtifacts(), now: NOW
  });
  assert.equal(plan.ok, true);
  const executions = [a, b].map(p => ({ profileId: p.id, ok: true, observedProvider: p.provider, observedModel: p.model, observedRevision: p.revision, identityVerification: 'OBSERVED', resultRef: `receipt://${p.id}` }));
  const noVerifier = buildFrontierCognitiveReceipt({ planResult: plan, executions, adjudication: { decision: 'x', decisionBasis: 'EVIDENCE_WEIGHTED' }, now: NOW });
  assert.equal(noVerifier.ok, false);
  assert.ok(noVerifier.reasonCodes.includes('independent-verifier-evidence-required'));
  const majority = buildFrontierCognitiveReceipt({ planResult: plan, executions, verifierEvidenceRefs: ['proof://verifier'], adjudication: { decision: 'x', decisionBasis: 'MAJORITY_ONLY' }, now: NOW });
  assert.equal(majority.ok, false);
  assert.ok(majority.reasonCodes.includes('majority-only-adjudication-prohibited'));
  const good = buildFrontierCognitiveReceipt({ planResult: plan, executions, verifierEvidenceRefs: ['proof://verifier'], adjudication: { decision: 'x', decisionBasis: 'EVIDENCE_WEIGHTED', unresolved: ['minor dissent'] }, now: NOW });
  assert.equal(good.ok, true);
  assert.equal(good.receipt.providerSessionStateCanonical, false);
});
