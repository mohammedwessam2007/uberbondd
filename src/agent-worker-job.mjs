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

export const AGENT_WORKER_JOB_POLICY_VERSION = 'agent-worker-job-1.1.0';

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

// A pending provider result is durable economic work. It may only be replayed
// by the worker configuration that originally produced it. The compute budget
// itself provides the strongest currently persisted binding: the task must be
// present as a COMMITTED reservation with the same provider/model and the same
// measured usage. A different worker is simply foreign work; a record owned by
// this worker but inconsistent with its current target/provider/model/budget is
// a scope conflict and fails closed rather than being silently replayed.
export function evaluatePendingSubmissionScope(record, {
  budget,
  budgetId,
  targetAgent,
  workerId,
  provider,
  model = ''
} = {}) {
  const taskId = text(record?.taskId, 160);
  const recordWorker = text(record?.workerId, 160);
  const expectedWorker = text(workerId, 160);
  if (!taskId || !recordWorker || !expectedWorker) {
    return {
      ok: false,
      status: 'SCOPE_CONFLICT',
      reasonCodes: ['pending-submission-identity-incomplete']
    };
  }
  if (recordWorker !== expectedWorker) {
    return {
      ok: false,
      status: 'FOREIGN',
      reasonCodes: ['pending-submission-owned-by-another-worker']
    };
  }

  const expectedTarget = text(targetAgent, 80).toLowerCase();
  const expectedProvider = text(provider, 80).toLowerCase();
  const expectedModel = text(model, 160);
  const recordTarget = text(record?.targetAgent, 80).toLowerCase();
  const recordProvider = text(record?.provider, 80).toLowerCase();
  const recordModel = text(record?.model, 160);
  const reasons = [];
  if (!expectedTarget || recordTarget !== expectedTarget) reasons.push('pending-submission-target-agent-mismatch');
  if (!expectedProvider || recordProvider !== expectedProvider) reasons.push('pending-submission-provider-mismatch');
  if (recordModel !== expectedModel) reasons.push('pending-submission-model-mismatch');

  const expectedBudgetId = text(budgetId, 160);
  if (!budget?.ok || !expectedBudgetId || text(budget?.budgetId, 160) !== expectedBudgetId) {
    reasons.push('pending-submission-budget-context-invalid');
  }
  const reservation = budget?.reservations?.[taskId];
  if (!reservation || String(reservation.status || '').toUpperCase() !== 'COMMITTED') {
    reasons.push('pending-submission-committed-reservation-required');
  } else {
    if (text(reservation.provider, 80).toLowerCase() !== recordProvider) {
      reasons.push('pending-submission-reservation-provider-mismatch');
    }
    if (text(reservation.model, 160) !== recordModel) {
      reasons.push('pending-submission-reservation-model-mismatch');
    }
    const recordCost = Number(record?.usage?.costCents);
    const recordTokens = Number(record?.usage?.totalUnits);
    if (!Number.isSafeInteger(recordCost) || recordCost < 0 || recordCost !== Number(reservation.actualCostCents)) {
      reasons.push('pending-submission-reservation-cost-mismatch');
    }
    if (!Number.isSafeInteger(recordTokens) || recordTokens < 0 || recordTokens !== Number(reservation.actualTokens)) {
      reasons.push('pending-submission-reservation-token-mismatch');
    }
  }

  if (reasons.length) {
    return {
      ok: false,
      status: 'SCOPE_CONFLICT',
      taskId,
      workerId: recordWorker,
      reasonCodes: [...new Set(reasons)]
    };
  }
  return {
    ok: true,
    status: 'OWNED',
    taskId,
    workerId: recordWorker,
    budgetId: expectedBudgetId,
    targetAgent: expectedTarget,
    provider: expectedProvider,
    model: expectedModel || null,
    reasonCodes: []
  };
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
  const normalizedModel = text(model, 160);
  const reasons = [];
  if (!computeId) reasons.push('budget-id-required');
  if (!target) reasons.push('target-agent-required');
  if (!worker) reasons.push('worker-id-required');
  if (!providerName) reasons.push('provider-required');
  if (typeof modelExecutor !== 'function') reasons.push('model-executor-required');
  if (reasons.length) return fail(reasons);

  const loaded = await loadLatestComputeBudget(store, computeId);
  if (!loaded.ok) return fail(loaded.reasonCodes || ['compute-budget-load-failed'], 'BLOCKED');

  // A successfully computed result is more valuable than new work. Scan a
  // bounded pending set, but only replay a result whose immutable worker and
  // compute context matches this tick. The old `limit: 1` behavior allowed
  // worker A to submit worker B's result with A's callbacks and budget context.
  const pending = await listPendingAgentSubmissions(store, { limit: 100 });
  if (!pending.ok) return fail(pending.reasonCodes || ['pending-submission-scan-failed']);
  let ownedPending = null;
  const conflicts = [];
  for (const record of pending.records) {
    const scope = evaluatePendingSubmissionScope(record, {
      budget: loaded.budget,
      budgetId: computeId,
      targetAgent: target,
      workerId: worker,
      provider: providerName,
      model: normalizedModel
    });
    if (scope.ok) {
      ownedPending = record;
      break;
    }
    if (scope.status === 'SCOPE_CONFLICT') conflicts.push(scope);
  }
  if (ownedPending) {
    return replayPendingSubmission({ store, record: ownedPending, date });
  }
  if (conflicts.length) {
    return fail(
      ['pending-submission-scope-conflict', ...conflicts.flatMap(item => item.reasonCodes || [])],
      'PENDING_SUBMISSION_SCOPE_CONFLICT',
      {
        workerId: worker,
        targetAgent: target,
        provider: providerName,
        model: normalizedModel || null,
        conflictingTaskIds: [...new Set(conflicts.map(item => item.taskId).filter(Boolean))]
      }
    );
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
    model: normalizedModel,
    costCeilingCents,
    tokenCeiling,
    modelExecutor,
    heartbeat: input => heartbeatCloudRelayTask({ store, ...input }),
    submitResult: payload => submitCloudRelayResult({ store, ...payload, date }),
    persistBudgetState: payload => persistBudget(store, payload.budget, {
      reason: `runtime-${String(payload.stage || 'state').toLowerCase()}`,
      taskId: payload.taskId,
      executionStatus: payload.executionStatus,
      date: payload.date || date
    }),
    persistExecutionRecord: payload => persistExecution(store, payload.executionRecord, payload.date || date),
    date
  });

  // The runtime persists reservation, commit/release, and ready result at the
  // exact safety boundaries. These final writes are duplicate-safe audit
  // reinforcement and make the tick receipt self-contained.
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
    model: normalizedModel || null,
    workerResult: result,
    budgetPersistence,
    executionPersistence,
    at: timestamp(date),
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
