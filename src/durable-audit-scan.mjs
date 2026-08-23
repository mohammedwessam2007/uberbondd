// One way to read the whole of a filtered audit history.
//
// Four modules used to each hold a private `MAX_SCAN` constant and pass it
// straight through as `store.list({ limit })`. That is not a page size, it is a
// ceiling: `src/store.mjs` `_listDirect` applies no ordering unless a caller
// passes `orderBy`, so rows arrive in insertion order and `limit: 2000` returns
// the OLDEST 2000. Past that mark, `listLatestAutonomyRuns` returned
// `ok: true, status: 'LISTED'` with the newest run missing from its own answer,
// and the fairness ledger stopped seeing recent service -- so the scheduler
// re-served runs it had just served, which is the starvation bug the ledger was
// built to prevent, arriving silently at scale.
//
// Raising the number moves the mark. It does not remove it. This module removes
// it: callers fold rows into an accumulator as pages arrive, so the walk runs
// to exhaustion at bounded memory, and a walk that cannot finish fails closed
// instead of returning a short answer that looks complete.
//
// MAX_PAGES below is a liveness guard, not a data ceiling. The difference is
// the whole point: exceeding it is a refusal with a reason code, never a
// truncated success. A store appending faster than this can page it is a
// condition to report, not to quietly round off.

export const DURABLE_AUDIT_SCAN_POLICY_VERSION = 'durable-audit-scan-1.0.0';

export const AUDIT_SCAN_PAGE_SIZE = 500;
const MAX_PAGES = 10_000;

function validStore(store) {
  return Boolean(store && typeof store.list === 'function');
}

function pageIdentity(rows) {
  if (!Array.isArray(rows) || !rows.length) return '';
  return `${String(rows[0]?.id || '')}|${String(rows[rows.length - 1]?.id || '')}|${rows.length}`;
}

/**
 * Walk every audit row of one type, folding as it goes.
 *
 * @param {object} store            durable store exposing list(key, {filters, limit, offset})
 * @param {object} options
 * @param {string} options.type     audit row type to filter on
 * @param {Function} options.fold   (accumulator, row) => accumulator
 * @param {*} options.seed          initial accumulator
 * @param {number} [options.pageSize]
 * @returns {Promise<{ok: true, value: *, scannedRows: number, pages: number, exhausted: true}
 *                  |{ok: false, reasonCodes: string[], scannedRows: number, pages: number}>}
 */
export async function foldAuditRows(store, { type, fold, seed, pageSize = AUDIT_SCAN_PAGE_SIZE } = {}) {
  if (!validStore(store)) {
    return { ok: false, reasonCodes: ['store-list-required'], scannedRows: 0, pages: 0 };
  }
  if (typeof fold !== 'function') {
    return { ok: false, reasonCodes: ['audit-scan-fold-required'], scannedRows: 0, pages: 0 };
  }
  const size = Math.max(1, Math.min(5000, Number.isInteger(pageSize) ? pageSize : AUDIT_SCAN_PAGE_SIZE));

  let accumulator = seed;
  let offset = 0;
  let scannedRows = 0;
  let pages = 0;
  let priorPageIdentity = '';

  while (pages < MAX_PAGES) {
    const page = await store.list('auditLog', { filters: type ? { type } : undefined, limit: size, offset });
    const rows = Array.isArray(page) ? page : [];
    const identity = pageIdentity(rows);
    pages += 1;

    // An adapter that ignores `offset` hands back the same full page forever.
    // Detect it before counting the repeat, so scannedRows stays evidence about
    // unique traversal rather than about how many times we asked.
    if (rows.length >= size && priorPageIdentity && identity === priorPageIdentity) {
      return { ok: false, reasonCodes: ['audit-scan-pagination-stalled'], scannedRows, pages };
    }

    scannedRows += rows.length;
    for (const row of rows) accumulator = fold(accumulator, row);

    if (rows.length < size) {
      return { ok: true, value: accumulator, scannedRows, pages, exhausted: true };
    }
    if (!identity) {
      return { ok: false, reasonCodes: ['audit-scan-pagination-stalled'], scannedRows, pages };
    }
    priorPageIdentity = identity;
    offset += rows.length;
  }

  // Liveness guard tripped. Report it; never return the partial fold.
  return { ok: false, reasonCodes: ['audit-scan-page-budget-exhausted'], scannedRows, pages };
}

/**
 * Collect the rows of one type that satisfy `match`. Memory is bounded by the
 * number of matches, not by the size of the history.
 */
export async function collectAuditRows(store, { type, match = () => true, pageSize } = {}) {
  const result = await foldAuditRows(store, {
    type,
    pageSize,
    seed: [],
    fold: (rows, row) => {
      if (match(row)) rows.push(row);
      return rows;
    }
  });
  if (!result.ok) return { ...result, rows: [] };
  return { ok: true, rows: result.value, scannedRows: result.scannedRows, pages: result.pages, exhausted: true };
}
