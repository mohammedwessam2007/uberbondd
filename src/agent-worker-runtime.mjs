import crypto from 'node:crypto';
import { reserveCompute, commitCompute, releaseCompute } from './ai-compute-budget.mjs';
import { ZERO_EFFECTS, hasSecret, validResult } from './cloud-agent-relay.mjs';

export const AGENT_WORKER_RUNTIME_POLICY_VERSION = 'agent-worker-runtime-1.0.0';

const MAX_RECEIPT_BYTES = 50_000;
const MAX_TEXT = 1600;

function text(value, max = MAX_TEXT) {
  return String(value ?? '').trim().slice(0, max);
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function safeInt(value, min = 0, max = Number.MAX_SAFE_INTEGER, fallback = null) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback;
}

function sizeOf(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
}

function fail(reasonCodes, status = 'BLOCKED', extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_WORKER_RUNTIME_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    externalEffectLedger: { ...ZERO_EFFECTS },
    ...extra
  };
}

function normalizeClaim(claim) {
  if (!claim?.ok || String(claim.status || '').toUpperCase() !== 'CLAIMED') return null;
  const task = claim.task && typeof claim.task === 'object' ? claim.task : null;
  const taskId = text(claim.taskId || task?.taskId, 160);
  const workerId = text(claim.workerId, 160);
  if (!task || !taskId || task.taskId !== taskId || !workerId) return null;
  return { claim, task, taskId, workerId };
}

function canonicalUsage(value = {}) {
  const inputTokens = safeInt(value.inputTokens ?? 0, 0, 100_000_000, null);
  const outputTokens = safeInt(value.outputTokens ?? 0, 0, 100_000_000, null);
  const explicitTotal = value.totalTokens == null ? null : safeInt(value.totalTokens, 0, 100_000_000, null);
  const costCents = safeInt(value.costCents ?? 0, 0, 10_000_000, null);
  if (inputTokens == null || outputTokens == null || costCents == null || (value.totalTokens != null && explicitTotal == null)) return null;
  const totalTokens = explicitTotal == null ? inputTokens + outputTokens : explicitTotal;
  if (totalTokens < inputTokens + outputTokens) return null;
  return { inputTokens, outputTokens, totalTokens, costCents };
}

function makeExecutionRecord({ claim, provider, model, reservation, executor, usage, result, status, date }) {
  const at = timestamp(date);
  const record = {
    policyVersion: AGENT_WORKER_RUNTIME_POLICY_VERSION,
    executionId: `agent_exec_${digest({
      taskId: claim.taskId,
      workerId: claim.workerId,
      provider,
      model,
      reservationId: reservation?.reservationId || null
    }).slice(0, 24)}`,
    taskId: claim.taskId,
    workerId: claim.workerId,
    targetAgent: claim.task?.targetAgent || null,
    provider,
    model: model || null,
    providerRequestId: text(executor?.providerRequestId, 240) || null,
    executorOutcome: text(executor?.outcome || executor?.status, 80).toUpperCase() || null,
    usage: usage || null,
    result: result || null,
    status,
    createdAt: at,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
  if (hasSecret(record) || sizeOf(record) > MAX_RECEIPT_BYTES) return null;
  return record;
}

function failureResult(reasonCodes, outcome = 'Agent worker execution failed before a trustworthy result was produced.') {
  return {
    outcome,
    changedArtifacts: [],
    testsActuallyRun: [],
    truthTable: {
      workerRuntime: 'FAILED',
      reasonCodes: [...new Set(reasonCodes)]
    },
    externalEffectLedger: { ...ZERO_EFFECTS },
    decision: 'STOP',
    coordination: {
      action: 'BLOCKED_EXTERNAL',
      objective: null,
      summary: outcome,
      evidenceRefs: [],
      confidence: 1
    },
    evidenceRefs: []
  };
}

export function compileAgentWorkerPlan({
  claim,
  computeBudget,
  provider,
  model = '',
  costCeilingCents = 0,
  tokenCeiling = 50_000,
  date = new Date()
} = {}) {
  const normalized = normalizeClaim(claim);
  if (!normalized) return fail(['valid-claimed-relay-task-required']);
  const normalizedProvider = text(provider, 80).toLowerCase();
  const normalizedModel = text(model, 160);
  const cost = safeInt(costCeilingCents, 0, 10_000_000, null);
  const tokens = safeInt(tokenCeiling, 1, 100_000_000, null);
  const reasons = [];
  if (!computeBudget?.ok) reasons.push('valid-compute-budget-required');
  if (!normalizedProvider) reasons.push('provider-required');
  if (cost == null) reasons.push('valid-cost-ceiling-required');
  if (tokens == null) reasons.push('valid-token-ceiling-required');
  if (normalized.task?.consequenceClass && normalized.task.consequenceClass !== 'LOCAL_PREPARATION') {
    reasons.push('worker-only-accepts-local-preparation');
  }
  if (hasSecret(normalized.task)) reasons.push('secret-like-task-rejected');
  if (reasons.length) return fail(reasons);

  const reserved = reserveCompute({
    budget: computeBudget,
    taskId: normalized.taskId,
    provider: normalizedProvider,
    model: normalizedModel,
    costCeilingCents: cost,
    tokenCeiling: tokens,
    date
  });
  if (!reserved.ok) return fail(reserved.reasonCodes || ['compute-reservation-failed'], reserved.status || 'BLOCKED', {
    taskId: normalized.taskId,
    workerId: normalized.workerId,
    computeBudget
  });

  return {
    ok: true,
    policyVersion: AGENT_WORKER_RUNTIME_POLICY_VERSION,
    status: 'READY_TO_EXECUTE',
    taskId: normalized.taskId,
    workerId: normalized.workerId,
    task: normalized.task,
    provider: normalizedProvider,
    model: normalizedModel || null,
    tokenCeiling: tokens,
    costCeilingCents: cost,
    computeBudget: reserved.budget,
    reservation: reserved.reservation,
    idempotencyKey: `agent-model:${normalized.taskId}`,
    createdAt: timestamp(date),
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export async function runAgentWorkerOnce({
  claim,
  computeBudget,
  provider,
  model = '',
  costCeilingCents = 0,
  tokenCeiling = 50_000,
  modelExecutor,
  heartbeat = null,
  submitResult,
  date = new Date()
} = {}) {
  if (typeof modelExecutor !== 'function') return fail(['model-executor-required']);
  if (typeof submitResult !== 'function') return fail(['relay-result-submitter-required']);

  const plan = compileAgentWorkerPlan({
    claim,
    computeBudget,
    provider,
    model,
    costCeilingCents,
    tokenCeiling,
    date
  });
  if (!plan.ok) return plan;

  let budget = plan.computeBudget;
  if (typeof heartbeat === 'function') {
    let beat;
    try {
      beat = await heartbeat({ taskId: plan.taskId, workerId: plan.workerId });
    } catch (error) {
      beat = { ok: false, reasonCodes: ['relay-heartbeat-threw'], detail: text(error?.message, 500) };
    }
    if (!beat?.ok) {
      const released = releaseCompute({ budget, taskId: plan.taskId, reason: 'relay-lease-heartbeat-failed', date });
      return fail(['relay-lease-heartbeat-failed', ...(beat?.reasonCodes || [])], 'LEASE_LOST', {
        taskId: plan.taskId,
        workerId: plan.workerId,
        detail: text(beat?.detail, 500),
        computeBudget: released.ok ? released.budget : budget
      });
    }
  }

  let executor;
  try {
    executor = await modelExecutor({
      task: structuredClone(plan.task),
      provider: plan.provider,
      model: plan.model,
      maxTokens: plan.tokenCeiling,
      costCeilingCents: plan.costCeilingCents,
      idempotencyKey: plan.idempotencyKey
    });
  } catch (error) {
    // A thrown transport/client error is not proof that the provider did not
    // accept the request. Keep the reservation active so a scheduler cannot
    // blindly re-spend the same task. Reconciliation decides what happened.
    return fail(['model-executor-threw', 'provider-compute-outcome-uncertain'], 'COMPUTE_OUTCOME_UNCERTAIN', {
      taskId: plan.taskId,
      workerId: plan.workerId,
      detail: text(error?.message, 500),
      computeBudget: budget
    });
  }

  const executorOutcome = text(executor?.outcome || executor?.status, 80).toUpperCase();
  if (executorOutcome === 'CONFIRMED_FAILURE') {
    const released = releaseCompute({ budget, taskId: plan.taskId, reason: 'confirmed-provider-failure', date });
    budget = released.ok ? released.budget : budget;
    const result = failureResult(['confirmed-provider-failure']);
    let submitted;
    try {
      submitted = await submitResult({
        taskId: plan.taskId,
        workerId: plan.workerId,
        status: 'FAILED',
        result,
        receipt: {
          policyVersion: AGENT_WORKER_RUNTIME_POLICY_VERSION,
          taskId: plan.taskId,
          provider: plan.provider,
          model: plan.model,
          providerRequestId: text(executor?.providerRequestId, 240) || null,
          providerOutcome: 'CONFIRMED_FAILURE',
          externalEffectLedger: { ...ZERO_EFFECTS }
        }
      });
    } catch (error) {
      submitted = { ok: false, reasonCodes: ['relay-result-submitter-threw'], detail: text(error?.message, 500) };
    }
    return {
      ok: Boolean(submitted?.ok),
      policyVersion: AGENT_WORKER_RUNTIME_POLICY_VERSION,
      status: submitted?.ok ? 'FAILED_SUBMITTED' : 'FAILURE_SUBMISSION_PENDING',
      taskId: plan.taskId,
      workerId: plan.workerId,
      computeBudget: budget,
      reasonCodes: submitted?.ok ? ['confirmed-provider-failure'] : ['confirmed-provider-failure', 'relay-result-submit-failed', ...(submitted?.reasonCodes || [])],
      externalEffectLedger: { ...ZERO_EFFECTS }
    };
  }

  if (!executor?.ok || executorOutcome === 'UNCERTAIN' || executor?.uncertain === true) {
    const record = makeExecutionRecord({
      claim: { ...claim, taskId: plan.taskId, workerId: plan.workerId, task: plan.task },
      provider: plan.provider,
      model: plan.model,
      reservation: plan.reservation,
      executor,
      usage: canonicalUsage(executor?.usage || {}),
      result: executor?.result || null,
      status: 'COMPUTE_OUTCOME_UNCERTAIN',
      date
    });
    return fail(['provider-compute-outcome-uncertain'], 'COMPUTE_OUTCOME_UNCERTAIN', {
      taskId: plan.taskId,
      workerId: plan.workerId,
      computeBudget: budget,
      executionRecord: record
    });
  }

  const usage = canonicalUsage(executor?.usage || {});
  if (!usage) {
    return fail(['valid-provider-usage-required'], 'USAGE_UNKNOWN', {
      taskId: plan.taskId,
      workerId: plan.workerId,
      computeBudget: budget
    });
  }

  const committed = commitCompute({
    budget,
    taskId: plan.taskId,
    actualCostCents: usage.costCents,
    actualTokens: usage.totalTokens,
    date
  });
  if (!committed.ok) {
    const record = makeExecutionRecord({
      claim: { ...claim, taskId: plan.taskId, workerId: plan.workerId, task: plan.task },
      provider: plan.provider,
      model: plan.model,
      reservation: plan.reservation,
      executor,
      usage,
      result: executor?.result || null,
      status: 'COMPUTE_BUDGET_VIOLATION',
      date
    });
    return fail(committed.reasonCodes || ['compute-commit-failed'], 'COMPUTE_BUDGET_VIOLATION', {
      taskId: plan.taskId,
      workerId: plan.workerId,
      computeBudget: budget,
      executionRecord: record
    });
  }
  budget = committed.budget;

  const result = executor?.result;
  const resultErrors = validResult(result);
  if (resultErrors.length || hasSecret(result)) {
    const record = makeExecutionRecord({
      claim: { ...claim, taskId: plan.taskId, workerId: plan.workerId, task: plan.task },
      provider: plan.provider,
      model: plan.model,
      reservation: plan.reservation,
      executor,
      usage,
      result: null,
      status: 'INVALID_MODEL_RESULT',
      date
    });
    return fail([...resultErrors, ...(hasSecret(result) ? ['secret-like-model-result-rejected'] : [])], 'INVALID_MODEL_RESULT', {
      taskId: plan.taskId,
      workerId: plan.workerId,
      computeBudget: budget,
      executionRecord: record
    });
  }

  const executionRecord = makeExecutionRecord({
    claim: { ...claim, taskId: plan.taskId, workerId: plan.workerId, task: plan.task },
    provider: plan.provider,
    model: plan.model,
    reservation: plan.reservation,
    executor,
    usage,
    result,
    status: 'MODEL_RESULT_READY',
    date
  });
  if (!executionRecord) {
    return fail(['execution-record-invalid-or-too-large'], 'INVALID_EXECUTION_RECORD', {
      taskId: plan.taskId,
      workerId: plan.workerId,
      computeBudget: budget
    });
  }

  let submitted;
  try {
    submitted = await submitResult({
      taskId: plan.taskId,
      workerId: plan.workerId,
      status: 'COMPLETED',
      result,
      receipt: executionRecord
    });
  } catch (error) {
    submitted = { ok: false, reasonCodes: ['relay-result-submitter-threw'], detail: text(error?.message, 500) };
  }
  if (!submitted?.ok) {
    return fail(['relay-result-submit-failed', ...(submitted?.reasonCodes || [])], 'RESULT_SUBMISSION_PENDING', {
      taskId: plan.taskId,
      workerId: plan.workerId,
      detail: text(submitted?.detail, 500),
      computeBudget: budget,
      executionRecord: { ...executionRecord, status: 'RESULT_SUBMISSION_PENDING' }
    });
  }

  return {
    ok: true,
    policyVersion: AGENT_WORKER_RUNTIME_POLICY_VERSION,
    status: 'COMPLETED',
    taskId: plan.taskId,
    workerId: plan.workerId,
    computeBudget: budget,
    executionRecord: { ...executionRecord, status: 'RESULT_SUBMITTED' },
    relayReceipt: submitted,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export async function resumeAgentWorkerSubmission({ executionRecord, submitResult } = {}) {
  if (typeof submitResult !== 'function') return fail(['relay-result-submitter-required']);
  if (!executionRecord || executionRecord.policyVersion !== AGENT_WORKER_RUNTIME_POLICY_VERSION) {
    return fail(['valid-execution-record-required']);
  }
  if (!['MODEL_RESULT_READY', 'RESULT_SUBMISSION_PENDING'].includes(String(executionRecord.status || '').toUpperCase())) {
    return fail(['execution-record-not-resumable']);
  }
  if (!executionRecord.result || validResult(executionRecord.result).length || hasSecret(executionRecord)) {
    return fail(['execution-record-result-invalid']);
  }
  let submitted;
  try {
    submitted = await submitResult({
      taskId: executionRecord.taskId,
      workerId: executionRecord.workerId,
      status: 'COMPLETED',
      result: executionRecord.result,
      receipt: executionRecord
    });
  } catch (error) {
    submitted = { ok: false, reasonCodes: ['relay-result-submitter-threw'], detail: text(error?.message, 500) };
  }
  if (!submitted?.ok) {
    return fail(['relay-result-submit-failed', ...(submitted?.reasonCodes || [])], 'RESULT_SUBMISSION_PENDING', {
      detail: text(submitted?.detail, 500),
      executionRecord
    });
  }
  return {
    ok: true,
    policyVersion: AGENT_WORKER_RUNTIME_POLICY_VERSION,
    status: 'COMPLETED',
    executionRecord: { ...executionRecord, status: 'RESULT_SUBMITTED' },
    relayReceipt: submitted,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
