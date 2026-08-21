import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPendingRelayTask,
  reconcilePendingRelayTask
} from '../src/pending-relay-reconciliation.mjs';

const now = '2026-08-20T13:14:03.000Z';
const receipt = {
  taskId: 'task_123',
  issueNumber: 43,
  createdAt: '2026-08-20T13:04:03.000Z'
};
const openTask = {
  ok: true,
  issueState: 'open',
  task: { taskId: receipt.taskId },
  result: null
};

test('fresh unresolved task remains pending', () => {
  const value = classifyPendingRelayTask({ pendingReceipt: receipt, observedTask: openTask, date: now });
  assert.equal(value.status, 'PENDING');
  assert.equal(value.retryAuthorized, false);
  assert.equal(value.mutationAttempted, false);
});

test('stale task requires review and never authorizes retry', () => {
  const value = classifyPendingRelayTask({
    pendingReceipt: { ...receipt, createdAt: '2026-08-20T10:00:00.000Z' },
    observedTask: openTask,
    staleAfterMs: 3_600_000,
    date: now
  });
  assert.equal(value.status, 'OWNER_REVIEW_REQUIRED');
  assert.deepEqual(value.reasonCodes, ['pending-task-stale-no-automatic-retry']);
  assert.equal(value.retryAuthorized, false);
});

test('completed result is routed to independent review only', () => {
  const value = classifyPendingRelayTask({
    pendingReceipt: receipt,
    observedTask: { ...openTask, result: { decision: 'PROCEED' }, resultStatus: 'COMPLETED' },
    date: now
  });
  assert.equal(value.status, 'RESULT_READY_FOR_REVIEW');
  assert.equal(value.retryAuthorized, false);
});

test('closed issue without result is quarantined', () => {
  const value = classifyPendingRelayTask({
    pendingReceipt: receipt,
    observedTask: { ...openTask, issueState: 'closed' },
    date: now
  });
  assert.equal(value.status, 'QUARANTINED');
  assert.deepEqual(value.reasonCodes, ['relay-closed-without-result-receipt']);
});

test('identity mismatch is quarantined', () => {
  const value = classifyPendingRelayTask({
    pendingReceipt: receipt,
    observedTask: { ...openTask, task: { taskId: 'different' } },
    date: now
  });
  assert.equal(value.status, 'QUARANTINED');
});

test('relay read failure is blocked', () => {
  const value = classifyPendingRelayTask({
    pendingReceipt: receipt,
    observedTask: { ok: false, reasonCodes: ['relay-unavailable'] },
    date: now
  });
  assert.equal(value.status, 'BLOCKED');
  assert.deepEqual(value.reasonCodes, ['relay-read-failed', 'relay-unavailable']);
});

test('missing receipt time requires owner review', () => {
  const value = classifyPendingRelayTask({
    pendingReceipt: { taskId: 'task_123', issueNumber: 43 },
    observedTask: openTask,
    date: now
  });
  assert.equal(value.status, 'OWNER_REVIEW_REQUIRED');
});

test('future receipt time requires owner review', () => {
  const value = classifyPendingRelayTask({
    pendingReceipt: { ...receipt, createdAt: '2026-08-21T00:00:00.000Z' },
    observedTask: openTask,
    date: now
  });
  assert.equal(value.status, 'OWNER_REVIEW_REQUIRED');
});

test('invalid stale threshold falls back to one hour', () => {
  const value = classifyPendingRelayTask({
    pendingReceipt: { ...receipt, createdAt: '2026-08-20T11:00:00.000Z' },
    observedTask: openTask,
    staleAfterMs: -1,
    date: now
  });
  assert.equal(value.status, 'OWNER_REVIEW_REQUIRED');
});

test('invalid pending receipt is rejected before relay read', async () => {
  let reads = 0;
  const value = await reconcilePendingRelayTask({
    relayClient: { async readTask() { reads += 1; return openTask; } },
    pendingReceipt: {},
    date: now
  });
  assert.equal(value.status, 'INVALID');
  assert.equal(reads, 0);
});

test('reconciliation performs exactly one read and no other relay action', async () => {
  const calls = [];
  const relayClient = {
    async readTask(input) { calls.push(['readTask', input]); return openTask; },
    async createTask() { calls.push(['createTask']); throw new Error('must not run'); },
    async waitForResult() { calls.push(['waitForResult']); throw new Error('must not run'); }
  };
  const value = await reconcilePendingRelayTask({ relayClient, pendingReceipt: receipt, date: now });
  assert.equal(value.status, 'PENDING');
  assert.deepEqual(calls, [['readTask', { issueNumber: 43, expectedTaskId: 'task_123' }]]);
});

test('missing relay client fails closed', async () => {
  const value = await reconcilePendingRelayTask({ pendingReceipt: receipt, date: now });
  assert.equal(value.status, 'INVALID');
  assert.equal(value.retryAuthorized, false);
});
