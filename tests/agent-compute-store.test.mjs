import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createComputeBudget,
  reserveCompute,
  commitCompute
} from '../src/ai-compute-budget.mjs';
import {
  saveComputeBudgetSnapshot,
  loadLatestComputeBudget,
  saveAgentExecutionRecord,
  loadLatestAgentExecution,
  listPendingAgentSubmissions
} from '../src/agent-compute-store.mjs';

function memoryStore() {
  const auditLog = [];
  return {
    auditLog,
    async log(type, detail) {
      const row = {
        id: `audit_${auditLog.length + 1}`,
        type,
        detail: structuredClone(detail),
        createdAt: detail?.createdAt || new Date().toISOString()
      };
      auditLog.push(row);
      return structuredClone(row);
    },
    async list(key, { filters = {}, limit = 3000 } = {}) {
      assert.equal(key, 'auditLog');
      return auditLog
        .filter(row => Object.entries(filters).every(([field, value]) => row[field] === value))
        .slice(0, limit)
        .map(row => structuredClone(row));
    }
  };
}

function budget() {
  return createComputeBudget({
    totalCostCents: 100,
    totalTokens: 100_000,
    allowPaidCompute: true,
    allowedProviders: ['openai'],
    budgetNonce: 'compute-store-test'
  });
}

function execution(status = 'MODEL_RESULT_READY', taskId = 'task_1') {
  return {
    policyVersion: 'agent-worker-runtime-1.0.0',
    executionId: `exec_${taskId}`,
    taskId,
    workerId: 'chatgpt:test',
    targetAgent: 'chatgpt',
    provider: 'openai',
    model: 'example-model',
    providerRequestId: 'req_123',
    executorOutcome: 'COMPLETED',
    usage: { inputUnits: 100, outputUnits: 20, totalUnits: 120, unitType: 'tokens', costCents: 2 },
    result: {
      outcome: 'completed',
      changedArtifacts: [],
      testsActuallyRun: [],
      truthTable: {},
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
      decision: 'PROCEED'
    },
    status,
    createdAt: '2026-08-20T02:00:00.000Z',
    externalEffectLedger: {
      providerCalls: 0,
      messages: 0,
      purchases: 0,
      deployments: 0,
      credentialChanges: 0,
      dnsChanges: 0,
      productionMutations: 0,
      spendCents: 0
    }
  };
}

test('compute budget snapshots preserve token counters and reservations without secret false positives', async () => {
  const store = memoryStore();
  const base = budget();
  const reserved = reserveCompute({
    budget: base,
    taskId: 'task_1',
    provider: 'openai',
    model: 'example-model',
    costCeilingCents: 10,
    tokenCeiling: 5000
  });
  assert.equal(reserved.ok, true);
  assert.equal(reserved.budget.reservedTokens, 5000);

  const saved = await saveComputeBudgetSnapshot(store, reserved.budget, {
    reason: 'test-reservation',
    taskId: 'task_1',
    executionStatus: 'RESERVED',
    date: '2026-08-20T02:00:00.000Z'
  });
  assert.equal(saved.ok, true);

  const loaded = await loadLatestComputeBudget(store, reserved.budget.budgetId);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.budget.reservedTokens, 5000);
  assert.equal(loaded.budget.reservations.task_1.status, 'RESERVED');
});

test('latest compute snapshot wins after commit', async () => {
  const store = memoryStore();
  const base = budget();
  const reserved = reserveCompute({
    budget: base,
    taskId: 'task_2',
    provider: 'openai',
    costCeilingCents: 10,
    tokenCeiling: 5000,
    date: '2026-08-20T02:00:00.000Z'
  });
  await saveComputeBudgetSnapshot(store, reserved.budget, { date: '2026-08-20T02:00:00.000Z' });
  const committed = commitCompute({
    budget: reserved.budget,
    taskId: 'task_2',
    actualCostCents: 2,
    actualTokens: 120,
    date: '2026-08-20T02:01:00.000Z'
  });
  await saveComputeBudgetSnapshot(store, committed.budget, { date: '2026-08-20T02:01:00.000Z' });

  const loaded = await loadLatestComputeBudget(store, committed.budget.budgetId);
  assert.equal(loaded.budget.reservedTokens, 0);
  assert.equal(loaded.budget.committedTokens, 120);
  assert.equal(loaded.budget.committedCostCents, 2);
  assert.equal(loaded.budget.reservations.task_2.status, 'COMMITTED');
});

test('ready model result is replayable until a later submitted receipt supersedes it', async () => {
  const store = memoryStore();
  const ready = execution('MODEL_RESULT_READY', 'task_replay');
  await saveAgentExecutionRecord(store, ready, { date: '2026-08-20T02:00:00.000Z' });

  let pending = await listPendingAgentSubmissions(store);
  assert.equal(pending.ok, true);
  assert.equal(pending.count, 1);
  assert.equal(pending.records[0].taskId, 'task_replay');

  const submitted = { ...ready, status: 'RESULT_SUBMITTED', createdAt: '2026-08-20T02:01:00.000Z' };
  await saveAgentExecutionRecord(store, submitted, { date: '2026-08-20T02:01:00.000Z' });
  pending = await listPendingAgentSubmissions(store);
  assert.equal(pending.count, 0);

  const latest = await loadLatestAgentExecution(store, 'task_replay');
  assert.equal(latest.executionRecord.status, 'RESULT_SUBMITTED');
});

test('explicit auth-shaped additions to an otherwise canonical compute budget fail closed', async () => {
  const store = memoryStore();
  const poisoned = { ...budget(), apiKey: 'not-a-real-key-but-sensitive-field' };
  const saved = await saveComputeBudgetSnapshot(store, poisoned);
  assert.equal(saved.ok, false);
  assert.ok(saved.reasonCodes.includes('valid-secret-free-compute-budget-required'));
});

test('execution records containing credential-shaped material are rejected', async () => {
  const store = memoryStore();
  const poisoned = { ...execution(), credential: 'should-never-be-persisted' };
  const saved = await saveAgentExecutionRecord(store, poisoned);
  assert.equal(saved.ok, false);
  assert.ok(saved.reasonCodes.includes('secret-like-execution-record-rejected'));
});
