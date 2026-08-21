import test from 'node:test';
import assert from 'node:assert/strict';
import { compileAgentWorkerPlan } from '../src/agent-worker-runtime.mjs';
import { createComputeBudget } from '../src/ai-compute-budget.mjs';

// This worker is only allowed to do local preparation. The interesting case is
// not a task that declares the wrong class -- that was always refused -- but a
// task that declares nothing at all. Silence is not consent: an undeclared
// consequence class is unknown consequential state, and unknown fails closed.

const budget = () => createComputeBudget({
  totalCostCents: 100,
  totalTokens: 100_000,
  allowPaidCompute: true,
  allowedProviders: ['openai'],
  budgetNonce: 'consequence-gate'
});

function claim(taskOverrides = {}) {
  return {
    ok: true,
    status: 'CLAIMED',
    taskId: 'task-1',
    workerId: 'worker-1',
    task: {
      ok: true,
      taskId: 'task-1',
      objective: 'Review a diff and report findings',
      originAgent: 'chatgpt',
      targetAgent: 'claude-code',
      ...taskOverrides
    }
  };
}

const plan = task => compileAgentWorkerPlan({
  claim: claim(task),
  computeBudget: budget(),
  provider: 'openai',
  model: 'test-model',
  costCeilingCents: 5,
  tokenCeiling: 100
});

test('a task that declares LOCAL_PREPARATION is accepted', () => {
  const result = plan({ consequenceClass: 'LOCAL_PREPARATION' });
  assert.equal(result.ok, true, `expected acceptance: ${result.reasonCodes}`);
  assert.equal(result.status, 'READY_TO_EXECUTE');
});

test('a task that declares a consequential class is refused', () => {
  const result = plan({ consequenceClass: 'EXTERNAL_EFFECT' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('worker-only-accepts-local-preparation'));
});

test('a task that declares no consequence class at all is refused, not assumed local', () => {
  // The hole this closes: the guard used to fire only when a class was PRESENT
  // and wrong, so an undeclared task sailed through and went on to reserve and
  // spend compute.
  const result = plan({});
  assert.equal(result.ok, false, 'an undeclared consequence class must fail closed');
  assert.ok(
    result.reasonCodes.includes('task-consequence-class-required'),
    `expected a distinct reason naming the missing declaration; got ${result.reasonCodes}`
  );
});

test('an empty or whitespace consequence class counts as undeclared', () => {
  for (const value of ['', '   ', null, undefined]) {
    const result = plan({ consequenceClass: value });
    assert.equal(result.ok, false, `consequenceClass ${JSON.stringify(value)} must fail closed`);
    assert.ok(result.reasonCodes.includes('task-consequence-class-required'));
  }
});

test('refusing on consequence class reserves no compute', () => {
  // Failing closed is only half the property. If the refusal happened after
  // the reservation, a stream of undeclared tasks would drain the budget while
  // being rejected.
  const state = budget();
  const result = compileAgentWorkerPlan({
    claim: claim({}), computeBudget: state, provider: 'openai', model: 'm', costCeilingCents: 5, tokenCeiling: 100
  });
  assert.equal(result.ok, false);
  assert.equal(state.reservedCostCents, 0, 'a refused task must not hold budget');
  assert.deepEqual(state.reservations, {}, 'a refused task must leave no reservation behind');
});
