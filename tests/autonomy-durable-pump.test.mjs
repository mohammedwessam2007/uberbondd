import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAutonomySession, compileTaskIntent } from '../src/agent-autonomy-loop.mjs';
import { createAutonomyRun, advanceAutonomyRun } from '../src/agent-autonomy-pump.mjs';
import {
  saveAutonomyRunSnapshot,
  loadLatestAutonomyRun,
  listLatestAutonomyRuns,
  logAutonomyExecutionReceipt
} from '../src/agent-autonomy-store.mjs';

const ZERO = {
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  businessSpendCents: 0
};

const ZERO_EXTERNAL = {
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
};

function completeWorkerResult({ outcome = 'supported', coordination, overrides = {} } = {}) {
  return {
    outcome,
    changedArtifacts: [],
    testsActuallyRun: [{ command: 'deterministic-fixture', status: 'PASS' }],
    truthTable: [{ claim: outcome, status: 'VERIFIED_BY_FIXTURE' }],
    externalEffectLedger: { ...ZERO_EXTERNAL },
    decision: coordination?.action === 'DONE' ? 'DONE' : 'CONTINUE',
    coordination,
    businessEffectLedger: { ...ZERO },
    ...overrides
  };
}

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
  const session = compileAutonomySession({ objective: 'Research build review without founder', maxRounds: 6, maxTasks: 6 });
  const initialIntent = compileTaskIntent({
    session,
    originAgent: 'uberbond',
    targetAgent: 'chatgpt',
    objective: 'Research the bounded opportunity',
    acceptanceTests: ['evidence gate']
  });
  return { session, initialIntent, run: createAutonomyRun({ session, initialIntent }) };
}

test('durable store saves and reloads latest immutable run snapshot', async () => {
  const store = fakeStore();
  const { run } = fixture();
  await saveAutonomyRunSnapshot(store, run, { date: new Date('2026-08-20T01:00:00Z') });
  const newer = { ...run, status: 'PENDING', sequence: 1, updatedAt: '2026-08-20T01:01:00Z' };
  await saveAutonomyRunSnapshot(store, newer, { date: new Date('2026-08-20T01:01:00Z') });
  const loaded = await loadLatestAutonomyRun(store, run.runId);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.run.status, 'PENDING');
  assert.equal(loaded.run.sequence, 1);
});

test('latest-run listing deduplicates historical snapshots', async () => {
  const store = fakeStore();
  const { run } = fixture();
  await saveAutonomyRunSnapshot(store, run, { date: new Date('2026-08-20T01:00:00Z') });
  await saveAutonomyRunSnapshot(store, { ...run, sequence: (run.sequence || 0) + 1, status: 'PENDING', updatedAt: '2026-08-20T01:01:00Z' }, { date: new Date('2026-08-20T01:01:00Z') });
  const listed = await listLatestAutonomyRuns(store);
  assert.equal(listed.count, 1);
  assert.equal(listed.runs[0].status, 'PENDING');
});

test('execution receipt requires task identity', async () => {
  const store = fakeStore();
  assert.equal((await logAutonomyExecutionReceipt(store, { runId: 'r' })).ok, false);
  assert.equal((await logAutonomyExecutionReceipt(store, { runId: 'r', taskId: 't' })).ok, true);
});

test('pump dispatches exactly once then waits without blocking', async () => {
  const { run } = fixture();
  let creates = 0;
  const adapterFactory = async () => ({
    createTask: async task => { creates += 1; return { ok: true, issueNumber: 77, taskId: task.taskId }; },
    readTask: async () => ({ ok: false, status: 'PENDING' })
  });
  const compileRelayTask = intent => ({ ok: true, ...intent });
  const dispatched = await advanceAutonomyRun({ run, adapterFactory, compileRelayTask });
  assert.equal(dispatched.transition, 'DISPATCHED');
  assert.equal(dispatched.run.phase, 'AWAITING_RESULT');
  assert.equal(creates, 1);
  const pending = await advanceAutonomyRun({ run: dispatched.run, adapterFactory, compileRelayTask });
  assert.equal(pending.transition, 'RESULT_PENDING');
  assert.equal(creates, 1);
});

test('pump advances GPT result to Claude follow-up on later tick', async () => {
  const { run } = fixture();
  const compileRelayTask = intent => ({ ok: true, ...intent });
  let phase = 0;
  const adapterFactory = async ({ targetAgent }) => ({
    createTask: async task => ({ ok: true, issueNumber: targetAgent === 'chatgpt' ? 10 : 11, taskId: task.taskId }),
    readTask: async () => {
      phase += 1;
      return phase === 1
        ? { ok: true, status: 'RESULT_RECEIVED', resultStatus: 'COMPLETED', result: completeWorkerResult({ coordination: { action: 'ENGINEERING_REQUIRED', objective: 'build it', acceptanceTests: ['tests'] } }) }
        : { ok: false, status: 'PENDING' };
    }
  });
  const sent = await advanceAutonomyRun({ run, adapterFactory, compileRelayTask });
  const consumed = await advanceAutonomyRun({ run: sent.run, adapterFactory, compileRelayTask });
  assert.equal(consumed.transition, 'FOLLOWUP_READY');
  assert.equal(consumed.run.currentIntent.targetAgent, 'claude-code');
  const claudeSent = await advanceAutonomyRun({ run: consumed.run, adapterFactory, compileRelayTask });
  assert.equal(claudeSent.transition, 'DISPATCHED');
  assert.equal(claudeSent.run.relayRef.targetAgent, 'claude-code');
});

test('pump stops at owner boundary rather than dispatching consequence action', async () => {
  const { run } = fixture();
  const compileRelayTask = intent => ({ ok: true, ...intent });
  const adapterFactory = async () => ({
    createTask: async task => ({ ok: true, issueNumber: 12, taskId: task.taskId }),
    readTask: async () => ({ ok: true, status: 'RESULT_RECEIVED', resultStatus: 'COMPLETED', result: completeWorkerResult({ outcome: 'needs external authority', coordination: { action: 'OWNER_REVIEW_REQUIRED', summary: 'approval required' } }) })
  });
  const sent = await advanceAutonomyRun({ run, adapterFactory, compileRelayTask });
  const stopped = await advanceAutonomyRun({ run: sent.run, adapterFactory, compileRelayTask });
  assert.equal(stopped.transition, 'TERMINAL');
  assert.equal(stopped.run.status, 'OWNER_BOUNDARY');
  assert.equal(stopped.run.currentIntent, null);
});

test('terminal runs are idempotent no-ops', async () => {
  const { run } = fixture();
  const terminal = { ...run, phase: 'TERMINAL', status: 'COMPLETED', currentIntent: null };
  const result = await advanceAutonomyRun({ run: terminal, adapterFactory: async () => null, compileRelayTask: () => ({ ok: true }) });
  assert.equal(result.transition, 'NOOP_TERMINAL');
  assert.equal(result.run.runId, terminal.runId);
});

test('a run snapshot cannot move backwards, and two states at one sequence conflict', async () => {
  const store = fakeStore();
  const { run } = fixture();
  const at = new Date('2026-08-20T01:00:00Z');

  assert.equal((await saveAutonomyRunSnapshot(store, { ...run, sequence: 1 }, { date: at })).ok, true);
  assert.equal((await saveAutonomyRunSnapshot(store, { ...run, sequence: 2 }, { date: at })).ok, true);

  const rewind = await saveAutonomyRunSnapshot(store, { ...run, sequence: 1 }, { date: at });
  assert.equal(rewind.ok, false, 'a lower sequence must not rewind the run');
  assert.deepEqual(rewind.reasonCodes, ['autonomy-run-sequence-regression']);

  const replay = await saveAutonomyRunSnapshot(store, { ...run, sequence: 2 }, { date: at });
  assert.equal(replay.ok, true);
  assert.equal(replay.status, 'SNAPSHOT_ALREADY_SAVED');

  const disagree = await saveAutonomyRunSnapshot(store, { ...run, sequence: 2, status: 'BLOCKED' }, { date: at });
  assert.equal(disagree.ok, false, 'conflicting states at one sequence must not be silently appended');
  assert.deepEqual(disagree.reasonCodes, ['autonomy-run-snapshot-conflict']);

  const latest = await loadLatestAutonomyRun(store, run.runId);
  assert.equal(latest.run.sequence, 2, 'the furthest-along snapshot must remain authoritative');
});

test('the active-run listing shows the furthest-along snapshot, not the first one written', async () => {
  const store = fakeStore();
  const { run } = fixture();
  const sameInstant = new Date('2026-08-20T02:00:00Z');

  await saveAutonomyRunSnapshot(store, { ...run, sequence: 1, status: 'ACTIVE' }, { date: sameInstant });
  await saveAutonomyRunSnapshot(store, { ...run, sequence: 2, status: 'DONE' }, { date: sameInstant });

  const listed = await listLatestAutonomyRuns(store);
  assert.equal(listed.count, 1);
  assert.equal(listed.runs[0].sequence, 2, 'the later sequence must win a timestamp tie');
  assert.equal(listed.runs[0].status, 'DONE', 'a finished run must not still read as active');
});
