import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginAgentMeshCycleReceipt,
  finishAgentMeshCycleReceipt
} from '../src/agent-mesh-cycle-receipts.mjs';

function racingDeterministicStore() {
  const rows = new Map();
  return {
    rows,
    async get(collection, id) {
      return structuredClone(rows.get(`${collection}:${id}`) || null);
    },
    async add(collection, row) {
      // Yield once so concurrent callers can both complete their pre-write
      // lookup before either reaches the deterministic insert.
      await new Promise(resolve => setImmediate(resolve));
      const key = `${collection}:${row.id}`;
      if (rows.has(key)) {
        const error = new Error(`duplicate:${row.id}`);
        error.code = 'CONFLICT';
        throw error;
      }
      rows.set(key, structuredClone(row));
      return structuredClone(row);
    }
  };
}

test('concurrent delivery of the same occurrence persists exactly one STARTED receipt', async () => {
  const store = racingDeterministicStore();
  const input = {
    store,
    occurrenceKey: 'mesh:2026-08-22T16:00:00+03:00',
    startedAt: new Date('2026-08-22T13:00:00.000Z'),
    sourceCommit: 'abc123',
    policyVersions: ['mesh-policy-1'],
    workers: []
  };

  const [first, second] = await Promise.all([
    beginAgentMeshCycleReceipt(input),
    beginAgentMeshCycleReceipt(input)
  ]);

  assert.equal(store.rows.size, 1);
  assert.deepEqual([first.duplicate, second.duplicate].sort(), [false, true]);
  assert.equal(first.cycleId, second.cycleId);
  assert.deepEqual(first.receipt, second.receipt);
});

test('concurrent terminalization persists exactly one terminal receipt and recovers the loser', async () => {
  const store = racingDeterministicStore();
  const startedAt = new Date('2026-08-22T13:00:00.000Z');
  const begun = await beginAgentMeshCycleReceipt({
    store,
    occurrenceKey: 'mesh:terminal-race',
    startedAt,
    sourceCommit: 'abc123',
    policyVersions: ['mesh-policy-1'],
    workers: []
  });

  const input = {
    store,
    cycleId: begun.cycleId,
    startedAt,
    finishedAt: new Date('2026-08-22T13:01:00.000Z'),
    sourceCommit: 'abc123',
    policyVersions: ['mesh-policy-1'],
    status: 'ADVANCED',
    firstSweep: { ok: true, status: 'OK', runsConsidered: 1, runsTicked: 1, failed: 0 },
    workers: [],
    secondSweep: null
  };

  const [first, second] = await Promise.all([
    finishAgentMeshCycleReceipt(input),
    finishAgentMeshCycleReceipt(input)
  ]);

  assert.equal(store.rows.size, 2);
  assert.deepEqual([first.duplicate, second.duplicate].sort(), [false, true]);
  assert.deepEqual(first.receipt, second.receipt);
});

test('an unrelated durable write failure is not laundered into duplicate success', async () => {
  const store = {
    async get() { return null; },
    async add() {
      const error = new Error('storage unavailable');
      error.code = 'EIO';
      throw error;
    }
  };

  await assert.rejects(
    beginAgentMeshCycleReceipt({
      store,
      occurrenceKey: 'mesh:real-write-failure',
      sourceCommit: 'abc123',
      policyVersions: ['mesh-policy-1']
    }),
    /storage unavailable/
  );
});
