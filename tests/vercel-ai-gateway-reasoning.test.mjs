import test from 'node:test';
import assert from 'node:assert/strict';
import { createVercelAIGatewayExecutor, VERCEL_AI_GATEWAY_ENDPOINT } from '../src/vercel-ai-gateway-executor.mjs';

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(payload); }
  };
}

const task = {
  taskId: 'frontier-reasoning-proof',
  objective: 'Return a bounded structured result.',
  consequenceClass: 'LOCAL_PREPARATION'
};

const pricing = {
  inputUsdPerMillion: 1,
  outputUsdPerMillion: 2,
  sourceRef: 'official://pricing',
  verifiedAt: '2026-09-04T20:00:00.000Z'
};

test('AI Gateway executor applies xhigh reasoning to the actual request and attests the applied setting', async () => {
  let request = null;
  const executor = createVercelAIGatewayExecutor({
    apiKey: 'test-key-long-enough',
    enabled: true,
    defaultModel: 'openai/frontier-model',
    pricing,
    reasoningEffort: 'xhigh',
    fetchImpl: async (url, init) => {
      request = { url, init, body: JSON.parse(init.body) };
      return response({
        id: 'req_1',
        model: 'openai/frontier-model',
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ outcome: 'ok' }) } }]
      });
    }
  });

  const out = await executor({ task, model: 'openai/frontier-model', maxTokens: 100, costCeilingCents: 100 });
  assert.equal(out.ok, true);
  assert.equal(request.url, VERCEL_AI_GATEWAY_ENDPOINT);
  assert.deepEqual(request.body.reasoning, { effort: 'xhigh' });
  assert.equal(out.appliedReasoningEffort, 'xhigh');
  assert.equal(out.appliedReasoningEvidence, 'REQUEST_BODY_ATTESTED');
});

test('AI Gateway executor refuses unsupported reasoning setting instead of downgrading it', async () => {
  let calls = 0;
  const executor = createVercelAIGatewayExecutor({
    apiKey: 'test-key-long-enough', enabled: true, defaultModel: 'openai/frontier-model', pricing,
    reasoningEffort: 'ultra-secret-max',
    fetchImpl: async () => { calls += 1; return response({}); }
  });
  const out = await executor({ task, model: 'openai/frontier-model', maxTokens: 100, costCeilingCents: 100 });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('ai-gateway-reasoning-effort-unsupported'));
  assert.equal(calls, 0);
});

test('AI Gateway executor rejects returned model identity drift before success', async () => {
  const executor = createVercelAIGatewayExecutor({
    apiKey: 'test-key-long-enough', enabled: true, defaultModel: 'openai/frontier-model', pricing,
    reasoningEffort: 'xhigh',
    fetchImpl: async () => response({
      id: 'req_2',
      model: 'different/model',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ outcome: 'ok' }) } }]
    })
  });
  const out = await executor({ task, model: 'openai/frontier-model', maxTokens: 100, costCeilingCents: 100 });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('ai-gateway-model-identity-mismatch'));
});
