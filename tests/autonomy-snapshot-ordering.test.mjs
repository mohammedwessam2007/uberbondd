// Paged snapshot lookup lifted the 2000-row ceiling by walking offset pages
// until the run appeared. That reasoning depended on pages arriving
// newest-first, and they do not: src/store.mjs `_listDirect` applies no
// ordering unless a caller passes `orderBy`, so rows come back in insertion
// order -- oldest first.
//
// Stopping at the first page containing the run therefore returned the run's
// OLDEST snapshot. A run buried under 2500 filler rows and then advanced came
// back at sequence 0 instead of 5: the same silent rewind the saturation guard
// exists to prevent, arriving through the door built to fix it.
//
// The store this file uses mirrors `_listDirect` exactly -- filter, offset,
// limit, no sort -- because using a friendlier fake is how the assumption
// survived in the first place.
import test from 'node:test';
import assert from 'node:assert/strict';
import { saveAutonomyRunSnapshot, loadLatestAutonomyRun } from '../src/agent-autonomy-store.mjs';
import { compileScheduledAutonomyRun } from '../src/agent-autonomy-scheduled-run.mjs';

const MAX_SCAN = 2000;

function insertionOrderStore() {
  const auditLog = [];
  return {
    auditLog,
    async log(type, detail) {
      const row = {
        id: `a${auditLog.length + 1}`,
        type,
        detail: structuredClone(detail),
        createdAt: detail.createdAt || new Date().toISOString()
      };
      auditLog.push(row);
      return row;
    },
    async list(key, options = {}) {
      let rows = [...auditLog];
      if (options.filters?.type) rows = rows.filter(row => row.type === options.filters.type);
      if (options.offset) rows = rows.slice(options.offset);
      if (Number.isInteger(options.limit)) rows = rows.slice(0, Math.max(0, options.limit));
      return structuredClone(rows);
    }
  };
}

function run(occurrenceKey, objective) {
  const compiled = compileScheduledAutonomyRun({
    occurrenceKey,
    session: { objective, maxRounds: 10, maxTasks: 10 },
    initialIntent: {
      originAgent: 'uberbond', targetAgent: 'chatgpt', objective,
      acceptanceTests: ['acceptance'], evidenceRefs: ['evidence:ordering']
    }
  });
  assert.equal(compiled.ok, true);
  return compiled.run;
}

test('the newest snapshot wins even when the run is buried and the store lists oldest-first', async () => {
  const store = insertionOrderStore();
  const target = run('ordering/target', 'target mission');

  await saveAutonomyRunSnapshot(store, target, { reason: 'seq-0' });
  for (let index = 0; index < MAX_SCAN + 500; index += 1) {
    await saveAutonomyRunSnapshot(store, run(`ordering/filler-${index}`, `filler ${index}`), { reason: 'filler' });
  }
  const advanced = { ...target, sequence: target.sequence + 5, status: 'ACTIVE', phase: 'AWAITING_RESULT' };
  const written = await saveAutonomyRunSnapshot(store, advanced, { reason: 'seq-5' });
  assert.equal(written.ok, true, written.reasonCodes?.join(','));

  const loaded = await loadLatestAutonomyRun(store, target.runId);
  assert.equal(loaded.ok, true, loaded.reasonCodes?.join(','));
  assert.equal(loaded.run.sequence, advanced.sequence, 'a stale snapshot was returned');
  assert.equal(loaded.run.phase, 'AWAITING_RESULT');
});

test('a run written only after the first full page is still found', async () => {
  const store = insertionOrderStore();
  for (let index = 0; index < MAX_SCAN + 10; index += 1) {
    await saveAutonomyRunSnapshot(store, run(`late/filler-${index}`, `filler ${index}`), { reason: 'filler' });
  }
  const late = run('late/target', 'late mission');
  await saveAutonomyRunSnapshot(store, late, { reason: 'seq-0' });

  const loaded = await loadLatestAutonomyRun(store, late.runId);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.run.runId, late.runId);
});

test('a genuinely absent run is reported absent, not saturated', async () => {
  const store = insertionOrderStore();
  for (let index = 0; index < MAX_SCAN + 10; index += 1) {
    await saveAutonomyRunSnapshot(store, run(`absent/filler-${index}`, `filler ${index}`), { reason: 'filler' });
  }
  const loaded = await loadLatestAutonomyRun(store, 'autonomy_occ_run_does_not_exist');
  assert.equal(loaded.ok, false);
  assert.equal(loaded.status, 'NOT_FOUND');
  assert.ok(loaded.reasonCodes.includes('autonomy-run-not-found'));
});

test('a store that ignores offset is refused rather than looped over forever', async () => {
  // Pagination cannot make progress here, and reporting absence would be a
  // claim the store has not earned.
  const stuck = {
    async log(type, detail) { return { id: 'a1', type, detail, createdAt: new Date().toISOString() }; },
    async list() {
      return Array.from({ length: MAX_SCAN }, (_, index) => ({
        id: `a${index + 1}`,
        type: 'agent_autonomy_run_snapshot',
        detail: { runId: 'someone_else', createdAt: new Date().toISOString(), run: null },
        createdAt: new Date().toISOString()
      }));
    }
  };
  const loaded = await loadLatestAutonomyRun(stuck, 'autonomy_occ_run_target');
  assert.equal(loaded.ok, false);
  assert.ok(loaded.reasonCodes.includes('autonomy-run-snapshot-scan-saturated'));
});
