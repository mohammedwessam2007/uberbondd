import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIAgentExecutor } from '../src/openai-agent-executor.mjs';

const pricing = {
  inputUsdPerMillion: 5,
  outputUsdPerMillion: 30,
  sourceRef: 'official-openai-pricing-snapshot:test',
  verifiedAt: '2026-08-20T03:00:00.000Z'
};

function task() {
  return {
    taskId: 'task_openai_1',
    objective: 'Review a local implementation and identify the next bounded step.',
    originAgent: 'claude-code',
    targetAgent: 'chatgpt',
    contextRefs: ['doc:architecture'],
    evidenceRefs: ['test:fixture'],
    constraints: ['local-preparation-only'],
    forbiddenActions: ['deploy'],
    requiredOutputs: ['outcome'],
    acceptanceTests: ['return canonical result'],
    consequenceClass: 'LOCAL_PREPARATION'
  };
}

function result() {
  return {
    outcome: 'Review complete.',
    changedArtifacts: [],
    testsActuallyRun: [],
    truthTable: [
      { claim: 'fixture reviewed', status: 'VERIFIED', evidenceRefs: ['test:fixture'] }
    ],
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
      objective: '',
      summary: 'No follow-up required.',
      evidenceRefs: ['test:fixture'],
      contextRefs: [],
      acceptanceTests: [],
      requiredOutputs: [],
      constraints: [],
      tokenBudget: 1000,
      confidence: 0.9
    },
    evidenceRefs: ['test:fixture']
  };
}

function completedResponse(payload = result()) {
  return {
    id: 'resp_test_1',
    status: 'completed',
    model: 'gpt-5.6-sol',
    usage: { input_tokens: 1000, output_tokens: 100, total_tokens: 1100 },
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify(payload) }]
      }
    ]
  };
}

function fakeResponse({ ok = true, status = 200, body = completedResponse() } = {}) {
  return {
    ok,
    status,
    async text() { return JSON.stringify(body); }
  };
}

test('adapter is disabled by default and makes no network call', async () => {
  let calls = 0;
  const executor = createOpenAIAgentExecutor({
    apiKey: 'sk-test-not-real-123456789',
    pricing,
    fetchImpl: async () => { calls += 1; return fakeResponse(); }
  });
  const out = await executor({ task: task(), maxTokens: 1000, costCeilingCents: 50 });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('openai-agent-executor-disabled'));
  assert.equal(calls, 0);
});

test('enabled adapter sends only the allowlisted Responses endpoint and requests strict structured output', async () => {
  let captured;
  const executor = createOpenAIAgentExecutor({
    enabled: true,
    apiKey: 'sk-test-not-real-123456789',
    pricing,
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return fakeResponse();
    }
  });
  const out = await executor({ task: task(), model: 'gpt-5.6-sol', maxTokens: 1000, costCeilingCents: 50 });
  assert.equal(out.ok, true);
  assert.equal(captured.url, 'https://api.openai.com/v1/responses');
  assert.equal(captured.init.method, 'POST');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.model, 'gpt-5.6-sol');
  assert.equal(body.max_output_tokens, 1000);
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.name, 'uberbond_agent_worker_result');
  assert.equal(out.result.coordination.action, 'DONE');
  assert.equal(out.usage.totalTokens, 1100);
  assert.equal(out.usage.costCents, 1);
});

test('API key is used only in the request header and never returned in executor result', async () => {
  const key = 'sk-test-not-real-secret-material-123456';
  let authHeader;
  const executor = createOpenAIAgentExecutor({
    enabled: true,
    apiKey: key,
    pricing,
    fetchImpl: async (_url, init) => {
      authHeader = init.headers.Authorization;
      return fakeResponse();
    }
  });
  const out = await executor({ task: task(), maxTokens: 1000, costCeilingCents: 50 });
  assert.equal(authHeader, `Bearer ${key}`);
  assert.equal(JSON.stringify(out).includes(key), false);
});

test('network ambiguity is classified uncertain instead of confirmed failure', async () => {
  const executor = createOpenAIAgentExecutor({
    enabled: true,
    apiKey: 'sk-test-not-real-123456789',
    pricing,
    fetchImpl: async () => { throw new Error('socket reset'); }
  });
  const out = await executor({ task: task(), maxTokens: 1000, costCeilingCents: 50 });
  assert.equal(out.ok, false);
  assert.equal(out.outcome, 'UNCERTAIN');
  assert.equal(out.uncertain, true);
});

test('client rejection is confirmed while server error is uncertain', async () => {
  const clientExecutor = createOpenAIAgentExecutor({
    enabled: true,
    apiKey: 'sk-test-not-real-123456789',
    pricing,
    fetchImpl: async () => fakeResponse({ ok: false, status: 401 })
  });
  const client = await clientExecutor({ task: task(), maxTokens: 1000, costCeilingCents: 50 });
  assert.equal(client.outcome, 'CONFIRMED_FAILURE');

  const serverExecutor = createOpenAIAgentExecutor({
    enabled: true,
    apiKey: 'sk-test-not-real-123456789',
    pricing,
    fetchImpl: async () => fakeResponse({ ok: false, status: 500 })
  });
  const server = await serverExecutor({ task: task(), maxTokens: 1000, costCeilingCents: 50 });
  assert.equal(server.outcome, 'UNCERTAIN');
  assert.equal(server.uncertain, true);
});

test('non-completed 2xx provider state remains uncertain', async () => {
  const executor = createOpenAIAgentExecutor({
    enabled: true,
    apiKey: 'sk-test-not-real-123456789',
    pricing,
    fetchImpl: async () => fakeResponse({ body: { id: 'resp_pending', status: 'in_progress' } })
  });
  const out = await executor({ task: task(), maxTokens: 1000, costCeilingCents: 50 });
  assert.equal(out.outcome, 'UNCERTAIN');
  assert.equal(out.providerRequestId, 'resp_pending');
});

test('pricing evidence is mandatory instead of silently treating paid inference as free', async () => {
  let calls = 0;
  const executor = createOpenAIAgentExecutor({
    enabled: true,
    apiKey: 'sk-test-not-real-123456789',
    pricing: { inputUsdPerMillion: 5, outputUsdPerMillion: 30 },
    fetchImpl: async () => { calls += 1; return fakeResponse(); }
  });
  const out = await executor({ task: task(), maxTokens: 1000, costCeilingCents: 50 });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('verified-pricing-config-required'));
  assert.equal(calls, 0);
});

test('consequenceful task is rejected before any OpenAI request', async () => {
  let calls = 0;
  const executor = createOpenAIAgentExecutor({
    enabled: true,
    apiKey: 'sk-test-not-real-123456789',
    pricing,
    fetchImpl: async () => { calls += 1; return fakeResponse(); }
  });
  const out = await executor({
    task: { ...task(), consequenceClass: 'EXTERNAL_EFFECT' },
    maxTokens: 1000,
    costCeilingCents: 50
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('openai-worker-only-accepts-local-preparation'));
  assert.equal(calls, 0);
});
