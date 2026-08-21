export const AGENT_AUTONOMY_STORE_POLICY_VERSION = 'agent-autonomy-store-1.0.0';

const SNAPSHOT_TYPE = 'agent_autonomy_run_snapshot';
const RECEIPT_TYPE = 'agent_autonomy_execution_receipt';
const MAX_SCAN = 2000;

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function fail(reasonCodes) {
  return {
    ok: false,
    policyVersion: AGENT_AUTONOMY_STORE_POLICY_VERSION,
    status: 'REJECTED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))]
  };
}

function validStore(store) {
  return Boolean(store && typeof store.log === 'function' && typeof store.list === 'function');
}

function validRun(run) {
  return Boolean(run?.ok && run.runId && run.session?.sessionId);
}

// Audit row ids end in the store's monotonic counter. Compare the numeric
// tail, not the string -- "row-9" sorts after "row-12" lexically.
function rowAppendOrder(row) {
  const match = /(\d+)\s*$/.exec(String(row?.id ?? ''));
  return match ? Number(match[1]) : 0;
}

export async function saveAutonomyRunSnapshot(store, run, { reason = 'tick', date = new Date() } = {}) {
  if (!validStore(store)) return fail(['store-log-and-list-required']);
  if (!validRun(run)) return fail(['valid-autonomy-run-required']);
  const createdAt = timestamp(date);
  const detail = {
    policyVersion: AGENT_AUTONOMY_STORE_POLICY_VERSION,
    runId: run.runId,
    sessionId: run.session.sessionId,
    phase: run.phase,
    status: run.status,
    reason: text(reason, 120) || 'tick',
    sequence: Number(run.sequence || 0),
    run,
    createdAt
  };
  const row = await store.log(SNAPSHOT_TYPE, detail);
  return {
    ok: true,
    policyVersion: AGENT_AUTONOMY_STORE_POLICY_VERSION,
    status: 'SNAPSHOT_SAVED',
    runId: run.runId,
    sessionId: run.session.sessionId,
    auditId: row?.id || null,
    createdAt
  };
}

export async function logAutonomyExecutionReceipt(store, receipt, { date = new Date() } = {}) {
  if (!validStore(store)) return fail(['store-log-and-list-required']);
  if (!receipt || typeof receipt !== 'object' || !receipt.runId || !receipt.taskId) return fail(['valid-execution-receipt-required']);
  const createdAt = timestamp(date);
  const row = await store.log(RECEIPT_TYPE, {
    policyVersion: AGENT_AUTONOMY_STORE_POLICY_VERSION,
    ...receipt,
    createdAt
  });
  return {
    ok: true,
    policyVersion: AGENT_AUTONOMY_STORE_POLICY_VERSION,
    status: 'RECEIPT_LOGGED',
    auditId: row?.id || null,
    createdAt
  };
}

async function auditRows(store, type, limit = MAX_SCAN) {
  if (!validStore(store)) return [];
  const rows = await store.list('auditLog', { filters: { type }, limit: Math.max(1, Math.min(MAX_SCAN, Number(limit || MAX_SCAN))) });
  return Array.isArray(rows) ? rows : [];
}

export async function loadLatestAutonomyRun(store, runId) {
  if (!validStore(store)) return fail(['store-log-and-list-required']);
  const id = text(runId, 160);
  if (!id) return fail(['run-id-required']);
  const rows = await auditRows(store, SNAPSHOT_TYPE);
  const matches = rows
    .filter(row => row?.detail?.runId === id && validRun(row?.detail?.run))
    // Timestamps alone leave ties unordered, and an unordered tie here means
    // loading an OLDER run snapshot -- rewinding progress. Two P0s in this
    // repository were that exact mistake (execution records and compute budget
    // snapshots, both fixed by ranking on a monotonic quantity). Autonomy runs
    // declare no monotonic field to rank on, so fall back to the store's own
    // append order, which is at least defined. Kept local deliberately: a
    // three-line tiebreak does not justify coupling this module to another.
    .sort((a, b) =>
      String(b?.detail?.createdAt || b?.createdAt || '').localeCompare(String(a?.detail?.createdAt || a?.createdAt || ''))
      || (rowAppendOrder(b) - rowAppendOrder(a)));
  if (!matches.length) {
    return {
      ok: false,
      policyVersion: AGENT_AUTONOMY_STORE_POLICY_VERSION,
      status: 'NOT_FOUND',
      reasonCodes: ['autonomy-run-not-found']
    };
  }
  const latest = matches[0];
  return {
    ok: true,
    policyVersion: AGENT_AUTONOMY_STORE_POLICY_VERSION,
    status: 'LOADED',
    run: latest.detail.run,
    auditId: latest.id || null,
    snapshotAt: latest.detail.createdAt || latest.createdAt || null
  };
}

export async function listLatestAutonomyRuns(store, { statuses = [], limit = 50 } = {}) {
  if (!validStore(store)) return fail(['store-log-and-list-required']);
  const allowedStatuses = new Set((Array.isArray(statuses) ? statuses : []).map(value => text(value, 80).toUpperCase()).filter(Boolean));
  const rows = await auditRows(store, SNAPSHOT_TYPE);
  const latest = new Map();
  for (const row of rows) {
    const run = row?.detail?.run;
    if (!validRun(run)) continue;
    const current = latest.get(run.runId);
    const rowTime = String(row?.detail?.createdAt || row?.createdAt || '');
    const currentTime = String(current?.detail?.createdAt || current?.createdAt || '');
    if (!current || rowTime > currentTime) latest.set(run.runId, row);
  }
  const runs = [...latest.values()]
    .map(row => row.detail.run)
    .filter(run => !allowedStatuses.size || allowedStatuses.has(String(run.status || '').toUpperCase()))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, Math.max(1, Math.min(200, Number(limit || 50))));
  return {
    ok: true,
    policyVersion: AGENT_AUTONOMY_STORE_POLICY_VERSION,
    status: 'LISTED',
    count: runs.length,
    runs
  };
}

export const AUTONOMY_AUDIT_TYPES = Object.freeze({ snapshot: SNAPSHOT_TYPE, receipt: RECEIPT_TYPE });
