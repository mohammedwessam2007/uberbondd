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

test('concurrent terminalizers with contradictory outcomes fail closed instead of laundering the loser', async () => {
  const store = racingDeterministicStore();
  const begun = await beginAgentMeshCycleReceipt({
    store,
    occurrenceKey: 'mesh:terminal-truth-race',
    startedAt: new Date('2026-08-22T13:00:00.000Z'),
    sourceCommit: 'abc123',
    policyVersions: ['mesh-policy-1'],
    workers: []
  });

  const common = {
    store,
    cycleId: begun.cycleId,
    finishedAt: new Date('2026-08-22T13:01:00.000Z'),
    sourceCommit: 'abc123',
    policyVersions: ['mesh-policy-1'],
    workers: []
  };
  const results = await Promise.allSettled([
    finishAgentMeshCycleReceipt({
      ...common,
      status: 'ADVANCED',
      reasonCodes: ['healthy-cycle'],
      firstSweep: { ok: true, status: 'OK', runsConsidered: 1, runsTicked: 1, failed: 0 }
    }),
    finishAgentMeshCycleReceipt({
      ...common,
      status: 'BLOCKED',
      reasonCodes: ['worker-result-invalid'],
      firstSweep: { ok: false, status: 'BLOCKED', runsConsidered: 1, runsTicked: 0, failed: 1 }
    })
  ]);

  const fulfilled = results.filter(result => result.status === 'fulfilled');
  const rejected = results.filter(result => result.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(String(rejected[0].reason?.message), /scheduler-occurrence-terminal-truth-conflict/);
  assert.equal(store.rows.size, 2);
});

test('completed occurrence cannot be replayed with rewritten terminal evidence', async () => {
  const store = racingDeterministicStore();
  const begun = await beginAgentMeshCycleReceipt({
    store,
    occurrenceKey: 'mesh:terminal-truth-replay',
    sourceCommit: 'abc123',
    policyVersions: ['mesh-policy-1'],
    workers: []
  });

  await finishAgentMeshCycleReceipt({
    store,
    cycleId: begun.cycleId,
    sourceCommit: 'abc123',
    policyVersions: ['mesh-policy-1'],
    status: 'DEGRADED',
    reasonCodes: ['provider-timeout'],
    workers: [{ targetAgent: 'claude', provider: 'anthropic', workerId: 'w1', status: 'FAILED', ok: false }]
  });

  await assert.rejects(
    finishAgentMeshCycleReceipt({
      store,
      cycleId: begun.cycleId,
      sourceCommit: 'abc123',
      policyVersions: ['mesh-policy-1'],
      status: 'ADVANCED',
      reasonCodes: ['healthy-cycle'],
      workers: [{ targetAgent: 'claude', provider: 'anthropic', workerId: 'w1', status: 'DONE', ok: true }]
    }),
    /scheduler-occurrence-terminal-truth-conflict/
  );
  assert.equal(store.rows.size, 2);
});

test('reusing one occurrence key with different source commit fails closed', async () => {
  const store = racingDeterministicStore();
  const occurrenceKey = 'mesh:immutable-source';
  await beginAgentMeshCycleReceipt({
    store,
    occurrenceKey,
    sourceCommit: 'commit-a',
    policyVersions: ['mesh-policy-1'],
    workers: []
  });

  await assert.rejects(
    beginAgentMeshCycleReceipt({
      store,
      occurrenceKey,
      sourceCommit: 'commit-b',
      policyVersions: ['mesh-policy-1'],
      workers: []
    }),
    /scheduler-occurrence-identity-conflict/
  );
  assert.equal(store.rows.size, 1);
});

test('reusing one occurrence key with different policy or worker config fails closed', async () => {
  const store = racingDeterministicStore();
  const occurrenceKey = 'mesh:immutable-config';
  const workers = [{ targetAgent: 'claude', provider: 'anthropic', model: 'opus', workerId: 'worker-1' }];
  await beginAgentMeshCycleReceipt({
    store,
    occurrenceKey,
    sourceCommit: 'commit-a',
    policyVersions: ['mesh-policy-1'],
    workers
  });

  await assert.rejects(
    beginAgentMeshCycleReceipt({
      store,
      occurrenceKey,
      sourceCommit: 'commit-a',
      policyVersions: ['mesh-policy-2'],
      workers
    }),
    /scheduler-occurrence-identity-conflict/
  );
  await assert.rejects(
    beginAgentMeshCycleReceipt({
      store,
      occurrenceKey,
      sourceCommit: 'commit-a',
      policyVersions: ['mesh-policy-1'],
      workers: [{ ...workers[0], model: 'sonnet' }]
    }),
    /scheduler-occurrence-identity-conflict/
  );
  assert.equal(store.rows.size, 1);
});

test('semantically identical unordered policies and workers remain idempotent', async () => {
  const store = racingDeterministicStore();
  const occurrenceKey = 'mesh:canonical-order';
  const first = await beginAgentMeshCycleReceipt({
    store,
    occurrenceKey,
    sourceCommit: 'commit-a',
    policyVersions: ['policy-b', 'policy-a'],
    workers: [
      { targetAgent: 'gpt', provider: 'openai', model: 'gpt-5.6', workerId: 'w2' },
      { targetAgent: 'claude', provider: 'anthropic', model: 'opus', workerId: 'w1' }
    ]
  });
  const second = await beginAgentMeshCycleReceipt({
    store,
    occurrenceKey,
    sourceCommit: 'commit-a',
    policyVersions: ['policy-a', 'policy-b'],
    workers: [
      { targetAgent: 'claude', provider: 'anthropic', model: 'opus', workerId: 'w1' },
      { targetAgent: 'gpt', provider: 'openai', model: 'gpt-5.6', workerId: 'w2' }
    ]
  });

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.deepEqual(first.receipt, second.receipt);
});

test('terminalization cannot change source or policy identity established at STARTED', async () => {
  const store = racingDeterministicStore();
  const begun = await beginAgentMeshCycleReceipt({
    store,
    occurrenceKey: 'mesh:terminal-identity',
    sourceCommit: 'commit-a',
    policyVersions: ['mesh-policy-1'],
    workers: []
  });

  await assert.rejects(
    finishAgentMeshCycleReceipt({
      store,
      cycleId: begun.cycleId,
      sourceCommit: 'commit-b',
      policyVersions: ['mesh-policy-1'],
      status: 'ADVANCED'
    }),
    /scheduler-occurrence-identity-conflict/
  );
  await assert.rejects(
    finishAgentMeshCycleReceipt({
      store,
      cycleId: begun.cycleId,
      sourceCommit: 'commit-a',
      policyVersions: ['mesh-policy-2'],
      status: 'ADVANCED'
    }),
    /scheduler-occurrence-identity-conflict/
  );
  assert.equal(store.rows.size, 1);
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
