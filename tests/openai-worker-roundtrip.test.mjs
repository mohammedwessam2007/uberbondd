import test from 'node:test';
import assert from 'node:assert/strict';
import { createComputeBudget } from '../src/ai-compute-budget.mjs';
import { createOpenAIAgentExecutor } from '../src/openai-agent-executor.mjs';
import { runAgentWorkerOnce } from '../src/agent-worker-runtime.mjs';

const zero = {
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
};

function relayClaim() {
  return {
    ok: true,
    status: 'CLAIMED',
    taskId: 'task_e2e_openai',
    workerId: 'chatgpt:cloud-worker-1',
    task: {
      ok: true,
      taskId: 'task_e2e_openai',
      objective: 'Independently review the prior engineering result.',
      originAgent: 'claude-code',
      targetAgent: 'chatgpt',
      parentTask: 'task_parent',
      contextRefs: ['doc:architecture'],
      evidenceRefs: ['test:engineering'],
      constraints: ['local-preparation-only'],
      forbiddenActions: ['deploy', 'send'],
      requiredOutputs: ['outcome', 'coordination'],
      acceptanceTests: ['identify whether another repair is required'],
      consequenceClass: 'LOCAL_PREPARATION'
    }
  };
}

function modelResult() {
  return {
    outcome: 'Independent review passed.',
    changedArtifacts: [],
    testsActuallyRun: [],
    truthTable: [
      { claim: 'engineering result reviewed', status: 'VERIFIED', evidenceRefs: ['test:engineering'] }
    ],
    externalEffectLedger: { ...zero },
    decision: 'PROCEED',
    coordination: {
      action: 'DONE',
      objective: '',
      summary: 'No repair required.',
      evidenceRefs: ['test:engineering'],
      contextRefs: [],
      acceptanceTests: [],
      requiredOutputs: [],
      constraints: [],
      tokenBudget: 1000,
      confidence: 0.97
    },
    evidenceRefs: ['test:engineering']
  };
}

test('claimed relay task can cross the disabled-by-default OpenAI socket, persist, and return to relay without business effects', async () => {
  const events = [];
  const result = modelResult();
  const fetchImpl = async (_url, init) => {
    events.push('openai-request');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'gpt-5.6-sol');
    assert.equal(body.text.format.type, 'json_schema');
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          id: 'resp_e2e_1',
          status: 'completed',
          model: 'gpt-5.6-sol',
          usage: { input_tokens: 1200, output_tokens: 200, total_tokens: 1400 },
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: JSON.stringify(result) }]
            }
          ]
        });
      }
    };
  };

  const openai = createOpenAIAgentExecutor({
    enabled: true,
    apiKey: 'sk-test-not-real-123456789012345',
    defaultModel: 'gpt-5.6-sol',
    pricing: {
      inputUsdPerMillion: 5,
      outputUsdPerMillion: 30,
      sourceRef: 'official-openai-pricing-snapshot:test',
      verifiedAt: '2026-08-20T03:00:00.000Z'
    },
    fetchImpl
  });

  const compute = createComputeBudget({
    totalCostCents: 100,
    totalTokens: 100_000,
    allowPaidCompute: true,
    allowedProviders: ['openai'],
    budgetNonce: 'e2e-openai-worker'
  });

  let relayPayload = null;
  const out = await runAgentWorkerOnce({
    claim: relayClaim(),
    computeBudget: compute,
    provider: 'openai',
    model: 'gpt-5.6-sol',
    costCeilingCents: 20,
    tokenCeiling: 5000,
    modelExecutor: openai,
    persistBudgetState: async ({ stage }) => {
      events.push(`budget:${stage}`);
      return { ok: true };
    },
    persistExecutionRecord: async ({ executionRecord }) => {
      events.push(`record:${executionRecord.status}`);
      return { ok: true };
    },
    submitResult: async payload => {
      events.push('relay-submit');
      relayPayload = payload;
      return { ok: true, status: 'COMPLETED' };
    }
  });

  assert.equal(out.ok, true);
  assert.equal(out.status, 'COMPLETED');
  assert.equal(out.computeBudget.committedTokens, 1400);
  assert.ok(out.computeBudget.committedCostCents > 0);
  assert.deepEqual(relayPayload.result, result);
  assert.deepEqual(relayPayload.result.externalEffectLedger, zero);
  assert.equal(out.executionRecord.providerRequestId, 'resp_e2e_1');
  assert.ok(events.indexOf('budget:RESERVED') < events.indexOf('openai-request'));
  assert.ok(events.indexOf('budget:COMMITTED') < events.indexOf('record:MODEL_RESULT_READY'));
  assert.ok(events.indexOf('record:MODEL_RESULT_READY') < events.indexOf('relay-submit'));
});
