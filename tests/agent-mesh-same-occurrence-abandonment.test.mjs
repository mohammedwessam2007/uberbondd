import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgentMeshCycle, AGENT_MESH_CONTROL_PLANE_POLICY_VERSION } from '../src/agent-mesh-control-plane.mjs';
import { AGENT_MODEL_ROUTING_CONFIG_POLICY_VERSION } from '../src/agent-model-routing-config.mjs';
import { beginAgentMeshCycleReceipt, getAgentMeshCycleReceipt } from '../src/agent-mesh-cycle-receipts.mjs';

const HOUR = 60 * 60 * 1000;

function memoryStore() {
  const rows = new Map();
  const order = [];
  return {
    async get(_key, id) { return structuredClone(rows.get(id) || null); },
    async add(_key, item) {
      if (rows.has(item.id)) throw new Error(`duplicate:${item.id}`);
      rows.set(item.id, structuredClone(item));
      order.push(item.id);
      return structuredClone(item);
    },
    async list(_key, options = {}) {
      let out = order.map(id => rows.get(id));
      if (options.filters?.type) out = out.filter(row => row.type === options.filters.type);
      return structuredClone(out.slice(0, options.limit || out.length));
    }
  };
}

test('same occurrence redelivery after abandonment horizon terminalizes without replay', async () => {
  const store = memoryStore();
  const occurrenceKey = 'occurrence-crashed-and-redelivered';
  const now = new Date('2026-08-24T03:30:00.000Z');
  const startedAt = new Date(now.getTime() - 3 * HOUR);
  const policyVersions = [
    AGENT_MESH_CONTROL_PLANE_POLICY_VERSION,
    AGENT_MODEL_ROUTING_CONFIG_POLICY_VERSION
  ];

  await beginAgentMeshCycleReceipt({
    store,
    occurrenceKey,
    startedAt,
    sourceCommit: null,
    policyVersions,
    workers: [],
    configuration: { autonomyRunLimit: 5, ingestAfterWorkers: true }
  });

  let sweepCalls = 0;
  let workerCalls = 0;
  const result = await runAgentMeshCycle({
    enabled: true,
    store,
    adapterFactory: () => ({}),
    compileRelayTask: () => ({}),
    workers: [],
    autonomyRunLimit: 5,
    ingestAfterWorkers: true,
    schedulerOccurrenceKey: occurrenceKey,
    sourceCommit: null,
    abandonedCycleAfterMs: HOUR,
    date: now,
    tickRuns: async () => { sweepCalls += 1; return { ok: true, status: 'IDLE', runsConsidered: 0, runsTicked: 0, failed: 0 }; },
    workerTick: async () => { workerCalls += 1; return { ok: true, status: 'IDLE' }; },
    routingEnv: {}
  });

  assert.equal(sweepCalls, 0, 'abandoned occurrence recovery must not replay autonomy work');
  assert.equal(workerCalls, 0, 'abandoned occurrence recovery must not replay worker/provider work');
  assert.equal(result.status, 'DEGRADED');
  assert.equal(result.duplicateDelivery, true);
  assert.ok(result.reasonCodes.includes('cycle-abandoned-before-terminal'));

  const durable = await getAgentMeshCycleReceipt({ store, occurrenceKey });
  assert.equal(durable.state, 'TERMINAL');
  assert.equal(durable.receipt.status, 'DEGRADED');
  assert.ok(durable.receipt.reasonCodes.includes('cycle-abandoned-before-terminal'));

  const replay = await runAgentMeshCycle({
    enabled: true,
    store,
    adapterFactory: () => ({}),
    compileRelayTask: () => ({}),
    workers: [],
    schedulerOccurrenceKey: occurrenceKey,
    sourceCommit: null,
    abandonedCycleAfterMs: HOUR,
    date: new Date(now.getTime() + 1000),
    tickRuns: async () => { throw new Error('must not replay'); },
    workerTick: async () => { throw new Error('must not replay'); },
    routingEnv: {}
  });
  assert.equal(replay.status, 'DEGRADED');
  assert.equal(replay.duplicateDelivery, true);
});

test('same occurrence inside abandonment horizon remains blocked and un-replayed', async () => {
  const store = memoryStore();
  const occurrenceKey = 'occurrence-still-running';
  const now = new Date('2026-08-24T03:30:00.000Z');
  const policyVersions = [AGENT_MESH_CONTROL_PLANE_POLICY_VERSION, AGENT_MODEL_ROUTING_CONFIG_POLICY_VERSION];
  await beginAgentMeshCycleReceipt({
    store,
    occurrenceKey,
    startedAt: new Date(now.getTime() - 5 * 60_000),
    sourceCommit: null,
    policyVersions,
    workers: [],
    configuration: { autonomyRunLimit: 5, ingestAfterWorkers: true }
  });

  const result = await runAgentMeshCycle({
    enabled: true,
    store,
    adapterFactory: () => ({}),
    compileRelayTask: () => ({}),
    workers: [],
    schedulerOccurrenceKey: occurrenceKey,
    sourceCommit: null,
    abandonedCycleAfterMs: HOUR,
    date: now,
    tickRuns: async () => { throw new Error('must not replay'); },
    workerTick: async () => { throw new Error('must not replay'); },
    routingEnv: {}
  });

  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.reasonCodes.includes('scheduler-occurrence-already-started-incomplete'));
  assert.equal((await getAgentMeshCycleReceipt({ store, occurrenceKey })).state, 'STARTED');
});
