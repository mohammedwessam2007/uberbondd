// Section 55: race the writers and check for exactly-once *logical effect*.
// The network call may happen twice; what must not happen twice is the
// consequence, the receipt, or the money.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  beginAgentMeshCycleReceipt,
  finishAgentMeshCycleReceipt,
  getAgentMeshCycleReceipt,
  listTerminalAgentMeshCycleReceipts,
  reconcileAbandonedAgentMeshCycles
} from '../src/agent-mesh-cycle-receipts.mjs';
import { logAutonomySchedulerSelection, selectFairAutonomyRuns } from '../src/agent-autonomy-scheduler.mjs';

/** A store whose add() is genuinely exclusive on id, like a unique index. */
function racingStore({ delayMs = 0 } = {}) {
  const rows = new Map();
  const order = [];
  return {
    rows,
    async get(key, id) {
      if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
      return structuredClone(rows.get(id) || null);
    },
    async add(key, item) {
      if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
      if (rows.has(item.id)) throw new Error(`duplicate key: ${item.id}`);
      rows.set(item.id, structuredClone(item));
      order.push(item.id);
      return structuredClone(item);
    },
    async log(type, detail) {
      const id = `a${order.length + 1}`;
      const row = { id, type, detail: structuredClone(detail), createdAt: detail.createdAt || new Date().toISOString() };
      rows.set(id, row);
      order.push(id);
      return structuredClone(row);
    },
    async list(key, options = {}) {
      let out = order.map(id => rows.get(id)).filter(Boolean);
      if (options.filters?.type) out = out.filter(row => row.type === options.filters.type);
      return structuredClone(out.slice(0, options.limit || out.length));
    }
  };
}

const START = '2026-08-23T00:00:00.000Z';
const FINISH = '2026-08-23T00:05:00.000Z';

test('concurrent starts of one occurrence produce exactly one STARTED receipt', async () => {
  const store = racingStore({ delayMs: 1 });
  const attempts = await Promise.allSettled(
    Array.from({ length: 12 }, () => beginAgentMeshCycleReceipt({
      store, occurrenceKey: 'occ/racing', startedAt: START,
      sourceCommit: 'abc1234', policyVersions: ['p1']
    }))
  );
  const fulfilled = attempts.filter(item => item.status === 'fulfilled');
  assert.equal(fulfilled.length, 12, 'every racer should resolve, as duplicate or winner');
  const winners = fulfilled.filter(item => item.value.duplicate === false);
  assert.equal(winners.length, 1, `${winners.length} racers each believed they started the cycle`);
  const started = [...store.rows.values()].filter(row => row.type === 'agent_mesh_cycle_started');
  assert.equal(started.length, 1);
});

test('concurrent terminalizations of one cycle produce exactly one terminal receipt', async () => {
  const store = racingStore({ delayMs: 1 });
  const begun = await beginAgentMeshCycleReceipt({
    store, occurrenceKey: 'occ/terminal-race', startedAt: START, sourceCommit: 'abc1234', policyVersions: ['p1']
  });
  const attempts = await Promise.allSettled(
    Array.from({ length: 10 }, () => finishAgentMeshCycleReceipt({
      store, cycleId: begun.cycleId, finishedAt: FINISH,
      sourceCommit: 'abc1234', policyVersions: ['p1'], status: 'ADVANCED'
    }))
  );
  assert.equal(attempts.filter(item => item.status === 'rejected').length, 0);
  const terminal = [...store.rows.values()].filter(row => row.type === 'agent_mesh_cycle_terminal');
  assert.equal(terminal.length, 1);
  const state = await getAgentMeshCycleReceipt({ store, occurrenceKey: 'occ/terminal-race' });
  assert.equal(state.state, 'TERMINAL');
});

test('two racers claiming different terminal truth for one cycle cannot both win', async () => {
  const store = racingStore({ delayMs: 1 });
  const begun = await beginAgentMeshCycleReceipt({
    store, occurrenceKey: 'occ/conflict', startedAt: START, sourceCommit: 'abc1234', policyVersions: ['p1']
  });
  const settled = await Promise.allSettled([
    finishAgentMeshCycleReceipt({ store, cycleId: begun.cycleId, finishedAt: FINISH, sourceCommit: 'abc1234', policyVersions: ['p1'], status: 'ADVANCED' }),
    finishAgentMeshCycleReceipt({ store, cycleId: begun.cycleId, finishedAt: FINISH, sourceCommit: 'abc1234', policyVersions: ['p1'], status: 'BLOCKED', reasonCodes: ['different-story'] })
  ]);
  const accepted = settled.filter(item => item.status === 'fulfilled');
  const refused = settled.filter(item => item.status === 'rejected');
  assert.equal(accepted.length, 1, 'both conflicting truths were accepted');
  assert.equal(refused.length, 1);
  assert.match(String(refused[0].reason?.message), /terminal-truth-conflict/);
  const terminal = [...store.rows.values()].filter(row => row.type === 'agent_mesh_cycle_terminal');
  assert.equal(terminal.length, 1);
});

test('concurrent reconciliation of one abandoned cycle records one failure, not many', async () => {
  const store = racingStore({ delayMs: 1 });
  await beginAgentMeshCycleReceipt({
    store, occurrenceKey: 'occ/abandoned', startedAt: START, sourceCommit: 'abc1234', policyVersions: ['p1']
  });
  const now = new Date('2026-08-23T06:00:00.000Z');
  await Promise.allSettled(Array.from({ length: 6 }, () =>
    reconcileAbandonedAgentMeshCycles({ store, now, abandonedAfterMs: 60 * 60 * 1000 })));
  const terminal = await listTerminalAgentMeshCycleReceipts({ store });
  const degraded = terminal.filter(receipt => receipt.reasonCodes?.includes('cycle-abandoned-before-terminal'));
  assert.equal(degraded.length, 1);
});

test('an occurrence key that differs only past the length bound cannot collide', async () => {
  const store = racingStore();
  const shared = 'o'.repeat(299);
  const left = `${shared}A`;
  const right = `${shared}B`;
  const a = await beginAgentMeshCycleReceipt({ store, occurrenceKey: left, startedAt: START, sourceCommit: 'c', policyVersions: ['p1'] });
  const b = await beginAgentMeshCycleReceipt({ store, occurrenceKey: right, startedAt: START, sourceCommit: 'c', policyVersions: ['p1'] });
  assert.notEqual(a.cycleId, b.cycleId);
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, false);

  // Past the bound it is a refusal rather than a silent truncation into a
  // shared identity.
  await assert.rejects(() => beginAgentMeshCycleReceipt({
    store, occurrenceKey: `${shared}TOOLONG`, startedAt: START, sourceCommit: 'c', policyVersions: ['p1']
  }), /scheduler-occurrence-key-too-long/);
});

test('a cycle started under one configuration cannot be terminalized under another', async () => {
  const store = racingStore();
  const begun = await beginAgentMeshCycleReceipt({
    store, occurrenceKey: 'occ/identity', startedAt: START, sourceCommit: 'abc1234', policyVersions: ['p1']
  });
  await assert.rejects(() => finishAgentMeshCycleReceipt({
    store, cycleId: begun.cycleId, finishedAt: FINISH,
    sourceCommit: 'different', policyVersions: ['p1'], status: 'ADVANCED'
  }), /scheduler-occurrence-identity-conflict/);
  assert.equal((await listTerminalAgentMeshCycleReceipts({ store })).length, 0);
});

test('concurrent scheduler selections stay deterministic and do not double-serve', async () => {
  const store = racingStore();
  const runs = Array.from({ length: 9 }, (_, index) => ({
    runId: `run_${String(index).padStart(2, '0')}`,
    session: { sessionId: `sess_${index}` }
  }));
  await Promise.all(runs.slice(0, 4).map(run =>
    logAutonomySchedulerSelection(store, run, { date: new Date('2026-08-23T00:00:00Z') })));

  const [a, b] = await Promise.all([
    selectFairAutonomyRuns(store, runs, { limit: 5 }),
    selectFairAutonomyRuns(store, runs, { limit: 5 })
  ]);
  assert.deepEqual(a.runs.map(run => run.runId), b.runs.map(run => run.runId));
  // The five never selected come first.
  assert.deepEqual(a.runs.map(run => run.runId), ['run_04', 'run_05', 'run_06', 'run_07', 'run_08']);
});
