import test from 'node:test';
import assert from 'node:assert/strict';
import { compileScheduledAutonomyRun } from '../src/agent-autonomy-scheduled-run.mjs';
import { loadLatestAutonomyRun, saveAutonomyRunSnapshot } from '../src/agent-autonomy-store.mjs';

const SNAPSHOT_TYPE = 'agent_autonomy_run_snapshot';
const PAGE = 2000;

function pagedStore() {
  const rows = [];
  return {
    rows,
    async log(type, detail) {
      const row = {
        id: `a${rows.length + 1}`,
        type,
        detail: structuredClone(detail),
        createdAt: detail.createdAt || new Date().toISOString()
      };
      rows.push(row);
      return structuredClone(row);
    },
    async list(key, options = {}) {
      assert.equal(key, 'auditLog');
      let out = [...rows];
      if (options.filters?.type) out = out.filter(row => row.type === options.filters.type);
      out.reverse();
      const offset = Number.isInteger(options.offset) ? options.offset : 0;
      const limit = Number.isInteger(options.limit) ? options.limit : out.length;
      return structuredClone(out.slice(offset, offset + limit));
    }
  };
}

function compiledRun(occurrenceKey) {
  const compiled = compileScheduledAutonomyRun({
    occurrenceKey,
    session: { objective: `pagination ${occurrenceKey}`, maxRounds: 4, maxTasks: 4 },
    initialIntent: {
      originAgent: 'uberbond',
      targetAgent: 'chatgpt',
      objective: `objective ${occurrenceKey}`,
      acceptanceTests: ['pagination invariant'],
      evidenceRefs: ['evidence:pagination'],
      constraints: ['no-business-external-effects']
    }
  });
  assert.equal(compiled.ok, true);
  return compiled.run;
}

async function addUnrelatedSnapshots(store, count) {
  for (let index = 0; index < count; index += 1) {
    await store.log(SNAPSHOT_TYPE, {
      runId: `unrelated_${String(index).padStart(5, '0')}`,
      sessionId: `session_${index}`,
      sequence: 0,
      run: null,
      createdAt: new Date(Date.UTC(2026, 7, 23, 0, 0, 0) + index).toISOString()
    });
  }
}

test('a run older than the former 2000-row global window still loads', async () => {
  const store = pagedStore();
  const run = compiledRun('pagination/old-run');
  await saveAutonomyRunSnapshot(store, run, { reason: 'created', date: new Date('2026-08-22T00:00:00Z') });
  await addUnrelatedSnapshots(store, PAGE + 500);

  const loaded = await loadLatestAutonomyRun(store, run.runId);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.run.runId, run.runId);
  assert.equal(loaded.run.sequence, run.sequence);
  assert.ok(loaded.scannedRows > PAGE, `expected pagination past ${PAGE}, scanned ${loaded.scannedRows}`);
});

test('stale-write protection still sees history beyond the former global window', async () => {
  const store = pagedStore();
  const run = compiledRun('pagination/write-guard');
  await saveAutonomyRunSnapshot(store, run, { reason: 'created', date: new Date('2026-08-22T00:00:00Z') });
  await addUnrelatedSnapshots(store, PAGE + 250);

  const advanced = structuredClone(run);
  advanced.sequence = Number(run.sequence || 0) + 1;
  advanced.updatedAt = '2026-08-23T01:00:00.000Z';
  const saved = await saveAutonomyRunSnapshot(store, advanced, { reason: 'advanced', date: new Date('2026-08-23T01:00:00Z') });
  assert.equal(saved.ok, true);
  assert.equal(saved.status, 'SNAPSHOT_SAVED');

  const stale = await saveAutonomyRunSnapshot(store, run, { reason: 'stale-replay', date: new Date('2026-08-23T01:01:00Z') });
  assert.equal(stale.ok, false);
  assert.ok(stale.reasonCodes.includes('autonomy-run-sequence-regression'));
});

test('a genuinely new run can be saved after more than 2000 unrelated snapshots', async () => {
  const store = pagedStore();
  await addUnrelatedSnapshots(store, PAGE + 750);
  const run = compiledRun('pagination/new-run');

  const saved = await saveAutonomyRunSnapshot(store, run, { reason: 'created' });
  assert.equal(saved.ok, true);
  assert.equal(saved.status, 'SNAPSHOT_SAVED');

  const loaded = await loadLatestAutonomyRun(store, run.runId);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.run.runId, run.runId);
});

test('a store that ignores offset still fails closed instead of looping or claiming absence', async () => {
  const fixedPage = Array.from({ length: PAGE }, (_, index) => ({
    id: `a${index + 1}`,
    type: SNAPSHOT_TYPE,
    detail: { runId: `other_${index}`, run: null },
    createdAt: '2026-08-23T00:00:00.000Z'
  }));
  let calls = 0;
  const store = {
    async log(type, detail) { return { id: 'never', type, detail }; },
    async list() { calls += 1; return structuredClone(fixedPage); }
  };

  const loaded = await loadLatestAutonomyRun(store, 'autonomy_occ_missing');
  assert.equal(loaded.ok, false);
  assert.equal(loaded.status, 'SCAN_SATURATED');
  assert.ok(loaded.reasonCodes.includes('autonomy-run-snapshot-scan-saturated'));
  assert.ok(loaded.reasonCodes.includes('autonomy-run-snapshot-pagination-stalled'));
  assert.equal(calls, 2, 'pagination stall must be detected on the first repeated page');
});