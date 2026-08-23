// Section 56: push thousands of events through the durable spine and look for
// the four things that only show up at volume -- lost work, duplicate work,
// state resurrection, and unbounded growth.
//
// Counts are chosen to stay inside a normal deterministic run while still
// being large enough that an off-by-one in identity or dedupe shows up as a
// mismatch rather than as luck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileScheduledAutonomyRun } from '../src/agent-autonomy-scheduled-run.mjs';
import { saveAutonomyRunSnapshot, loadLatestAutonomyRun, listLatestAutonomyRuns } from '../src/agent-autonomy-store.mjs';
import { advanceAutonomyRun } from '../src/agent-autonomy-pump.mjs';
import {
  beginAgentMeshCycleReceipt,
  finishAgentMeshCycleReceipt,
  listTerminalAgentMeshCycleReceipts
} from '../src/agent-mesh-cycle-receipts.mjs';
import { ZERO_EFFECTS } from '../src/cloud-agent-relay.mjs';

function durableStore() {
  const rows = new Map();
  const order = [];
  return {
    rows,
    order,
    async get(key, id) { return structuredClone(rows.get(id) || null); },
    async add(key, item) {
      if (rows.has(item.id)) throw new Error(`duplicate:${item.id}`);
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
    // Newest-first, like a real store's bounded read. Returning the oldest N
    // instead is not a hypothetical: it is what makes a bounded scan hide the
    // rows that matter, and the saturation test below depends on the realistic
    // ordering to prove the guard fires for the right reason.
    async list(key, options = {}) {
      if (key === 'jobs') return [];
      let out = order.map(id => rows.get(id)).filter(Boolean);
      if (options.filters?.type) out = out.filter(row => row.type === options.filters.type);
      out = out.reverse();
      return structuredClone(out.slice(0, options.limit || out.length));
    }
  };
}

test('800 scheduler occurrences, every fifth delivered three times, produce exactly 800 terminal receipts', async () => {
  const store = durableStore();
  const OCCURRENCES = 800;
  let refusedAsDuplicate = 0;

  for (let index = 0; index < OCCURRENCES; index += 1) {
    const occurrenceKey = `mission/soak#${String(index).padStart(6, '0')}`;
    const startedAt = new Date(Date.UTC(2026, 7, 1) + index * 60_000);
    const deliveries = index % 5 === 0 ? 3 : 1;
    for (let delivery = 0; delivery < deliveries; delivery += 1) {
      const begun = await beginAgentMeshCycleReceipt({
        store, occurrenceKey, startedAt, sourceCommit: 'soak123', policyVersions: ['p1']
      });
      if (begun.duplicate) { refusedAsDuplicate += 1; continue; }
      await finishAgentMeshCycleReceipt({
        store, cycleId: begun.cycleId, finishedAt: new Date(startedAt.getTime() + 30_000),
        sourceCommit: 'soak123', policyVersions: ['p1'], status: 'ADVANCED'
      });
    }
  }

  const terminal = await listTerminalAgentMeshCycleReceipts({ store, limit: 20_000 });
  assert.equal(terminal.length, OCCURRENCES, 'one occurrence must mean exactly one terminal receipt');
  assert.equal(new Set(terminal.map(receipt => receipt.cycleId)).size, OCCURRENCES, 'cycle ids collided');
  // Every fifth occurrence was delivered twice more, and both extra deliveries
  // must have been refused rather than executed.
  assert.equal(refusedAsDuplicate, Math.ceil(OCCURRENCES / 5) * 2);
  for (const receipt of terminal) {
    assert.equal(receipt.businessEffectAuthority, 'NONE');
    for (const value of Object.values(receipt.externalEffectLedger)) assert.equal(value, 0);
  }
});

test('60 autonomy runs reloaded from the store at every step all reach a terminal state', async () => {
  const store = durableStore();
  const RUNS = 60;

  function stage(action, outcome) {
    return {
      outcome,
      changedArtifacts: [],
      testsActuallyRun: [{ command: 'fixture', status: 'PASS' }],
      truthTable: [{ claim: outcome, status: 'VERIFIED_BY_FIXTURE' }],
      externalEffectLedger: { ...ZERO_EFFECTS },
      decision: action === 'DONE' ? 'DONE' : 'CONTINUE',
      coordination: action === 'DONE'
        ? { action: 'DONE', summary: outcome, objective: outcome }
        : {
            action, objective: `${outcome}-next`, evidenceRefs: ['evidence:soak'],
            acceptanceTests: ['soak acceptance'], requiredOutputs: ['outcome'],
            constraints: [], tokenBudget: 50_000
          },
      evidenceRefs: ['evidence:soak']
    };
  }
  const sequence = [stage('ENGINEERING_REQUIRED', 'built'), stage('REVIEW_REQUIRED', 'reviewed'), stage('DONE', 'done')];

  const runIds = [];
  for (let index = 0; index < RUNS; index += 1) {
    const compiled = compileScheduledAutonomyRun({
      occurrenceKey: `run/soak#${index}`,
      session: { objective: `soak mission ${index}`, maxRounds: 10, maxTasks: 10 },
      initialIntent: {
        originAgent: 'uberbond', targetAgent: 'chatgpt', objective: `objective ${index}`,
        acceptanceTests: ['soak acceptance'], evidenceRefs: ['evidence:soak'],
        constraints: ['no-customer-contact']
      }
    });
    assert.equal(compiled.ok, true);
    runIds.push(compiled.run.runId);
    await saveAutonomyRunSnapshot(store, compiled.run, { reason: 'created' });
  }
  assert.equal(new Set(runIds).size, RUNS, 'run ids collided across distinct occurrences');

  const compileRelayTask = intent => ({ ok: true, ...intent });
  for (const runId of runIds) {
    for (let step = 0; step < 12; step += 1) {
      const loaded = await loadLatestAutonomyRun(store, runId);
      assert.equal(loaded.ok, true);
      if (loaded.run.phase === 'TERMINAL') break;
      const pending = loaded.run.phase === 'AWAITING_RESULT';
      const result = pending ? sequence[Math.min(loaded.run.session.roundsCompleted, sequence.length - 1)] : null;
      const adapterFactory = async () => ({
        createTask: async task => ({ ok: true, issueNumber: 1, taskId: task.taskId }),
        readTask: async () => ({ ok: true, status: 'RESULT_RECEIVED', resultStatus: 'COMPLETED', result })
      });
      const advanced = await advanceAutonomyRun({ run: loaded.run, adapterFactory, compileRelayTask });
      await saveAutonomyRunSnapshot(store, advanced.run, { reason: 'soak' });
      if (advanced.transition === 'TERMINAL' || advanced.transition === 'FAILED') break;
    }
  }

  let completed = 0;
  for (const runId of runIds) {
    const loaded = await loadLatestAutonomyRun(store, runId);
    assert.equal(loaded.run.status, 'COMPLETED', `run ${runId} ended as ${loaded.run.status}`);
    assert.equal(loaded.run.session.roundsCompleted, 3);
    completed += 1;
  }
  assert.equal(completed, RUNS, 'work was lost');

  // No completed run may reappear in the active set: that is state
  // resurrection, and it is how a finished run gets its work redone.
  const active = await listLatestAutonomyRuns(store, { statuses: ['ACTIVE', 'PENDING'], limit: 200 });
  assert.equal(active.count, 0, `${active.count} completed runs came back as active`);
});

test('durable growth stays proportional to work done, not quadratic in it', async () => {
  async function rowsAfter(occurrences) {
    const store = durableStore();
    for (let index = 0; index < occurrences; index += 1) {
      const startedAt = new Date(Date.UTC(2026, 7, 1) + index * 60_000);
      const begun = await beginAgentMeshCycleReceipt({
        store, occurrenceKey: `growth#${index}`, startedAt, sourceCommit: 'g', policyVersions: ['p1']
      });
      await finishAgentMeshCycleReceipt({
        store, cycleId: begun.cycleId, finishedAt: new Date(startedAt.getTime() + 1000),
        sourceCommit: 'g', policyVersions: ['p1'], status: 'IDLE'
      });
    }
    return store.order.length;
  }
  const small = await rowsAfter(100);
  const large = await rowsAfter(400);
  assert.equal(small, 200, 'a cycle should cost exactly one STARTED and one TERMINAL row');
  assert.equal(large, 800);
  assert.equal(large / small, 4, 'durable growth is not linear in occurrences');
});

test('a saturated snapshot scan is reported, never answered with a stale run', async () => {
  // Every read here pulls a bounded window of audit rows and picks the newest
  // match out of it. Once that window comes back full, "no matching row" stops
  // meaning "no such run" and starts meaning "the run may be past the bound" --
  // and from inside the function those are the same observation. The soak hit
  // it for real: one run's snapshots fell outside the window, every reload
  // returned an older snapshot, and the run stopped advancing with nothing
  // anywhere saying why.
  //
  // A saturated window is driven directly rather than by writing two thousand
  // filler rows, which took the best part of a minute and proved the same
  // thing.
  const MAX_SCAN = 2000;
  const saturatedStore = {
    async log(type, detail) { return { id: 'a1', type, detail, createdAt: new Date().toISOString() }; },
    async list() {
      return Array.from({ length: MAX_SCAN }, (_, index) => ({
        id: `a${index + 1}`,
        type: 'agent_autonomy_run_snapshot',
        detail: { runId: 'some_other_run', createdAt: new Date().toISOString(), run: null },
        createdAt: new Date().toISOString()
      }));
    }
  };

  const loaded = await loadLatestAutonomyRun(saturatedStore, 'autonomy_occ_run_missing');
  assert.equal(loaded.ok, false);
  assert.equal(loaded.status, 'SCAN_SATURATED');
  assert.ok(loaded.reasonCodes.includes('autonomy-run-snapshot-scan-saturated'));
  assert.equal(loaded.run, undefined, 'a saturated scan must not hand back a run at all');
  assert.equal(loaded.scannedRows, MAX_SCAN);

  // A short window is still an ordinary not-found, not a saturation report.
  const shortStore = { ...saturatedStore, async list() { return []; } };
  const notFound = await loadLatestAutonomyRun(shortStore, 'autonomy_occ_run_missing');
  assert.equal(notFound.status, 'NOT_FOUND');
  assert.ok(notFound.reasonCodes.includes('autonomy-run-not-found'));
});

test('a write that cannot see its own history refuses rather than risking a rewind', async () => {
  const MAX_SCAN = 2000;
  const compiled = compileScheduledAutonomyRun({
    occurrenceKey: 'run/blind-write',
    session: { objective: 'blind write', maxRounds: 4, maxTasks: 4 },
    initialIntent: {
      originAgent: 'uberbond', targetAgent: 'chatgpt', objective: 'objective',
      acceptanceTests: ['acceptance'], evidenceRefs: ['evidence:blind']
    }
  });
  const saturatedStore = {
    async log(type, detail) { return { id: 'a1', type, detail, createdAt: new Date().toISOString() }; },
    async list() {
      return Array.from({ length: MAX_SCAN }, (_, index) => ({
        id: `a${index + 1}`,
        type: 'agent_autonomy_run_snapshot',
        detail: { runId: 'some_other_run', createdAt: new Date().toISOString(), run: null },
        createdAt: new Date().toISOString()
      }));
    }
  };
  const write = await saveAutonomyRunSnapshot(saturatedStore, compiled.run, { reason: 'blind-write' });
  assert.equal(write.ok, false);
  assert.ok(write.reasonCodes.includes('autonomy-run-snapshot-scan-saturated'));
});
