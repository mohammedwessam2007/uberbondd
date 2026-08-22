import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgentMeshCycle } from '../src/agent-mesh-control-plane.mjs';
import {
  getAgentMeshCycleReceipt,
  countTerminalAgentMeshCycles
} from '../src/agent-mesh-cycle-receipts.mjs';

function worker(overrides = {}) {
  return {
    budgetId: 'compute_test_1',
    targetAgent: 'chatgpt',
    workerId: 'worker_chatgpt_1',
    provider: 'openai',
    model: 'gpt-test',
    costCeilingCents: 10,
    tokenCeiling: 1000,
    modelExecutor: async () => ({ ok: true }),
    ...overrides
  };
}

function memoryStore() {
  const rows = new Map();
  return {
    rows,
    async get(key, id) { return key === 'auditLog' ? structuredClone(rows.get(id) || null) : null; },
    async add(key, item) {
      assert.equal(key, 'auditLog');
      if (rows.has(item.id)) throw new Error(`duplicate:${item.id}`);
      rows.set(item.id, structuredClone(item));
      return structuredClone(item);
    }
  };
}

const adapterFactory = () => ({});
const compileRelayTask = () => ({});
function base(key = cryptoKey()) {
  return {
    store: memoryStore(),
    adapterFactory,
    compileRelayTask,
    schedulerOccurrenceKey: key
  };
}
let keySeq = 0;
function cryptoKey() { keySeq += 1; return `test-occurrence-${keySeq}`; }

test('control plane is disabled by default and performs no work', async () => {
  let sweeps = 0;
  let workerTicks = 0;
  const out = await runAgentMeshCycle({
    ...base(),
    workers: [worker()],
    tickRuns: async () => { sweeps += 1; return { ok: true }; },
    workerTick: async () => { workerTicks += 1; return { ok: true }; }
  });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'DISABLED');
  assert.equal(sweeps, 0);
  assert.equal(workerTicks, 0);
  assert.equal(out.businessEffectAuthority, 'NONE');
});

test('enabled cycle is finite and persists one terminal receipt', async () => {
  const order = [];
  const input = base('hour-001');
  const out = await runAgentMeshCycle({
    enabled: true,
    ...input,
    workers: [
      worker(),
      worker({ budgetId: 'compute_test_2', targetAgent: 'claude-code', workerId: 'worker_claude_1', provider: 'anthropic', model: 'claude-test' })
    ],
    tickRuns: async () => {
      order.push('sweep');
      return { ok: true, status: 'TICKED', runsConsidered: 1, runsTicked: 1, failed: 0 };
    },
    workerTick: async tick => {
      order.push(`worker:${tick.targetAgent}`);
      return { ok: true, status: 'COMPLETED', taskId: `task_${tick.targetAgent}` };
    }
  });
  assert.deepEqual(order, ['sweep', 'worker:chatgpt', 'worker:claude-code', 'sweep']);
  assert.equal(out.ok, true);
  assert.equal(out.status, 'ADVANCED');
  assert.equal(out.workers.length, 2);
  assert.equal(out.cycleReceiptState, 'TERMINAL');
  const receipt = await getAgentMeshCycleReceipt({ store: input.store, occurrenceKey: 'hour-001' });
  assert.equal(receipt.state, 'TERMINAL');
  assert.equal(receipt.receipt.status, 'ADVANCED');
  assert.equal([...input.store.rows.values()].filter(row => row.type === 'agent_mesh_cycle_terminal').length, 1);
});

test('same scheduler occurrence delivered twice is read-only idempotent', async () => {
  const input = base('hour-002');
  let sweeps = 0;
  let workers = 0;
  const run = () => runAgentMeshCycle({
    enabled: true,
    ...input,
    workers: [worker()],
    tickRuns: async () => { sweeps += 1; return { ok: true, status: 'IDLE', runsConsidered: 0, runsTicked: 0, failed: 0 }; },
    workerTick: async () => { workers += 1; return { ok: true, status: 'IDLE' }; }
  });
  const first = await run();
  const second = await run();
  assert.equal(first.duplicateDelivery, false);
  assert.equal(second.duplicateDelivery, true);
  assert.equal(first.cycleId, second.cycleId);
  assert.equal(sweeps, 2);
  assert.equal(workers, 1);
  assert.equal([...input.store.rows.values()].filter(row => row.type === 'agent_mesh_cycle_terminal').length, 1);
});

test('different hourly occurrence IDs create distinct cycle receipts', async () => {
  const store = memoryStore();
  for (const schedulerOccurrenceKey of ['hour-003', 'hour-004']) {
    const out = await runAgentMeshCycle({
      enabled: true,
      store,
      adapterFactory,
      compileRelayTask,
      schedulerOccurrenceKey,
      workers: [],
      tickRuns: async () => ({ ok: true, status: 'IDLE', runsConsidered: 0, runsTicked: 0, failed: 0 }),
      workerTick: async () => ({ ok: true, status: 'IDLE' })
    });
    assert.equal(out.status, 'IDLE');
  }
  const terminal = [...store.rows.values()].filter(row => row.type === 'agent_mesh_cycle_terminal');
  assert.equal(terminal.length, 2);
  assert.notEqual(terminal[0].detail.cycleId, terminal[1].detail.cycleId);
});

test('crash after STARTED leaves inspectable incomplete occurrence and retry fails closed', async () => {
  const input = base('hour-crash');
  await assert.rejects(() => runAgentMeshCycle({
    enabled: true,
    ...input,
    workers: [],
    tickRuns: async () => { throw new Error('simulated-process-death-window'); },
    workerTick: async () => ({ ok: true, status: 'IDLE' })
  }), /simulated-process-death-window/);
  const afterCrash = await getAgentMeshCycleReceipt({ store: input.store, occurrenceKey: 'hour-crash' });
  assert.equal(afterCrash.state, 'STARTED');
  const retry = await runAgentMeshCycle({
    enabled: true,
    ...input,
    workers: [],
    tickRuns: async () => { throw new Error('must-not-run'); },
    workerTick: async () => ({ ok: true, status: 'IDLE' })
  });
  assert.equal(retry.ok, false);
  assert.equal(retry.cycleReceiptState, 'STARTED');
  assert.ok(retry.reasonCodes.includes('scheduler-occurrence-already-started-incomplete'));
});

test('receipt excludes credentials, model executor, and raw task payloads', async () => {
  const input = base('hour-secret-scan');
  const secret = 'sk-secret-value-that-must-never-persist';
  await runAgentMeshCycle({
    enabled: true,
    ...input,
    sourceCommit: 'abcdef123456',
    workers: [worker({ apiKey: secret, rawPrompt: 'private prompt body', modelExecutor: async () => ({ secret }) })],
    tickRuns: async () => ({ ok: true, status: 'IDLE', runsConsidered: 0, runsTicked: 0, failed: 0, rawTaskPayload: { secret } }),
    workerTick: async () => ({ ok: true, status: 'IDLE', rawModelOutput: secret })
  });
  const serialized = JSON.stringify([...input.store.rows.values()]);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes('private prompt body'), false);
  assert.equal(serialized.includes('rawTaskPayload'), false);
  assert.equal(serialized.includes('rawModelOutput'), false);
});

test('founder-absence proof helper counts real terminal ticks only', async () => {
  const store = memoryStore();
  for (const key of ['proof-1', 'proof-2']) {
    await runAgentMeshCycle({
      enabled: true, store, adapterFactory, compileRelayTask,
      schedulerOccurrenceKey: key,
      workers: [],
      tickRuns: async () => ({ ok: true, status: 'IDLE', runsConsidered: 0, runsTicked: 0, failed: 0 }),
      workerTick: async () => ({ ok: true, status: 'IDLE' })
    });
  }
  await assert.rejects(() => runAgentMeshCycle({
    enabled: true, store, adapterFactory, compileRelayTask,
    schedulerOccurrenceKey: 'proof-crash',
    workers: [],
    tickRuns: async () => { throw new Error('crash'); },
    workerTick: async () => ({ ok: true, status: 'IDLE' })
  }));
  assert.equal(await countTerminalAgentMeshCycles({ store, occurrenceKeys: ['proof-1', 'proof-2', 'proof-crash', 'proof-2'] }), 2);
});

test('enabled cycle fails closed without durable occurrence identity', async () => {
  let sweeps = 0;
  const input = base();
  const out = await runAgentMeshCycle({
    enabled: true,
    ...input,
    schedulerOccurrenceKey: '',
    workers: [],
    tickRuns: async () => { sweeps += 1; return { ok: true }; },
    workerTick: async () => ({ ok: true })
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('scheduler-occurrence-key-required'));
  assert.equal(sweeps, 0);
});

test('initial autonomy sweep failure blocks all model workers and persists BLOCKED terminal', async () => {
  let workerTicks = 0;
  const input = base();
  const out = await runAgentMeshCycle({
    enabled: true,
    ...input,
    workers: [worker()],
    tickRuns: async () => ({ ok: false, status: 'FAILED', reasonCodes: ['store-unavailable'] }),
    workerTick: async () => { workerTicks += 1; return { ok: true, status: 'COMPLETED' }; }
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'BLOCKED');
  assert.equal(workerTicks, 0);
  const terminal = [...input.store.rows.values()].find(row => row.type === 'agent_mesh_cycle_terminal');
  assert.equal(terminal.detail.status, 'BLOCKED');
});

test('worker uncertainty degrades the cycle instead of pretending success', async () => {
  let sweepCount = 0;
  const out = await runAgentMeshCycle({
    enabled: true,
    ...base(),
    workers: [worker()],
    tickRuns: async () => {
      sweepCount += 1;
      return { ok: true, status: 'IDLE', runsConsidered: 0, runsTicked: 0, failed: 0 };
    },
    workerTick: async () => ({ ok: false, status: 'COMPUTE_OUTCOME_UNCERTAIN', reasonCodes: ['transport-uncertain'] })
  });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'DEGRADED');
  assert.equal(sweepCount, 2);
  assert.equal(out.workers[0].status, 'COMPUTE_OUTCOME_UNCERTAIN');
});

test('worker count is hard capped rather than silently truncating an oversized fleet', async () => {
  const out = await runAgentMeshCycle({
    enabled: true,
    ...base(),
    workers: [worker(), worker(), worker(), worker(), worker()],
    tickRuns: async () => ({ ok: true, status: 'IDLE' }),
    workerTick: async () => ({ ok: true, status: 'IDLE' })
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('worker-count-exceeds-cycle-cap'));
});

test('invalid worker configuration blocks before any sweep or provider work', async () => {
  let sweeps = 0;
  let workerTicks = 0;
  const out = await runAgentMeshCycle({
    enabled: true,
    ...base(),
    workers: [worker({ modelExecutor: null })],
    tickRuns: async () => { sweeps += 1; return { ok: true, status: 'IDLE' }; },
    workerTick: async () => { workerTicks += 1; return { ok: true, status: 'IDLE' }; }
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('invalid-worker-configuration'));
  assert.equal(sweeps, 0);
  assert.equal(workerTicks, 0);
});

test('post-worker ingest can be disabled explicitly for single-sweep operation', async () => {
  let sweeps = 0;
  const out = await runAgentMeshCycle({
    enabled: true,
    ...base(),
    workers: [worker()],
    ingestAfterWorkers: false,
    tickRuns: async () => {
      sweeps += 1;
      return { ok: true, status: 'IDLE', runsConsidered: 0, runsTicked: 0, failed: 0 };
    },
    workerTick: async () => ({ ok: true, status: 'IDLE' })
  });
  assert.equal(out.ok, true);
  assert.equal(sweeps, 1);
  assert.equal(out.secondSweep, null);
});
