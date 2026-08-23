// Section 20's sequence, driven end to end against deterministic fake
// providers, with the process killed between every stage.
//
//   research trigger -> GPT says ENGINEERING_REQUIRED -> Claude implements
//   -> GPT review says REPAIR_REQUIRED -> Claude repairs -> GPT says DONE
//
// "Killed" here means the run is dropped on the floor and reloaded from the
// durable store, which is what a restart actually is from the run's point of
// view. The properties under test are the ones a green suite does not imply:
// that lineage, constraints, occurrence identity and receipts survive the
// restart, and that no stage acquires business-effect authority on the way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileScheduledAutonomyRun } from '../src/agent-autonomy-scheduled-run.mjs';
import { advanceAutonomyRun } from '../src/agent-autonomy-pump.mjs';
import { saveAutonomyRunSnapshot, loadLatestAutonomyRun } from '../src/agent-autonomy-store.mjs';
import { ZERO_EFFECTS } from '../src/cloud-agent-relay.mjs';

function durableStore() {
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
    async list(key, options = {}) {
      let rows = [...auditLog];
      if (options.filters?.type) rows = rows.filter(row => row.type === options.filters.type);
      return structuredClone(rows.slice(0, options.limit || rows.length));
    }
  };
}

/** A worker result that satisfies the canonical contract for a non-terminal stage. */
function stageResult({ action, objective, outcome, constraints = [] }) {
  return {
    outcome,
    changedArtifacts: [],
    testsActuallyRun: [{ command: 'fixture', status: 'PASS' }],
    truthTable: [{ claim: outcome, status: 'VERIFIED_BY_FIXTURE' }],
    externalEffectLedger: { ...ZERO_EFFECTS },
    decision: 'CONTINUE',
    coordination: {
      action,
      objective,
      evidenceRefs: ['evidence:stage'],
      acceptanceTests: ['stage acceptance'],
      requiredOutputs: ['outcome', 'coordination', 'evidenceRefs'],
      constraints,
      tokenBudget: 50_000
    },
    evidenceRefs: ['evidence:stage']
  };
}

function doneResult() {
  return {
    outcome: 'repair verified by review',
    changedArtifacts: [{ path: 'src/thing.mjs' }],
    testsActuallyRun: [{ command: 'npm test', status: 'PASS' }],
    truthTable: [{ claim: 'repair verified by review', status: 'VERIFIED_BY_FIXTURE' }],
    externalEffectLedger: { ...ZERO_EFFECTS },
    decision: 'DONE',
    coordination: { action: 'DONE', summary: 'complete', objective: 'complete' },
    evidenceRefs: ['evidence:final']
  };
}

const SEQUENCE = [
  stageResult({ action: 'ENGINEERING_REQUIRED', objective: 'Implement the bounded change', outcome: 'research supports building it', constraints: ['research-scope-only'] }),
  stageResult({ action: 'REVIEW_REQUIRED', objective: 'Review the bounded change', outcome: 'implementation artifact produced' }),
  stageResult({ action: 'REPAIR_REQUIRED', objective: 'Repair what review found', outcome: 'review found a defect' }),
  stageResult({ action: 'REVIEW_REQUIRED', objective: 'Re-review the repair', outcome: 'repair produced' }),
  doneResult()
];

function scheduledRun(occurrenceKey) {
  return compileScheduledAutonomyRun({
    occurrenceKey,
    session: { objective: 'Prove the cognitive loop survives being killed', maxRounds: 12, maxTasks: 12 },
    initialIntent: {
      originAgent: 'uberbond',
      targetAgent: 'chatgpt',
      objective: 'Research a bounded opportunity',
      acceptanceTests: ['research acceptance'],
      evidenceRefs: ['evidence:trigger'],
      constraints: ['no-customer-contact']
    }
  });
}

/**
 * Drive the loop, reloading the run from the durable store before every single
 * advance. Nothing is carried in memory across a stage.
 */
async function driveWithRestarts(store, runId, { stopAfter = Infinity } = {}) {
  const compileRelayTask = intent => ({ ok: true, ...intent });
  const transitions = [];
  let issue = 500;

  for (let step = 0; step < 40 && step < stopAfter; step += 1) {
    const loaded = await loadLatestAutonomyRun(store, runId);
    assert.equal(loaded.ok, true, 'run must be reloadable from the durable store');
    const run = loaded.run;
    if (run.phase === 'TERMINAL') break;

    // The stage comes from the run's own durable state, not a local counter.
    // A restarted process has no counter, and replaying stage zero would make
    // the loop repeat itself -- which the cycle detector would (correctly)
    // catch, but that is a different test.
    const pending = run.phase === 'AWAITING_RESULT';
    const stage = run.session.roundsCompleted;
    const result = pending ? SEQUENCE[Math.min(stage, SEQUENCE.length - 1)] : null;
    const adapterFactory = async () => ({
      createTask: async task => ({ ok: true, issueNumber: (issue += 1), taskId: task.taskId }),
      readTask: async () => ({ ok: true, status: 'RESULT_RECEIVED', resultStatus: 'COMPLETED', result })
    });

    const advanced = await advanceAutonomyRun({ run, adapterFactory, compileRelayTask });
    assert.equal(advanced.run.businessEffectAuthority ?? 'NONE', 'NONE');
    await saveAutonomyRunSnapshot(store, advanced.run, { reason: 'restart-tick' });
    transitions.push(advanced.transition);
    if (advanced.transition === 'TERMINAL' || advanced.transition === 'FAILED') break;
  }
  return transitions;
}

test('the full research -> build -> review -> repair -> done loop completes across restarts', async () => {
  const store = durableStore();
  const scheduled = scheduledRun('mission/nightly#2026-08-23T00:00:00Z');
  assert.equal(scheduled.ok, true);
  await saveAutonomyRunSnapshot(store, scheduled.run, { reason: 'created' });

  const transitions = await driveWithRestarts(store, scheduled.run.runId);
  assert.equal(transitions.at(-1), 'TERMINAL');

  const final = await loadLatestAutonomyRun(store, scheduled.run.runId);
  assert.equal(final.run.status, 'COMPLETED');
  assert.equal(final.run.phase, 'TERMINAL');

  // Every stage of the conversation is in the durable history, in order.
  const actions = final.run.session.history.filter(item => item.event === 'AGENT_RESULT').map(item => item.action);
  assert.deepEqual(actions, ['ENGINEERING_REQUIRED', 'REVIEW_REQUIRED', 'REPAIR_REQUIRED', 'REVIEW_REQUIRED', 'DONE']);

  // The agents alternated rather than one of them talking to itself.
  const agents = final.run.session.history.filter(item => item.event === 'AGENT_RESULT').map(item => item.agent);
  assert.deepEqual(agents, ['chatgpt', 'claude-code', 'chatgpt', 'claude-code', 'chatgpt']);
});

test('a constraint set at the trigger survives every stage of the loop', async () => {
  const store = durableStore();
  const scheduled = scheduledRun('mission/nightly#2026-08-23T01:00:00Z');
  await saveAutonomyRunSnapshot(store, scheduled.run, { reason: 'created' });
  await driveWithRestarts(store, scheduled.run.runId);

  const final = await loadLatestAutonomyRun(store, scheduled.run.runId);
  const registered = final.run.session.history.filter(item => item.event === 'TASK_CREATED');
  assert.ok(registered.length >= 4, `expected at least four created tasks, got ${registered.length}`);
  for (const item of registered) {
    assert.ok(item.constraints.includes('no-customer-contact'), 'the trigger constraint was dropped');
    assert.ok(item.constraints.includes('local-preparation-only'));
    assert.ok(item.constraints.includes('no-business-external-effects'));
    assert.equal(item.consequenceClass, 'LOCAL_PREPARATION');
  }
  // A constraint a mid-loop stage added is also carried forward.
  const afterResearch = registered.slice(1);
  for (const item of afterResearch) assert.ok(item.constraints.includes('research-scope-only'));
});

test('the same occurrence retried keeps one identity; the next occurrence gets another', () => {
  const key = 'mission/nightly#2026-08-23T02:00:00Z';
  const first = scheduledRun(key);
  const retry = scheduledRun(key);
  const next = scheduledRun('mission/nightly#2026-08-23T03:00:00Z');

  assert.equal(first.run.runId, retry.run.runId);
  assert.equal(first.session.sessionId, retry.session.sessionId);
  assert.equal(first.initialIntent.taskId, retry.initialIntent.taskId);

  assert.notEqual(first.run.runId, next.run.runId);
  assert.notEqual(first.session.sessionId, next.session.sessionId);
  // Same logical mission across both occurrences.
  assert.equal(first.missionKey, next.missionKey);
});

test('a killed run resumes from the durable snapshot rather than starting over', async () => {
  const store = durableStore();
  const scheduled = scheduledRun('mission/nightly#2026-08-23T04:00:00Z');
  await saveAutonomyRunSnapshot(store, scheduled.run, { reason: 'created' });

  // Die three transitions in.
  await driveWithRestarts(store, scheduled.run.runId, { stopAfter: 3 });
  const midway = await loadLatestAutonomyRun(store, scheduled.run.runId);
  assert.notEqual(midway.run.phase, 'TERMINAL');
  const roundsBefore = midway.run.session.roundsCompleted;
  assert.ok(roundsBefore > 0);

  // Resume in what is, as far as the run can tell, a brand new process.
  await driveWithRestarts(store, scheduled.run.runId);
  const final = await loadLatestAutonomyRun(store, scheduled.run.runId);
  assert.equal(final.run.status, 'COMPLETED');
  assert.ok(final.run.session.roundsCompleted > roundsBefore, 'the run restarted from zero instead of resuming');
  assert.equal(final.run.session.roundsCompleted, 5);
});

test('no stage of the loop ever acquires business-effect authority', async () => {
  const store = durableStore();
  const scheduled = scheduledRun('mission/nightly#2026-08-23T05:00:00Z');
  await saveAutonomyRunSnapshot(store, scheduled.run, { reason: 'created' });
  await driveWithRestarts(store, scheduled.run.runId);

  const snapshots = store.auditLog.filter(row => row.type === 'agent_autonomy_run_snapshot');
  assert.ok(snapshots.length >= 5);
  for (const row of snapshots) {
    const ledger = row.detail.run?.session?.businessEffectLedger || row.detail.run?.externalEffectLedger;
    if (ledger) {
      for (const value of Object.values(ledger)) assert.equal(Number(value), 0);
    }
    assert.notEqual(row.detail.run?.currentIntent?.consequenceClass, 'EXTERNAL_EFFECT');
  }
});

test('a thin DONE at the final stage fails the run instead of completing it', async () => {
  const store = durableStore();
  const scheduled = scheduledRun('mission/nightly#2026-08-23T06:00:00Z');
  await saveAutonomyRunSnapshot(store, scheduled.run, { reason: 'created' });

  const compileRelayTask = intent => ({ ok: true, ...intent });
  const loaded = await loadLatestAutonomyRun(store, scheduled.run.runId);
  const adapterFactory = async () => ({
    createTask: async task => ({ ok: true, issueNumber: 900, taskId: task.taskId }),
    readTask: async () => ({
      ok: true, status: 'RESULT_RECEIVED', resultStatus: 'COMPLETED',
      result: { coordination: { action: 'DONE' } }
    })
  });
  const dispatched = await advanceAutonomyRun({ run: loaded.run, adapterFactory, compileRelayTask });
  const consumed = await advanceAutonomyRun({ run: dispatched.run, adapterFactory, compileRelayTask });

  assert.equal(consumed.ok, false);
  assert.equal(consumed.run.status, 'FAILED');
  assert.ok(consumed.reasonCodes.includes('terminal-result-truth-table-required'));
});
