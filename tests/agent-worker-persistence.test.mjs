import test from 'node:test';
import assert from 'node:assert/strict';
import { createComputeBudget, reserveCompute, commitCompute } from '../src/ai-compute-budget.mjs';
import { runAgentWorkerOnce } from '../src/agent-worker-runtime.mjs';
import { evaluatePendingSubmissionScope } from '../src/agent-worker-job.mjs';

function claim() {
  return {
    ok: true,
    status: 'CLAIMED',
    taskId: 'task_persist_1',
    workerId: 'chatgpt:test-worker',
    task: {
      taskId: 'task_persist_1',
      objective: 'Perform a bounded local review.',
      originAgent: 'claude-code',
      targetAgent: 'chatgpt',
      consequenceClass: 'LOCAL_PREPARATION',
      budget: { maxTokens: 5000, maxCostCents: 10 }
    }
  };
}

function budget() {
  return createComputeBudget({
    totalCostCents: 100,
    totalTokens: 100_000,
    allowPaidCompute: true,
    allowedProviders: ['openai'],
    budgetNonce: 'worker-persistence-test'
  });
}

function result() {
  return {
    outcome: 'Review completed.',
    changedArtifacts: [],
    testsActuallyRun: [{ command: 'node --test', status: 'PASS', total: 1, passed: 1, failed: 0 }],
    truthTable: { localReview: 'PASS' },
    externalEffectLedger: {
      providerCalls: 0,
      messages: 0,
      purchases: 0,
      deployments: 0,
      credentialChanges: 0,
      dnsChanges: 0,
      productionMutations: 0,
      spendCents: 0
    },
    decision: 'PROCEED',
    coordination: {
      action: 'DONE',
      summary: 'Finished.',
      evidenceRefs: ['test:persistence-order'],
      confidence: 0.9
    },
    evidenceRefs: ['test:persistence-order']
  };
}

function committedBudget(taskId = 'task_pending_1') {
  const initial = budget();
  const reserved = reserveCompute({
    budget: initial,
    taskId,
    provider: 'openai',
    model: 'example-model',
    costCeilingCents: 10,
    tokenCeiling: 5000,
    date: new Date('2026-08-21T12:00:00Z')
  });
  assert.equal(reserved.ok, true);
  const committed = commitCompute({
    budget: reserved.budget,
    taskId,
    actualCostCents: 2,
    actualTokens: 120,
    date: new Date('2026-08-21T12:01:00Z')
  });
  assert.equal(committed.ok, true);
  return committed.budget;
}

function pendingRecord(overrides = {}) {
  return {
    executionId: 'agent_exec_pending_1',
    taskId: 'task_pending_1',
    workerId: 'chatgpt:test-worker',
    targetAgent: 'chatgpt',
    provider: 'openai',
    model: 'example-model',
    usage: {
      inputUnits: 100,
      outputUnits: 20,
      totalUnits: 120,
      unitType: 'tokens',
      costCents: 2
    },
    result: result(),
    status: 'RESULT_SUBMISSION_PENDING',
    externalEffectLedger: {
      providerCalls: 0,
      messages: 0,
      purchases: 0,
      deployments: 0,
      credentialChanges: 0,
      dnsChanges: 0,
      productionMutations: 0,
      spendCents: 0
    },
    ...overrides
  };
}

test('compute reservation is durably persisted before the provider executor can run', async () => {
  const order = [];
  const out = await runAgentWorkerOnce({
    claim: claim(),
    computeBudget: budget(),
    provider: 'openai',
    model: 'example-model',
    costCeilingCents: 10,
    tokenCeiling: 5000,
    persistBudgetState: async ({ stage, budget: persisted }) => {
      order.push(`budget:${stage}`);
      assert.equal(stage, order.length === 1 ? 'RESERVED' : stage);
      assert.equal(persisted.reservations.task_persist_1.status, stage === 'RESERVED' ? 'RESERVED' : 'COMMITTED');
      return { ok: true };
    },
    persistExecutionRecord: async ({ executionRecord }) => {
      order.push(`record:${executionRecord.status}`);
      return { ok: true };
    },
    modelExecutor: async () => {
      order.push('provider');
      return {
        ok: true,
        outcome: 'COMPLETED',
        usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, costCents: 2 },
        result: result()
      };
    },
    submitResult: async () => {
      order.push('relay-submit');
      return { ok: true, status: 'COMPLETED' };
    }
  });
  assert.equal(out.ok, true);
  assert.equal(order[0], 'budget:RESERVED');
  assert.ok(order.indexOf('budget:RESERVED') < order.indexOf('provider'));
  assert.ok(order.indexOf('budget:COMMITTED') < order.indexOf('record:MODEL_RESULT_READY'));
  assert.ok(order.indexOf('record:MODEL_RESULT_READY') < order.indexOf('relay-submit'));
});

test('reservation persistence failure prevents any provider call', async () => {
  let providerCalls = 0;
  const out = await runAgentWorkerOnce({
    claim: claim(),
    computeBudget: budget(),
    provider: 'openai',
    model: 'example-model',
    costCeilingCents: 10,
    tokenCeiling: 5000,
    persistBudgetState: async () => ({ ok: false, reasonCodes: ['disk-write-failed'] }),
    modelExecutor: async () => {
      providerCalls += 1;
      return { ok: true };
    },
    submitResult: async () => ({ ok: true })
  });
  assert.equal(out.status, 'PERSISTENCE_BLOCKED');
  assert.equal(providerCalls, 0);
  assert.ok(out.reasonCodes.includes('compute-reservation-persistence-failed'));
});

test('ready result persistence failure prevents relay completion so the result cannot vanish between worlds', async () => {
  let relaySubmits = 0;
  const stages = [];
  const out = await runAgentWorkerOnce({
    claim: claim(),
    computeBudget: budget(),
    provider: 'openai',
    model: 'example-model',
    costCeilingCents: 10,
    tokenCeiling: 5000,
    persistBudgetState: async ({ stage }) => {
      stages.push(stage);
      return { ok: true };
    },
    persistExecutionRecord: async ({ executionRecord }) => {
      if (executionRecord.status === 'MODEL_RESULT_READY') return { ok: false, reasonCodes: ['record-store-down'] };
      return { ok: true };
    },
    modelExecutor: async () => ({
      ok: true,
      outcome: 'COMPLETED',
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, costCents: 2 },
      result: result()
    }),
    submitResult: async () => {
      relaySubmits += 1;
      return { ok: true };
    }
  });
  assert.equal(out.status, 'RESULT_PERSISTENCE_BLOCKED');
  assert.equal(relaySubmits, 0);
  assert.deepEqual(stages, ['RESERVED', 'COMMITTED']);
});

test('relay submission failure leaves an explicitly replayable pending record', async () => {
  const records = [];
  const out = await runAgentWorkerOnce({
    claim: claim(),
    computeBudget: budget(),
    provider: 'openai',
    model: 'example-model',
    costCeilingCents: 10,
    tokenCeiling: 5000,
    persistBudgetState: async () => ({ ok: true }),
    persistExecutionRecord: async ({ executionRecord }) => {
      records.push(structuredClone(executionRecord));
      return { ok: true };
    },
    modelExecutor: async () => ({
      ok: true,
      outcome: 'COMPLETED',
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, costCents: 2 },
      result: result()
    }),
    submitResult: async () => ({ ok: false, reasonCodes: ['relay-temporary-failure'] })
  });
  assert.equal(out.status, 'RESULT_SUBMISSION_PENDING');
  assert.deepEqual(records.map(record => record.status), ['MODEL_RESULT_READY', 'RESULT_SUBMISSION_PENDING']);
  assert.equal(out.executionRecord.status, 'RESULT_SUBMISSION_PENDING');
});

test('pending result replay is accepted only by the owning worker, target, provider, model and committed compute context', () => {
  const compute = committedBudget();
  const record = pendingRecord();
  const scope = evaluatePendingSubmissionScope(record, {
    budget: compute,
    budgetId: compute.budgetId,
    targetAgent: 'chatgpt',
    workerId: 'chatgpt:test-worker',
    provider: 'openai',
    model: 'example-model'
  });
  assert.equal(scope.ok, true);
  assert.equal(scope.status, 'OWNED');
  assert.equal(scope.taskId, 'task_pending_1');
});

test('pending result owned by a different worker is foreign and cannot be replayed', () => {
  const compute = committedBudget();
  const scope = evaluatePendingSubmissionScope(pendingRecord({ workerId: 'chatgpt:other-worker' }), {
    budget: compute,
    budgetId: compute.budgetId,
    targetAgent: 'chatgpt',
    workerId: 'chatgpt:test-worker',
    provider: 'openai',
    model: 'example-model'
  });
  assert.equal(scope.ok, false);
  assert.equal(scope.status, 'FOREIGN');
  assert.deepEqual(scope.reasonCodes, ['pending-submission-owned-by-another-worker']);
});

test('same worker with a different provider or model fails closed as a scope conflict', () => {
  const compute = committedBudget();
  const providerConflict = evaluatePendingSubmissionScope(pendingRecord({ provider: 'anthropic' }), {
    budget: compute,
    budgetId: compute.budgetId,
    targetAgent: 'chatgpt',
    workerId: 'chatgpt:test-worker',
    provider: 'openai',
    model: 'example-model'
  });
  assert.equal(providerConflict.ok, false);
  assert.equal(providerConflict.status, 'SCOPE_CONFLICT');
  assert.ok(providerConflict.reasonCodes.includes('pending-submission-provider-mismatch'));

  const modelConflict = evaluatePendingSubmissionScope(pendingRecord({ model: 'other-model' }), {
    budget: compute,
    budgetId: compute.budgetId,
    targetAgent: 'chatgpt',
    workerId: 'chatgpt:test-worker',
    provider: 'openai',
    model: 'example-model'
  });
  assert.equal(modelConflict.ok, false);
  assert.equal(modelConflict.status, 'SCOPE_CONFLICT');
  assert.ok(modelConflict.reasonCodes.includes('pending-submission-model-mismatch'));
});

test('pending result cannot borrow a different budget reservation or falsify committed usage', () => {
  const compute = committedBudget();
  const wrongTask = evaluatePendingSubmissionScope(pendingRecord({ taskId: 'task_not_in_budget' }), {
    budget: compute,
    budgetId: compute.budgetId,
    targetAgent: 'chatgpt',
    workerId: 'chatgpt:test-worker',
    provider: 'openai',
    model: 'example-model'
  });
  assert.equal(wrongTask.ok, false);
  assert.equal(wrongTask.status, 'SCOPE_CONFLICT');
  assert.ok(wrongTask.reasonCodes.includes('pending-submission-committed-reservation-required'));

  const usageConflict = evaluatePendingSubmissionScope(pendingRecord({ usage: { totalUnits: 999, costCents: 77 } }), {
    budget: compute,
    budgetId: compute.budgetId,
    targetAgent: 'chatgpt',
    workerId: 'chatgpt:test-worker',
    provider: 'openai',
    model: 'example-model'
  });
  assert.equal(usageConflict.ok, false);
  assert.equal(usageConflict.status, 'SCOPE_CONFLICT');
  assert.ok(usageConflict.reasonCodes.includes('pending-submission-reservation-cost-mismatch'));
  assert.ok(usageConflict.reasonCodes.includes('pending-submission-reservation-token-mismatch'));
});
