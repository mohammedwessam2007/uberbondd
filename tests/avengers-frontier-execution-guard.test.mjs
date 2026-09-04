import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';
import { executeAdmittedFrontierAvenger } from '../src/avengers-execution-guard.mjs';
import { buildFrontierCallabilityProbeReceipt } from '../src/frontier-callability-provenance.mjs';

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

test('synthetic FRONTIER_MAX reaches the canonical factory only through an explicit injected fetch seam', async () => {
  const p = profile();
  const calls = [callability(p)];
  let requestBody = null;
  const fetchImpl = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return { ok: true, status: 200, async text() { return JSON.stringify({ id: 'req_guard_1', model: p.transportModel, usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 }, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ outcome: 'bounded-result' }) } }] }); } };
  };
  const times = [1000, 1042];
  const out = await executeAdmittedFrontierAvenger({
    task: task(), profiles: [p], callability: calls, benchmarks: [benchmark(p)], contextArtifacts,
    admissionSource: { kind: 'RUNTIME_PROBE_LEDGER', ref: 'proof://guard-e2e', observedAt: FRESH },
    callabilityProvenance: provenance(calls), env, fetchImpl, maxTokens: 100, costCeilingCents: 100, date: NOW, clock: () => times.shift()
  });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'FRONTIER_AVENGER_SIMULATION_COMPLETE');
  assert.equal(out.simulationOnly, true);
  assert.equal(out.providerCalls, 1);
  assert.deepEqual(requestBody.reasoning, { effort: 'xhigh' });
  assert.equal(requestBody.model, p.transportModel);
  assert.equal(out.execution.observedRevision, p.revision);
  assert.equal(out.execution.latencyMs, 42);
  assert.equal(out.receipt.executions[0].appliedReasoningSettingRef, 'ai-gateway:reasoning=xhigh');
  assert.equal(out.receipt.simulationOnly, true);
  assert.match(out.receipt.callabilityProvenance.receiptDigest, /^[a-f0-9]{64}$/);
});

test('COUNCIL_MAX executes independent responders, critique and distinct adjudication with one shared zero-effect budget', async () => {
  const profiles = [
    profile({ id: 'google', provider: 'google', model: 'gemini-frontier', quality: 0.99 }),
    profile({ id: 'openai', provider: 'openai', model: 'gpt-frontier', quality: 0.98 }),
    profile({ id: 'anthropic', provider: 'anthropic', model: 'claude-frontier', quality: 0.97 })
  ];
  const calls = profiles.map(callability);
  const seenTasks = [];
  const seenCeilings = [];
  let serial = 0;
  const modelExecutorFactory = worker => async ({ task: workerTask, costCeilingCents }) => {
    seenTasks.push({ model: worker.model, taskId: workerTask.taskId, objective: workerTask.objective });
    seenCeilings.push(costCeilingCents);
    serial += 1;
    const result = workerTask.taskId.includes('cross-critique')
      ? { contradictions: ['bounded contradiction'] }
      : workerTask.taskId.includes('independent-adjudication')
        ? { decision: 'bounded-synthesis', unresolved: ['bounded uncertainty'] }
        : { answer: `independent-${worker.model}` };
    return {
      ok: true, providerRequestId: `synthetic-${serial}`, model: worker.model,
      identityVerification: 'OBSERVED', appliedReasoningEffort: 'xhigh', appliedReasoningEvidence: 'REQUEST_BODY_ATTESTED',
      usage: { costCents: 0 }, result
    };
  };
  let tick = 1000;
  const out = await executeAdmittedFrontierAvenger({
    task: task('COUNCIL_MAX'), profiles, callability: calls, benchmarks: profiles.map(benchmark), contextArtifacts,
    admissionSource: { kind: 'RUNTIME_PROBE_LEDGER', ref: 'proof://council-runtime', observedAt: FRESH },
    callabilityProvenance: provenance(calls), env, modelExecutorFactory, costCeilingCents: 100, date: NOW, clock: () => ++tick
  });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'FRONTIER_COUNCIL_SIMULATION_COMPLETE');
  assert.equal(out.simulationOnly, true);
  assert.equal(out.executionCount, 4);
  assert.equal(out.providerCalls, 0);
  assert.equal(out.receipt.mode, 'COUNCIL_MAX');
  assert.equal(out.receipt.executions.length, 3);
  assert.equal(out.receipt.adjudication.decisionBasis, 'EVIDENCE_WEIGHTED');
  assert.equal(out.receipt.adjudication.independentFromResponders, true);
  assert.equal(out.receipt.councilBudgetCents, 100);
  assert.equal(out.receipt.councilSpentCents, 0);
  assert.ok(seenCeilings.every(value => value <= 50));
  assert.match(out.processVerifierRef, /^frontier-process-proof:\/\/[a-f0-9]{64}$/);
  const independent = seenTasks.filter(item => item.taskId.includes(':independent-') && !item.taskId.includes('adjudication'));
  assert.equal(independent.length, 2);
  assert.ok(independent.every(item => !item.objective.includes('independent-google') && !item.objective.includes('independent-openai')));
  assert.equal(seenTasks.some(item => item.taskId.includes('cross-critique')), true);
  assert.equal(seenTasks.some(item => item.taskId.includes('independent-adjudication')), true);
});
