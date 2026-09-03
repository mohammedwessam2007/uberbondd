import test from 'node:test';
import assert from 'node:assert/strict';
import { logIdempotentAutonomyExecutionReceipt } from '../src/agent-autonomy-receipt-ledger.mjs';

function fakeStore() {
  const rows = new Map();
  return {
    rows,
    async get(collection, id) {
      return structuredClone(rows.get(`${collection}:${id}`) || null);
    },
    async add(collection, row) {
      await new Promise(resolve => setImmediate(resolve));
      const key = `${collection}:${row.id}`;
      if (rows.has(key)) {
        const error = new Error('duplicate-row');
        error.code = 'CONFLICT';
        throw error;
      }
      rows.set(key, structuredClone(row));
      return structuredClone(row);
    }
  };
}

function receipt(overrides = {}) {
  return {
    runId: 'autonomy_run_abc',
    sequence: 7,
    sessionId: 'session_123',
    taskId: 'agent_task_456',
    originAgent: 'chatgpt',
    targetAgent: 'claude-code',
    employeeRoleRef: 'roles/runtime-worker.json',
    employeeRoleDigest: 'd'.repeat(64),
    issueNumber: 42,
    resultStatus: 'COMPLETED',
    receivedAt: '2026-09-03T09:10:00.000Z',
    ...overrides
  };
}

test('concurrent replay of one execution receipt creates exactly one durable row', async () => {
  const store = fakeStore();
  const [a, b] = await Promise.all([
    logIdempotentAutonomyExecutionReceipt(store, receipt(), { date: new Date('2026-09-03T09:10:01Z') }),
    logIdempotentAutonomyExecutionReceipt(store, receipt(), { date: new Date('2026-09-03T09:10:02Z') })
  ]);

  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(store.rows.size, 1);
  assert.equal([a.duplicate, b.duplicate].filter(Boolean).length, 1);
  assert.equal(a.auditId, b.auditId);
});

test('restart after receipt write tolerates a later local observation time and reuses the durable receipt', async () => {
  const store = fakeStore();
  const first = await logIdempotentAutonomyExecutionReceipt(
    store,
    receipt({ receivedAt: '2026-09-03T09:10:00.000Z' }),
    { date: new Date('2026-09-03T09:10:01Z') }
  );
  // This is what the real autonomy pump does after receipt-before-snapshot
  // process death: it re-enters the same run/sequence/task, sees the same
  // provider result, but stamps the new tick's local observation time.
  const restarted = await logIdempotentAutonomyExecutionReceipt(
    store,
    receipt({ receivedAt: '2026-09-03T09:15:00.000Z' }),
    { date: new Date('2026-09-03T09:15:01Z') }
  );

  assert.equal(first.status, 'RECEIPT_LOGGED');
  assert.equal(restarted.status, 'RECEIPT_ALREADY_LOGGED');
  assert.equal(restarted.duplicate, true);
  assert.equal(restarted.firstReceivedAt, '2026-09-03T09:10:00.000Z');
  assert.equal(store.rows.size, 1);
  const persisted = [...store.rows.values()][0];
  assert.equal(persisted.detail.receivedAt, '2026-09-03T09:10:00.000Z', 'first observation time stays immutable');
});

test('same durable receipt identity with conflicting worker truth fails closed', async () => {
  const store = fakeStore();
  const first = await logIdempotentAutonomyExecutionReceipt(store, receipt());
  const conflict = await logIdempotentAutonomyExecutionReceipt(store, receipt({ targetAgent: 'different-worker' }));

  assert.equal(first.ok, true);
  assert.equal(conflict.ok, false);
  assert.deepEqual(conflict.reasonCodes, ['autonomy-execution-receipt-conflict']);
  assert.equal(store.rows.size, 1);
});

test('same durable receipt identity with conflicting result status still fails closed', async () => {
  const store = fakeStore();
  const first = await logIdempotentAutonomyExecutionReceipt(store, receipt({ resultStatus: 'COMPLETED' }));
  const conflict = await logIdempotentAutonomyExecutionReceipt(
    store,
    receipt({ resultStatus: 'FAILED', receivedAt: '2026-09-03T09:20:00.000Z' })
  );

  assert.equal(first.ok, true);
  assert.equal(conflict.ok, false);
  assert.deepEqual(conflict.reasonCodes, ['autonomy-execution-receipt-conflict']);
  assert.equal(store.rows.size, 1);
});
