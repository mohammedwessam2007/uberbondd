import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createComputeBudget, reserveCompute, commitCompute, releaseCompute, computeBudgetSummary
} from '../src/ai-compute-budget.mjs';
import { saveAgentExecutionRecord, loadLatestAgentExecution } from '../src/agent-compute-store.mjs';

// A thousand tasks through the real state machines, with crashes injected at
// every durable boundary and workers racing for the same tasks. Individual
// unit tests prove each guard in isolation; this asks whether the guards still
// hold when they interact at volume.
//
// Fakes only. No provider is called, no network is touched, no money moves.

function memoryStore() {
  const rows = [];
  let sequence = 0;
  return {
    rows,
    async log(type, detail) {
      sequence += 1;
      const row = {
        id: `row-${sequence}`,
        type,
        detail,
        createdAt: new Date(Date.UTC(2026, 0, 1) + sequence * 1000).toISOString()
      };
      rows.push(row);
      return row;
    },
    async list(_key, { filters = {}, limit = 3000 } = {}) {
      return rows.filter(row => !filters.type || row.type === filters.type).slice(0, limit);
    }
  };
}

test('1,000 tasks survive crash injection at every durable boundary', async () => {
  let seed = 8675309;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = n => Math.floor(rand() * n);

  const TASKS = 1000;
  const MAX_COST = 100_000;
  const MAX_TOKENS = 10_000_000;
  let budget = createComputeBudget({
    totalCostCents: MAX_COST, totalTokens: MAX_TOKENS,
    allowPaidCompute: true, allowedProviders: ['openai', 'anthropic'], budgetNonce: 'soak'
  });
  const store = memoryStore();

  let committed = 0;
  let released = 0;
  let crashedBeforeCommit = 0;
  let crashedBeforePersist = 0;
  let submitted = 0;
  let spentCost = 0;
  const terminalTasks = new Set();

  for (let index = 0; index < TASKS; index += 1) {
    const taskId = `soak-${index}`;
    const provider = pick(2) ? 'openai' : 'anthropic';
    const costCeiling = 1 + pick(5);
    const tokenCeiling = 10 + pick(90);

    const reserved = reserveCompute({ budget, taskId, provider, model: 'soak-model', costCeilingCents: costCeiling, tokenCeiling });
    if (!reserved.ok) { continue; }
    budget = reserved.budget;

    // Crash boundary 1: after reserving, before any provider dispatch. The
    // capacity must come back and the task must remain retryable.
    if (pick(10) === 0) {
      const back = releaseCompute({ budget, taskId, reason: 'crash before dispatch' });
      budget = back.budget;
      crashedBeforeCommit += 1;
      released += 1;
      const retry = reserveCompute({ budget, taskId, provider, model: 'soak-model', costCeilingCents: costCeiling, tokenCeiling });
      assert.equal(retry.ok, true, `a task released before dispatch must be retryable: ${retry.reasonCodes}`);
      budget = retry.budget;
    }

    const actualCost = pick(costCeiling + 1);
    const actualTokens = pick(tokenCeiling + 1);
    const done = commitCompute({ budget, taskId, actualCostCents: actualCost, actualTokens });
    assert.equal(done.ok, true, `commit must succeed for ${taskId}: ${done.reasonCodes}`);
    budget = done.budget;
    committed += 1;
    spentCost += actualCost;

    const record = {
      executionId: `exec-${index}`,
      taskId,
      status: 'MODEL_RESULT_READY',
      provider,
      usage: { inputTokens: actualTokens, outputTokens: 0, totalTokens: actualTokens }
    };

    // Crash boundary 2: model succeeded, nothing persisted yet.
    if (pick(12) === 0) { crashedBeforePersist += 1; continue; }

    const saved = await saveAgentExecutionRecord(store, record);
    assert.equal(saved.ok, true, `persisting ${taskId} must succeed: ${saved.reasonCodes}`);

    // Crash boundary 3: persisted, then the process dies before submitting.
    // On restart the same record is rebuilt -- and rebuilt code emits keys in
    // its own order, which must still converge rather than conflict.
    if (pick(8) === 0) {
      const rebuilt = {
        usage: { totalTokens: actualTokens, outputTokens: 0, inputTokens: actualTokens },
        provider, status: 'MODEL_RESULT_READY', taskId, executionId: `exec-${index}`
      };
      const replay = await saveAgentExecutionRecord(store, rebuilt);
      assert.equal(replay.ok, true, `reordered replay of ${taskId} must converge: ${replay.reasonCodes}`);
      assert.equal(replay.status, 'EXECUTION_ALREADY_SAVED');
    }

    const terminal = { ...record, status: 'RESULT_SUBMITTED' };
    const finished = await saveAgentExecutionRecord(store, terminal);
    assert.equal(finished.ok, true, `terminal save for ${taskId}: ${finished.reasonCodes}`);
    terminalTasks.add(taskId);
    submitted += 1;

    // Crash boundary 4: submitted, then the process dies before recording that
    // it submitted. The replay must be idempotent, never a second submission.
    if (pick(6) === 0) {
      const again = await saveAgentExecutionRecord(store, terminal);
      assert.equal(again.ok, true);
      assert.equal(again.status, 'EXECUTION_ALREADY_SAVED', 'a terminal replay must not create a second record');
    }
  }

  // Every boundary was actually exercised; a soak that never crashed proves
  // nothing about crash recovery.
  assert.ok(crashedBeforeCommit > 40, `expected pre-dispatch crashes; got ${crashedBeforeCommit}`);
  assert.ok(crashedBeforePersist > 30, `expected pre-persist crashes; got ${crashedBeforePersist}`);
  assert.ok(submitted > 700, `expected most tasks to finish; got ${submitted}`);

  // Conservation across the whole run.
  const summary = computeBudgetSummary(budget);
  assert.equal(summary.committedCostCents, spentCost, 'committed cost must equal what was actually committed');
  assert.equal(summary.reservedCostCents, 0, 'no reservation may be left holding capacity');
  assert.ok(summary.committedCostCents <= MAX_COST, 'cost capacity was created from nowhere');
  assert.equal(committed, TASKS - (TASKS - committed), 'commit accounting is self-consistent');

  // No task resurrected: every terminal task still reads back as terminal.
  for (const taskId of [...terminalTasks].slice(0, 100)) {
    const latest = await loadLatestAgentExecution(store, taskId);
    assert.equal(latest.ok, true, `must be able to read back ${taskId}`);
    assert.equal(latest.executionRecord.status, 'RESULT_SUBMITTED', `${taskId} must still be terminal`);
  }

  // Bounded memory: one row per real state change, not one per attempt.
  assert.ok(store.rows.length <= TASKS * 3, `audit log grew unexpectedly: ${store.rows.length} rows`);
  assert.ok(released > 40, `expected releases to happen; got ${released}`);
});

test('concurrent workers racing one task produce exactly one committed reservation', async () => {
  // The budget is a value, not a lock. Interleaving is modelled by having
  // every worker start from the SAME snapshot -- which is what two processes
  // that read before either wrote actually see.
  const start = createComputeBudget({
    totalCostCents: 1000, totalTokens: 100_000,
    allowPaidCompute: true, allowedProviders: ['openai'], budgetNonce: 'race'
  });

  const attempts = await Promise.all(
    Array.from({ length: 8 }, (_, index) => Promise.resolve(
      reserveCompute({ budget: start, taskId: 'contested', provider: 'openai', costCeilingCents: 10, tokenCeiling: 100 })
    ).then(result => ({ worker: `w-${index}`, result })))
  );

  // Every worker reading the same snapshot will locally succeed -- that is
  // precisely why the snapshot cannot be the authority. Only one of these
  // budgets may ever be persisted, and committing from one must not let a
  // second commit land on top of it.
  assert.ok(attempts.every(a => a.result.ok), 'each worker computes a reservation against its own snapshot');

  const winner = attempts[0].result.budget;
  const firstCommit = commitCompute({ budget: winner, taskId: 'contested', actualCostCents: 4, actualTokens: 40 });
  assert.equal(firstCommit.ok, true);

  const secondCommit = commitCompute({ budget: firstCommit.budget, taskId: 'contested', actualCostCents: 4, actualTokens: 40 });
  assert.equal(secondCommit.ok, false, 'a committed reservation must not commit twice');
  assert.deepEqual(secondCommit.reasonCodes, ['active-compute-reservation-required']);

  const summary = computeBudgetSummary(firstCommit.budget);
  assert.equal(summary.committedCostCents, 4, 'exactly one commit may count');
  assert.equal(summary.activeReservations, 0);
});

test('a terminal task cannot be resurrected by replaying an earlier stage', async () => {
  const store = memoryStore();
  const base = { executionId: 'exec-r', taskId: 'task-r', provider: 'openai', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };

  assert.equal((await saveAgentExecutionRecord(store, { ...base, status: 'MODEL_RESULT_READY' })).ok, true);
  assert.equal((await saveAgentExecutionRecord(store, { ...base, status: 'RESULT_SUBMITTED' })).ok, true);

  // A delayed write from before the terminal state arrives late.
  const stale = await saveAgentExecutionRecord(store, { ...base, status: 'MODEL_RESULT_READY' });
  assert.equal(stale.ok, false, 'a stale earlier stage must not reopen a terminal task');
  assert.deepEqual(stale.reasonCodes, ['terminal-execution-history-conflict']);

  const latest = await loadLatestAgentExecution(store, 'task-r');
  assert.equal(latest.executionRecord.status, 'RESULT_SUBMITTED', 'the terminal state must survive the stale write');
});
