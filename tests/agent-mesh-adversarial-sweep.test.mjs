import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createComputeBudget, reserveCompute, commitCompute, releaseCompute, computeBudgetSummary
} from '../src/ai-compute-budget.mjs';
import {
  saveAgentExecutionRecord, loadLatestAgentExecution,
  saveComputeBudgetSnapshot, loadLatestComputeBudget
} from '../src/agent-compute-store.mjs';
import {
  saveAutonomyRunSnapshot, loadLatestAutonomyRun, listLatestAutonomyRuns
} from '../src/agent-autonomy-store.mjs';

// These are the attacks from the final adversarial sweeps, kept so they run
// forever rather than living in one session's scratch directory. Each one
// tries to defeat a guard that was added because something actually broke.
//
// Every case uses a single fixed instant, because colliding timestamps are what
// defeated the original ordering in three separate places.

const SAME = new Date('2026-01-01T00:00:00.000Z');

function memoryStore() {
  const rows = [];
  let sequence = 0;
  return {
    rows,
    async log(type, detail) {
      sequence += 1;
      return rows[rows.push({
        id: `row-${sequence}`, type, detail,
        createdAt: new Date(Date.UTC(2026, 0, 1) + sequence * 1000).toISOString()
      }) - 1];
    },
    async list(_key, { filters = {}, limit = 3000 } = {}) {
      return rows.filter(row => !filters.type || row.type === filters.type).slice(0, limit);
    }
  };
}

test('a terminal execution survives a stale write that arrives later in the log', async () => {
  const store = memoryStore();
  const base = { executionId: 'e', taskId: 't', provider: 'openai' };
  await saveAgentExecutionRecord(store, { ...base, status: 'RESULT_SUBMITTED' }, { date: SAME });

  const stale = await saveAgentExecutionRecord(store, { ...base, status: 'MODEL_RESULT_READY' }, { date: SAME });
  assert.equal(stale.ok, false, 'a later-written earlier stage must not win');
  assert.equal((await loadLatestAgentExecution(store, 't')).executionRecord.status, 'RESULT_SUBMITTED');
});

test('two different terminal statuses for one task conflict rather than racing', async () => {
  const store = memoryStore();
  const base = { executionId: 'e', taskId: 't', provider: 'openai' };
  await saveAgentExecutionRecord(store, { ...base, status: 'RESULT_SUBMITTED' }, { date: SAME });
  const other = await saveAgentExecutionRecord(store, { ...base, status: 'INVALID_MODEL_RESULT' }, { date: SAME });
  assert.equal(other.ok, false);
  assert.deepEqual(other.reasonCodes, ['terminal-execution-history-conflict']);
});

test('budget ranking holds when only tokens moved and cost is identical', async () => {
  // The cost tiebreak cannot carry this one: both snapshots record 0 cents.
  // If the token comparison were missing, the older snapshot would win and
  // 500 tokens of recorded usage would disappear.
  const store = memoryStore();
  let budget = createComputeBudget({
    totalCostCents: 1000, totalTokens: 10_000,
    allowPaidCompute: true, allowedProviders: ['openai'], budgetNonce: 'sweep'
  });
  await saveComputeBudgetSnapshot(store, budget, { reason: 'start', date: SAME });

  const reserved = reserveCompute({ budget, taskId: 'x', provider: 'openai', costCeilingCents: 0, tokenCeiling: 500 });
  const committed = commitCompute({ budget: reserved.budget, taskId: 'x', actualCostCents: 0, actualTokens: 500 });
  await saveComputeBudgetSnapshot(store, committed.budget, { reason: 'after', date: SAME });

  const loaded = await loadLatestComputeBudget(store, budget.budgetId);
  assert.equal(computeBudgetSummary(loaded.budget).committedTokens, 500);
});

test('the autonomy sequence guard refuses every shape of rewind', async () => {
  const store = memoryStore();
  const run = { ok: true, runId: 'r1', session: { ok: true, sessionId: 's1' }, status: 'ACTIVE', sequence: 5 };
  assert.equal((await saveAutonomyRunSnapshot(store, run, { date: SAME })).ok, true);

  for (const [label, mutation] of [
    ['an explicit lower sequence', { sequence: 0, status: 'DONE' }],
    ['no sequence at all', { sequence: undefined, status: 'DONE' }],
    ['a negative sequence', { sequence: -3 }],
    ['a NaN sequence', { sequence: NaN, status: 'DONE' }]
  ]) {
    const attempt = await saveAutonomyRunSnapshot(store, { ...run, ...mutation }, { date: SAME });
    assert.equal(attempt.ok, false, `${label} must not rewind the run`);
  }

  assert.equal((await saveAutonomyRunSnapshot(store, { ...run, sequence: 6, status: 'DONE' }, { date: SAME })).ok, true);
  const latest = await loadLatestAutonomyRun(store, 'r1');
  assert.equal(latest.run.sequence, 6);
  assert.equal(latest.run.status, 'DONE');

  // The listing drives which runs get swept, so it must agree with the load.
  const listed = await listLatestAutonomyRuns(store);
  assert.equal(listed.runs[0].sequence, 6, 'listing and load must not disagree about run state');
});

test('reserve, release and commit cannot be interleaved into extra capacity', () => {
  let budget = createComputeBudget({
    totalCostCents: 100, totalTokens: 1000,
    allowPaidCompute: true, allowedProviders: ['openai'], budgetNonce: 'interleave'
  });
  const reserved = reserveCompute({ budget, taskId: 'y', provider: 'openai', costCeilingCents: 10, tokenCeiling: 10 });
  const released = releaseCompute({ budget: reserved.budget, taskId: 'y' });

  assert.equal(commitCompute({ budget: released.budget, taskId: 'y', actualCostCents: 1, actualTokens: 1 }).ok, false,
    'a released reservation must not commit');
  assert.equal(releaseCompute({ budget: released.budget, taskId: 'y' }).ok, false,
    'releasing twice must not return capacity twice');

  const retry = reserveCompute({ budget: released.budget, taskId: 'y', provider: 'openai', costCeilingCents: 10, tokenCeiling: 10 });
  assert.equal(retry.ok, true, 'the safe-retry path must stay open');

  const committed = commitCompute({ budget: retry.budget, taskId: 'y', actualCostCents: 3, actualTokens: 3 });
  const summary = computeBudgetSummary(committed.budget);
  assert.equal(summary.committedCostCents, 3);
  assert.equal(summary.reservedCostCents, 0);
  assert.equal(releaseCompute({ budget: committed.budget, taskId: 'y' }).ok, false,
    'a committed reservation must not be released back into capacity');
});
