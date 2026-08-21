import test from 'node:test';
import assert from 'node:assert/strict';
import { createComputeBudget, computeBudgetSummary } from '../src/ai-compute-budget.mjs';
import { normalizeModelBenchmark, routeModel } from '../src/agent-model-router.mjs';
import { executeProviderTask } from '../src/agent-provider-execution.mjs';

function task(overrides = {}) {
  return {
    ok: true,
    taskId: 'task-exec-1',
    targetAgent: 'chatgpt',
    objective: 'Research bounded question',
    contextRefs: ['doc:x'],
    evidenceRefs: ['doc:y'],
    requiredOutputs: ['outcome', 'coordination'],
    acceptanceTests: ['evidence-check'],
    constraints: ['local-only'],
    consequenceClass: 'LOCAL_PREPARATION',
    ...overrides
  };
}

function route() {
  const candidate = { provider: 'openai', model: 'gpt-x', taskClasses: ['research'] };
  const benchmark = normalizeModelBenchmark({
    ...candidate,
    taskClass: 'research',
    quality: .9,
    reliability: .9,
    latencyScore: .8,
    economicImpact: .8,
    evidenceConfidence: .9,
    costEfficiency: .8
  }, new Date('2026-08-20T00:00:00Z'));
  return routeModel({ taskClass: 'research', candidates: [candidate], benchmarks: [benchmark], explorationRate: 0, random: () => 1 });
}

function budget() {
  return createComputeBudget({
    totalCostCents: 100,
    totalTokens: 5000,
    allowPaidCompute: true,
    allowedProviders: ['openai']
  });
}

function validResult(overrides = {}) {
  return {
    taskId: 'task-exec-1',
    provider: 'openai',
    model: 'gpt-x',
    outcome: 'Done',
    coordination: { action: 'DONE', evidenceRefs: ['doc:done'] },
    evidenceRefs: ['doc:done'],
    usage: { inputTokens: 400, outputTokens: 100, costCents: 12 },
    businessEffectLedger: { messages: 0, purchases: 0, deployments: 0, credentialChanges: 0, dnsChanges: 0, productionMutations: 0, businessSpendCents: 0 },
    externalEffectLedger: { providerCalls: 0, messages: 0, purchases: 0, deployments: 0, credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0 },
    ...overrides
  };
}

test('successful provider invocation commits measured compute usage', async () => {
  const result = await executeProviderTask({
    budget: budget(), relayTask: task(), modelRoute: route(), costCeilingCents: 25, tokenCeiling: 1000,
    invoke: async () => validResult()
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'COMPLETED');
  const summary = computeBudgetSummary(result.budget);
  assert.equal(summary.committedCostCents, 12);
  assert.equal(summary.committedTokens, 500);
  assert.equal(summary.reservedCostCents, 0);
});

test('malformed post-invoke result quarantines reservation as usage uncertain', async () => {
  const result = await executeProviderTask({
    budget: budget(), relayTask: task(), modelRoute: route(), costCeilingCents: 25, tokenCeiling: 1000,
    invoke: async () => ({ text: 'unstructured response' })
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'COMPUTE_USAGE_UNCERTAIN');
  const summary = computeBudgetSummary(result.budget);
  assert.equal(summary.reservedCostCents, 25);
  assert.equal(summary.activeReservations, 1);
});

test('thrown provider transport after invocation attempt keeps reservation locked', async () => {
  const result = await executeProviderTask({
    budget: budget(), relayTask: task(), modelRoute: route(), costCeilingCents: 25, tokenCeiling: 1000,
    invoke: async () => { throw new Error('timeout'); }
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'COMPUTE_USAGE_UNCERTAIN');
  assert.equal(computeBudgetSummary(result.budget).reservedCostCents, 25);
});

test('request rejection before invoke safely releases compute reservation', async () => {
  let invoked = false;
  const result = await executeProviderTask({
    budget: budget(),
    relayTask: task({ metadata: { apiKey: 'do-not-forward' } }),
    modelRoute: route(),
    costCeilingCents: 25,
    tokenCeiling: 1000,
    invoke: async () => { invoked = true; return validResult(); }
  });
  assert.equal(result.ok, false);
  assert.equal(invoked, false);
  assert.equal(result.computeStatus, 'RELEASED_BEFORE_INVOKE');
  assert.equal(computeBudgetSummary(result.budget).availableCostCents, 100);
});

test('forged route is rejected before any compute reservation', async () => {
  const result = await executeProviderTask({
    budget: budget(),
    relayTask: task(),
    modelRoute: { ok: true, status: 'ROUTED', selected: { provider: 'openai', model: 'gpt-x' } },
    costCeilingCents: 25,
    tokenCeiling: 1000,
    invoke: async () => validResult()
  });
  assert.equal(result.ok, false);
});
