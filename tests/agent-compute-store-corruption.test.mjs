import test from 'node:test';
import assert from 'node:assert/strict';
import { createComputeBudget } from '../src/ai-compute-budget.mjs';
import {
  saveComputeBudgetSnapshot,
  loadLatestComputeBudget,
  saveAgentExecutionRecord,
  loadLatestAgentExecution,
  listPendingAgentSubmissions
} from '../src/agent-compute-store.mjs';

function storeFixture() {
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
    async list(_key, { filters = {}, limit = 3000 } = {}) {
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
    budgetNonce: 'compute-corruption-test'
  });
}

function execution(status = 'MODEL_RESULT_READY', taskId = 'task_corrupt') {
  return {
    policyVersion: 'agent-worker-runtime-1.0.0',
    executionId: `exec_${taskId}_${status.toLowerCase()}`,
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
    createdAt: '2026-08-21T01:00:00.000Z',
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

test('corrupt newest compute snapshot fails closed instead of silently falling back to stale budget state', async () => {
  const store = storeFixture();
  const base = budget();
  await saveComputeBudgetSnapshot(store, base, { date: '2026-08-21T01:00:00.000Z' });
  await saveComputeBudgetSnapshot(store, base, { date: '2026-08-21T01:01:00.000Z' });

  const newest = store.auditLog.at(-1);
  newest.detail.budget.allowedProviders = ['openai', 'Bearer attacker-controlled-token'];

  const loaded = await loadLatestComputeBudget(store, base.budgetId);
  assert.equal(loaded.ok, false);
  assert.equal(loaded.status, 'CORRUPT');
  assert.ok(loaded.reasonCodes.includes('stored-compute-budget-corrupt'));
});

test('mismatched execution envelope cannot supersede a valid older record', async () => {
  const store = storeFixture();
  const ready = execution('MODEL_RESULT_READY');
  await saveAgentExecutionRecord(store, ready, { date: '2026-08-21T01:00:00.000Z' });
  const submitted = execution('RESULT_SUBMITTED');
  await saveAgentExecutionRecord(store, submitted, { date: '2026-08-21T01:01:00.000Z' });

  const newest = store.auditLog.at(-1);
  newest.detail.status = 'MODEL_RESULT_READY';

  const loaded = await loadLatestAgentExecution(store, ready.taskId);
  assert.equal(loaded.ok, false);
  assert.equal(loaded.status, 'CORRUPT');
  assert.ok(loaded.reasonCodes.includes('stored-execution-record-identity-mismatch'));
});

test('pending submission scan fails closed on corrupt newest task history instead of claiming fresh work', async () => {
  const store = storeFixture();
  const ready = execution('MODEL_RESULT_READY', 'task_pending_corrupt');
  await saveAgentExecutionRecord(store, ready, { date: '2026-08-21T01:00:00.000Z' });
  const submitted = execution('RESULT_SUBMITTED', 'task_pending_corrupt');
  await saveAgentExecutionRecord(store, submitted, { date: '2026-08-21T01:01:00.000Z' });

  const newest = store.auditLog.at(-1);
  newest.detail.executionRecord.taskId = 'task_other_identity';

  const pending = await listPendingAgentSubmissions(store);
  assert.equal(pending.ok, false);
  assert.equal(pending.status, 'CORRUPT');
  assert.ok(pending.reasonCodes.some(code => code.startsWith('execution-history-corrupt:')));
});

test('execution record without status is rejected before persistence', async () => {
  const store = storeFixture();
  const invalid = execution();
  delete invalid.status;
  const saved = await saveAgentExecutionRecord(store, invalid);
  assert.equal(saved.ok, false);
  assert.ok(saved.reasonCodes.includes('execution-status-required'));
  assert.equal(store.auditLog.length, 0);
});
