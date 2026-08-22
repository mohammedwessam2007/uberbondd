import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgentMeshCycle } from '../src/agent-mesh-control-plane.mjs';

function memoryStore() {
  const rows = new Map();
  return {
    rows,
    async get(key, id) {
      return key === 'auditLog' ? structuredClone(rows.get(id) || null) : null;
    },
    async add(key, item) {
      assert.equal(key, 'auditLog');
      if (rows.has(item.id)) throw new Error(`duplicate:${item.id}`);
      rows.set(item.id, structuredClone(item));
      return structuredClone(item);
    }
  };
}

function worker(overrides = {}) {
  return {
    budgetId: 'budget-1',
    targetAgent: 'chatgpt',
    workerId: 'worker-1',
    provider: 'openai',
    model: 'gpt-test',
    costCeilingCents: 10,
    tokenCeiling: 1000,
    lockTimeoutMs: 5000,
    modelExecutor: async () => ({ ok: true }),
    ...overrides
  };
}

const adapterFactory = () => ({});
const compileRelayTask = () => ({});
const idleSweep = async () => ({ ok: true, status: 'IDLE', runsConsidered: 0, runsTicked: 0, failed: 0 });
const idleWorker = async () => ({ ok: true, status: 'IDLE' });

function run(store, overrides = {}) {
  return runAgentMeshCycle({
    enabled: true,
    store,
    adapterFactory,
    compileRelayTask,
    schedulerOccurrenceKey: 'immutable-hour-1',
    sourceCommit: 'commit-a',
    workers: [worker()],
    autonomyRunLimit: 5,
    ingestAfterWorkers: true,
    tickRuns: idleSweep,
    workerTick: idleWorker,
    ...overrides
  });
}

test('completed occurrence rejects source-code drift before any repeated work', async () => {
  const store = memoryStore();
  const first = await run(store);
  assert.equal(first.ok, true);

  let sweeps = 0;
  let workers = 0;
  const replay = await run(store, {
    sourceCommit: 'commit-b',
    tickRuns: async () => { sweeps += 1; return idleSweep(); },
    workerTick: async () => { workers += 1; return idleWorker(); }
  });

  assert.equal(replay.ok, false);
  assert.ok(replay.reasonCodes.includes('scheduler-occurrence-identity-conflict'));
  assert.equal(replay.duplicateDelivery, true);
  assert.equal(sweeps, 0);
  assert.equal(workers, 0);
});

test('completed occurrence rejects worker budget or model drift instead of replaying stale truth', async () => {
  const store = memoryStore();
  await run(store);

  for (const changedWorker of [
    worker({ model: 'different-model' }),
    worker({ costCeilingCents: 999 }),
    worker({ tokenCeiling: 9999 }),
    worker({ lockTimeoutMs: 99999 }),
    worker({ budgetId: 'different-budget' })
  ]) {
    const replay = await run(store, { workers: [changedWorker] });
    assert.equal(replay.ok, false);
    assert.ok(replay.reasonCodes.includes('scheduler-occurrence-identity-conflict'));
  }
});

test('completed occurrence rejects cycle-control drift', async () => {
  const store = memoryStore();
  await run(store);

  const changedLimit = await run(store, { autonomyRunLimit: 3 });
  assert.equal(changedLimit.ok, false);
  assert.ok(changedLimit.reasonCodes.includes('scheduler-occurrence-identity-conflict'));

  const changedIngest = await run(store, { ingestAfterWorkers: false });
  assert.equal(changedIngest.ok, false);
  assert.ok(changedIngest.reasonCodes.includes('scheduler-occurrence-identity-conflict'));
});

test('exact same occurrence identity remains read-only idempotent', async () => {
  const store = memoryStore();
  let sweeps = 0;
  let workers = 0;
  const options = {
    tickRuns: async () => { sweeps += 1; return idleSweep(); },
    workerTick: async () => { workers += 1; return idleWorker(); }
  };

  const first = await run(store, options);
  const second = await run(store, options);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.duplicateDelivery, true);
  assert.equal(sweeps, 2);
  assert.equal(workers, 1);
});
