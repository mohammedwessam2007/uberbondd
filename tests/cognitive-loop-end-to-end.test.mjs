import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAutonomySession, compileTaskIntent } from '../src/agent-autonomy-loop.mjs';
import { createAutonomyRun } from '../src/agent-autonomy-pump.mjs';
import { saveAutonomyRunSnapshot, loadLatestAutonomyRun, AUTONOMY_AUDIT_TYPES } from '../src/agent-autonomy-store.mjs';
import { tickAutonomyRun } from '../src/agent-autonomy-job.mjs';

// The whole conversation, end to end, with the process killed between every
// stage.
//
// Research -> ENGINEERING_REQUIRED -> build -> REVIEW_REQUIRED -> review says
// REPAIR_REQUIRED -> repair -> review -> DONE. Every stage is a durable tick
// against a store; between each one the in-memory run is thrown away entirely
// and the next tick reloads from persistence alone. If any stage were carrying
// state in the process rather than in the store, the reload would lose it and
// the loop would not reach a terminal state.
//
// The workers are deterministic fakes. What is under test is the coordination,
// the lineage, and the crash-resumption -- and a real provider would make all
// three non-deterministic while proving none of them.

const ZERO_BUSINESS = Object.freeze({
  messages: 0, purchases: 0, deployments: 0, credentialChanges: 0,
  dnsChanges: 0, productionMutations: 0, businessSpendCents: 0
});
const ZERO_EXTERNAL = Object.freeze({
  providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
  credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
});

/** A store that survives being handed to a brand-new "process". */
function durableStore() {
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

function canonicalResult({ action, objective, summary, acceptanceTests = ['npm run check'] }) {
  return {
    outcome: summary,
    changedArtifacts: [],
    testsActuallyRun: [{ command: 'npm run check', status: 'PASS' }],
    truthTable: [{ claim: summary, status: 'VERIFIED_BY_FIXTURE' }],
    externalEffectLedger: { ...ZERO_EXTERNAL },
    decision: action,
    coordination: { action, objective, summary, acceptanceTests, evidenceRefs: ['evidence:fixture'] },
    businessEffectLedger: { ...ZERO_BUSINESS }
  };
}

// The scripted conversation. Each entry is what the agent at that stage says.
const SCRIPT = [
  { from: 'chatgpt', action: 'ENGINEERING_REQUIRED', objective: 'Build the bounded implementation the research supports', summary: 'research supports building' },
  { from: 'claude-code', action: 'REVIEW_REQUIRED', objective: 'Review the implementation against its acceptance tests', summary: 'implementation ready for review' },
  { from: 'chatgpt', action: 'REPAIR_REQUIRED', objective: 'Repair the two defects the review found', summary: 'review found defects' },
  { from: 'claude-code', action: 'REVIEW_REQUIRED', objective: 'Re-review the repaired implementation', summary: 'repairs applied' },
  { from: 'chatgpt', action: 'DONE', objective: 'Accept the reviewed implementation', summary: 'reviewed and accepted' }
];

function fixture() {
  const session = compileAutonomySession({
    objective: 'Prove the internal GPT/Claude conversation reaches a terminal state across restarts',
    maxRounds: 12,
    maxTasks: 12
  });
  const initialIntent = compileTaskIntent({
    session,
    originAgent: 'uberbond',
    targetAgent: 'chatgpt',
    objective: 'Research whether the bounded opportunity is worth building',
    acceptanceTests: ['evidence check'],
    constraints: ['no-provider-calls', 'budget-cap-zero']
  });
  return createAutonomyRun({ session, initialIntent });
}

test('the full research/build/review/repair/review/done loop terminates across restarts', async () => {
  const store = durableStore();
  const run = fixture();
  const runId = run.runId;
  await saveAutonomyRunSnapshot(store, run, { date: new Date('2026-08-20T00:00:00Z') });

  const dispatched = [];
  let stage = 0;
  let resultReady = false;

  // A fresh adapter factory each tick: nothing may be remembered between
  // "processes" except what the store holds.
  const makeAdapterFactory = () => async () => ({
    createTask: async task => {
      dispatched.push({ targetAgent: task.targetAgent, kind: task.kind, constraints: task.constraints });
      return { ok: true, issueNumber: 100 + dispatched.length, taskId: task.taskId };
    },
    readTask: async () => {
      if (!resultReady || stage >= SCRIPT.length) return { ok: false, status: 'PENDING' };
      const step = SCRIPT[stage];
      return {
        ok: true,
        status: 'RESULT_RECEIVED',
        resultStatus: 'COMPLETED',
        result: canonicalResult(step)
      };
    }
  });

  const transitions = [];
  for (let tick = 0; tick < 40; tick += 1) {
    // The kill. Nothing from the previous tick survives except the store.
    const reloaded = await loadLatestAutonomyRun(store, runId);
    assert.equal(reloaded.ok, true, `run must be reloadable at tick ${tick}`);
    if (['COMPLETED', 'FAILED', 'BOUNDED_STOP', 'LOOP_DETECTED'].includes(reloaded.run.status)) break;

    const result = await tickAutonomyRun({
      store,
      runId,
      adapterFactory: makeAdapterFactory(),
      compileRelayTask: intent => ({ ok: true, ...intent }),
      date: new Date(Date.UTC(2026, 7, 20, 0, tick))
    });
    transitions.push(result.transition);
    if (result.transition === 'DISPATCHED') { resultReady = true; continue; }
    if (['FOLLOWUP_READY', 'TERMINAL'].includes(result.transition)) { stage += 1; resultReady = false; }
  }

  const final = await loadLatestAutonomyRun(store, runId);
  assert.equal(final.run.status, 'COMPLETED', `loop must terminate, got ${final.run.status} after ${transitions.join(',')}`);
  assert.ok(transitions.includes('TERMINAL'));

  // The conversation actually alternated between the two agents rather than
  // one of them talking to itself.
  const routed = dispatched.map(item => item.targetAgent);
  assert.deepEqual(routed, ['chatgpt', 'claude-code', 'chatgpt', 'claude-code', 'chatgpt']);
  assert.deepEqual(
    dispatched.map(item => item.kind),
    ['GENERAL', 'ENGINEERING_REQUIRED', 'REVIEW_REQUIRED', 'REPAIR_REQUIRED', 'REVIEW_REQUIRED']
  );
});

test('the parent constraints survive every hop of that loop', async () => {
  const store = durableStore();
  const run = fixture();
  await saveAutonomyRunSnapshot(store, run, { date: new Date('2026-08-20T00:00:00Z') });
  const parentConstraints = new Set(run.currentIntent.constraints);
  assert.ok(parentConstraints.has('no-provider-calls'));

  const dispatched = [];
  let stage = 0;
  let resultReady = false;
  const adapterFactory = async () => ({
    createTask: async task => { dispatched.push(task); return { ok: true, issueNumber: 200 + dispatched.length, taskId: task.taskId }; },
    readTask: async () => {
      if (!resultReady || stage >= SCRIPT.length) return { ok: false, status: 'PENDING' };
      // A worker that quietly drops the parent's constraints from its
      // follow-up. The inheritance rule is what has to catch this, not the
      // worker's good behaviour.
      return { ok: true, status: 'RESULT_RECEIVED', resultStatus: 'COMPLETED', result: canonicalResult({ ...SCRIPT[stage], constraints: [] }) };
    }
  });

  for (let tick = 0; tick < 40; tick += 1) {
    const reloaded = await loadLatestAutonomyRun(store, run.runId);
    if (['COMPLETED', 'FAILED', 'BOUNDED_STOP', 'LOOP_DETECTED'].includes(reloaded.run.status)) break;
    const result = await tickAutonomyRun({
      store, runId: run.runId, adapterFactory,
      compileRelayTask: intent => ({ ok: true, ...intent }),
      date: new Date(Date.UTC(2026, 7, 21, 0, tick))
    });
    if (result.transition === 'DISPATCHED') { resultReady = true; continue; }
    if (['FOLLOWUP_READY', 'TERMINAL'].includes(result.transition)) { stage += 1; resultReady = false; }
  }

  assert.ok(dispatched.length >= 2, 'the loop must have made at least one follow-up');
  for (const task of dispatched) {
    for (const constraint of parentConstraints) {
      assert.ok(task.constraints.includes(constraint), `${task.kind} lost parent constraint ${constraint}`);
    }
    assert.ok(task.constraints.includes('local-preparation-only'));
    assert.ok(task.constraints.includes('no-business-external-effects'));
  }
});

test('every tick leaves a durable receipt, and no consequence is claimed', async () => {
  const store = durableStore();
  const run = fixture();
  await saveAutonomyRunSnapshot(store, run, { date: new Date('2026-08-20T00:00:00Z') });
  let stage = 0;
  let resultReady = false;
  const adapterFactory = async () => ({
    createTask: async task => ({ ok: true, issueNumber: 300, taskId: task.taskId }),
    readTask: async () => resultReady && stage < SCRIPT.length
      ? { ok: true, status: 'RESULT_RECEIVED', resultStatus: 'COMPLETED', result: canonicalResult(SCRIPT[stage]) }
      : { ok: false, status: 'PENDING' }
  });
  for (let tick = 0; tick < 40; tick += 1) {
    const reloaded = await loadLatestAutonomyRun(store, run.runId);
    if (['COMPLETED', 'FAILED', 'BOUNDED_STOP', 'LOOP_DETECTED'].includes(reloaded.run.status)) break;
    const result = await tickAutonomyRun({
      store, runId: run.runId, adapterFactory,
      compileRelayTask: intent => ({ ok: true, ...intent }),
      date: new Date(Date.UTC(2026, 7, 22, 0, tick))
    });
    if (result.transition === 'DISPATCHED') { resultReady = true; continue; }
    if (['FOLLOWUP_READY', 'TERMINAL'].includes(result.transition)) { stage += 1; resultReady = false; }
  }

  const receipts = store.auditLog.filter(row => row.type === AUTONOMY_AUDIT_TYPES.receipt);
  assert.equal(receipts.length, SCRIPT.length, 'one receipt per consumed worker result');
  for (const row of receipts) {
    const ledger = row.detail.businessEffectLedger || row.detail.receipt?.businessEffectLedger || ZERO_BUSINESS;
    for (const value of Object.values(ledger)) assert.equal(value, 0, 'no tick may claim a business effect');
  }
  const snapshots = store.auditLog.filter(row => row.type === AUTONOMY_AUDIT_TYPES.snapshot);
  assert.ok(snapshots.length >= SCRIPT.length, 'each tick must persist state before the next one reads it');
});

test('replaying the same tick after a crash does not run the stage twice', async () => {
  const store = durableStore();
  const run = fixture();
  await saveAutonomyRunSnapshot(store, run, { date: new Date('2026-08-20T00:00:00Z') });
  let creates = 0;
  const adapterFactory = async () => ({
    createTask: async task => { creates += 1; return { ok: true, issueNumber: 400, taskId: task.taskId }; },
    readTask: async () => ({ ok: false, status: 'PENDING' })
  });
  const args = {
    store, runId: run.runId, adapterFactory,
    compileRelayTask: intent => ({ ok: true, ...intent }),
    date: new Date('2026-08-20T01:00:00Z')
  };
  const first = await tickAutonomyRun(args);
  assert.equal(first.transition, 'DISPATCHED');
  // The crash: the caller never learned the first tick succeeded, so it runs
  // the identical tick again against the persisted state.
  const replay = await tickAutonomyRun(args);
  assert.notEqual(replay.transition, 'DISPATCHED', 'a replay must not dispatch a second time');
  assert.equal(creates, 1, 'exactly one relay task for one occurrence');
});

test('a worker that never answers ends bounded rather than spinning', async () => {
  const store = durableStore();
  const run = fixture();
  await saveAutonomyRunSnapshot(store, run, { date: new Date('2026-08-20T00:00:00Z') });
  const adapterFactory = async () => ({
    createTask: async task => ({ ok: true, issueNumber: 500, taskId: task.taskId }),
    readTask: async () => ({ ok: false, status: 'PENDING' })
  });
  let ticks = 0;
  for (; ticks < 60; ticks += 1) {
    const reloaded = await loadLatestAutonomyRun(store, run.runId);
    if (['COMPLETED', 'FAILED', 'BOUNDED_STOP', 'LOOP_DETECTED'].includes(reloaded.run.status)) break;
    await tickAutonomyRun({
      store, runId: run.runId, adapterFactory,
      compileRelayTask: intent => ({ ok: true, ...intent }),
      date: new Date(Date.UTC(2026, 7, 23, 0, ticks))
    });
  }
  const final = await loadLatestAutonomyRun(store, run.runId);
  // It must not have completed, and it must not have burned unbounded work
  // either: a silent worker leaves the run waiting, not looping.
  assert.notEqual(final.run.status, 'COMPLETED');
  assert.ok(final.run.session.tasksCreated <= final.run.session.maxTasks);
});

test('a worker that keeps asking for the same follow-up is stopped as a loop', async () => {
  const store = durableStore();
  const run = fixture();
  await saveAutonomyRunSnapshot(store, run, { date: new Date('2026-08-20T00:00:00Z') });
  let resultReady = false;
  const repeated = { from: 'chatgpt', action: 'ENGINEERING_REQUIRED', objective: 'Build the same thing again', summary: 'same as before' };
  const adapterFactory = async () => ({
    createTask: async task => ({ ok: true, issueNumber: 600, taskId: task.taskId }),
    readTask: async () => resultReady
      ? { ok: true, status: 'RESULT_RECEIVED', resultStatus: 'COMPLETED', result: canonicalResult(repeated) }
      : { ok: false, status: 'PENDING' }
  });
  const statuses = [];
  for (let tick = 0; tick < 40; tick += 1) {
    const reloaded = await loadLatestAutonomyRun(store, run.runId);
    statuses.push(reloaded.run.status);
    if (['COMPLETED', 'FAILED', 'BOUNDED_STOP', 'LOOP_DETECTED'].includes(reloaded.run.status)) break;
    const result = await tickAutonomyRun({
      store, runId: run.runId, adapterFactory,
      compileRelayTask: intent => ({ ok: true, ...intent }),
      date: new Date(Date.UTC(2026, 7, 24, 0, tick))
    });
    if (result.transition === 'DISPATCHED') { resultReady = true; continue; }
    resultReady = false;
  }
  const final = await loadLatestAutonomyRun(store, run.runId);
  assert.ok(
    ['LOOP_DETECTED', 'BOUNDED_STOP', 'FAILED'].includes(final.run.status),
    `an endlessly repeating worker must be stopped, got ${final.run.status} via ${statuses.join(',')}`
  );
});
