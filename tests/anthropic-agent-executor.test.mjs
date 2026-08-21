import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnthropicAgentExecutor } from '../src/anthropic-agent-executor.mjs';

const pricing = {
  inputUsdPerMillion: 3,
  outputUsdPerMillion: 15,
  sourceRef: 'official-anthropic-pricing-snapshot:test',
  verifiedAt: '2026-08-20T06:00:00.000Z'
};

function task() {
  return {
    taskId: 'task_anthropic_1',
    objective: 'Review a local implementation and identify the next bounded engineering step.',
    originAgent: 'chatgpt',
    targetAgent: 'claude-code',
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
    outcome: 'Engineering review complete.',
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

function completedResponse(payload = result(), overrides = {}) {
  return {
    id: 'msg_test_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-test',
    stop_reason: 'tool_use',
    usage: {
      input_tokens: 1000,
      output_tokens: 100,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0
    },
    content: [
      {
        type: 'tool_use',
        id: 'toolu_test_1',
        name: 'submit_uberbond_result',
        input: payload
      }
    ],
    ...overrides
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
  const executor = createAnthropicAgentExecutor({
    apiKey: 'anthropic-test-not-real-123456789',
    pricing,
    fetchImpl: async () => { calls += 1; return fakeResponse(); }
  });
  const out = await executor({ task: task(), model: 'claude-sonnet-test', maxTokens: 1000, costCeilingCents: 50 });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('anthropic-agent-executor-disabled'));
  assert.equal(calls, 0);
});

test('enabled adapter uses only the allowlisted Messages endpoint and forced result-return tool', async () => {
  let captured;
  const executor = createAnthropicAgentExecutor({
    enabled: true,
    apiKey: 'anthropic-test-not-real-123456789',
    pricing,
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return fakeResponse();
    }
  });
  const out = await executor({ task: task(), model: 'claude-sonnet-test', maxTokens: 1000, costCeilingCents: 50 });
  assert.equal(out.ok, true);
  assert.equal(captured.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.headers['anthropic-version'], '2023-06-01');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.model, 'claude-sonnet-test');
  assert.equal(body.max_tokens, 1000);
  assert.equal(body.tools.length, 1);
  assert.equal(body.tools[0].name, 'submit_uberbond_result');
  assert.equal(body.tool_choice.type, 'tool');
  assert.equal(body.tool_choice.name, 'submit_uberbond_result');
  assert.equal(out.result.coordination.action, 'DONE');
  assert.equal(out.usage.totalTokens, 1100);
  assert.equal(out.usage.costCents, 1);
});

test('API key is used only in request header and is not returned', async () => {
  const key = 'anthropic-test-secret-material-123456789';
  let keyHeader;
  const executor = createAnthropicAgentExecutor({
    enabled: true,
    apiKey: key,
    pricing,
    fetchImpl: async (_url, init) => {
      keyHeader = init.headers['x-api-key'];
      return fakeResponse();
    }
  });
  const out = await executor({ task: task(), model: 'claude-sonnet-test', maxTokens: 1000, costCeilingCents: 50 });
  assert.equal(keyHeader, key);
  assert.equal(JSON.stringify(out).includes(key), false);
});

test('transport ambiguity is quarantined instead of marked confirmed failure', async () => {
  const executor = createAnthropicAgentExecutor({
    enabled: true,
    apiKey: 'anthropic-test-not-real-123456789',
    pricing,
    fetchImpl: async () => { throw new Error('socket reset'); }
  });
  const out = await executor({ task: task(), model: 'claude-sonnet-test', maxTokens: 1000, costCeilingCents: 50 });
  assert.equal(out.ok, false);
  assert.equal(out.outcome, 'UNCERTAIN');
  assert.equal(out.uncertain, true);
});

test('explicit client rejection is confirmed while server and overload errors are uncertain', async () => {
  const clientExecutor = createAnthropicAgentExecutor({
    enabled: true,
    apiKey: 'anthropic-test-not-real-123456789',
    pricing,
    fetchImpl: async () => fakeResponse({ ok: false, status: 401 })
  });
  const client = await clientExecutor({ task: task(), model: 'claude-sonnet-test', maxTokens: 1000, costCeilingCents: 50 });
  assert.equal(client.outcome, 'CONFIRMED_FAILURE');

  for (const status of [500, 529]) {
    const executor = createAnthropicAgentExecutor({
      enabled: true,
      apiKey: 'anthropic-test-not-real-123456789',
      pricing,
      fetchImpl: async () => fakeResponse({ ok: false, status })
    });
    const out = await executor({ task: task(), model: 'claude-sonnet-test', maxTokens: 1000, costCeilingCents: 50 });
    assert.equal(out.outcome, 'UNCERTAIN');
    assert.equal(out.uncertain, true);
  }
});

test('pricing evidence is mandatory and no paid request is made without it', async () => {
  let calls = 0;
  const executor = createAnthropicAgentExecutor({
    enabled: true,
    apiKey: 'anthropic-test-not-real-123456789',
    pricing: { inputUsdPerMillion: 3, outputUsdPerMillion: 15 },
    fetchImpl: async () => { calls += 1; return fakeResponse(); }
  });
  const out = await executor({ task: task(), model: 'claude-sonnet-test', maxTokens: 1000, costCeilingCents: 50 });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('verified-pricing-config-required'));
  assert.equal(calls, 0);
});

test('consequenceful task is rejected before any Anthropic request', async () => {
  let calls = 0;
  const executor = createAnthropicAgentExecutor({
    enabled: true,
    apiKey: 'anthropic-test-not-real-123456789',
    pricing,
    fetchImpl: async () => { calls += 1; return fakeResponse(); }
  });
  const out = await executor({
    task: { ...task(), consequenceClass: 'EXTERNAL_EFFECT' },
    model: 'claude-sonnet-test',
    maxTokens: 1000,
    costCeilingCents: 50
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('anthropic-worker-only-accepts-local-preparation'));
  assert.equal(calls, 0);
});

test('cached-input usage is counted into the compute ledger conservatively by default', async () => {
  const executor = createAnthropicAgentExecutor({
    enabled: true,
    apiKey: 'anthropic-test-not-real-123456789',
    pricing,
    fetchImpl: async () => fakeResponse({
      body: completedResponse(result(), {
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 200,
          cache_read_input_tokens: 300
        }
      })
    })
  });
  const out = await executor({ task: task(), model: 'claude-sonnet-test', maxTokens: 1000, costCeilingCents: 50 });
  assert.equal(out.ok, true);
  assert.equal(out.usage.inputTokens, 600);
  assert.equal(out.usage.outputTokens, 50);
  assert.equal(out.usage.totalTokens, 650);
  assert.equal(out.usage.costBasis, 'CONFIGURED_CONSERVATIVE_ESTIMATE');
});

test('missing canonical tool result is uncertain because compute may already have occurred', async () => {
  const executor = createAnthropicAgentExecutor({
    enabled: true,
    apiKey: 'anthropic-test-not-real-123456789',
    pricing,
    fetchImpl: async () => fakeResponse({
      body: completedResponse(result(), {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'not the required tool result' }]
      })
    })
  });
  const out = await executor({ task: task(), model: 'claude-sonnet-test', maxTokens: 1000, costCeilingCents: 50 });
  assert.equal(out.ok, false);
  assert.equal(out.outcome, 'UNCERTAIN');
  assert.ok(out.reasonCodes.includes('anthropic-canonical-result-tool-missing'));
});

test('max-token truncation is quarantined with provider request evidence', async () => {
  const executor = createAnthropicAgentExecutor({
    enabled: true,
    apiKey: 'anthropic-test-not-real-123456789',
    pricing,
    fetchImpl: async () => fakeResponse({
      body: completedResponse(result(), { stop_reason: 'max_tokens', content: [] })
    })
  });
  const out = await executor({ task: task(), model: 'claude-sonnet-test', maxTokens: 1000, costCeilingCents: 50 });
  assert.equal(out.ok, false);
  assert.equal(out.outcome, 'UNCERTAIN');
  assert.equal(out.providerRequestId, 'msg_test_1');
  assert.ok(out.reasonCodes.includes('anthropic-max-tokens-before-canonical-result'));
});
