// Issue #85's invariant is not "the selector orders fairly". It is: for N
// active runs and a per-cycle cap K, every still-active run receives service
// within a bounded number of cycles. Those are different claims, and the
// scheduler satisfied the first while failing the second.
//
// The scan is bounded (200 runs). It used to be taken newest-updated-first,
// and ticking a run refreshes its updatedAt -- so the served runs stayed at the
// front of the window and the runs past the cap never entered it. With 260
// active runs and five times the capacity needed, sixty of them were never
// served once. Ordering *within* a window cannot rescue a window that the
// starved work is not in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAutonomySession, compileTaskIntent } from '../src/agent-autonomy-loop.mjs';
import { createAutonomyRun } from '../src/agent-autonomy-pump.mjs';
import { saveAutonomyRunSnapshot, listLatestAutonomyRuns } from '../src/agent-autonomy-store.mjs';
import { tickActiveAutonomyRuns } from '../src/agent-autonomy-job.mjs';

const MAX_ACTIVE_RUN_SCAN = 200;

function fakeStore() {
  const auditLog = [];
  return {
    auditLog,
    async log(type, detail) {
      const row = {
        id: `a${auditLog.length + 1}`,
        type,
        detail: structuredClone(detail),
        createdAt: detail.createdAt || new Date().toISOString()
      };
      auditLog.push(row);
      return row;
    },
    // Newest-first, and it honours `offset`. Both halves matter. `offset` is
    // part of the store contract -- `src/store.mjs` implements it on the JSON
    // path (`_listDirect`) and as SQL `OFFSET` on the Postgres path -- and a
    // fake that drops it is not a smaller store, it is a store that cannot be
    // paginated. Keeping the reversal is deliberate: the real JSON store hands
    // back insertion order, so serving pages newest-first here proves the walk
    // does not depend on an ordering no store promises.
    async list(key, options = {}) {
      let rows = [...auditLog];
      if (options.filters?.type) rows = rows.filter(row => row.type === options.filters.type);
      rows.reverse();
      if (options.offset) rows = rows.slice(options.offset);
      return rows.slice(0, options.limit || rows.length);
    }
  };
}

async function seedRuns(store, count) {
  const runIds = [];
  for (let index = 0; index < count; index += 1) {
    const date = new Date(Date.UTC(2026, 7, 22, 0, 0, index));
    const session = compileAutonomySession({ objective: `mission ${index}`, date });
    const initialIntent = compileTaskIntent({
      session,
      targetAgent: 'chatgpt',
      objective: `objective ${index}`,
      acceptanceTests: ['fairness'],
      evidenceRefs: ['evidence:fairness'],
      date
    });
    const run = createAutonomyRun({ session, initialIntent, date });
    runIds.push(run.runId);
    await saveAutonomyRunSnapshot(store, run, { date });
  }
  return runIds;
}

function pendingAdapters() {
  return {
    adapterFactory: async () => ({
      createTask: async task => ({ ok: true, issueNumber: 1, taskId: task.taskId }),
      readTask: async () => ({ ok: false, status: 'PENDING' })
    }),
    compileRelayTask: intent => ({ ok: true, ...intent })
  };
}

async function sweep(store, { cycles, limit, startMinute = 0 }) {
  const { adapterFactory, compileRelayTask } = pendingAdapters();
  const served = new Map();
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const date = new Date(Date.UTC(2026, 7, 22, 1, startMinute + cycle, 0));
    const result = await tickActiveAutonomyRuns({ store, adapterFactory, compileRelayTask, limit, date });
    for (const item of result.results || []) {
      const runId = item.run?.runId || item.runId;
      if (runId) served.set(runId, (served.get(runId) || 0) + 1);
    }
  }
  return served;
}

test('the scheduler scan is taken oldest-touched first', async () => {
  const store = fakeStore();
  const runIds = await seedRuns(store, 12);
  const scheduled = await listLatestAutonomyRuns(store, { statuses: ['ACTIVE', 'PENDING'], limit: 5, order: 'oldest' });
  assert.equal(scheduled.count, 5);
  assert.equal(scheduled.runs[0].runId, runIds[0]);

  // The default ordering other callers rely on is unchanged.
  const operatorView = await listLatestAutonomyRuns(store, { statuses: ['ACTIVE', 'PENDING'], limit: 5 });
  assert.equal(operatorView.runs[0].runId, runIds[runIds.length - 1]);
});

test('more active runs than the scan cap: every run is still served', async () => {
  const store = fakeStore();
  const runIds = await seedRuns(store, MAX_ACTIVE_RUN_SCAN + 60);
  const served = await sweep(store, { cycles: 120, limit: 5 });
  const never = runIds.filter(runId => !served.get(runId));
  assert.deepEqual(never, [], `${never.length} of ${runIds.length} active runs were never served`);
});

test('service stays within a bounded spread rather than favouring one cohort', async () => {
  const store = fakeStore();
  const runIds = await seedRuns(store, MAX_ACTIVE_RUN_SCAN + 60);
  const served = await sweep(store, { cycles: 200, limit: 5 });
  const counts = runIds.map(runId => served.get(runId) || 0);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  assert.ok(min >= 1, `a run was never served (min ${min})`);
  assert.ok(max - min <= 2, `service spread ${min}..${max} is not bounded`);
});

test('starvation resistance survives a restart of the scheduler process', async () => {
  const store = fakeStore();
  const runIds = await seedRuns(store, MAX_ACTIVE_RUN_SCAN + 60);
  // Two independent sweeps against the same durable store stand in for a
  // process restart: nothing is carried in memory between them.
  const first = await sweep(store, { cycles: 60, limit: 5, startMinute: 0 });
  const second = await sweep(store, { cycles: 60, limit: 5, startMinute: 60 });
  const never = runIds.filter(runId => !first.get(runId) && !second.get(runId));
  assert.deepEqual(never, [], `${never.length} runs were never served across the restart`);
});

test('a tie on updatedAt is broken by a stable total order, not by chance', async () => {
  const store = fakeStore();
  const runIds = [];
  const date = new Date(Date.UTC(2026, 7, 22, 0, 0, 0));
  for (let index = 0; index < 20; index += 1) {
    const session = compileAutonomySession({ objective: `tied mission ${index}`, date });
    const initialIntent = compileTaskIntent({
      session, targetAgent: 'chatgpt', objective: `tied ${index}`,
      acceptanceTests: ['fairness'], evidenceRefs: ['evidence:fairness'], date
    });
    const run = createAutonomyRun({ session, initialIntent, date });
    runIds.push(run.runId);
    await saveAutonomyRunSnapshot(store, run, { date });
  }
  const a = await listLatestAutonomyRuns(store, { statuses: ['ACTIVE', 'PENDING'], limit: 8, order: 'oldest' });
  const b = await listLatestAutonomyRuns(store, { statuses: ['ACTIVE', 'PENDING'], limit: 8, order: 'oldest' });
  assert.deepEqual(a.runs.map(run => run.runId), b.runs.map(run => run.runId));
  assert.deepEqual(a.runs.map(run => run.runId), [...runIds].sort().slice(0, 8));
});
