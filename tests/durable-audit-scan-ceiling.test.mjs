// The autonomy persistence ceiling.
//
// Four modules each held a private `MAX_SCAN` and passed it straight through as
// `store.list({ limit })`. That reads as a page size and behaves as a ceiling:
// `src/store.mjs` `_listDirect` applies no ordering unless a caller passes
// `orderBy`, so rows arrive oldest-first and `limit: 2000` returns the OLDEST
// 2000. Two probes, both reproduced against the real modules before the fix:
//
//   A. 2100 filler snapshots, then one new run. `listLatestAutonomyRuns`
//      returned `ok: true, status: 'LISTED'` and the new run was not in it.
//      Not a saturation error -- a confident, complete-looking, wrong answer.
//
//   B. 2100 filler selections, then three runs served. `selectFairAutonomyRuns`
//      re-served 2 of those 3 immediately, because from inside the window they
//      had never been served. The starvation bug the fairness ledger exists to
//      prevent, returning at scale, silently.
//
// These tests use counts above the old mark deliberately. If someone reinstates
// a ceiling by raising a number, they fail here rather than in production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAutonomySession, compileTaskIntent } from '../src/agent-autonomy-loop.mjs';
import { createAutonomyRun } from '../src/agent-autonomy-pump.mjs';
import { saveAutonomyRunSnapshot, listLatestAutonomyRuns } from '../src/agent-autonomy-store.mjs';
import { selectFairAutonomyRuns, logAutonomySchedulerSelection } from '../src/agent-autonomy-scheduler.mjs';
import { foldAuditRows, collectAuditRows, AUDIT_SCAN_PAGE_SIZE } from '../src/durable-audit-scan.mjs';

const OLD_CEILING = 2000;
const BEYOND = OLD_CEILING + 100;

function fakeStore() {
  const auditLog = [];
  let n = 0;
  return {
    auditLog,
    async log(type, detail) {
      const row = {
        id: `row-${++n}`,
        type,
        detail: structuredClone(detail),
        createdAt: detail.createdAt || detail.selectedAt || new Date().toISOString()
      };
      auditLog.push(row);
      return row;
    },
    async list(key, options = {}) {
      assert.equal(key, 'auditLog');
      let rows = [...auditLog];
      if (options.filters?.type) rows = rows.filter(row => row.type === options.filters.type);
      if (options.offset) rows = rows.slice(options.offset);
      if (Number.isInteger(options.limit)) rows = rows.slice(0, Math.max(0, options.limit));
      return rows;
    }
  };
}

function mkRun(index) {
  const session = compileAutonomySession({ objective: `ceiling probe ${index}`, maxRounds: 20, maxTasks: 20 });
  const initialIntent = compileTaskIntent({
    session,
    originAgent: 'uberbond',
    targetAgent: 'chatgpt',
    objective: `probe ${index} objective, long enough to compile`,
    acceptanceTests: ['bounded']
  });
  return createAutonomyRun({ session, initialIntent });
}

test('a run whose snapshot lands beyond the old ceiling is still in the listing', async () => {
  const store = fakeStore();
  for (let index = 0; index < BEYOND; index += 1) {
    await saveAutonomyRunSnapshot(store, mkRun(index), { date: new Date('2026-08-01T00:00:00Z') });
  }
  const late = mkRun(999999);
  await saveAutonomyRunSnapshot(store, late, { date: new Date('2026-08-23T12:00:00Z') });

  const listed = await listLatestAutonomyRuns(store, { statuses: ['ACTIVE', 'PENDING'], limit: 500 });
  assert.equal(listed.ok, true);
  assert.ok(listed.scannedRows > OLD_CEILING, `only ${listed.scannedRows} rows were read`);
  assert.ok(listed.runs.some(run => run.runId === late.runId),
    'a run written past the old scan window was absent from a listing that reported success');
});

test('fairness survives a selection ledger longer than the old ceiling', async () => {
  const store = fakeStore();
  const runs = Array.from({ length: 6 }, (_, index) => mkRun(index + 5000));
  const filler = mkRun(4242);
  for (let index = 0; index < BEYOND; index += 1) {
    await logAutonomySchedulerSelection(store, filler, { date: new Date('2026-08-01T00:00:00Z') });
  }
  const justServed = runs.slice(0, 3);
  for (const run of justServed) {
    await logAutonomySchedulerSelection(store, run, { date: new Date('2026-08-23T12:00:00Z') });
  }

  const selected = await selectFairAutonomyRuns(store, runs, { limit: 3 });
  assert.equal(selected.ok, true);
  const servedIds = new Set(justServed.map(run => run.runId));
  const reServed = selected.runs.map(run => run.runId).filter(id => servedIds.has(id));
  assert.deepEqual(reServed, [],
    'runs served moments ago were selected again: recent history fell outside the read');
});

test('a listing that cannot read the whole history refuses instead of answering short', async () => {
  // A store that ignores `offset` is the shape a partial read takes in the wild.
  const store = fakeStore();
  for (let index = 0; index < BEYOND; index += 1) {
    await saveAutonomyRunSnapshot(store, mkRun(index), { date: new Date('2026-08-01T00:00:00Z') });
  }
  const stuck = {
    async log(...args) { return store.log(...args); },
    async list(key, options = {}) { return store.list(key, { ...options, offset: 0 }); }
  };

  const listed = await listLatestAutonomyRuns(stuck, { statuses: ['ACTIVE'], limit: 50 });
  assert.equal(listed.ok, false);
  assert.equal(listed.status, 'SCAN_SATURATED');
  assert.ok(listed.reasonCodes.includes('autonomy-run-snapshot-scan-saturated'));
  assert.ok(listed.reasonCodes.includes('audit-scan-pagination-stalled'));
});

test('a scheduler that cannot read its fairness ledger refuses to call an order fair', async () => {
  const store = fakeStore();
  const runs = Array.from({ length: 3 }, (_, index) => mkRun(index + 7000));
  for (let index = 0; index < BEYOND; index += 1) {
    await logAutonomySchedulerSelection(store, runs[0], { date: new Date('2026-08-01T00:00:00Z') });
  }
  const stuck = {
    async log(...args) { return store.log(...args); },
    async list(key, options = {}) { return store.list(key, { ...options, offset: 0 }); }
  };

  const selected = await selectFairAutonomyRuns(stuck, runs, { limit: 2 });
  assert.equal(selected.ok, false);
  assert.equal(selected.status, 'FAIRNESS_LEDGER_UNREADABLE');
  assert.ok(selected.reasonCodes.includes('autonomy-scheduler-fairness-ledger-unreadable'));
});

test('the scanner folds at one entry per key, not one per row', async () => {
  const store = fakeStore();
  for (let index = 0; index < BEYOND; index += 1) {
    await store.log('probe_type', { key: `k${index % 7}`, index });
  }
  const scan = await foldAuditRows(store, {
    type: 'probe_type',
    seed: new Map(),
    fold: (acc, row) => acc.set(row.detail.key, row)
  });
  assert.equal(scan.ok, true);
  assert.equal(scan.scannedRows, BEYOND, 'the walk must reach every row');
  assert.equal(scan.value.size, 7, 'memory is bounded by distinct keys, not history length');
  assert.ok(scan.pages > 1, 'the walk must actually paginate');
});

test('the scanner never returns a partial fold as success', async () => {
  const store = fakeStore();
  for (let index = 0; index < BEYOND; index += 1) await store.log('probe_type', { index });
  const stuck = { async list(key, options = {}) { return store.list(key, { ...options, offset: 0 }); } };

  const scan = await foldAuditRows(stuck, { type: 'probe_type', seed: 0, fold: acc => acc + 1 });
  assert.equal(scan.ok, false);
  assert.equal(scan.value, undefined, 'a refused scan must not hand back the rows it did read');
  assert.deepEqual(scan.reasonCodes, ['audit-scan-pagination-stalled']);

  const collected = await collectAuditRows(stuck, { type: 'probe_type' });
  assert.equal(collected.ok, false);
  assert.deepEqual(collected.rows, []);
});

// There used to be a second refusal below the short-page return, for a page with
// no identity. It was unreachable -- by that line a short page has already
// returned, so `rows.length >= size >= 1`, and `pageIdentity` builds a string
// that is non-empty for any non-empty page. Instrumenting it with a throw and
// running every suite that touches this module confirmed nothing reaches it.
//
// It was removed rather than kept as reassurance, which leaves one question
// worth answering with a test instead of an argument: rows with no `id` at all
// produce the weakest identity the scanner can form ("||500"), so are they still
// caught when a store stalls? They are, because that identity is stable across
// repeats, which is exactly what the repeat check looks at.
test('a stalled store is caught even when no row carries an id', async () => {
  const page = Array.from({ length: AUDIT_SCAN_PAGE_SIZE }, () => ({ type: 'probe_type', detail: {} }));
  const idless = { async list() { return page.map(row => ({ ...row })); } };

  const scan = await foldAuditRows(idless, { type: 'probe_type', seed: 0, fold: acc => acc + 1 });
  assert.equal(scan.ok, false, 'an id-less page repeating forever must not read as a successful walk');
  assert.deepEqual(scan.reasonCodes, ['audit-scan-pagination-stalled']);
  assert.equal(scan.value, undefined);
  assert.ok(scan.pages < 10, `the refusal must be prompt, not after the page budget: ${scan.pages}`);
});
