import {
  claimCloudRelayTask,
  heartbeatCloudRelayTask,
  submitCloudRelayResult,
  ZERO_EFFECTS
} from './cloud-agent-relay.mjs';
import { runAgentWorkerOnce, resumeAgentWorkerSubmission } from './agent-worker-runtime.mjs';
import {
  loadLatestComputeBudget,
  saveComputeBudgetSnapshot,
  saveAgentExecutionRecord,
  listPendingAgentSubmissions
} from './agent-compute-store.mjs';

export const AGENT_WORKER_JOB_POLICY_VERSION = 'agent-worker-job-1.0.0';

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function fail(reasonCodes, status = 'FAILED', extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_WORKER_JOB_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    externalEffectLedger: { ...ZERO_EFFECTS },
    ...extra
  };
}

function validStore(store) {
  return Boolean(
    store
    && typeof store.log === 'function'
    && typeof store.list === 'function'
    && typeof store.claimJobsByType === 'function'
  );
}

async function persistBudget(store, budget, detail = {}) {
  if (!budget?.ok) return fail(['valid-compute-budget-required-for-persistence']);
  const saved = await saveComputeBudgetSnapshot(store, budget, detail);
  if (!saved.ok) return fail(saved.reasonCodes || ['compute-budget-persistence-failed']);
  return saved;
}

async function persistExecution(store, record, date) {
  if (!record) return { ok: true, status: 'NO_RECORD' };
  const saved = await saveAgentExecutionRecord(store, record, { date });
  if (!saved.ok) return fail(saved.reasonCodes || ['execution-record-persistence-failed']);
  return saved;
}

async function replayPendingSubmission({ store, record, date }) {
  const resumed = await resumeAgentWorkerSubmission({
    executionRecord: record,
    submitResult: payload => submitCloudRelayResult({ store, ...payload, date })
  });
  const saved = await persistExecution(store, resumed.executionRecord || record, date);
  return {
    ok: resumed.ok && saved.ok,
    policyVersion: AGENT_WORKER_JOB_POLICY_VERSION,
    status: resumed.ok ? 'PENDING_SUBMISSION_REPLAYED' : 'PENDING_SUBMISSION_STILL_BLOCKED',
    taskId: record.taskId,
    workerId: record.workerId,
    replay: resumed,
    persistence: saved,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

// One scheduler-safe worker tick. It performs at most one of two actions:
// 1) replay one already-computed result that failed to reach the relay, or
// 2) claim and execute one new relay task.
// It never loops and never grants business-world consequence authority.
export async function runAgentWorkerTick({
  store,
  budgetId,
  targetAgent,
  workerId,
  provider,
  model = '',
  costCeilingCents = 0,
  tokenCeiling = 50_000,
  modelExecutor,
  lockTimeoutMs = 300000,
  date = new Date()
} = {}) {
  if (!validStore(store)) return fail(['relay-capable-store-required']);
  const computeId = text(budgetId, 160);
  const target = text(targetAgent, 80).toLowerCase();
  const worker = text(workerId, 160);
  const providerName = text(provider, 80).toLowerCase();
  const reasons = [];
  if (!computeId) reasons.push('budget-id-required');
  if (!target) reasons.push('target-agent-required');
  if (!worker) reasons.push('worker-id-required');
  if (!providerName) reasons.push('provider-required');
  if (typeof modelExecutor !== 'function') reasons.push('model-executor-required');
  if (reasons.length) return fail(reasons);

  const loaded = await loadLatestComputeBudget(store, computeId);
  if (!loaded.ok) return fail(loaded.reasonCodes || ['compute-budget-load-failed'], 'BLOCKED');

  // A successfully computed result is more valuable than new work. Replay it
  // before claiming anything else so a transient relay failure cannot cause a
  // second provider call for the same economic work.
  const pending = await listPendingAgentSubmissions(store, { limit: 1 });
  if (!pending.ok) return fail(pending.reasonCodes || ['pending-submission-scan-failed']);
  if (pending.records.length) {
    return replayPendingSubmission({ store, record: pending.records[0], date });
  }

  const claim = await claimCloudRelayTask({
    store,
    targetAgent: target,
    workerId: worker,
    lockTimeoutMs
  });
  if (!claim.ok && String(claim.status || '').toUpperCase() === 'EMPTY') {
    return {
      ok: true,
      policyVersion: AGENT_WORKER_JOB_POLICY_VERSION,
      status: 'IDLE',
      budgetId: computeId,
      targetAgent: target,
      at: timestamp(date),
      externalEffectLedger: { ...ZERO_EFFECTS }
    };
  }
  if (!claim.ok) return fail(claim.reasonCodes || ['relay-task-claim-failed'], 'CLAIM_BLOCKED');

  // Persist the current pre-execution budget snapshot before doing anything.
  // The runtime will create its task-level reservation next. This snapshot is
  // not itself proof of reservation; it is a durable recovery anchor.
  const before = await persistBudget(store, loaded.budget, {
    reason: 'worker-pre-execution',
    taskId: claim.taskId,
    executionStatus: 'CLAIMED',
    date
  });
  if (!before.ok) return fail(before.reasonCodes || ['pre-execution-budget-persistence-failed'], 'PERSISTENCE_BLOCKED', {
    taskId: claim.taskId
  });

  const result = await runAgentWorkerOnce({
    claim,
    computeBudget: loaded.budget,
    provider: providerName,
    model,
    costCeilingCents,
    tokenCeiling,
    modelExecutor,
    heartbeat: input => heartbeatCloudRelayTask({ store, ...input }),
    submitResult: payload => submitCloudRelayResult({ store, ...payload, date }),
    date
  });

  // Persist whatever budget state the runtime returns. If the provider outcome
  // is uncertain, this preserves the active reservation so later work fails
  // closed rather than blindly spending again.
  const budgetPersistence = result.computeBudget?.ok
    ? await persistBudget(store, result.computeBudget, {
      reason: 'worker-post-execution',
      taskId: claim.taskId,
      executionStatus: result.status,
      date
    })
    : { ok: true, status: 'NO_BUDGET_CHANGE' };

  const executionPersistence = await persistExecution(store, result.executionRecord, date);
  const persistenceOk = budgetPersistence.ok && executionPersistence.ok;

  return {
    ok: result.ok && persistenceOk,
    policyVersion: AGENT_WORKER_JOB_POLICY_VERSION,
    status: persistenceOk ? result.status : 'PERSISTENCE_BLOCKED',
    taskId: claim.taskId,
    workerId: worker,
    targetAgent: target,
    provider: providerName,
    model: text(model, 160) || null,
    workerResult: result,
    budgetPersistence,
    executionPersistence,
    at: timestamp(date),
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
