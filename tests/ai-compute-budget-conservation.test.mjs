import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createComputeBudget,
  reserveCompute,
  commitCompute,
  releaseCompute,
  computeBudgetSummary
} from '../src/ai-compute-budget.mjs';

// Compute capacity is money. The invariant that matters is that it can be
// spent, returned, or held -- never created. These attack that directly, and
// they attack the retry path, where "give the capacity back safely" and "let
// the task try again" have to both be true at once.

function budget(overrides = {}) {
  return createComputeBudget({
    totalCostCents: 1000,
    totalTokens: 1_000_000,
    allowPaidCompute: true,
    allowedProviders: ['openai', 'anthropic'],
    budgetNonce: 'conservation-suite',
    ...overrides
  });
}

const reserve = (state, taskId, costCeilingCents = 10, tokenCeiling = 100, provider = 'openai') =>
  reserveCompute({ budget: state, taskId, provider, model: 'test-model', costCeilingCents, tokenCeiling });

test('a task released without spending anything can try again', () => {
  // A rate limit or a cancelled dispatch returns the capacity untouched: no
  // provider call happened, so there is nothing to double-spend. Refusing the
  // retry strands the task forever against a budget showing full capacity.
  const first = reserve(budget(), 'task-a');
  assert.equal(first.ok, true);

  const released = releaseCompute({ budget: first.budget, taskId: 'task-a', reason: 'provider rate limited before dispatch' });
  assert.equal(released.ok, true);
  assert.equal(computeBudgetSummary(released.budget).availableCostCents, 1000, 'release must return the full ceiling');

  const retry = reserve(released.budget, 'task-a');
  assert.equal(retry.ok, true, `retry after a safe release must be allowed: ${retry.reasonCodes}`);
  assert.equal(retry.reservation.attempt, 2);
  assert.deepEqual(retry.reservation.priorReservationIds, [first.reservation.reservationId],
    'the earlier attempt must stay in the record rather than being overwritten silently');
});

test('a live reservation still refuses a second one, so two workers cannot spend it at once', () => {
  const first = reserve(budget(), 'task-b');
  const second = reserve(first.budget, 'task-b');
  assert.equal(second.ok, false);
  assert.deepEqual(second.reasonCodes, ['task-compute-already-reserved']);
});

test('a committed task still refuses a new reservation, because that is how you pay twice', () => {
  // The important half of the retry fix: loosening RELEASED must not loosen
  // COMMITTED. Compute was already bought under this identity.
  const first = reserve(budget(), 'task-c');
  const committed = commitCompute({ budget: first.budget, taskId: 'task-c', actualCostCents: 6, actualTokens: 60 });
  assert.equal(committed.ok, true);

  const again = reserve(committed.budget, 'task-c');
  assert.equal(again.ok, false);
  assert.deepEqual(again.reasonCodes, ['task-compute-already-reserved']);
});

test('actual usage above the reserved ceiling is a violation, not a silent overspend', () => {
  const first = reserve(budget(), 'task-d', 10, 100);
  const over = commitCompute({ budget: first.budget, taskId: 'task-d', actualCostCents: 11, actualTokens: 100 });
  assert.equal(over.ok, false);
  assert.ok(over.reasonCodes.includes('actual-cost-exceeds-reservation'));

  const overTokens = commitCompute({ budget: first.budget, taskId: 'task-d', actualCostCents: 10, actualTokens: 101 });
  assert.equal(overTokens.ok, false);
  assert.ok(overTokens.reasonCodes.includes('actual-tokens-exceed-reservation'));
});

test('capacity is conserved across thousands of random reserve/commit/release cycles', () => {
  // Seeded so a failure is reproducible. The invariant is checked after EVERY
  // transition, not just at the end -- a budget that goes briefly wrong and
  // corrects itself is still wrong.
  let seed = 20260821;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = n => Math.floor(rand() * n);

  const MAX_COST = 5000;
  const MAX_TOKENS = 500_000;
  let state = budget({ totalCostCents: MAX_COST, totalTokens: MAX_TOKENS });
  const live = new Set();
  let spentCost = 0;
  let spentTokens = 0;
  let released = 0;
  let retried = 0;

  const invariant = where => {
    const summary = computeBudgetSummary(state);
    assert.ok(summary.reservedCostCents >= 0, `${where}: reserved cost went negative`);
    assert.ok(summary.reservedTokens >= 0, `${where}: reserved tokens went negative`);
    assert.ok(summary.committedCostCents >= 0, `${where}: committed cost went negative`);
    assert.ok(
      summary.committedCostCents + summary.reservedCostCents <= MAX_COST,
      `${where}: cost capacity was created from nowhere`
    );
    assert.ok(
      summary.committedTokens + summary.reservedTokens <= MAX_TOKENS,
      `${where}: token capacity was created from nowhere`
    );
    // Committed totals are the ground truth of what was actually spent.
    assert.equal(summary.committedCostCents, spentCost, `${where}: committed cost drifted from what was committed`);
    assert.equal(summary.committedTokens, spentTokens, `${where}: committed tokens drifted from what was committed`);
  };

  for (let step = 0; step < 3000; step += 1) {
    const action = pick(3);
    if (action === 0) {
      const id = `t-${pick(400)}`;
      const cost = pick(4);
      const tokens = pick(40);
      const result = reserveCompute({ budget: state, taskId: id, provider: 'openai', costCeilingCents: cost, tokenCeiling: tokens });
      if (result.ok) {
        if (result.reservation.attempt > 1) retried += 1;
        state = result.budget;
        live.add(id);
      }
    } else if (live.size) {
      const ids = [...live];
      const id = ids[pick(ids.length)];
      const reservation = state.reservations[id];
      if (action === 1) {
        const cost = pick(reservation.costCeilingCents + 1);
        const tokens = pick(reservation.tokenCeiling + 1);
        const result = commitCompute({ budget: state, taskId: id, actualCostCents: cost, actualTokens: tokens });
        if (result.ok) {
          state = result.budget;
          spentCost += cost;
          spentTokens += tokens;
          live.delete(id);
        }
      } else {
        const result = releaseCompute({ budget: state, taskId: id });
        if (result.ok) {
          state = result.budget;
          live.delete(id);
          released += 1;
        }
      }
    }
    invariant(`step ${step}`);
  }

  // A run that never exercised release-then-retry would prove nothing about
  // the path this suite exists for.
  assert.ok(released > 50, `expected the run to release often; got ${released}`);
  assert.ok(retried > 10, `expected the run to retry released tasks; got ${retried}`);

  // Everything still live can be released, and that must return the budget to
  // exactly the committed total -- no residue.
  for (const id of live) {
    const result = releaseCompute({ budget: state, taskId: id });
    if (result.ok) state = result.budget;
  }
  const finalSummary = computeBudgetSummary(state);
  assert.equal(finalSummary.reservedCostCents, 0, 'releasing everything must leave no reserved cost behind');
  assert.equal(finalSummary.reservedTokens, 0, 'releasing everything must leave no reserved tokens behind');
  assert.equal(finalSummary.committedCostCents, spentCost);
  assert.equal(finalSummary.availableCostCents, MAX_COST - spentCost);
});

test('the reservation history bound names itself, so an operator knows which limit was hit', () => {
  // "too much in flight" and "too much history" need different responses, and
  // a shared reason code sends the reader looking in the wrong place.
  let state = budget({ totalCostCents: 0, totalTokens: 200_000, allowPaidCompute: false, allowedProviders: [] });
  let blocked = null;
  for (let index = 0; index < 10_050; index += 1) {
    const result = reserveCompute({ budget: state, taskId: `h-${index}`, provider: 'openai', costCeilingCents: 0, tokenCeiling: 1 });
    if (!result.ok) { blocked = result; break; }
    const committed = commitCompute({ budget: result.budget, taskId: `h-${index}`, actualCostCents: 0, actualTokens: 1 });
    state = committed.ok ? committed.budget : result.budget;
  }
  assert.ok(blocked, 'expected the history bound to be reached');
  assert.ok(
    blocked.reasonCodes.includes('reservation-history-limit-reached'),
    `expected a history-specific reason; got ${blocked.reasonCodes}`
  );
});
