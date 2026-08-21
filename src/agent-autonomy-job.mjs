import {
  loadLatestAutonomyRun,
  listLatestAutonomyRuns,
  saveAutonomyRunSnapshot,
  logAutonomyExecutionReceipt
} from './agent-autonomy-store.mjs';
import { advanceAutonomyRun } from './agent-autonomy-pump.mjs';

export const AGENT_AUTONOMY_JOB_POLICY_VERSION = 'agent-autonomy-job-1.0.0';

const ACTIVE_STATUSES = Object.freeze(['ACTIVE', 'PENDING']);
const MAX_RUNS_PER_TICK = 20;

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_AUTONOMY_JOB_POLICY_VERSION,
    status: 'FAILED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    ...extra
  };
}

function validStore(store) {
  return Boolean(store && typeof store.log === 'function' && typeof store.list === 'function');
}

export async function tickAutonomyRun({
  store,
  runId,
  adapterFactory,
  compileRelayTask,
  date = new Date()
} = {}) {
  if (!validStore(store)) return fail(['store-log-and-list-required']);
  const id = text(runId, 160);
  if (!id) return fail(['run-id-required']);
  if (typeof adapterFactory !== 'function') return fail(['adapter-factory-required']);
  if (typeof compileRelayTask !== 'function') return fail(['relay-task-compiler-required']);

  const loaded = await loadLatestAutonomyRun(store, id);
  if (!loaded.ok) return fail(loaded.reasonCodes || ['autonomy-run-load-failed'], { loadStatus: loaded.status });

  const advanced = await advanceAutonomyRun({
    run: loaded.run,
    adapterFactory,
    compileRelayTask,
    date
  });

  const resultingRun = advanced.run || loaded.run;
  if (advanced.receipt) {
    await logAutonomyExecutionReceipt(store, advanced.receipt, { date });
  }
  const snapshot = await saveAutonomyRunSnapshot(store, resultingRun, {
    reason: advanced.transition || 'tick',
    date
  });
  if (!snapshot.ok) return fail(snapshot.reasonCodes || ['autonomy-snapshot-save-failed'], { run: resultingRun });

  return {
    ok: advanced.ok !== false,
    policyVersion: AGENT_AUTONOMY_JOB_POLICY_VERSION,
    status: advanced.status,
    transition: advanced.transition,
    runId: resultingRun.runId,
    sessionId: resultingRun.session?.sessionId || null,
    phase: resultingRun.phase,
    taskId: resultingRun.currentIntent?.taskId || resultingRun.relayRef?.taskId || null,
    targetAgent: resultingRun.currentIntent?.targetAgent || resultingRun.relayRef?.targetAgent || null,
    receiptLogged: Boolean(advanced.receipt),
    snapshotAuditId: snapshot.auditId,
    reasonCodes: advanced.reasonCodes || [],
    updatedAt: resultingRun.updatedAt || timestamp(date)
  };
}

export async function tickActiveAutonomyRuns({
  store,
  adapterFactory,
  compileRelayTask,
  limit = 5,
  date = new Date()
} = {}) {
  if (!validStore(store)) return fail(['store-log-and-list-required']);
  if (typeof adapterFactory !== 'function') return fail(['adapter-factory-required']);
  if (typeof compileRelayTask !== 'function') return fail(['relay-task-compiler-required']);
  const boundedLimit = Number.isInteger(Number(limit))
    ? Math.max(1, Math.min(MAX_RUNS_PER_TICK, Number(limit)))
    : 5;

  const listed = await listLatestAutonomyRuns(store, { statuses: ACTIVE_STATUSES, limit: boundedLimit });
  if (!listed.ok) return fail(listed.reasonCodes || ['autonomy-run-list-failed']);

  const results = [];
  for (const run of listed.runs.slice(0, boundedLimit)) {
    const result = await tickAutonomyRun({
      store,
      runId: run.runId,
      adapterFactory,
      compileRelayTask,
      date
    });
    results.push(result);
  }

  return {
    ok: results.every(result => result.ok !== false),
    policyVersion: AGENT_AUTONOMY_JOB_POLICY_VERSION,
    status: results.length ? 'TICKED' : 'IDLE',
    runsConsidered: listed.count,
    runsTicked: results.length,
    failed: results.filter(result => result.ok === false).length,
    results,
    at: timestamp(date)
  };
}
