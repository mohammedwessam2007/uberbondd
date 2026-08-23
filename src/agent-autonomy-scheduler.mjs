import { foldAuditRows, AUDIT_SCAN_PAGE_SIZE } from './durable-audit-scan.mjs';

export const AGENT_AUTONOMY_SCHEDULER_POLICY_VERSION = 'agent-autonomy-scheduler-1.1.0';

const SELECTION_TYPE = 'agent_autonomy_scheduler_selection';
// Page size, not a ceiling. The fairness ledger is the one history that must
// never be read partially: a truncated read looks exactly like "nobody has been
// served recently", which is the input that makes the scheduler re-serve the
// runs it just served.
const SCAN_PAGE_SIZE = AUDIT_SCAN_PAGE_SIZE;

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

/**
 * The most recent selection for every run, folded over the whole ledger.
 *
 * This used to be one `store.list({ limit: 2000 })`. `src/store.mjs`
 * `_listDirect` returns insertion order absent an `orderBy`, so that read
 * returned the OLDEST 2000 selections and silently discarded every recent one.
 * A probe with 2100 filler selections then re-served 2 of the 3 runs it had
 * just served, because from inside the window they had never been served at
 * all. Raising the limit moves the point at which that starts; folding to
 * exhaustion at one entry per run removes it.
 */
async function latestSelectionByRun(store) {
  if (!validStore(store)) return { ok: false, reasonCodes: ['store-log-and-list-required'], value: new Map() };
  const scan = await foldAuditRows(store, {
    type: SELECTION_TYPE,
    pageSize: SCAN_PAGE_SIZE,
    seed: new Map(),
    fold: (latest, row) => {
      const runId = text(row?.detail?.runId, 160);
      if (!runId) return latest;
      const current = latest.get(runId);
      if (!current) { latest.set(runId, row); return latest; }
      const selectedAt = String(row?.detail?.selectedAt || row?.createdAt || '');
      const currentAt = String(current?.detail?.selectedAt || current?.createdAt || '');
      if (selectedAt > currentAt || (selectedAt === currentAt && rowAppendOrder(row) > rowAppendOrder(current))) {
        latest.set(runId, row);
      }
      return latest;
    }
  });
  if (!scan.ok) return { ok: false, reasonCodes: scan.reasonCodes, value: new Map(), scannedRows: scan.scannedRows };
  return { ok: true, value: scan.value, scannedRows: scan.scannedRows };
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

  const ledger = await latestSelectionByRun(store);
  // Fail closed. A scheduler that cannot read its own fairness history has no
  // basis for calling any ordering fair, and the failure mode of guessing is to
  // starve whichever runs it cannot see.
  if (!ledger.ok) {
    return {
      ok: false,
      policyVersion: AGENT_AUTONOMY_SCHEDULER_POLICY_VERSION,
      status: 'FAIRNESS_LEDGER_UNREADABLE',
      reasonCodes: [...new Set(['autonomy-scheduler-fairness-ledger-unreadable', ...(ledger.reasonCodes || [])])],
      scannedRows: ledger.scannedRows || 0
    };
  }
  const latestSelection = ledger.value;

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
