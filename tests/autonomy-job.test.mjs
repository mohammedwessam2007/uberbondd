import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAutonomySession, compileTaskIntent } from '../src/agent-autonomy-loop.mjs';
import { createAutonomyRun } from '../src/agent-autonomy-pump.mjs';
import { saveAutonomyRunSnapshot, loadLatestAutonomyRun } from '../src/agent-autonomy-store.mjs';
import { tickAutonomyRun, tickActiveAutonomyRuns } from '../src/agent-autonomy-job.mjs';

const ZERO = {
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  businessSpendCents: 0
};

function fakeStore() {
  const auditLog = [];
  return {
    auditLog,
    async log(type, detail) {
      const row = { id: `a${auditLog.length + 1}`, type, detail: structuredClone(detail), createdAt: detail.createdAt || new Date().toISOString() };
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

function fixture() {
  const session = compileAutonomySession({ objective: 'Research build review while founder is away', maxRounds: 6, maxTasks: 6 });
  const initialIntent = compileTaskIntent({
    session,
    originAgent: 'uberbond',
    targetAgent: 'chatgpt',
    objective: 'Research bounded opportunity',
    acceptanceTests: ['evidence check']
  });
  return { session, initialIntent, run: createAutonomyRun({ session, initialIntent }) };
}

const compileRelayTask = intent => ({ ok: true, ...intent });

test('single job tick dispatches one pending run and persists new state', async () => {
  const store = fakeStore();
  const { run } = fixture();
  await saveAutonomyRunSnapshot(store, run, { date: new Date('2026-08-20T02:00:00Z') });
  let creates = 0;
  const adapterFactory = async () => ({
    createTask: async task => { creates += 1; return { ok: true, issueNumber: 88, taskId: task.taskId }; },
    readTask: async () => ({ ok: false, status: 'PENDING' })
  });
  const tick = await tickAutonomyRun({ store, runId: run.runId, adapterFactory, compileRelayTask, date: new Date('2026-08-20T02:01:00Z') });
  assert.equal(tick.ok, true);
  assert.equal(tick.transition, 'DISPATCHED');
  assert.equal(creates, 1);
  const loaded = await loadLatestAutonomyRun(store, run.runId);
  assert.equal(loaded.run.phase, 'AWAITING_RESULT');
  assert.equal(loaded.run.relayRef.issueNumber, 88);
});

test('later job tick consumes result and prepares Claude followup durably', async () => {
  const store = fakeStore();
  const { run } = fixture();
  await saveAutonomyRunSnapshot(store, run, { date: new Date('2026-08-20T02:00:00Z') });
  let resultReady = false;
  const adapterFactory = async () => ({
    createTask: async task => ({ ok: true, issueNumber: 89, taskId: task.taskId }),
    readTask: async () => resultReady
      ? { ok: true, status: 'RESULT_RECEIVED', resultStatus: 'COMPLETED', result: {
          outcome: 'supported',
          coordination: { action: 'ENGINEERING_REQUIRED', objective: 'Build bounded implementation', acceptanceTests: ['npm test'] },
          businessEffectLedger: ZERO
        } }
      : { ok: false, status: 'PENDING' }
  });
  const first = await tickAutonomyRun({ store, runId: run.runId, adapterFactory, compileRelayTask, date: new Date('2026-08-20T02:01:00Z') });
  assert.equal(first.transition, 'DISPATCHED');
  resultReady = true;
  const second = await tickAutonomyRun({ store, runId: run.runId, adapterFactory, compileRelayTask, date: new Date('2026-08-20T02:02:00Z') });
  assert.equal(second.transition, 'FOLLOWUP_READY');
  const loaded = await loadLatestAutonomyRun(store, run.runId);
  assert.equal(loaded.run.currentIntent.targetAgent, 'claude-code');
  assert.equal(store.auditLog.filter(row => row.type === 'agent_autonomy_execution_receipt').length, 1);
});

test('active-run sweep advances each run at most once per sweep', async () => {
  const store = fakeStore();
  const a = fixture().run;
  const bFixture = fixture();
  const b = { ...bFixture.run, runId: `${bFixture.run.runId}_b`, session: { ...bFixture.run.session, sessionId: `${bFixture.run.session.sessionId}_b` }, currentIntent: { ...bFixture.run.currentIntent, sessionId: `${bFixture.run.session.sessionId}_b`, taskId: `${bFixture.run.currentIntent.taskId}_b` } };
  await saveAutonomyRunSnapshot(store, a, { date: new Date('2026-08-20T03:00:00Z') });
  await saveAutonomyRunSnapshot(store, b, { date: new Date('2026-08-20T03:00:01Z') });
  let creates = 0;
  const adapterFactory = async () => ({
    createTask: async task => { creates += 1; return { ok: true, issueNumber: 100 + creates, taskId: task.taskId }; },
    readTask: async () => ({ ok: false, status: 'PENDING' })
  });
  const result = await tickActiveAutonomyRuns({ store, adapterFactory, compileRelayTask, limit: 10, date: new Date('2026-08-20T03:01:00Z') });
  assert.equal(result.ok, true);
  assert.equal(result.runsTicked, 2);
  assert.equal(creates, 2);
});

test('terminal run is not selected by active sweep', async () => {
  const store = fakeStore();
  const { run } = fixture();
  const terminal = { ...run, status: 'COMPLETED', phase: 'TERMINAL', currentIntent: null };
  await saveAutonomyRunSnapshot(store, terminal);
  let calls = 0;
  const result = await tickActiveAutonomyRuns({
    store,
    adapterFactory: async () => { calls += 1; return {}; },
    compileRelayTask,
    limit: 5
  });
  assert.equal(result.status, 'IDLE');
  assert.equal(result.runsTicked, 0);
  assert.equal(calls, 0);
});
