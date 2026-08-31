import {
  claimCloudRelayTask,
  heartbeatCloudRelayTask,
  submitCloudRelayResult,
  ZERO_EFFECTS
} from './cloud-agent-relay.mjs';
import { runAgentWorkerOnce, resumeAgentWorkerSubmission } from './agent-worker-runtime.mjs';
import { classifyRouteFailure } from './agent-model-failover.mjs';
import { validateRoleBoundExecution } from './ai-employee-role-contract.mjs';
import {
  bindEmployeeRoleIdentityToReceipt,
  bindEmployeeRoleSubmissionPayload
} from './ai-employee-terminal-identity.mjs';
import {
  loadLatestComputeBudget,
  saveComputeBudgetSnapshot,
  saveAgentExecutionRecord,
  listPendingAgentSubmissions
} from './agent-compute-store.mjs';

export const AGENT_WORKER_JOB_POLICY_VERSION = 'agent-worker-job-1.3.0';

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
//
// New model execution is role-bound by default. A legacy generic relay caller
// must opt out explicitly with requireEmployeeRole=false; silence can no longer
// turn a generic task into an AI employee. The gate runs after the durable
// claim but before compute reservation or modelExecutor, so a malformed,
// expanded, or digest-tampered role cannot spend provider compute.
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
  requireEmployeeRole = true,
  lockTimeoutMs = 300000,
  // The ranked order routing already produced, from
  // agent-model-routing-integration's `failoverOrder`. Empty means the single
  // declared provider/model and nothing else, which is what this always did.
  //
  // Every entry is a worker the authority layer already approved: routing can
  // only narrow. A route that appears here was declined as the first choice,
  // never one that was refused authorization.
  failoverOrder = [],
  taskIdempotency = 'NOT_IDEMPOTENT',
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
  if (typeof requireEmployeeRole !== 'boolean') reasons.push('require-employee-role-boolean-required');
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

  if (requireEmployeeRole) {
    const roleEligibility = validateRoleBoundExecution(claim.task);
    if (!roleEligibility.ok) {
      return fail(
        ['employee-role-required-before-model-execution', ...(roleEligibility.reasonCodes || [])],
        'ROLE_BINDING_BLOCKED',
        {
          taskId: claim.taskId || claim.task?.taskId || null,
          workerId: worker,
          targetAgent: target,
          provider: providerName,
          model: normalizedModel || null,
          roleBindingRequired: true
        }
      );
    }
  }

  const before = await persistBudget(store, loaded.budget, {
    reason: 'worker-pre-execution',
    taskId: claim.taskId,
    executionStatus: 'CLAIMED',
    date
  });
  if (!before.ok) return fail(before.reasonCodes || ['pre-execution-budget-persistence-failed'], 'PERSISTENCE_BLOCKED', {
    taskId: claim.taskId
  });

  const submitRoleBoundResult = async payload => {
    const binding = bindEmployeeRoleSubmissionPayload({ task: claim.task, payload });
    if (!binding.ok) {
      return fail(
        ['employee-role-terminal-submission-binding-failed', ...(binding.reasonCodes || [])],
        'ROLE_BINDING_BLOCKED',
        { taskId: claim.taskId, workerId: worker }
      );
    }
    return submitCloudRelayResult({ store, ...binding.payload, date });
  };

  const persistRoleBoundExecution = async payload => {
    const binding = bindEmployeeRoleIdentityToReceipt({
      task: claim.task,
      receipt: payload?.executionRecord || null
    });
    if (!binding.ok) {
      return fail(
        ['employee-role-execution-record-binding-failed', ...(binding.reasonCodes || [])],
        'ROLE_BINDING_BLOCKED',
        { taskId: claim.taskId, workerId: worker }
      );
    }
    return persistExecution(store, binding.receipt, payload?.date || date);
  };

  const attemptOnce = ({ attemptProvider, attemptModel, defer }) => runAgentWorkerOnce({
    claim,
    computeBudget: loaded.budget,
    provider: attemptProvider,
    model: attemptModel,
    costCeilingCents,
    tokenCeiling,
    modelExecutor,
    heartbeat: input => heartbeatCloudRelayTask({ store, ...input }),
    submitResult: submitRoleBoundResult,
    persistBudgetState: payload => persistBudget(store, payload.budget, {
      reason: `runtime-${String(payload.stage || 'state').toLowerCase()}`,
      taskId: payload.taskId,
      executionStatus: payload.executionStatus,
      date: payload.date || date
    }),
    persistExecutionRecord: persistRoleBoundExecution,
    deferTerminalSubmission: defer,
    date
  });

  // Walk the routing order the router already produced.
  //
  // `routeModel` has ranked alternatives since it was written and nothing ever
  // executed down them: a quota wall failed the run next to a list naming which
  // model should have served it. This is the walk.
  //
  // Only the final attempt submits. Every earlier one defers, so a chain that
  // fails and then succeeds reports one outcome rather than a failure the relay
  // has already recorded followed by a result contradicting it.
  const chain = Array.isArray(failoverOrder) && failoverOrder.length
    ? failoverOrder
      .map(entry => ({
        provider: text(entry?.provider, 80).toLowerCase(),
        model: text(entry?.model, 160)
      }))
      .filter(entry => entry.provider && entry.model)
    : [{ provider: providerName, model: normalizedModel }];

  let result;
  const routeAttempts = [];
  for (let index = 0; index < chain.length; index += 1) {
    const route = chain[index];
    const isLast = index === chain.length - 1;
    const attempt = await attemptOnce({
      attemptProvider: route.provider,
      attemptModel: route.model,
      defer: !isLast
    });
    routeAttempts.push({
      sequence: index + 1,
      provider: route.provider,
      model: route.model,
      status: attempt?.status || null,
      submissionDeferred: attempt?.submissionDeferred === true
    });
    result = attempt;

    if (!attempt || attempt.submissionDeferred !== true) break;

    const classification = classifyRouteFailure({
      ok: false,
      outcome: attempt.providerOutcome || 'CONFIRMED_FAILURE',
      reasonCodes: attempt.reasonCodes || []
    });
    const mayRetry = classification.failoverEligible
      && (!classification.requiresIdempotency || taskIdempotency === 'IDEMPOTENT');
    if (!mayRetry) {
      // A failure a different provider cannot fix, or one whose outcome is
      // unknown on a task that may not be run twice. Submit it as the answer
      // instead of touring the remaining providers.
      result = await attemptOnce({
        attemptProvider: route.provider,
        attemptModel: route.model,
        defer: false
      });
      routeAttempts.push({
        sequence: routeAttempts.length + 1,
        provider: route.provider,
        model: route.model,
        status: result?.status || null,
        resubmittedTerminalOutcome: true
      });
      break;
    }
  }

  let workerResult = result;
  if (result.executionRecord) {
    const binding = bindEmployeeRoleIdentityToReceipt({ task: claim.task, receipt: result.executionRecord });
    if (!binding.ok) {
      return fail(
        ['employee-role-final-execution-record-binding-failed', ...(binding.reasonCodes || [])],
        'ROLE_BINDING_BLOCKED',
        { taskId: claim.taskId, workerId: worker }
      );
    }
    workerResult = { ...result, executionRecord: binding.receipt };
  }

  // The runtime persists reservation, commit/release, and ready result at the
  // exact safety boundaries. These final writes are duplicate-safe audit
  // reinforcement and make the tick receipt self-contained.
  const budgetPersistence = workerResult.computeBudget?.ok
    ? await persistBudget(store, workerResult.computeBudget, {
      reason: 'worker-post-execution',
      taskId: claim.taskId,
      executionStatus: workerResult.status,
      date
    })
    : { ok: true, status: 'NO_BUDGET_CHANGE' };

  const executionPersistence = await persistExecution(store, workerResult.executionRecord, date);
  const persistenceOk = budgetPersistence.ok && executionPersistence.ok;

  return {
    ok: workerResult.ok && persistenceOk,
    policyVersion: AGENT_WORKER_JOB_POLICY_VERSION,
    status: persistenceOk ? workerResult.status : 'PERSISTENCE_BLOCKED',
    taskId: claim.taskId,
    workerId: worker,
    targetAgent: target,
    provider: providerName,
    model: normalizedModel || null,
    workerResult,
    budgetPersistence,
    executionPersistence,
    at: timestamp(date),
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
