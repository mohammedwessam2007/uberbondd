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

function execution(status = 'MODEL_RESULT_READY', taskId = 'task_corrupt', overrides = {}) {
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
    },
    ...overrides
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
  const submitted = { ...ready, status: 'RESULT_SUBMITTED', createdAt: '2026-08-21T01:01:00.000Z' };
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
  const submitted = { ...ready, status: 'RESULT_SUBMITTED', createdAt: '2026-08-21T01:01:00.000Z' };
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

test('unknown execution statuses are rejected instead of entering durable scheduler history', async () => {
  const store = storeFixture();
  const saved = await saveAgentExecutionRecord(store, execution('TOTALLY_NEW_UNREVIEWED_STATE'));
  assert.equal(saved.ok, false);
  assert.ok(saved.reasonCodes.includes('execution-status-invalid'));
  assert.equal(store.auditLog.length, 0);
});

test('result-submitted is terminal and cannot be resurrected into replayable work', async () => {
  const store = storeFixture();
  const ready = execution('MODEL_RESULT_READY', 'task_terminal');
  const submitted = { ...ready, status: 'RESULT_SUBMITTED' };
  assert.equal((await saveAgentExecutionRecord(store, ready, { date: '2026-08-21T01:00:00Z' })).ok, true);
  assert.equal((await saveAgentExecutionRecord(store, submitted, { date: '2026-08-21T01:01:00Z' })).ok, true);

  const resurrect = await saveAgentExecutionRecord(store, { ...ready, status: 'MODEL_RESULT_READY' }, { date: '2026-08-21T01:02:00Z' });
  assert.equal(resurrect.ok, false);
  assert.equal(resurrect.status, 'CONFLICT');
  assert.ok(resurrect.reasonCodes.includes('terminal-execution-history-conflict'));

  const pending = await listPendingAgentSubmissions(store);
  assert.equal(pending.ok, true);
  assert.equal(pending.count, 0);
});

test('replay stages cannot silently switch execution identity within one task', async () => {
  const store = storeFixture();
  const ready = execution('MODEL_RESULT_READY', 'task_identity');
  assert.equal((await saveAgentExecutionRecord(store, ready)).ok, true);

  const foreignPending = execution('RESULT_SUBMISSION_PENDING', 'task_identity', { executionId: 'exec_foreign' });
  const saved = await saveAgentExecutionRecord(store, foreignPending, { date: '2026-08-21T01:01:00Z' });
  assert.equal(saved.ok, false);
  assert.equal(saved.status, 'CONFLICT');
  assert.ok(saved.reasonCodes.includes('execution-id-changed-within-task-history'));
});

test('duplicate terminal persistence is idempotent and does not append another audit row', async () => {
  const store = storeFixture();
  const submitted = execution('RESULT_SUBMITTED', 'task_terminal_duplicate');
  const first = await saveAgentExecutionRecord(store, submitted, { date: '2026-08-21T01:00:00Z' });
  const second = await saveAgentExecutionRecord(store, structuredClone(submitted), { date: '2026-08-21T01:01:00Z' });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.status, 'EXECUTION_ALREADY_SAVED');
  assert.equal(store.auditLog.length, 1);
});

test('uncertain compute state is terminal for the autonomous worker and requires separate reconciliation', async () => {
  const store = storeFixture();
  const uncertain = execution('COMPUTE_OUTCOME_UNCERTAIN', 'task_uncertain');
  assert.equal((await saveAgentExecutionRecord(store, uncertain)).ok, true);
  const pretendReady = { ...uncertain, status: 'MODEL_RESULT_READY', result: execution().result };
  const saved = await saveAgentExecutionRecord(store, pretendReady, { date: '2026-08-21T01:01:00Z' });
  assert.equal(saved.ok, false);
  assert.equal(saved.status, 'CONFLICT');
  assert.ok(saved.reasonCodes.includes('terminal-execution-history-conflict'));
});
