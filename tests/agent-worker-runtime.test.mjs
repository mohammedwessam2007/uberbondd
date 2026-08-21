import test from 'node:test';
import assert from 'node:assert/strict';
import { createComputeBudget } from '../src/ai-compute-budget.mjs';
import {
  compileAgentWorkerPlan,
  runAgentWorkerOnce,
  resumeAgentWorkerSubmission
} from '../src/agent-worker-runtime.mjs';

function claim(overrides = {}) {
  const task = {
    taskId: 'task_worker_1',
    objective: 'Review the implementation and return a bounded result.',
    originAgent: 'chatgpt',
    targetAgent: 'claude-code',
    consequenceClass: 'LOCAL_PREPARATION',
    budget: { maxTokens: 5000, maxCostCents: 10 },
    ...overrides.task
  };
  return {
    ok: true,
    status: 'CLAIMED',
    taskId: task.taskId,
    workerId: 'claude-code:test-worker',
    task,
    ...overrides
  };
}

function budget({ paid = false, cents = 0, tokens = 100_000 } = {}) {
  return createComputeBudget({
    totalCostCents: cents,
    totalTokens: tokens,
    allowPaidCompute: paid,
    allowedProviders: paid ? ['openai', 'anthropic'] : []
  });
}

function goodResult(overrides = {}) {
  return {
    outcome: 'Review completed.',
    changedArtifacts: [],
    testsActuallyRun: [{ command: 'node --test tests/example.test.mjs', status: 'PASS', total: 1, passed: 1, failed: 0 }],
    truthTable: { implementation: 'PASS' },
    externalEffectLedger: {
      providerCalls: 0,
      messages: 0,
      purchases: 0,
      deployments: 0,
      credentialChanges: 0,
      dnsChanges: 0,
      productionMutations: 0,
      spendCents: 0
    },
    decision: 'PROCEED',
    coordination: {
      action: 'DONE',
      summary: 'No follow-up required.',
      evidenceRefs: ['test:example'],
      confidence: 0.95
    },
    evidenceRefs: ['test:example'],
    ...overrides
  };
}

test('worker plan refuses paid inference unless compute was explicitly authorized', () => {
  const plan = compileAgentWorkerPlan({
    claim: claim(),
    computeBudget: budget({ paid: false, cents: 0 }),
    provider: 'openai',
    model: 'example-model',
    costCeilingCents: 1,
    tokenCeiling: 5000
  });
  assert.equal(plan.ok, false);
  assert.ok(plan.reasonCodes.includes('paid-compute-not-authorized'));
});

test('worker success commits compute and submits the exact model result once', async () => {
  let modelCalls = 0;
  let submissions = 0;
  const result = goodResult();
  const out = await runAgentWorkerOnce({
    claim: claim(),
    computeBudget: budget({ paid: true, cents: 100 }),
    provider: 'openai',
    model: 'example-model',
    costCeilingCents: 10,
    tokenCeiling: 5000,
    modelExecutor: async ({ idempotencyKey }) => {
      modelCalls += 1;
      assert.equal(idempotencyKey, 'agent-model:task_worker_1');
      return {
        ok: true,
        outcome: 'COMPLETED',
        providerRequestId: 'req_123',
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, costCents: 3 },
        result
      };
    },
    submitResult: async payload => {
      submissions += 1;
      assert.deepEqual(payload.result, result);
      return { ok: true, status: 'COMPLETED' };
    }
  });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'COMPLETED');
  assert.equal(modelCalls, 1);
  assert.equal(submissions, 1);
  assert.equal(out.computeBudget.committedCostCents, 3);
  assert.equal(out.computeBudget.committedTokens, 150);
  assert.equal(out.executionRecord.status, 'RESULT_SUBMITTED');
});

test('provider transport throw is quarantined instead of being misclassified as a safe retry', async () => {
  let submissions = 0;
  const out = await runAgentWorkerOnce({
    claim: claim(),
    computeBudget: budget({ paid: true, cents: 100 }),
    provider: 'openai',
    model: 'example-model',
    costCeilingCents: 10,
    tokenCeiling: 5000,
    modelExecutor: async () => {
      throw new Error('connection reset after dispatch');
    },
    submitResult: async () => {
      submissions += 1;
      return { ok: true };
    }
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'COMPUTE_OUTCOME_UNCERTAIN');
  assert.equal(submissions, 0);
  assert.equal(out.computeBudget.reservedCostCents, 10);
  assert.equal(out.computeBudget.committedCostCents, 0);
});

test('explicit confirmed provider failure releases compute and reports failure', async () => {
  let submittedStatus = null;
  const out = await runAgentWorkerOnce({
    claim: claim(),
    computeBudget: budget({ paid: true, cents: 100 }),
    provider: 'anthropic',
    model: 'example-model',
    costCeilingCents: 10,
    tokenCeiling: 5000,
    modelExecutor: async () => ({
      ok: false,
      outcome: 'CONFIRMED_FAILURE',
      providerRequestId: 'req_fail'
    }),
    submitResult: async payload => {
      submittedStatus = payload.status;
      return { ok: true, status: 'FAILED' };
    }
  });
  assert.equal(out.status, 'FAILED_SUBMITTED');
  assert.equal(submittedStatus, 'FAILED');
  assert.equal(out.computeBudget.reservedCostCents, 0);
  assert.equal(out.computeBudget.committedCostCents, 0);
});

test('successful model call plus relay submission failure produces a replayable receipt without re-running the model', async () => {
  let modelCalls = 0;
  const result = goodResult();
  const first = await runAgentWorkerOnce({
    claim: claim(),
    computeBudget: budget({ paid: true, cents: 100 }),
    provider: 'openai',
    model: 'example-model',
    costCeilingCents: 10,
    tokenCeiling: 5000,
    modelExecutor: async () => {
      modelCalls += 1;
      return {
        ok: true,
        outcome: 'COMPLETED',
        usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, costCents: 2 },
        result
      };
    },
    submitResult: async () => {
      throw new Error('relay temporarily unavailable');
    }
  });
  assert.equal(first.status, 'RESULT_SUBMISSION_PENDING');
  assert.equal(modelCalls, 1);
  assert.equal(first.computeBudget.committedCostCents, 2);
  assert.equal(first.executionRecord.status, 'RESULT_SUBMISSION_PENDING');

  let resubmissions = 0;
  const resumed = await resumeAgentWorkerSubmission({
    executionRecord: first.executionRecord,
    submitResult: async payload => {
      resubmissions += 1;
      assert.deepEqual(payload.result, result);
      return { ok: true, status: 'COMPLETED' };
    }
  });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.status, 'COMPLETED');
  assert.equal(resubmissions, 1);
  assert.equal(modelCalls, 1);
});

test('nonzero business/external effects in a model result are rejected after compute is truthfully committed', async () => {
  let submissions = 0;
  const result = goodResult({
    externalEffectLedger: {
      providerCalls: 0,
      messages: 1,
      purchases: 0,
      deployments: 0,
      credentialChanges: 0,
      dnsChanges: 0,
      productionMutations: 0,
      spendCents: 0
    }
  });
  const out = await runAgentWorkerOnce({
    claim: claim(),
    computeBudget: budget({ paid: true, cents: 100 }),
    provider: 'openai',
    model: 'example-model',
    costCeilingCents: 10,
    tokenCeiling: 5000,
    modelExecutor: async () => ({
      ok: true,
      outcome: 'COMPLETED',
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, costCents: 2 },
      result
    }),
    submitResult: async () => {
      submissions += 1;
      return { ok: true };
    }
  });
  assert.equal(out.ok, false);
  assert.equal(out.status, 'INVALID_MODEL_RESULT');
  assert.equal(submissions, 0);
  assert.equal(out.computeBudget.committedCostCents, 2);
});

test('heartbeat failure releases reservation before any provider call', async () => {
  let modelCalls = 0;
  const out = await runAgentWorkerOnce({
    claim: claim(),
    computeBudget: budget({ paid: true, cents: 100 }),
    provider: 'openai',
    model: 'example-model',
    costCeilingCents: 10,
    tokenCeiling: 5000,
    heartbeat: async () => ({ ok: false, reasonCodes: ['lease-lost-before-heartbeat'] }),
    modelExecutor: async () => {
      modelCalls += 1;
      return { ok: true };
    },
    submitResult: async () => ({ ok: true })
  });
  assert.equal(out.status, 'LEASE_LOST');
  assert.equal(modelCalls, 0);
  assert.equal(out.computeBudget.reservedCostCents, 0);
});
