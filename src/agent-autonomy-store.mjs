import { sameJson } from './cloud-agent-relay.mjs';

export const AGENT_AUTONOMY_STORE_POLICY_VERSION = 'agent-autonomy-store-1.1.0';

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
function runSequence(row) {
  const value = row?.detail?.sequence ?? row?.detail?.run?.sequence;
  return Number.isSafeInteger(value) ? value : -1;
}

function rowAppendOrder(row) {
  const match = /(\d+)\s*$/.exec(String(row?.id ?? ''));
  return match ? Number(match[1]) : 0;
}

function pageIdentity(rows) {
  if (!Array.isArray(rows) || !rows.length) return '';
  const first = rows[0];
  const last = rows[rows.length - 1];
  return `${String(first?.id || '')}|${String(last?.id || '')}|${rows.length}`;
}

/**
 * Find the newest stored snapshots for one run without requiring that run to
 * be present inside one global MAX_SCAN window.
 *
 * Stores already expose bounded offset pagination. We walk newest-first pages
 * until the requested run appears or the filtered audit history is exhausted.
 * Once it appears, later pages are older append history and cannot contain a
 * newer valid sequence because saveAutonomyRunSnapshot rejects sequence
 * regression at write time.
 *
 * A store implementation that ignores offset is detected by a repeated full
 * page. We preserve the historical saturation failure in that case instead of
 * looping forever or pretending absence is proven.
 */
async function auditRowsForRun(store, type, runId) {
  if (!validStore(store)) return { ok: false, reasonCodes: ['store-log-and-list-required'], rows: [], scannedRows: 0 };
  const id = text(runId, 160);
  if (!id) return { ok: false, reasonCodes: ['run-id-required'], rows: [], scannedRows: 0 };

  let offset = 0;
  let scannedRows = 0;
  let priorPageIdentity = '';

  while (true) {
    const page = await store.list('auditLog', {
      filters: { type },
      limit: MAX_SCAN,
      offset
    });
    const rows = Array.isArray(page) ? page : [];
    const identity = pageIdentity(rows);

    // Detect an adapter that ignored offset before counting the repeated page.
    // scannedRows is evidence about unique traversal progress, not network I/O.
    if (rows.length >= MAX_SCAN && priorPageIdentity && identity === priorPageIdentity) {
      return {
        ok: false,
        reasonCodes: ['autonomy-run-snapshot-scan-saturated', 'autonomy-run-snapshot-pagination-stalled'],
        rows: [],
        scannedRows
      };
    }

    scannedRows += rows.length;

    const matches = rows.filter(row => row?.detail?.runId === id && validRun(row?.detail?.run));
    if (matches.length) {
      return { ok: true, rows: matches, scannedRows, exhausted: rows.length < MAX_SCAN };
    }

    if (rows.length < MAX_SCAN) {
      return { ok: true, rows: [], scannedRows, exhausted: true };
    }

    if (!identity) {
      return {
        ok: false,
        reasonCodes: ['autonomy-run-snapshot-scan-saturated', 'autonomy-run-snapshot-pagination-stalled'],
        rows: [],
        scannedRows
      };
    }
    priorPageIdentity = identity;
    offset += rows.length;
  }
}

function latestRunRow(rows) {
  return [...rows]
    .sort((a, b) =>
      (runSequence(b) - runSequence(a))
      || String(b?.detail?.createdAt || b?.createdAt || '').localeCompare(String(a?.detail?.createdAt || a?.createdAt || ''))
      || (rowAppendOrder(b) - rowAppendOrder(a)))[0] || null;
}

export async function saveAutonomyRunSnapshot(store, run, { reason = 'tick', date = new Date() } = {}) {
  if (!validStore(store)) return fail(['store-log-and-list-required']);
  if (!validRun(run)) return fail(['valid-autonomy-run-required']);

  // sequence is strictly monotonic per run (the pump only ever increments it),
  // so it is the authority on which snapshot came later. The read is paged by
  // audit history rather than capped to one global window; unrelated audit
  // volume can no longer make an existing run invisible.
  const incomingSequence = Number.isSafeInteger(run.sequence) ? run.sequence : 0;
  const scanned = await auditRowsForRun(store, SNAPSHOT_TYPE, run.runId);
  if (!scanned.ok) return fail(scanned.reasonCodes || ['autonomy-run-snapshot-history-unavailable']);
  const latest = latestRunRow(scanned.rows);

  if (latest) {
    const latestSequence = runSequence(latest);
    if (incomingSequence < latestSequence) {
      return fail(['autonomy-run-sequence-regression'], 'CONFLICT');
    }
    if (incomingSequence === latestSequence) {
      // Same point in the run. Identical content is a harmless replay after a
      // crash; different content at the same sequence means two writers
      // disagree about what happened, which must not be silently appended.
      if (!sameJson(latest?.detail?.run ?? null, run)) {
        return fail(['autonomy-run-snapshot-conflict'], 'CONFLICT');
      }
      return {
        ok: true,
        policyVersion: AGENT_AUTONOMY_STORE_POLICY_VERSION,
        status: 'SNAPSHOT_ALREADY_SAVED',
        runId: run.runId,
        sessionId: run.session.sessionId,
        auditId: latest?.id || null,
        createdAt: latest?.detail?.createdAt || latest?.createdAt || null
      };
    }
  }

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
  const scanned = await auditRowsForRun(store, SNAPSHOT_TYPE, id);
  if (!scanned.ok) {
    return {
      ok: false,
      policyVersion: AGENT_AUTONOMY_STORE_POLICY_VERSION,
      status: 'SCAN_SATURATED',
      reasonCodes: scanned.reasonCodes || ['autonomy-run-snapshot-scan-saturated'],
      scannedRows: scanned.scannedRows || 0
    };
  }
  if (!scanned.rows.length) {
    return {
      ok: false,
      policyVersion: AGENT_AUTONOMY_STORE_POLICY_VERSION,
      status: 'NOT_FOUND',
      reasonCodes: ['autonomy-run-not-found'],
      scannedRows: scanned.scannedRows
    };
  }
  const latest = latestRunRow(scanned.rows);
  return {
    ok: true,
    policyVersion: AGENT_AUTONOMY_STORE_POLICY_VERSION,
    status: 'LOADED',
    run: latest.detail.run,
    auditId: latest.id || null,
    snapshotAt: latest.detail.createdAt || latest.createdAt || null,
    scannedRows: scanned.scannedRows
  };
}

export async function listLatestAutonomyRuns(store, { statuses = [], limit = 50, order = 'newest' } = {}) {
  if (!validStore(store)) return fail(['store-log-and-list-required']);
  const allowedStatuses = new Set((Array.isArray(statuses) ? statuses : []).map(value => text(value, 80).toUpperCase()).filter(Boolean));
  const rows = await auditRows(store, SNAPSHOT_TYPE);
  const latest = new Map();
  for (const row of rows) {
    const run = row?.detail?.run;
    if (!validRun(run)) continue;
    // Dedup used to keep whichever row had the strictly greater timestamp, so a
    // tie kept the FIRST one seen -- the older snapshot. That is not cosmetic
    // here: agent-autonomy-job reads this listing to choose which runs to
    // sweep, so a stale status can put a finished run back in the active set
    // and have its work redone. Rank on the run's monotonic sequence first.
    const current = latest.get(run.runId);
    if (!current) { latest.set(run.runId, row); continue; }
    const bySequence = runSequence(row) - runSequence(current);
    if (bySequence > 0) { latest.set(run.runId, row); continue; }
    if (bySequence < 0) continue;
    const rowTime = String(row?.detail?.createdAt || row?.createdAt || '');
    const currentTime = String(current?.detail?.createdAt || current?.createdAt || '');
    if (rowTime > currentTime || (rowTime === currentTime && rowAppendOrder(row) > rowAppendOrder(current))) {
      latest.set(run.runId, row);
    }
  }
  // Newest-first is right for an operator reading recent activity and wrong for
  // a scheduler choosing what to work on. Ticking a run refreshes its
  // updatedAt, so under a bounded scan a newest-first window fills with the
  // runs that were just served and the least-recently-touched runs fall off the
  // end and are never seen again. `order: 'oldest'` puts the starved runs in
  // the window; the fairness ledger then orders within it.
  const oldestFirst = String(order || 'newest').toLowerCase() === 'oldest';
  const runs = [...latest.values()]
    .map(row => row.detail.run)
    .filter(run => !allowedStatuses.size || allowedStatuses.has(String(run.status || '').toUpperCase()))
    .sort((a, b) => {
      const left = String(a.updatedAt || '');
      const right = String(b.updatedAt || '');
      const byTime = oldestFirst ? left.localeCompare(right) : right.localeCompare(left);
      // A tie on a coarse timestamp must not be resolved arbitrarily, or the
      // same subset can win every cycle. runId is stable and total.
      return byTime || String(a.runId || '').localeCompare(String(b.runId || ''));
    })
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
