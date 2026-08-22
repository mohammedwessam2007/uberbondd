import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAutonomySession, compileTaskIntent } from '../src/agent-autonomy-loop.mjs';
import { createAutonomyRun } from '../src/agent-autonomy-pump.mjs';
import { saveAutonomyRunSnapshot, listLatestAutonomyRuns } from '../src/agent-autonomy-store.mjs';
import { tickActiveAutonomyRuns } from '../src/agent-autonomy-job.mjs';
import { selectFairAutonomyRuns, AUTONOMY_SCHEDULER_AUDIT_TYPES } from '../src/agent-autonomy-scheduler.mjs';

function fakeStore(existingRows = []) {
  const auditLog = existingRows;
  return {
    auditLog,
    async log(type, detail) {
      const row = {
        id: `a${auditLog.length + 1}`,
        type,
        detail: structuredClone(detail),
        createdAt: detail.createdAt || detail.selectedAt || new Date().toISOString()
      };
      auditLog.push(row);
      return row;
    },
    async list(key, options = {}) {
      assert.equal(key, 'auditLog');
      let rows = [...auditLog];
      if (options.filters?.type) rows = rows.filter(row => row.type === options.filters.type);
      return rows.slice(0, options.limit || rows.length);
    }
  };
}

function runFixture(index) {
  const session = compileAutonomySession({
    objective: `Fair scheduler mission ${index}`,
    maxRounds: 20,
    maxTasks: 20
  });
  const initialIntent = compileTaskIntent({
    session,
    originAgent: 'uberbond',
    targetAgent: 'chatgpt',
    objective: `Keep mission ${index} pending long enough to test starvation`,
    acceptanceTests: ['remain bounded']
  });
  return createAutonomyRun({ session, initialIntent });
}

const compileRelayTask = intent => ({ ok: true, ...intent });

function pendingAdapterFactory() {
  let issue = 700;
  return async () => ({
    createTask: async task => ({ ok: true, issueNumber: ++issue, taskId: task.taskId }),
    readTask: async () => ({ ok: false, status: 'PENDING' })
  });
}

test('eight active runs with limit three all receive scheduler service within three cycles', async () => {
  const store = fakeStore();
  const runs = Array.from({ length: 8 }, (_, index) => runFixture(index));
  for (let index = 0; index < runs.length; index += 1) {
    await saveAutonomyRunSnapshot(store, runs[index], {
      date: new Date(`2026-08-22T04:00:${String(index).padStart(2, '0')}Z`)
    });
  }

  const adapterFactory = pendingAdapterFactory();
  const served = new Set();
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const result = await tickActiveAutonomyRuns({
      store,
      adapterFactory,
      compileRelayTask,
      limit: 3,
      date: new Date(`2026-08-22T04:0${cycle + 1}:00Z`)
    });
    assert.equal(result.ok, true);
    for (const row of store.auditLog.filter(row => row.type === AUTONOMY_SCHEDULER_AUDIT_TYPES.selection)) {
      served.add(row.detail.runId);
    }
  }

  assert.equal(served.size, 8, 'newly refreshed runs must not monopolize the bounded scheduler');
});

test('persisted scheduler selection survives restart and keeps older work ahead', async () => {
  const firstProcess = fakeStore();
  const runs = Array.from({ length: 5 }, (_, index) => runFixture(index + 20));
  for (const run of runs) await saveAutonomyRunSnapshot(firstProcess, run, { date: new Date('2026-08-22T05:00:00Z') });

  const first = await tickActiveAutonomyRuns({
    store: firstProcess,
    adapterFactory: pendingAdapterFactory(),
    compileRelayTask,
    limit: 2,
    date: new Date('2026-08-22T05:01:00Z')
  });
  const firstIds = new Set(first.results.map(result => result.runId));
  assert.equal(firstIds.size, 2);

  const persistedRows = structuredClone(firstProcess.auditLog);
  const restartedStore = fakeStore(persistedRows);
  const second = await tickActiveAutonomyRuns({
    store: restartedStore,
    adapterFactory: pendingAdapterFactory(),
    compileRelayTask,
    limit: 2,
    date: new Date('2026-08-22T05:02:00Z')
  });

  assert.equal(second.results.length, 2);
  assert.ok(second.results.every(result => !firstIds.has(result.runId)), 'restart must not reset fairness history');
});

test('fair selector is deterministic when all runs are equally unserved', async () => {
  const store = fakeStore();
  const runs = Array.from({ length: 6 }, (_, index) => runFixture(index + 40)).reverse();
  const expected = [...runs].sort((a, b) => a.runId.localeCompare(b.runId)).slice(0, 4).map(run => run.runId);

  const a = await selectFairAutonomyRuns(store, runs, { limit: 4 });
  const b = await selectFairAutonomyRuns(store, [...runs].reverse(), { limit: 4 });

  assert.deepEqual(a.runs.map(run => run.runId), expected);
  assert.deepEqual(b.runs.map(run => run.runId), expected);
});

test('served runs with identical selectedAt remain deterministic by append order', async () => {
  const store = fakeStore();
  const runs = Array.from({ length: 3 }, (_, index) => runFixture(index + 50));
  const selectedAt = '2026-08-22T05:30:00.000Z';

  for (const run of runs) {
    await store.log(AUTONOMY_SCHEDULER_AUDIT_TYPES.selection, {
      runId: run.runId,
      sessionId: run.session.sessionId,
      selectedAt
    });
  }

  const selected = await selectFairAutonomyRuns(store, [...runs].reverse(), { limit: 3 });
  assert.deepEqual(selected.runs.map(run => run.runId), runs.map(run => run.runId));
});

test('terminal runs are excluded before fairness selection', async () => {
  const store = fakeStore();
  const active = runFixture(60);
  const completedBase = runFixture(61);
  const completed = { ...completedBase, status: 'COMPLETED', phase: 'TERMINAL', currentIntent: null };
  await saveAutonomyRunSnapshot(store, active, { date: new Date('2026-08-22T06:00:00Z') });
  await saveAutonomyRunSnapshot(store, completed, { date: new Date('2026-08-22T06:00:01Z') });

  const listed = await listLatestAutonomyRuns(store, { statuses: ['ACTIVE', 'PENDING'], limit: 200 });
  const selected = await selectFairAutonomyRuns(store, listed.runs, { limit: 5 });

  assert.deepEqual(selected.runs.map(run => run.runId), [active.runId]);
});
