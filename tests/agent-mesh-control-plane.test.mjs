import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgentMeshCycle } from '../src/agent-mesh-control-plane.mjs';

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

const store = {};
const adapterFactory = () => ({});
const compileRelayTask = () => ({});

test('control plane is disabled by default and performs no work', async () => {
  let sweeps = 0;
  let workerTicks = 0;
  const out = await runAgentMeshCycle({
    store,
    adapterFactory,
    compileRelayTask,
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

test('enabled cycle is finite: one initial sweep, one tick per worker, one ingest sweep', async () => {
  const order = [];
  const out = await runAgentMeshCycle({
    enabled: true,
    store,
    adapterFactory,
    compileRelayTask,
    workers: [
      worker(),
      worker({ budgetId: 'compute_test_2', targetAgent: 'claude-code', workerId: 'worker_claude_1', provider: 'anthropic', model: 'claude-test' })
    ],
    tickRuns: async () => {
      order.push('sweep');
      return { ok: true, status: 'TICKED', runsConsidered: 1, runsTicked: 1, failed: 0 };
    },
    workerTick: async input => {
      order.push(`worker:${input.targetAgent}`);
      return { ok: true, status: 'COMPLETED', taskId: `task_${input.targetAgent}` };
    }
  });
  assert.deepEqual(order, ['sweep', 'worker:chatgpt', 'worker:claude-code', 'sweep']);
  assert.equal(out.ok, true);
  assert.equal(out.status, 'ADVANCED');
  assert.equal(out.workers.length, 2);
});

test('initial autonomy sweep failure blocks all model workers', async () => {
  let workerTicks = 0;
  const out = await runAgentMeshCycle({
    enabled: true,
    store,
    adapterFactory,
    compileRelayTask,
    workers: [worker()],
    tickRuns: async () => ({ ok: false, status: 'FAILED', reasonCodes: ['store-unavailable'] }),
    workerTick: async () => { workerTicks += 1; return { ok: true, status: 'COMPLETED' }; }
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'BLOCKED');
  assert.equal(workerTicks, 0);
});

test('worker uncertainty degrades the cycle instead of pretending success', async () => {
  let sweepCount = 0;
  const out = await runAgentMeshCycle({
    enabled: true,
    store,
    adapterFactory,
    compileRelayTask,
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
    store,
    adapterFactory,
    compileRelayTask,
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
    store,
    adapterFactory,
    compileRelayTask,
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
    store,
    adapterFactory,
    compileRelayTask,
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
