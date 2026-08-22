import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginAgentMeshCycleReceipt,
  finishAgentMeshCycleReceipt
} from '../src/agent-mesh-cycle-receipts.mjs';

function memoryStore() {
  const rows = [];
  return {
    rows,
    async log(type, detail) {
      const row = {
        id: `${type}:${rows.length + 1}`,
        type,
        detail: structuredClone(detail),
        createdAt: detail.finishedAt || detail.startedAt
      };
      rows.push(row);
      return structuredClone(row);
    },
    async list(_collection, options = {}) {
      const wantedType = options?.filters?.type;
      const filtered = wantedType ? rows.filter(row => row.type === wantedType) : rows;
      return structuredClone(filtered.slice(0, options?.limit || filtered.length));
    }
  };
}

const IDENTITY = {
  occurrenceKey: 'mesh:2026-08-22T20:00:00+03:00',
  sourceCommit: 'abc123',
  policyVersions: ['agent-mesh-control-plane-1.2.0'],
  workers: [],
  configuration: { autonomyRunLimit: 5, ingestAfterWorkers: true }
};

async function begin(store) {
  return beginAgentMeshCycleReceipt({
    store,
    ...IDENTITY,
    startedAt: '2026-08-22T17:00:00.000Z'
  });
}

function terminalArgs(store, cycleId, extra = {}) {
  return {
    store,
    cycleId,
    sourceCommit: IDENTITY.sourceCommit,
    policyVersions: IDENTITY.policyVersions,
    status: 'IDLE',
    firstSweep: { ok: true, status: 'IDLE', runsConsidered: 0, runsTicked: 0, failed: 0 },
    workers: [],
    secondSweep: null,
    ...extra
  };
}

test('terminal receipt cannot rewrite the durable STARTED timestamp into the past', async () => {
  const store = memoryStore();
  const started = await begin(store);

  await assert.rejects(
    finishAgentMeshCycleReceipt(terminalArgs(store, started.cycleId, {
      startedAt: '2026-08-15T17:00:00.000Z',
      finishedAt: '2026-08-22T17:00:01.000Z'
    })),
    /scheduler-occurrence-start-time-conflict/
  );

  assert.equal(store.rows.filter(row => row.type === 'agent_mesh_cycle_terminal').length, 0);
});

test('terminal receipt cannot claim completion before the persisted STARTED timestamp', async () => {
  const store = memoryStore();
  const started = await begin(store);

  await assert.rejects(
    finishAgentMeshCycleReceipt(terminalArgs(store, started.cycleId, {
      startedAt: '2026-08-22T17:00:00.000Z',
      finishedAt: '2026-08-22T16:59:59.999Z'
    })),
    /scheduler-occurrence-finished-before-start/
  );

  assert.equal(store.rows.filter(row => row.type === 'agent_mesh_cycle_terminal').length, 0);
});

test('terminal receipt persists the authoritative STARTED timestamp and a later finish', async () => {
  const store = memoryStore();
  const started = await begin(store);

  const terminal = await finishAgentMeshCycleReceipt(terminalArgs(store, started.cycleId, {
    startedAt: '2026-08-22T17:00:00.000Z',
    finishedAt: '2026-08-22T17:00:03.000Z'
  }));

  assert.equal(terminal.receipt.startedAt, '2026-08-22T17:00:00.000Z');
  assert.equal(terminal.receipt.finishedAt, '2026-08-22T17:00:03.000Z');
  assert.equal(store.rows.filter(row => row.type === 'agent_mesh_cycle_terminal').length, 1);
});
