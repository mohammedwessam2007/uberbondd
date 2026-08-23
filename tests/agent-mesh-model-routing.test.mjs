import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgentMeshCycle } from '../src/agent-mesh-control-plane.mjs';

const NOW = new Date('2026-08-23T04:00:00.000Z');

function store() {
  const rows = new Map();
  return {
    async get(collection, id) {
      return rows.get(`${collection}:${id}`) || null;
    },
    async add(collection, row) {
      const key = `${collection}:${row.id}`;
      if (rows.has(key)) throw new Error('duplicate-row');
      rows.set(key, structuredClone(row));
      return structuredClone(row);
    },
    async list(collection, { filters = {}, limit = 2000 } = {}) {
      return [...rows.entries()]
        .filter(([key]) => key.startsWith(`${collection}:`))
        .map(([, row]) => structuredClone(row))
        .filter(row => (filters.type ? row.type === filters.type : true))
        .slice(0, limit);
    }
  };
}

function worker(workerId, provider, model) {
  return {
    budgetId: `budget-${workerId}`,
    targetAgent: 'claude-code',
    workerId,
    provider,
    model,
    costCeilingCents: 5,
    tokenCeiling: 1000,
    lockTimeoutMs: 1000,
    modelExecutor: async () => ({})
  };
}

function benchmark(provider, model, score) {
  return {
    provider,
    model,
    taskClass: 'coding',
    quality: score,
    reliability: score,
    latencyScore: score,
    economicImpact: score,
    evidenceConfidence: 0.95,
    costEfficiency: score,
    observedAt: '2026-08-23T03:59:00.000Z'
  };
}

function routingEnv(benchmarks) {
  return {
    AGENT_MODEL_ROUTE_ENABLED: 'true',
    AGENT_MODEL_ROUTE_TASK_CLASS: 'coding',
    AGENT_MODEL_ROUTE_BENCHMARKS: JSON.stringify(benchmarks)
  };
}

const noopSweep = async () => ({
  ok: true,
  status: 'IDLE',
  runsConsidered: 0,
  runsTicked: 0,
  failed: 0,
  reasonCodes: []
});

function baseArgs(overrides = {}) {
  return {
    enabled: true,
    store: store(),
    adapterFactory: () => ({}),
    compileRelayTask: () => ({}),
    workers: [worker('w1', 'openai', 'gpt-x'), worker('w2', 'anthropic', 'claude-x')],
    schedulerOccurrenceKey: 'routing-occurrence-1',
    sourceCommit: 'source-commit-1',
    autonomyRunLimit: 2,
    ingestAfterWorkers: false,
    date: NOW,
    tickRuns: noopSweep,
    ...overrides
  };
}

test('load-bearing routing executes only the selected activation-permitted worker', async () => {
  const called = [];
  const result = await runAgentMeshCycle(baseArgs({
    routingEnv: routingEnv([
      benchmark('openai', 'gpt-x', 0.65),
      benchmark('anthropic', 'claude-x', 0.95)
    ]),
    routingRandom: () => 0.9,
    workerTick: async ({ workerId }) => {
      called.push(workerId);
      return { ok: true, status: 'IDLE', taskId: null, reasonCodes: [] };
    }
  }));

  assert.equal(result.ok, true, JSON.stringify(result.reasonCodes || []));
  assert.deepEqual(called, ['w2']);
  assert.equal(result.routingStatus, 'ROUTED');
  assert.equal(result.routedWorkerId, 'w2');
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('routing disabled preserves existing all-authorized-workers execution', async () => {
  const called = [];
  const result = await runAgentMeshCycle(baseArgs({
    routingEnv: {},
    workerTick: async ({ workerId }) => {
      called.push(workerId);
      return { ok: true, status: 'IDLE', taskId: null, reasonCodes: [] };
    }
  }));

  assert.equal(result.ok, true);
  assert.deepEqual(called, ['w1', 'w2']);
  assert.equal(result.routingStatus, 'DISABLED');
});

test('malformed routing evidence blocks before sweep and worker execution', async () => {
  let sweeps = 0;
  let workers = 0;
  const result = await runAgentMeshCycle(baseArgs({
    routingEnv: {
      AGENT_MODEL_ROUTE_ENABLED: 'true',
      AGENT_MODEL_ROUTE_BENCHMARKS: '{broken'
    },
    tickRuns: async () => {
      sweeps += 1;
      return noopSweep();
    },
    workerTick: async () => {
      workers += 1;
      return { ok: true, status: 'IDLE' };
    }
  }));

  assert.equal(result.ok, false);
  assert.equal(result.status, 'BLOCKED');
  assert.deepEqual(result.reasonCodes, ['routing-benchmarks-invalid-json']);
  assert.equal(sweeps, 0);
  assert.equal(workers, 0);
});

test('same occurrence cannot silently switch routed model when benchmark evidence changes', async () => {
  const durableStore = store();
  const called = [];
  const common = baseArgs({
    store: durableStore,
    workerTick: async ({ workerId }) => {
      called.push(workerId);
      return { ok: true, status: 'IDLE', taskId: null, reasonCodes: [] };
    },
    routingRandom: () => 0.9
  });

  const first = await runAgentMeshCycle({
    ...common,
    routingEnv: routingEnv([
      benchmark('openai', 'gpt-x', 0.95),
      benchmark('anthropic', 'claude-x', 0.6)
    ])
  });
  assert.equal(first.ok, true, JSON.stringify(first.reasonCodes || []));
  assert.deepEqual(called, ['w1']);

  const retry = await runAgentMeshCycle({
    ...common,
    routingEnv: routingEnv([
      benchmark('openai', 'gpt-x', 0.6),
      benchmark('anthropic', 'claude-x', 0.95)
    ])
  });
  assert.equal(retry.ok, false);
  assert.equal(retry.status, 'BLOCKED');
  assert.deepEqual(retry.reasonCodes, ['scheduler-occurrence-identity-conflict']);
  assert.equal(retry.duplicateDelivery, true);
  assert.deepEqual(called, ['w1']);
});

test('benchmark evidence for a worker omitted by activation cannot reach workerTick', async () => {
  const called = [];
  const result = await runAgentMeshCycle(baseArgs({
    workers: [worker('w1', 'openai', 'gpt-x')],
    routingEnv: routingEnv([
      benchmark('openai', 'gpt-x', 0.7),
      benchmark('anthropic', 'claude-x', 1)
    ]),
    routingRandom: () => 0.9,
    workerTick: async ({ workerId }) => {
      called.push(workerId);
      return { ok: true, status: 'IDLE', taskId: null, reasonCodes: [] };
    }
  }));

  assert.equal(result.ok, true, JSON.stringify(result.reasonCodes || []));
  assert.deepEqual(called, ['w1']);
  assert.equal(result.routedWorkerId, 'w1');
});
