import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createModelExecutorFactory,
  describeProviderReadiness
} from '../src/agent-model-executor-factory.mjs';

function env(overrides = {}) {
  return {
    OPENROUTER_API_KEY: 'sk-or-v1-factory-test-secret',
    OPENROUTER_AGENT_ENABLED: 'true',
    OPENROUTER_PROVIDER_SORT: 'price',
    OPENROUTER_REQUIRE_ZDR: 'true',
    OPENROUTER_ALLOW_PROVIDER_FALLBACKS: 'true',
    ...overrides
  };
}

const pricing = {
  inputUsdPerMillion: 0.1,
  outputUsdPerMillion: 0.2,
  sourceRef: 'openrouter://catalog/vendor/model',
  verifiedAt: '2026-09-29T12:00:00.000Z'
};

test('OpenRouter transport readiness needs one credential and enablement; model pricing is execution-scoped', () => {
  const rows = describeProviderReadiness({ env: env() });
  const row = rows.find(item => item.provider === 'openrouter');
  assert.ok(row);
  assert.equal(row.ready, true);
  assert.equal(row.credentialPresent, true);
  assert.equal(row.pricingEvidenceMode, 'PER_MODEL_REQUIRED_AT_EXECUTION');
  assert.equal(JSON.stringify(rows).includes('sk-or-v1-factory-test-secret'), false);
});

test('canonical factory builds an OpenRouter worker only with per-model pricing evidence', async () => {
  let observedBody = null;
  const executor = createModelExecutorFactory({
    env: env(),
    fetchImpl: async (_url, options) => {
      observedBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            id: 'or_gen_factory',
            model: 'vendor/model',
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            choices: [{ message: { content: '{}' } }]
          });
        }
      };
    }
  })({
    provider: 'openrouter',
    model: 'vendor/model',
    pricing,
    reasoningEffort: 'high'
  });

  const out = await executor({
    task: { taskId: 'or-factory', objective: 'Return JSON.', consequenceClass: 'LOCAL_PREPARATION' },
    maxTokens: 32,
    costCeilingCents: 10,
    sessionId: 'session-factory'
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(observedBody.model, 'vendor/model');
  assert.equal(observedBody.provider.sort, 'price');
  assert.equal(observedBody.provider.zdr, true);
  assert.equal('models' in observedBody, false);
});

test('canonical factory refuses OpenRouter worker without per-model verified pricing', () => {
  assert.throws(
    () => createModelExecutorFactory({ env: env() })({ provider: 'openrouter', model: 'vendor/model' }),
    /pricing evidence is absent or incomplete/
  );
});
