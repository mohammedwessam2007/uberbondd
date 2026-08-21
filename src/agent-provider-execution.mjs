import {
  reserveCompute,
  commitCompute,
  releaseCompute,
  validateComputeBudget
} from './ai-compute-budget.mjs';
import {
  compileProviderWorkRequest,
  runProviderWorker
} from './agent-provider-worker.mjs';

export const AGENT_PROVIDER_EXECUTION_POLICY_VERSION = 'agent-provider-execution-1.0.0';

function fail(reasonCodes, status = 'BLOCKED', extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_PROVIDER_EXECUTION_POLICY_VERSION,
    status,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    ...extra
  };
}

function routeSelection(modelRoute) {
  const selected = modelRoute?.selected;
  if (!modelRoute?.ok || modelRoute.status !== 'ROUTED' || !selected?.provider || !selected?.model) return null;
  return { provider: String(selected.provider).trim().toLowerCase(), model: String(selected.model).trim() };
}

/**
 * Bounded model invocation transaction.
 *
 * Important uncertainty rule:
 * Once invoke() is called, a malformed result or thrown transport error may
 * still have consumed paid compute. In that case the reservation stays locked
 * as RESERVED and the caller receives COMPUTE_USAGE_UNCERTAIN. Capacity is
 * never silently recycled after an uncertain provider-side effect.
 */
export async function executeProviderTask({
  budget,
  relayTask,
  modelRoute,
  costCeilingCents,
  tokenCeiling,
  toolAllowlist = [],
  invoke,
  date = new Date()
} = {}) {
  const budgetValidation = validateComputeBudget(budget);
  if (!budgetValidation.ok) return fail(['valid-compute-budget-required']);
  const route = routeSelection(modelRoute);
  if (!route) return fail(['verified-model-route-required']);
  if (!relayTask?.ok || !relayTask.taskId) return fail(['valid-relay-task-required']);
  if (typeof invoke !== 'function') return fail(['provider-invoke-function-required']);

  const reserved = reserveCompute({
    budget,
    taskId: relayTask.taskId,
    provider: route.provider,
    model: route.model,
    costCeilingCents,
    tokenCeiling,
    date
  });
  if (!reserved.ok) return fail(reserved.reasonCodes || ['compute-reservation-failed'], reserved.status || 'BLOCKED', { budget });

  const request = compileProviderWorkRequest({
    relayTask,
    modelRoute,
    computeReservation: reserved.reservation,
    toolAllowlist
  });
  if (!request.ok) {
    const released = releaseCompute({
      budget: reserved.budget,
      taskId: relayTask.taskId,
      reason: 'provider-request-rejected-before-invoke',
      date
    });
    return fail(request.reasonCodes || ['provider-request-compilation-failed'], 'BLOCKED', {
      budget: released.ok ? released.budget : reserved.budget,
      computeStatus: released.ok ? 'RELEASED_BEFORE_INVOKE' : 'RESERVATION_HELD'
    });
  }

  let workerResult;
  try {
    workerResult = await runProviderWorker({ request, invoke });
  } catch (error) {
    return fail(['provider-invocation-threw'], 'COMPUTE_USAGE_UNCERTAIN', {
      budget: reserved.budget,
      requestId: request.requestId,
      taskId: relayTask.taskId,
      computeReservation: reserved.reservation,
      errorClass: error?.name || 'Error'
    });
  }

  if (!workerResult.ok) {
    return fail(workerResult.reasonCodes || ['provider-result-invalid'], 'COMPUTE_USAGE_UNCERTAIN', {
      budget: reserved.budget,
      requestId: request.requestId,
      taskId: relayTask.taskId,
      computeReservation: reserved.reservation,
      workerStatus: workerResult.status
    });
  }

  const committed = commitCompute({
    budget: reserved.budget,
    taskId: relayTask.taskId,
    actualCostCents: workerResult.aiComputeLedger.costCents,
    actualTokens: workerResult.aiComputeLedger.totalTokens,
    date
  });
  if (!committed.ok) {
    return fail(committed.reasonCodes || ['compute-commit-failed'], 'COMPUTE_ACCOUNTING_FAILURE', {
      budget: reserved.budget,
      requestId: request.requestId,
      taskId: relayTask.taskId,
      computeReservation: reserved.reservation,
      workerResult
    });
  }

  return {
    ok: true,
    policyVersion: AGENT_PROVIDER_EXECUTION_POLICY_VERSION,
    status: 'COMPLETED',
    taskId: relayTask.taskId,
    requestId: request.requestId,
    provider: route.provider,
    model: route.model,
    budget: committed.budget,
    computeReservation: committed.reservation,
    workerResult
  };
}
