import { hasSecret } from './cloud-agent-relay.mjs';
import { validateComputeBudget } from './ai-compute-budget.mjs';

export const AGENT_COMPUTE_STORE_POLICY_VERSION = 'agent-compute-store-1.2.0';

const SNAPSHOT_TYPE = 'agent_compute_budget_snapshot';
const EXECUTION_TYPE = 'agent_compute_execution_record';
const MAX_SCAN = 3000;
const MAX_EXECUTION_BYTES = 60_000;
const COMPUTE_SECRET_KEY = /secret|password|credential|privatekey|apikey|authorization/i;
const SECRET_VALUE = /(?:\bsk-[A-Za-z0-9]{12,}|\bghp_[A-Za-z0-9]{12,}|-----BEGIN|Bearer\s+\S+)/;
const EXECUTION_STATUSES = new Set([
  'COMPUTE_OUTCOME_UNCERTAIN',
  'COMPUTE_BUDGET_VIOLATION',
  'INVALID_MODEL_RESULT',
  'MODEL_RESULT_READY',
  'RESULT_SUBMISSION_PENDING',
  'RESULT_SUBMITTED'
]);
const TERMINAL_EXECUTION_STATUSES = new Set([
  'COMPUTE_OUTCOME_UNCERTAIN',
  'COMPUTE_BUDGET_VIOLATION',
  'INVALID_MODEL_RESULT',
  'RESULT_SUBMITTED'
]);

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function bytes(value) {
  return Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
}

function rowTime(row) {
  return String(row?.detail?.createdAt || row?.createdAt || '');
}

function fail(reasonCodes, status = 'REJECTED', extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_COMPUTE_STORE_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    ...extra
  };
}

function validStore(store) {
  return Boolean(store && typeof store.log === 'function' && typeof store.list === 'function');
}

function hasComputeSecret(value) {
  if (typeof value === 'string') return SECRET_VALUE.test(value);
  if (Array.isArray(value)) return value.some(hasComputeSecret);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) => COMPUTE_SECRET_KEY.test(key) || hasComputeSecret(item));
}

function safeBudget(budget) {
  if (!validateComputeBudget(budget).ok || hasComputeSecret(budget)) return null;
  return structuredClone(budget);
}

function inspectBudgetRow(row, expectedBudgetId) {
  const detailId = text(row?.detail?.budgetId, 160);
  const budget = safeBudget(row?.detail?.budget);
  const embeddedId = text(budget?.budgetId, 160);
  if (!detailId || !budget || !embeddedId) return fail(['stored-compute-budget-corrupt'], 'CORRUPT');
  if (detailId !== embeddedId) return fail(['stored-compute-budget-identity-mismatch'], 'CORRUPT');
  if (expectedBudgetId && detailId !== expectedBudgetId) return fail(['stored-compute-budget-identity-mismatch'], 'CORRUPT');
  return { ok: true, budget };
}

function inspectExecutionRow(row, expectedTaskId = null) {
  const detail = row?.detail;
  const record = detail?.executionRecord;
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return fail(['stored-execution-record-corrupt'], 'CORRUPT');
  }
  if (!record.executionId || !record.taskId || !record.status) {
    return fail(['stored-execution-record-corrupt'], 'CORRUPT');
  }
  if (hasSecret(record) || bytes(record) > MAX_EXECUTION_BYTES) {
    return fail(['stored-execution-record-corrupt'], 'CORRUPT');
  }
  const detailExecutionId = text(detail.executionId, 240);
  const detailTaskId = text(detail.taskId, 160);
  const detailStatus = text(detail.status, 100).toUpperCase();
  const recordExecutionId = text(record.executionId, 240);
  const recordTaskId = text(record.taskId, 160);
  const recordStatus = text(record.status, 100).toUpperCase();
  if (!EXECUTION_STATUSES.has(recordStatus)) return fail(['stored-execution-record-status-invalid'], 'CORRUPT');
  if (detailExecutionId !== recordExecutionId || detailTaskId !== recordTaskId || detailStatus !== recordStatus) {
    return fail(['stored-execution-record-identity-mismatch'], 'CORRUPT');
  }
  if (expectedTaskId && recordTaskId !== expectedTaskId) {
    return fail(['stored-execution-record-task-mismatch'], 'CORRUPT');
  }
  return { ok: true, executionRecord: structuredClone(record) };
}

async function rows(store, type, limit = MAX_SCAN) {
  if (!validStore(store)) return [];
  const result = await store.list('auditLog', {
    filters: { type },
    limit: Math.max(1, Math.min(MAX_SCAN, Number(limit || MAX_SCAN)))
  });
  return Array.isArray(result) ? result : [];
}

function executionRowsForTask(allRows, taskId) {
  return allRows
    .filter(row => row?.detail?.taskId === taskId || row?.detail?.executionRecord?.taskId === taskId)
    .sort((a, b) => rowTime(b).localeCompare(rowTime(a)));
}

function sameExecutionRecord(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function validateExecutionTransition(previous, next) {
  if (!previous) return { ok: true, status: 'FIRST_RECORD' };
  const previousStatus = text(previous.status, 100).toUpperCase();
  const nextStatus = text(next.status, 100).toUpperCase();
  if (!EXECUTION_STATUSES.has(previousStatus) || !EXECUTION_STATUSES.has(nextStatus)) {
    return fail(['execution-status-invalid'], 'CONFLICT');
  }

  if (TERMINAL_EXECUTION_STATUSES.has(previousStatus)) {
    if (previousStatus === nextStatus
      && previous.executionId === next.executionId
      && sameExecutionRecord(previous, next)) {
      return { ok: true, status: 'IDEMPOTENT_TERMINAL_REPLAY' };
    }
    return fail(['terminal-execution-history-conflict'], 'CONFLICT');
  }

  if (previous.executionId !== next.executionId) {
    return fail(['execution-id-changed-within-task-history'], 'CONFLICT');
  }

  if (previousStatus === 'MODEL_RESULT_READY') {
    if (!new Set(['MODEL_RESULT_READY', 'RESULT_SUBMISSION_PENDING', 'RESULT_SUBMITTED']).has(nextStatus)) {
      return fail(['execution-status-regression'], 'CONFLICT');
    }
    return { ok: true, status: previousStatus === nextStatus ? 'IDEMPOTENT_STAGE_REPLAY' : 'ADVANCED' };
  }

  if (previousStatus === 'RESULT_SUBMISSION_PENDING') {
    if (!new Set(['RESULT_SUBMISSION_PENDING', 'RESULT_SUBMITTED']).has(nextStatus)) {
      return fail(['execution-status-regression'], 'CONFLICT');
    }
    return { ok: true, status: previousStatus === nextStatus ? 'IDEMPOTENT_STAGE_REPLAY' : 'ADVANCED' };
  }

  return fail(['execution-transition-unrecognized'], 'CONFLICT');
}

export async function saveComputeBudgetSnapshot(store, budget, {
  reason = 'worker-tick',
  taskId = null,
  executionStatus = null,
  date = new Date()
} = {}) {
  if (!validStore(store)) return fail(['store-log-and-list-required']);
  const snapshot = safeBudget(budget);
  if (!snapshot) return fail(['valid-secret-free-compute-budget-required']);
  const at = timestamp(date);
  const detail = {
    policyVersion: AGENT_COMPUTE_STORE_POLICY_VERSION,
    budgetId: snapshot.budgetId,
    taskId: text(taskId, 160) || null,
    reason: text(reason, 160) || 'worker-tick',
    executionStatus: text(executionStatus, 100).toUpperCase() || null,
    budget: snapshot,
    createdAt: at
  };
  const row = await store.log(SNAPSHOT_TYPE, detail);
  return {
    ok: true,
    policyVersion: AGENT_COMPUTE_STORE_POLICY_VERSION,
    status: 'SNAPSHOT_SAVED',
    budgetId: snapshot.budgetId,
    auditId: row?.id || null,
    createdAt: at
  };
}

export async function loadLatestComputeBudget(store, budgetId) {
  if (!validStore(store)) return fail(['store-log-and-list-required']);
  const id = text(budgetId, 160);
  if (!id) return fail(['budget-id-required']);
  const all = await rows(store, SNAPSHOT_TYPE);
  const matches = all
    .filter(row => row?.detail?.budgetId === id || row?.detail?.budget?.budgetId === id)
    .sort((a, b) => rowTime(b).localeCompare(rowTime(a)));
  if (!matches.length) return fail(['compute-budget-not-found'], 'NOT_FOUND');
  const latest = matches[0];
  const inspected = inspectBudgetRow(latest, id);
  if (!inspected.ok) return inspected;
  return {
    ok: true,
    policyVersion: AGENT_COMPUTE_STORE_POLICY_VERSION,
    status: 'LOADED',
    budget: inspected.budget,
    auditId: latest.id || null,
    snapshotAt: latest.detail.createdAt || latest.createdAt || null
  };
}

export async function saveAgentExecutionRecord(store, executionRecord, { date = new Date() } = {}) {
  if (!validStore(store)) return fail(['store-log-and-list-required']);
  if (!executionRecord || typeof executionRecord !== 'object' || !executionRecord.executionId || !executionRecord.taskId) {
    return fail(['valid-execution-record-required']);
  }
  if (hasSecret(executionRecord)) return fail(['secret-like-execution-record-rejected']);
  if (bytes(executionRecord) > MAX_EXECUTION_BYTES) return fail(['execution-record-too-large']);
  const status = text(executionRecord.status, 100).toUpperCase();
  if (!status) return fail(['execution-status-required']);
  if (!EXECUTION_STATUSES.has(status)) return fail(['execution-status-invalid']);

  const existingRows = executionRowsForTask(await rows(store, EXECUTION_TYPE), text(executionRecord.taskId, 160));
  if (existingRows.length) {
    const inspected = inspectExecutionRow(existingRows[0], text(executionRecord.taskId, 160));
    if (!inspected.ok) return inspected;
    const transition = validateExecutionTransition(inspected.executionRecord, executionRecord);
    if (!transition.ok) return transition;
    if (transition.status === 'IDEMPOTENT_TERMINAL_REPLAY' || transition.status === 'IDEMPOTENT_STAGE_REPLAY') {
      return {
        ok: true,
        policyVersion: AGENT_COMPUTE_STORE_POLICY_VERSION,
        status: 'EXECUTION_ALREADY_SAVED',
        executionId: executionRecord.executionId,
        taskId: executionRecord.taskId,
        auditId: existingRows[0]?.id || null,
        createdAt: existingRows[0]?.detail?.createdAt || existingRows[0]?.createdAt || null
      };
    }
  }

  const at = timestamp(date);
  const detail = {
    policyVersion: AGENT_COMPUTE_STORE_POLICY_VERSION,
    executionId: executionRecord.executionId,
    taskId: executionRecord.taskId,
    status,
    executionRecord: structuredClone(executionRecord),
    createdAt: at
  };
  const row = await store.log(EXECUTION_TYPE, detail);
  return {
    ok: true,
    policyVersion: AGENT_COMPUTE_STORE_POLICY_VERSION,
    status: 'EXECUTION_SAVED',
    executionId: executionRecord.executionId,
    taskId: executionRecord.taskId,
    auditId: row?.id || null,
    createdAt: at
  };
}

export async function loadLatestAgentExecution(store, taskId) {
  if (!validStore(store)) return fail(['store-log-and-list-required']);
  const id = text(taskId, 160);
  if (!id) return fail(['task-id-required']);
  const all = await rows(store, EXECUTION_TYPE);
  const matches = executionRowsForTask(all, id);
  if (!matches.length) return fail(['agent-execution-not-found'], 'NOT_FOUND');
  const latest = matches[0];
  const inspected = inspectExecutionRow(latest, id);
  if (!inspected.ok) return inspected;
  return {
    ok: true,
    policyVersion: AGENT_COMPUTE_STORE_POLICY_VERSION,
    status: 'LOADED',
    executionRecord: inspected.executionRecord,
    auditId: latest.id || null,
    savedAt: latest.detail.createdAt || latest.createdAt || null
  };
}

export async function listPendingAgentSubmissions(store, { limit = 20 } = {}) {
  if (!validStore(store)) return fail(['store-log-and-list-required']);
  const all = await rows(store, EXECUTION_TYPE);
  const latestByTask = new Map();
  for (const row of all) {
    const detailTask = text(row?.detail?.taskId, 160);
    const recordTask = text(row?.detail?.executionRecord?.taskId, 160);
    const taskIds = [...new Set([detailTask, recordTask].filter(Boolean))];
    if (!taskIds.length) return fail(['execution-history-corrupt:missing-task-id'], 'CORRUPT');
    for (const taskId of taskIds) {
      const current = latestByTask.get(taskId);
      if (!current || rowTime(row) > rowTime(current)) latestByTask.set(taskId, row);
    }
  }

  const records = [];
  for (const [taskId, row] of latestByTask.entries()) {
    const inspected = inspectExecutionRow(row, taskId);
    if (!inspected.ok) {
      return fail([`execution-history-corrupt:${taskId}`, ...inspected.reasonCodes], 'CORRUPT');
    }
    records.push(inspected.executionRecord);
  }

  const replayableStatuses = new Set(['MODEL_RESULT_READY', 'RESULT_SUBMISSION_PENDING']);
  const pending = records
    .filter(record => replayableStatuses.has(String(record.status || '').toUpperCase()))
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .slice(0, Math.max(1, Math.min(100, Number(limit || 20))));
  return {
    ok: true,
    policyVersion: AGENT_COMPUTE_STORE_POLICY_VERSION,
    status: 'LISTED',
    count: pending.length,
    records: pending
  };
}

export const AGENT_COMPUTE_AUDIT_TYPES = Object.freeze({
  snapshot: SNAPSHOT_TYPE,
  execution: EXECUTION_TYPE
});
