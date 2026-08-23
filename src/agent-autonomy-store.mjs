import { sameJson } from './cloud-agent-relay.mjs';
import { foldAuditRows, collectAuditRows, AUDIT_SCAN_PAGE_SIZE } from './durable-audit-scan.mjs';

export const AGENT_AUTONOMY_STORE_POLICY_VERSION = 'agent-autonomy-store-1.1.0';

const SNAPSHOT_TYPE = 'agent_autonomy_run_snapshot';
const RECEIPT_TYPE = 'agent_autonomy_execution_receipt';
// Page size, not a ceiling. See src/durable-audit-scan.mjs: every read below
// walks to exhaustion and fails closed rather than returning a short answer.
const SCAN_PAGE_SIZE = AUDIT_SCAN_PAGE_SIZE;

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

/**
 * Every snapshot row for one run, from the whole history rather than from a
 * window over it.
 *
 * It deliberately does NOT stop at the first page containing the run. An
 * earlier version did, on the reasoning that pages arrive newest-first so the
 * first hit must be the newest. `src/store.mjs` `_listDirect` applies no
 * ordering unless a caller passes `orderBy`, so pages actually arrive in
 * insertion order -- oldest first. Stopping at the first hit therefore returned
 * the run's OLDEST snapshot: a probe that buried a run under 2500 filler rows
 * and then wrote a newer snapshot got sequence 0 back instead of 5. That is the
 * same silent rewind the saturation guard exists to prevent, arriving through
 * the door built to fix it.
 *
 * Scanning to exhaustion costs a full filtered pass. Correctness under an
 * ordering the store does not promise is worth more than a shorter walk.
 */
async function auditRowsForRun(store, type, runId) {
  if (!validStore(store)) return { ok: false, reasonCodes: ['store-log-and-list-required'], rows: [], scannedRows: 0 };
  const id = text(runId, 160);
  if (!id) return { ok: false, reasonCodes: ['run-id-required'], rows: [], scannedRows: 0 };

  const collected = await collectAuditRows(store, {
    type,
    pageSize: SCAN_PAGE_SIZE,
    match: row => row?.detail?.runId === id && validRun(row?.detail?.run)
  });
  if (!collected.ok) {
    return {
      ok: false,
      reasonCodes: scanReasonCodes(collected.reasonCodes),
      rows: [],
      scannedRows: collected.scannedRows || 0
    };
  }
  return { ok: true, rows: collected.rows, scannedRows: collected.scannedRows, exhausted: true };
}

// The shared scanner reports failures in its own vocabulary. This module has a
// published one that callers and tests already match on, so translate rather
// than leak: a caller should not have to learn the name of the helper the
// module happens to read its pages with.
const SCAN_REASON_TRANSLATION = Object.freeze({
  'audit-scan-pagination-stalled': 'autonomy-run-snapshot-pagination-stalled',
  'audit-scan-page-budget-exhausted': 'autonomy-run-snapshot-page-budget-exhausted',
  'store-list-required': 'store-log-and-list-required'
});

function scanReasonCodes(reasonCodes) {
  const translated = (reasonCodes || []).flatMap(code => {
    const local = SCAN_REASON_TRANSLATION[code];
    return local ? [local, code] : [code];
  });
  return [...new Set(['autonomy-run-snapshot-scan-saturated', ...translated])];
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

  // Folded as pages arrive, so peak memory is one row per distinct run rather
  // than one row per snapshot ever written. That is what makes reading the
  // whole history affordable, and it is why this no longer needs a ceiling:
  // the previous single `store.list({ limit: 2000 })` returned the OLDEST 2000
  // rows and still answered `ok: true, status: 'LISTED'`, so a run whose first
  // snapshot landed after that mark was absent from a reply that claimed to be
  // the complete listing. A scheduler reading this could never see it.
  const scan = await foldAuditRows(store, {
    type: SNAPSHOT_TYPE,
    pageSize: SCAN_PAGE_SIZE,
    seed: new Map(),
    fold: (latest, row) => {
      const run = row?.detail?.run;
      if (!validRun(run)) return latest;
      // Dedup used to keep whichever row had the strictly greater timestamp, so
      // a tie kept the FIRST one seen -- the older snapshot. That is not
      // cosmetic here: agent-autonomy-job reads this listing to choose which
      // runs to sweep, so a stale status can put a finished run back in the
      // active set and have its work redone. Rank on the run's monotonic
      // sequence first.
      const current = latest.get(run.runId);
      if (!current) { latest.set(run.runId, row); return latest; }
      const bySequence = runSequence(row) - runSequence(current);
      if (bySequence > 0) { latest.set(run.runId, row); return latest; }
      if (bySequence < 0) return latest;
      const rowTime = String(row?.detail?.createdAt || row?.createdAt || '');
      const currentTime = String(current?.detail?.createdAt || current?.createdAt || '');
      if (rowTime > currentTime || (rowTime === currentTime && rowAppendOrder(row) > rowAppendOrder(current))) {
        latest.set(run.runId, row);
      }
      return latest;
    }
  });

  // A listing that could not read the whole history is not a listing. Report
  // the refusal rather than a subset wearing the shape of a complete answer.
  if (!scan.ok) {
    return {
      ok: false,
      policyVersion: AGENT_AUTONOMY_STORE_POLICY_VERSION,
      status: 'SCAN_SATURATED',
      reasonCodes: scanReasonCodes(scan.reasonCodes),
      scannedRows: scan.scannedRows || 0
    };
  }
  const latest = scan.value;
  // Newest-first is right for an operator reading recent activity and wrong for
  // a scheduler choosing what to work on. Ticking a run refreshes its
  // updatedAt, so a newest-first `limit` window fills with the runs that were
  // just served and the least-recently-touched runs fall off the end.
  // `order: 'oldest'` puts the starved runs in the window; the fairness ledger
  // then orders within it.
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
    scannedRows: scan.scannedRows,
    runs
  };
}

export const AUTONOMY_AUDIT_TYPES = Object.freeze({ snapshot: SNAPSHOT_TYPE, receipt: RECEIPT_TYPE });
