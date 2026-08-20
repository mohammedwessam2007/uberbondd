import { hasSecret } from './cloud-agent-relay.mjs';

export const AGENT_COMPUTE_STORE_POLICY_VERSION = 'agent-compute-store-1.0.0';

const SNAPSHOT_TYPE = 'agent_compute_budget_snapshot';
const EXECUTION_TYPE = 'agent_compute_execution_record';
const MAX_SCAN = 3000;
const MAX_EXECUTION_BYTES = 60_000;

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

function validBudget(budget) {
  return Boolean(
    budget?.ok
    && budget.budgetId
    && budget.businessEffectAuthority === 'NONE'
    && Number.isSafeInteger(Number(budget.maxCostCents))
    && Number.isSafeInteger(Number(budget.maxTokens))
    && budget.reservations
    && typeof budget.reservations === 'object'
    && !Array.isArray(budget.reservations)
  );
}

function safeBudget(budget) {
  if (!validBudget(budget) || hasSecret(budget)) return null;
  return structuredClone(budget);
}

async function rows(store, type, limit = MAX_SCAN) {
  if (!validStore(store)) return [];
  const result = await store.list('auditLog', {
    filters: { type },
    limit: Math.max(1, Math.min(MAX_SCAN, Number(limit || MAX_SCAN)))
  });
  return Array.isArray(result) ? result : [];
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
    .filter(row => row?.detail?.budgetId === id && safeBudget(row?.detail?.budget))
    .sort((a, b) => String(b?.detail?.createdAt || b?.createdAt || '').localeCompare(String(a?.detail?.createdAt || a?.createdAt || '')));
  if (!matches.length) return fail(['compute-budget-not-found'], 'NOT_FOUND');
  const latest = matches[0];
  return {
    ok: true,
    policyVersion: AGENT_COMPUTE_STORE_POLICY_VERSION,
    status: 'LOADED',
    budget: structuredClone(latest.detail.budget),
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
  const at = timestamp(date);
  const detail = {
    policyVersion: AGENT_COMPUTE_STORE_POLICY_VERSION,
    executionId: executionRecord.executionId,
    taskId: executionRecord.taskId,
    status: text(executionRecord.status, 100).toUpperCase(),
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
  const matches = all
    .filter(row => row?.detail?.taskId === id && row?.detail?.executionRecord && !hasSecret(row.detail.executionRecord))
    .sort((a, b) => String(b?.detail?.createdAt || b?.createdAt || '').localeCompare(String(a?.detail?.createdAt || a?.createdAt || '')));
  if (!matches.length) return fail(['agent-execution-not-found'], 'NOT_FOUND');
  const latest = matches[0];
  return {
    ok: true,
    policyVersion: AGENT_COMPUTE_STORE_POLICY_VERSION,
    status: 'LOADED',
    executionRecord: structuredClone(latest.detail.executionRecord),
    auditId: latest.id || null,
    savedAt: latest.detail.createdAt || latest.createdAt || null
  };
}

export async function listPendingAgentSubmissions(store, { limit = 20 } = {}) {
  if (!validStore(store)) return fail(['store-log-and-list-required']);
  const all = await rows(store, EXECUTION_TYPE);
  const latestByTask = new Map();
  for (const row of all) {
    const record = row?.detail?.executionRecord;
    if (!record?.taskId || hasSecret(record)) continue;
    const current = latestByTask.get(record.taskId);
    const rowTime = String(row?.detail?.createdAt || row?.createdAt || '');
    const currentTime = String(current?.detail?.createdAt || current?.createdAt || '');
    if (!current || rowTime > currentTime) latestByTask.set(record.taskId, row);
  }
  const records = [...latestByTask.values()]
    .map(row => row.detail.executionRecord)
    .filter(record => String(record.status || '').toUpperCase() === 'RESULT_SUBMISSION_PENDING')
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    .slice(0, Math.max(1, Math.min(100, Number(limit || 20))));
  return {
    ok: true,
    policyVersion: AGENT_COMPUTE_STORE_POLICY_VERSION,
    status: 'LISTED',
    count: records.length,
    records
  };
}

export const AGENT_COMPUTE_AUDIT_TYPES = Object.freeze({
  snapshot: SNAPSHOT_TYPE,
  execution: EXECUTION_TYPE
});
