import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';
import { executeAdmittedFrontierAvenger } from '../src/avengers-execution-guard.mjs';
import { buildFrontierCallabilityProbeReceipt } from '../src/frontier-callability-provenance.mjs';
import { createFrontierSimulationExecutorFactory } from '../src/frontier-simulation-executor.mjs';

const NOW = new Date('2026-09-04T20:00:00.000Z');
const FRESH = '2026-09-04T19:00:00.000Z';

function profile({ id = 'google-frontier', provider = 'google', model = 'gemini-frontier', revision = 'rev-1', quality = 0.98 } = {}) {
  return {
    id, provider, model, revision,
    transportProvider: 'ai-gateway', transportModel: `${provider}/${model}`,
    transportSourceRef: 'official://gateway', transportVerifiedAt: FRESH, transportEvidenceClass: 'OFFICIAL_SOURCE',
    taskClasses: ['general'], roles: ['general'], allowedDataClasses: ['INTERNAL_NON_SECRET'],
    reasoningBindings: { FRONTIER_MAX: { settingRef: 'ai-gateway:reasoning=xhigh', sourceRef: 'official://gateway-reasoning', verifiedAt: FRESH, evidenceClass: 'OFFICIAL_SOURCE' } },
    pricingVerifiedAt: FRESH, pricingSourceRef: 'official://pricing', pricingEvidenceClass: 'OFFICIAL_SOURCE',
    maxContextTokens: 200000, maxOutputTokens: 32000, centsPerMillionInputTokens: 100, centsPerMillionOutputTokens: 500,
    identityAliases: [model], enabled: true, _quality: quality
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
function provenance(calls) {
  const built = buildFrontierCallabilityProbeReceipt({
    observations: calls.map(item => ({ ...item, providerRequestId: `probe-req-${item.profileId}` })),
    sourceRef: 'runtime-probe://avengers-frontier-guard', observedAt: FRESH
  });
  assert.equal(built.ok, true);
  assert.equal(built.simulationOnly, true);
  return { receipt: built.receipt, receiptDigest: built.receiptDigest };
}
function benchmark(p) {
  const out = normalizeModelBenchmark({
    provider: p.provider, model: p.model, taskClasses: p.taskClasses, taskClass: 'general',
    quality: p._quality, reliability: 0.97, latencyScore: 0.8, economicImpact: 0.9, evidenceConfidence: 0.99, costEfficiency: 0.7
  }, new Date(FRESH));
  out.observedRevision = p.revision;
  out.evidenceRef = `benchmark://${p.id}`;
  return out;
}
const contextArtifacts = [
  { id: 'constitution', kind: 'CONSTITUTION', contentRef: 'repo://constitution', tags: ['core'], dependencies: [], estimatedTokens: 300, priority: 100, immutable: true },
  { id: 'frontier-evidence', kind: 'EVIDENCE', contentRef: 'repo://frontier-evidence', tags: ['frontier'], dependencies: ['constitution'], estimatedTokens: 500, priority: 90 }
];
const env = {
  AI_GATEWAY_API_KEY: 'test-key-long-enough', AI_GATEWAY_AGENT_ENABLED: 'true',
  AI_GATEWAY_INPUT_USD_PER_MILLION: '1', AI_GATEWAY_OUTPUT_USD_PER_MILLION: '2',
  AI_GATEWAY_PRICING_SOURCE: 'official://pricing', AI_GATEWAY_PRICING_VERIFIED_AT: FRESH
};
function task(reasoningTier = 'FRONTIER_MAX') {
  return {
    missionId: 'avengers-frontier-guard', taskId: 'avengers-frontier-guard', objective: 'Solve one bounded frontier task.',
    taskClass: 'general', role: 'general', dataClass: 'INTERNAL_NON_SECRET', reasoningTier,
    requiredTags: ['frontier'], contextTokenBudget: 5000, minCouncilSize: 2, maxCouncilSize: 2
  };
}
function baseArgs(p, calls, reasoningTier = 'FRONTIER_MAX') {
  return {
    task: task(reasoningTier), profiles: Array.isArray(p) ? p : [p], callability: calls,
    benchmarks: (Array.isArray(p) ? p : [p]).map(benchmark), contextArtifacts,
    admissionSource: { kind: 'RUNTIME_PROBE_LEDGER', ref: 'proof://guard-e2e', observedAt: FRESH },
    callabilityProvenance: provenance(calls), env, maxTokens: 100, costCeilingCents: 100, date: NOW
  };
}

test('synthetic FRONTIER_MAX executes only through the branded deterministic no-network simulation factory', async () => {
  const p = profile();
  const calls = [callability(p)];
  const modelExecutorFactory = createFrontierSimulationExecutorFactory({
    responses: [{ taskId: 'avengers-frontier-guard', model: p.transportModel, costCents: 0, result: { outcome: 'bounded-result' } }]
  });
  const times = [1000, 1042];
  const out = await executeAdmittedFrontierAvenger({
    ...baseArgs(p, calls), modelExecutorFactory, clock: () => times.shift()
  });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'FRONTIER_AVENGER_EXECUTION_COMPLETE');
  assert.equal(out.simulationOnly, true);
  assert.equal(out.providerCalls, 0);
  assert.equal(out.execution.observedRevision, p.revision);
  assert.equal(out.execution.latencyMs, 42);
  assert.equal(out.receipt.executions[0].appliedReasoningSettingRef, 'ai-gateway:reasoning=xhigh');
  assert.equal(out.receipt.simulationOnly, true);
  assert.match(out.receipt.callabilityProvenance.receiptDigest, /^[a-f0-9]{64}$/);
});

test('synthetic callability rejects a network-capable fetch wrapper before any transport dispatch', async () => {
  const p = profile();
  const calls = [callability(p)];
  let fetchCalls = 0;
  const fetchImpl = (...args) => {
    fetchCalls += 1;
    return globalThis.fetch(...args);
  };
  const out = await executeAdmittedFrontierAvenger({ ...baseArgs(p, calls), fetchImpl });
  assert.equal(out.ok, false);
  assert.equal(fetchCalls, 0);
  assert.ok(out.reasonCodes.includes('synthetic-callability-requires-branded-no-network-simulation-executor'));
});

test('synthetic callability rejects an arbitrary executor factory before construction', async () => {
  const p = profile();
  const calls = [callability(p)];
  let constructions = 0;
  const modelExecutorFactory = () => {
    constructions += 1;
    return async () => ({ ok: true });
  };
  const out = await executeAdmittedFrontierAvenger({ ...baseArgs(p, calls), modelExecutorFactory });
  assert.equal(out.ok, false);
  assert.equal(constructions, 0);
  assert.ok(out.reasonCodes.includes('synthetic-callability-requires-branded-no-network-simulation-executor'));
});

test('even a branded synthetic simulation factory cannot be paired with injected network transport', async () => {
  const p = profile();
  const calls = [callability(p)];
  const modelExecutorFactory = createFrontierSimulationExecutorFactory({
    responses: [{ taskId: 'avengers-frontier-guard', model: p.transportModel, costCents: 0, result: { outcome: 'bounded-result' } }]
  });
  let fetchCalls = 0;
  const fetchImpl = (...args) => { fetchCalls += 1; return globalThis.fetch(...args); };
  const out = await executeAdmittedFrontierAvenger({ ...baseArgs(p, calls), modelExecutorFactory, fetchImpl });
  assert.equal(out.ok, false);
  assert.equal(fetchCalls, 0);
  assert.ok(out.reasonCodes.includes('synthetic-frontier-execution-prohibits-network-transport-injection'));
});

test('COUNCIL_MAX executes sealed first passes, responder cross-critiques and distinct adjudication under one shared budget', async () => {
  const profiles = [
    profile({ id: 'google', provider: 'google', model: 'gemini-frontier', quality: 0.99 }),
    profile({ id: 'openai', provider: 'openai', model: 'gpt-frontier', quality: 0.98 }),
    profile({ id: 'anthropic', provider: 'anthropic', model: 'claude-frontier', quality: 0.97 })
  ];
  const calls = profiles.map(callability);
  const modelExecutorFactory = createFrontierSimulationExecutorFactory({
    responses: [
      { taskId: 'avengers-frontier-guard:independent-google', model: 'google/gemini-frontier', costCents: 7, result: { answer: 'independent-google' } },
      { taskId: 'avengers-frontier-guard:independent-openai', model: 'openai/gpt-frontier', costCents: 7, result: { answer: 'independent-openai' } },
      { taskId: 'avengers-frontier-guard:cross-critique-google', model: 'google/gemini-frontier', costCents: 6, result: { contradictions: ['google contradiction'] } },
      { taskId: 'avengers-frontier-guard:cross-critique-openai', model: 'openai/gpt-frontier', costCents: 6, result: { contradictions: ['openai contradiction'] } },
      { taskId: 'avengers-frontier-guard:independent-adjudication', model: 'anthropic/claude-frontier', costCents: 5, result: { decision: 'bounded-synthesis', unresolved: ['bounded uncertainty'] } }
    ]
  });
  let tick = 1000;
  const out = await executeAdmittedFrontierAvenger({
    ...baseArgs(profiles, calls, 'COUNCIL_MAX'), modelExecutorFactory, costCeilingCents: 100, clock: () => ++tick
  });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'FRONTIER_COUNCIL_AVENGERS_EXECUTION_COMPLETE');
  assert.equal(out.simulationOnly, true);
  assert.equal(out.executionCount, 5);
  assert.equal(out.providerCalls, 0);
  assert.equal(out.receipt.mode, 'COUNCIL_MAX');
  assert.equal(out.receipt.executions.length, 3); // 2 sealed first passes + 1 distinct adjudicator; critiques remain process evidence.
  assert.equal(out.critiqueExecutions?.length ?? out.receipt.crossCritiqueProfiles?.length, 2);
  assert.deepEqual(new Set(out.receipt.crossCritiqueProfiles), new Set(['google', 'openai']));
  assert.deepEqual(new Set(out.receipt.contradictions), new Set(['google contradiction', 'openai contradiction']));
  assert.equal(out.receipt.adjudication.decisionBasis, 'EVIDENCE_WEIGHTED');
  assert.equal(out.receipt.adjudication.adjudicatorProfileId, 'anthropic');
  assert.equal(out.receipt.adjudication.independentFromResponders, true);
  assert.equal(out.receipt.councilBudgetCents, 100);
  assert.equal(out.receipt.councilSpentCents, 31);
  assert.equal(out.spentCents, 31);
  assert.match(out.processVerifierRef, /^frontier-process-proof:\/\/[a-f0-9]{64}$/);
  assert.equal(out.receipt.semanticClaimAuthority, 'NONE');
});
