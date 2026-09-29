import test from 'node:test';
import assert from 'node:assert/strict';

import { createOpenRouterAgentExecutor } from '../src/openrouter-agent-executor.mjs';

const pricing = {
  inputUsdPerMillion: 0.07,
  outputUsdPerMillion: 0.14,
  cacheReadUsdPerMillion: 0.0014,
  sourceRef: 'openrouter://catalog/test-model',
  verifiedAt: '2026-09-29T12:00:00.000Z'
};

const task = {
  taskId: 'or-test-1',
  objective: 'Produce a bounded JSON research artifact.',
  consequenceClass: 'LOCAL_PREPARATION',
  dataClass: 'PUBLIC'
};

test('OpenRouter executor sends price/ZDR/sticky-cache policy and never model fallbacks', async () => {
  let observed = null;
  const fetchImpl = async (url, options) => {
    observed = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          id: 'gen_1',
          model: 'xiaomi/mimo-v2.6-flash',
          usage: {
            prompt_tokens: 1000,
            completion_tokens: 100,
            total_tokens: 1100,
            prompt_tokens_details: { cached_tokens: 800 }
          },
          choices: [{ message: { content: JSON.stringify({ status: 'OK' }) } }]
        });
      }
    };
  };

  const executor = createOpenRouterAgentExecutor({
    apiKey: 'sk-or-v1-test-secret-token',
    enabled: true,
    defaultModel: 'xiaomi/mimo-v2.6-flash',
    pricing,
    fetchImpl,
    providerSort: 'price',
    requireZdr: true,
    allowProviderFallbacks: true,
    maxPromptPrice: 0.1,
    maxCompletionPrice: 0.2
  });

  const out = await executor({
    task,
    maxTokens: 200,
    costCeilingCents: 5,
    sessionId: 'mission-123',
    responseCacheEligible: true
  });

  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(observed.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(observed.body.provider.sort, 'price');
  assert.equal(observed.body.provider.zdr, true);
  assert.equal(observed.body.provider.data_collection, 'deny');
  assert.equal(observed.body.provider.allow_fallbacks, true);
  assert.equal(observed.body.provider.max_price.prompt, 0.1);
  assert.equal(observed.body.provider.max_price.completion, 0.2);
  assert.equal(observed.body.session_id, 'mission-123');
  assert.equal('models' in observed.body, false);
  assert.equal(observed.options.headers['X-OpenRouter-Cache'], 'true');
  assert.equal(out.observedModel, 'xiaomi/mimo-v2.6-flash');
  assert.equal(out.identityVerification, 'MATCHED');
  assert.equal(out.usage.cachedInputTokens, 800);
  assert.equal(JSON.stringify(out).includes('sk-or-v1-test-secret-token'), false);
});

test('OpenRouter executor refuses a different returned model even if provider returned HTTP 200', async () => {
  const executor = createOpenRouterAgentExecutor({
    apiKey: 'sk-or-v1-test-secret-token',
    enabled: true,
    defaultModel: 'anthropic/claude-opus-5.5',
    pricing: { ...pricing, inputUsdPerMillion: 4, outputUsdPerMillion: 20 },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          id: 'gen_2',
          model: 'some-cheaper-model',
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
          choices: [{ message: { content: '{}' } }]
        });
      }
    })
  });

  const out = await executor({ task, maxTokens: 20, costCeilingCents: 100 });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('openrouter-model-identity-mismatch'));
});

test('OpenRouter executor refuses unverified pricing before network use', async () => {
  let calls = 0;
  const executor = createOpenRouterAgentExecutor({
    apiKey: 'sk-or-v1-test-secret-token',
    enabled: true,
    defaultModel: 'test/model',
    pricing: { inputUsdPerMillion: 0, outputUsdPerMillion: 0 },
    fetchImpl: async () => { calls += 1; throw new Error('should not call'); }
  });
  const out = await executor({ task, maxTokens: 20, costCeilingCents: 100 });
  assert.equal(out.ok, false);
  assert.equal(calls, 0);
  assert.ok(out.reasonCodes.includes('verified-openrouter-model-pricing-required'));
});


test('OpenRouter response caching is refused for non-public task data', async () => {
  let calls = 0;
  const executor = createOpenRouterAgentExecutor({
    apiKey: 'sk-or-v1-test-secret-token',
    enabled: true,
    defaultModel: 'vendor/model',
    pricing,
    fetchImpl: async () => { calls += 1; throw new Error('should not call'); }
  });
  const out = await executor({
    task: { ...task, dataClass: 'INTERNAL_NON_SECRET' },
    maxTokens: 20,
    costCeilingCents: 10,
    responseCacheEligible: true
  });
  assert.equal(out.ok, false);
  assert.equal(calls, 0);
  assert.ok(out.reasonCodes.includes('openrouter-response-cache-public-data-only'));
});
