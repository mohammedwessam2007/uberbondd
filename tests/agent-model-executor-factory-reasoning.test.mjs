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
  ANTHROPIC_PRICING_VERIFIED_AT: '2026-09-04T20:00:00.000Z'
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

test('canonical executor factory refuses reasoning settings on a transport that has no proven bridge', () => {
  const factory = createModelExecutorFactory({ env, fetchImpl: async () => { throw new Error('should not call'); } });
  assert.throws(
    () => factory({ provider: 'anthropic', model: 'claude-frontier', reasoningEffort: 'xhigh' }),
    /reasoning setting not supported by canonical anthropic executor/i
  );
});
