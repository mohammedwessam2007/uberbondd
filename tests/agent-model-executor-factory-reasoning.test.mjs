import test from 'node:test';
import assert from 'node:assert/strict';
import { createModelExecutorFactory } from '../src/agent-model-executor-factory.mjs';

const env = {
  AI_GATEWAY_API_KEY: 'test-key-long-enough',
  AI_GATEWAY_AGENT_ENABLED: 'true',
  AI_GATEWAY_INPUT_USD_PER_MILLION: '1',
  AI_GATEWAY_OUTPUT_USD_PER_MILLION: '2',
  AI_GATEWAY_PRICING_SOURCE: 'official://pricing',
  AI_GATEWAY_PRICING_VERIFIED_AT: '2026-09-04T20:00:00.000Z',
  ANTHROPIC_API_KEY: 'test-key-long-enough',
  ANTHROPIC_AGENT_ENABLED: 'true',
  ANTHROPIC_INPUT_USD_PER_MILLION: '1',
  ANTHROPIC_OUTPUT_USD_PER_MILLION: '2',
  ANTHROPIC_PRICING_SOURCE: 'official://pricing',
  ANTHROPIC_PRICING_VERIFIED_AT: '2026-09-04T20:00:00.000Z',
  ANTHROPIC_CACHE_WRITE_USD_PER_MILLION: '1.25',
  ANTHROPIC_CACHE_READ_USD_PER_MILLION: '0.05',
  OPENAI_API_KEY: 'test-key-long-enough',
  OPENAI_AGENT_ENABLED: 'true',
  OPENAI_INPUT_USD_PER_MILLION: '1',
  OPENAI_OUTPUT_USD_PER_MILLION: '2',
  OPENAI_PRICING_SOURCE: 'official://pricing',
  OPENAI_PRICING_VERIFIED_AT: '2026-09-04T20:00:00.000Z'
};

const task = { taskId: 'factory-reasoning', objective: 'Return JSON.', consequenceClass: 'LOCAL_PREPARATION' };

test('canonical executor factory forwards xhigh reasoning to AI Gateway', async () => {
  let body;
  const factory = createModelExecutorFactory({
    env,
    fetchImpl: async (_url, init) => {
      body = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            id: 'req_1', model: 'openai/frontier-model',
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ outcome: 'ok' }) } }]
          });
        }
      };
    }
  });
  const executor = factory({ provider: 'ai-gateway', model: 'openai/frontier-model', reasoningEffort: 'xhigh' });
  const out = await executor({ task, maxTokens: 100, costCeilingCents: 100 });
  assert.equal(out.ok, true);
  assert.deepEqual(body.reasoning, { effort: 'xhigh' });
  assert.equal(out.appliedReasoningEffort, 'xhigh');
});

test('canonical executor factory forwards max effort to native Anthropic transport', async () => {
  let body;
  const factory = createModelExecutorFactory({
    env,
    fetchImpl: async (_url, init) => {
      body = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            id: 'msg_native_anthropic',
            model: 'claude-opus-5-5',
            stop_reason: 'tool_use',
            usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
            content: [{
              type: 'tool_use',
              id: 'tool_1',
              name: 'submit_uberbond_result',
              input: { outcome: 'ok' }
            }]
          });
        }
      };
    }
  });
  const executor = factory({ provider: 'anthropic', model: 'claude-opus-5-5', reasoningEffort: 'max' });
  const out = await executor({ task, maxTokens: 100, costCeilingCents: 100 });
  assert.equal(out.ok, true);
  assert.deepEqual(body.output_config, { effort: 'max' });
  assert.equal(out.appliedReasoningEffort, 'max');
  assert.equal(out.pricingEvidence.cacheReadUsdPerMillion, 0.05);
});

test('canonical executor factory forwards max reasoning and Flex to native OpenAI transport', async () => {
  let body;
  const factory = createModelExecutorFactory({
    env,
    fetchImpl: async (_url, init) => {
      body = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            id: 'resp_native_openai',
            status: 'completed',
            model: 'gpt-6-astra',
            service_tier: 'flex',
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
            output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ outcome: 'ok' }) }] }]
          });
        }
      };
    }
  });
  const executor = factory({ provider: 'openai', model: 'gpt-6-astra', reasoningEffort: 'max', serviceTier: 'flex' });
  const out = await executor({ task, maxTokens: 100, costCeilingCents: 100 });
  assert.equal(out.ok, true);
  assert.deepEqual(body.reasoning, { effort: 'max' });
  assert.equal(body.service_tier, 'flex');
  assert.equal(out.appliedServiceTier, 'flex');
});
