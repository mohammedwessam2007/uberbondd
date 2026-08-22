export const AGENT_AUTONOMY_SCHEDULER_POLICY_VERSION = 'agent-autonomy-scheduler-1.0.0';

const SELECTION_TYPE = 'agent_autonomy_scheduler_selection';
const MAX_SCAN = 2000;

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function validStore(store) {
  return Boolean(store && typeof store.log === 'function' && typeof store.list === 'function');
}

function fail(reasonCodes) {
  return {
    ok: false,
    policyVersion: AGENT_AUTONOMY_SCHEDULER_POLICY_VERSION,
    status: 'REJECTED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))]
  };
}

function rowAppendOrder(row) {
  const match = /(\d+)\s*$/.exec(String(row?.id ?? ''));
  return match ? Number(match[1]) : 0;
}

async function selectionRows(store) {
  if (!validStore(store)) return [];
  const rows = await store.list('auditLog', { filters: { type: SELECTION_TYPE }, limit: MAX_SCAN });
  return Array.isArray(rows) ? rows : [];
}

export async function logAutonomySchedulerSelection(store, run, { date = new Date() } = {}) {
  if (!validStore(store)) return fail(['store-log-and-list-required']);
  const runId = text(run?.runId, 160);
  const sessionId = text(run?.session?.sessionId, 160);
  if (!runId || !sessionId) return fail(['valid-autonomy-run-required']);

  const selectedAt = timestamp(date);
  const row = await store.log(SELECTION_TYPE, {
    policyVersion: AGENT_AUTONOMY_SCHEDULER_POLICY_VERSION,
    runId,
    sessionId,
    selectedAt
  });

  return {
    ok: true,
    policyVersion: AGENT_AUTONOMY_SCHEDULER_POLICY_VERSION,
    status: 'SELECTION_LOGGED',
    runId,
    sessionId,
    auditId: row?.id || null,
    selectedAt
  };
}

export async function selectFairAutonomyRuns(store, runs, { limit = 5 } = {}) {
  if (!validStore(store)) return fail(['store-log-and-list-required']);
  if (!Array.isArray(runs)) return fail(['runs-array-required']);

  const boundedLimit = Math.max(1, Math.min(200, Number.isInteger(Number(limit)) ? Number(limit) : 5));
  const latestSelection = new Map();
  for (const row of await selectionRows(store)) {
    const runId = text(row?.detail?.runId, 160);
    if (!runId) continue;
    const selectedAt = String(row?.detail?.selectedAt || row?.createdAt || '');
    const current = latestSelection.get(runId);
    if (!current) {
      latestSelection.set(runId, row);
      continue;
    }
    const currentAt = String(current?.detail?.selectedAt || current?.createdAt || '');
    if (selectedAt > currentAt || (selectedAt === currentAt && rowAppendOrder(row) > rowAppendOrder(current))) {
      latestSelection.set(runId, row);
    }
  }

  const ordered = [...runs].sort((a, b) => {
    const aRow = latestSelection.get(text(a?.runId, 160));
    const bRow = latestSelection.get(text(b?.runId, 160));
    if (!aRow && bRow) return -1;
    if (aRow && !bRow) return 1;
    if (aRow && bRow) {
      const aAt = String(aRow?.detail?.selectedAt || aRow?.createdAt || '');
      const bAt = String(bRow?.detail?.selectedAt || bRow?.createdAt || '');
      if (aAt !== bAt) return aAt.localeCompare(bAt);
      const byAppendOrder = rowAppendOrder(aRow) - rowAppendOrder(bRow);
      if (byAppendOrder) return byAppendOrder;
    }
    return text(a?.runId, 160).localeCompare(text(b?.runId, 160));
  });

  return {
    ok: true,
    policyVersion: AGENT_AUTONOMY_SCHEDULER_POLICY_VERSION,
    status: ordered.length ? 'SELECTED' : 'IDLE',
    count: Math.min(ordered.length, boundedLimit),
    runs: ordered.slice(0, boundedLimit)
  };
}

export const AUTONOMY_SCHEDULER_AUDIT_TYPES = Object.freeze({ selection: SELECTION_TYPE });
