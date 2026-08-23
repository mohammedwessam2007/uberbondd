import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginAgentMeshCycleReceipt,
  countTerminalAgentMeshCycles,
  deriveAgentMeshCycleId,
  finishAgentMeshCycleReceipt
} from '../src/agent-mesh-cycle-receipts.mjs';

function memoryStore() {
  const rows = new Map();
  return {
    rows,
    async get(key, id) {
      if (key !== 'auditLog') return null;
      return structuredClone(rows.get(id) || null);
    },
    async add(key, item) {
      assert.equal(key, 'auditLog');
      if (rows.has(item.id)) throw new Error(`duplicate:${item.id}`);
      rows.set(item.id, structuredClone(item));
      return structuredClone(item);
    }
  };
}

const start = '2026-08-23T00:00:00.000Z';
const finish = '2026-08-23T00:05:00.000Z';

test('overlong occurrence keys are rejected instead of truncating into the same cycle identity', async () => {
  const shared = 'x'.repeat(300);
  const left = `${shared}A`;
  const right = `${shared}B`;
  assert.throws(() => deriveAgentMeshCycleId(left), /scheduler-occurrence-key-too-long/);
  assert.throws(() => deriveAgentMeshCycleId(right), /scheduler-occurrence-key-too-long/);

  const store = memoryStore();
  await assert.rejects(() => beginAgentMeshCycleReceipt({ store, occurrenceKey: left, startedAt: start }), /scheduler-occurrence-key-too-long/);
  assert.equal(store.rows.size, 0);
  await assert.rejects(() => countTerminalAgentMeshCycles({ store, occurrenceKeys: [left] }), /scheduler-occurrence-key-too-long/);
});

test('distinct maximum-length occurrence keys remain valid and distinct', () => {
  const left = `${'x'.repeat(299)}A`;
  const right = `${'x'.repeat(299)}B`;
  assert.equal(left.length, 300);
  assert.equal(right.length, 300);
  assert.notEqual(deriveAgentMeshCycleId(left), deriveAgentMeshCycleId(right));
});

test('terminalization cannot rewrite the durable STARTED time', async () => {
  const store = memoryStore();
  const begun = await beginAgentMeshCycleReceipt({ store, occurrenceKey: 'time-integrity-rewrite', startedAt: start });
  await assert.rejects(() => finishAgentMeshCycleReceipt({
    store,
    cycleId: begun.cycleId,
    startedAt: '2026-08-16T00:00:00.000Z',
    finishedAt: finish,
    status: 'IDLE'
  }), /scheduler-occurrence-start-time-conflict/);
  assert.equal([...store.rows.values()].filter(row => row.type === 'agent_mesh_cycle_terminal').length, 0);
});

test('terminalization cannot finish before the durable STARTED time', async () => {
  const store = memoryStore();
  const begun = await beginAgentMeshCycleReceipt({ store, occurrenceKey: 'time-integrity-order', startedAt: start });
  await assert.rejects(() => finishAgentMeshCycleReceipt({
    store,
    cycleId: begun.cycleId,
    finishedAt: '2026-08-22T23:59:59.000Z',
    status: 'IDLE'
  }), /scheduler-occurrence-finished-before-start/);
  assert.equal([...store.rows.values()].filter(row => row.type === 'agent_mesh_cycle_terminal').length, 0);
});

test('legitimate terminal receipt preserves the durable STARTED time exactly', async () => {
  const store = memoryStore();
  const begun = await beginAgentMeshCycleReceipt({ store, occurrenceKey: 'time-integrity-good', startedAt: start });
  const ended = await finishAgentMeshCycleReceipt({
    store,
    cycleId: begun.cycleId,
    finishedAt: finish,
    status: 'ADVANCED'
  });
  assert.equal(ended.receipt.startedAt, start);
  assert.equal(ended.receipt.finishedAt, finish);
});
