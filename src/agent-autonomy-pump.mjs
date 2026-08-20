import crypto from 'node:crypto';
import { registerTaskIntent, ingestAgentResult } from './agent-autonomy-loop.mjs';

export const AGENT_AUTONOMY_PUMP_POLICY_VERSION = 'agent-autonomy-pump-1.0.0';

const MAX_RECEIPTS = 256;
const TERMINAL = new Set([
  'COMPLETED', 'OWNER_BOUNDARY', 'DISPUTE_PENDING', 'BLOCKED', 'BOUNDED_STOP', 'LOOP_DETECTED', 'FAILED'
]);

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_AUTONOMY_PUMP_POLICY_VERSION,
    status: 'FAILED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    ...extra
  };
}

function validSession(session) {
  return Boolean(session?.ok && session.sessionId);
}

function validIntent(intent, session) {
  return Boolean(intent?.ok && intent.taskId && intent.sessionId === session?.sessionId);
}

function validRun(run) {
  return Boolean(run?.ok && run.runId && validSession(run.session));
}

function cloneRun(run) {
  return {
    ...run,
    session: structuredClone(run.session),
    currentIntent: run.currentIntent ? structuredClone(run.currentIntent) : null,
    relayRef: run.relayRef ? structuredClone(run.relayRef) : null,
    receipts: [...(run.receipts || [])]
  };
}

export function createAutonomyRun({ session, initialIntent, date = new Date() } = {}) {
  if (!validSession(session)) return fail(['valid-autonomy-session-required']);
  if (!validIntent(initialIntent, session)) return fail(['valid-initial-intent-required']);
  const at = timestamp(date);
  const identity = { sessionId: session.sessionId, taskId: initialIntent.taskId, createdAt: at };
  return {
    ok: true,
    policyVersion: AGENT_AUTONOMY_PUMP_POLICY_VERSION,
    runId: `autonomy_run_${hash(identity).slice(0, 24)}`,
    phase: 'READY_TO_DISPATCH',
    status: 'ACTIVE',
    session: structuredClone(session),
    currentIntent: structuredClone(initialIntent),
    relayRef: null,
    receipts: [],
    sequence: 0,
    createdAt: at,
    updatedAt: at
  };
}

async function resolveAdapter(adapterFactory, run) {
  if (typeof adapterFactory !== 'function') return null;
  return adapterFactory({
    originAgent: run.currentIntent?.originAgent,
    targetAgent: run.currentIntent?.targetAgent,
    intent: run.currentIntent,
    session: run.session,
    run
  });
}

function withFailure(run, reasonCodes, date) {
  const next = cloneRun(run);
  next.phase = 'TERMINAL';
  next.status = 'FAILED';
  next.reasonCodes = [...new Set(reasonCodes.filter(Boolean))];
  next.updatedAt = timestamp(date);
  next.sequence += 1;
  return next;
}

export async function advanceAutonomyRun({
  run,
  adapterFactory,
  compileRelayTask,
  date = new Date()
} = {}) {
  if (!validRun(run)) return fail(['valid-autonomy-run-required']);
  if (typeof compileRelayTask !== 'function') return fail(['relay-task-compiler-required'], { run });
  if (TERMINAL.has(run.status) || run.phase === 'TERMINAL') {
    return {
      ok: true,
      policyVersion: AGENT_AUTONOMY_PUMP_POLICY_VERSION,
      status: run.status,
      transition: 'NOOP_TERMINAL',
      run
    };
  }

  const next = cloneRun(run);
  next.sequence += 1;
  next.updatedAt = timestamp(date);

  if (next.phase === 'READY_TO_DISPATCH') {
    if (!validIntent(next.currentIntent, next.session)) {
      const failed = withFailure(next, ['valid-current-intent-required'], date);
      return { ok: false, policyVersion: AGENT_AUTONOMY_PUMP_POLICY_VERSION, status: 'FAILED', transition: 'FAILED', run: failed, reasonCodes: failed.reasonCodes };
    }
    const adapter = await resolveAdapter(adapterFactory, next);
    if (!adapter || typeof adapter.createTask !== 'function') {
      const failed = withFailure(next, ['target-agent-create-adapter-required'], date);
      return { ok: false, policyVersion: AGENT_AUTONOMY_PUMP_POLICY_VERSION, status: 'FAILED', transition: 'FAILED', run: failed, reasonCodes: failed.reasonCodes };
    }
    const registered = registerTaskIntent({ session: next.session, intent: next.currentIntent, date });
    if (!registered.ok) {
      const failed = withFailure(next, registered.reasonCodes || ['task-registration-failed'], date);
      return { ok: false, policyVersion: AGENT_AUTONOMY_PUMP_POLICY_VERSION, status: 'FAILED', transition: 'FAILED', run: failed, reasonCodes: failed.reasonCodes };
    }
    next.session = registered.session;
    const relayTask = compileRelayTask(next.currentIntent, next.session, date);
    if (!relayTask?.ok) {
      const failed = withFailure(next, relayTask?.reasonCodes || ['relay-task-compilation-failed'], date);
      return { ok: false, policyVersion: AGENT_AUTONOMY_PUMP_POLICY_VERSION, status: 'FAILED', transition: 'FAILED', run: failed, reasonCodes: failed.reasonCodes };
    }
    const queued = await adapter.createTask(relayTask, date);
    if (!queued?.ok) {
      next.phase = 'READY_TO_DISPATCH';
      next.status = 'PENDING';
      next.lastError = queued?.reasonCodes || ['relay-task-queue-pending'];
      return { ok: true, policyVersion: AGENT_AUTONOMY_PUMP_POLICY_VERSION, status: 'PENDING', transition: 'DISPATCH_PENDING', run: next };
    }
    next.relayRef = {
      taskId: relayTask.taskId,
      issueNumber: Number(queued.issueNumber) || null,
      targetAgent: next.currentIntent.targetAgent,
      originAgent: next.currentIntent.originAgent,
      queuedAt: next.updatedAt
    };
    next.phase = 'AWAITING_RESULT';
    next.status = 'ACTIVE';
    next.lastError = null;
    return { ok: true, policyVersion: AGENT_AUTONOMY_PUMP_POLICY_VERSION, status: 'ACTIVE', transition: 'DISPATCHED', run: next };
  }

  if (next.phase === 'AWAITING_RESULT') {
    if (!next.relayRef?.taskId) {
      const failed = withFailure(next, ['relay-reference-required'], date);
      return { ok: false, policyVersion: AGENT_AUTONOMY_PUMP_POLICY_VERSION, status: 'FAILED', transition: 'FAILED', run: failed, reasonCodes: failed.reasonCodes };
    }
    const adapter = await resolveAdapter(adapterFactory, next);
    if (!adapter || (typeof adapter.readTask !== 'function' && typeof adapter.waitForResult !== 'function')) {
      const failed = withFailure(next, ['target-agent-read-adapter-required'], date);
      return { ok: false, policyVersion: AGENT_AUTONOMY_PUMP_POLICY_VERSION, status: 'FAILED', transition: 'FAILED', run: failed, reasonCodes: failed.reasonCodes };
    }
    const reader = typeof adapter.readTask === 'function'
      ? () => adapter.readTask(next.relayRef.issueNumber, next.relayRef.taskId)
      : () => adapter.waitForResult({ issueNumber: next.relayRef.issueNumber, expectedTaskId: next.relayRef.taskId });
    const received = await reader();
    if (!received?.ok || !['RESULT_RECEIVED', 'COMPLETED'].includes(String(received.status || '').toUpperCase())) {
      next.status = 'PENDING';
      return { ok: true, policyVersion: AGENT_AUTONOMY_PUMP_POLICY_VERSION, status: 'PENDING', transition: 'RESULT_PENDING', run: next };
    }
    const result = received.result || received.workerResult || null;
    if (!result) {
      const failed = withFailure(next, ['agent-result-required'], date);
      return { ok: false, policyVersion: AGENT_AUTONOMY_PUMP_POLICY_VERSION, status: 'FAILED', transition: 'FAILED', run: failed, reasonCodes: failed.reasonCodes };
    }
    const receipt = {
      runId: next.runId,
      sequence: next.sequence,
      sessionId: next.session.sessionId,
      taskId: next.relayRef.taskId,
      originAgent: next.relayRef.originAgent,
      targetAgent: next.relayRef.targetAgent,
      issueNumber: next.relayRef.issueNumber,
      resultStatus: received.resultStatus || received.status,
      receivedAt: next.updatedAt
    };
    next.receipts.push(receipt);
    next.receipts = next.receipts.slice(-MAX_RECEIPTS);

    const ingested = ingestAgentResult({ session: next.session, taskIntent: next.currentIntent, result, date });
    if (!ingested.ok) {
      const failed = withFailure(next, ingested.reasonCodes || ['agent-result-ingestion-failed'], date);
      return { ok: false, policyVersion: AGENT_AUTONOMY_PUMP_POLICY_VERSION, status: 'FAILED', transition: 'FAILED', run: failed, reasonCodes: failed.reasonCodes, receipt };
    }
    next.session = ingested.session;
    next.relayRef = null;
    if (ingested.nextIntent) {
      next.currentIntent = ingested.nextIntent;
      next.phase = 'READY_TO_DISPATCH';
      next.status = 'ACTIVE';
      return { ok: true, policyVersion: AGENT_AUTONOMY_PUMP_POLICY_VERSION, status: 'ACTIVE', transition: 'FOLLOWUP_READY', run: next, receipt, coordination: ingested.coordination };
    }
    next.currentIntent = null;
    next.phase = 'TERMINAL';
    next.status = ingested.status;
    return { ok: true, policyVersion: AGENT_AUTONOMY_PUMP_POLICY_VERSION, status: next.status, transition: 'TERMINAL', run: next, receipt, coordination: ingested.coordination };
  }

  const failed = withFailure(next, ['unknown-autonomy-run-phase'], date);
  return { ok: false, policyVersion: AGENT_AUTONOMY_PUMP_POLICY_VERSION, status: 'FAILED', transition: 'FAILED', run: failed, reasonCodes: failed.reasonCodes };
}
