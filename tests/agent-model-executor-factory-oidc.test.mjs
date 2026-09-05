import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createModelExecutorFactory,
  describeProviderReadiness
} from '../src/agent-model-executor-factory.mjs';

function gatewayOidcEnv(overrides = {}) {
  return {
    VERCEL_OIDC_TOKEN: 'vercel-oidc-runtime-token-test-value',
    AI_GATEWAY_API_KEY: '',
    AI_GATEWAY_AGENT_ENABLED: 'true',
    AI_GATEWAY_INPUT_USD_PER_MILLION: '1',
    AI_GATEWAY_OUTPUT_USD_PER_MILLION: '2',
    AI_GATEWAY_PRICING_SOURCE: 'official-vercel-ai-gateway-pricing:test',
    AI_GATEWAY_PRICING_VERIFIED_AT: '2026-09-05T00:00:00.000Z',
    ...overrides
  };
}

test('Vercel OIDC makes only the ai-gateway lane credential-ready without exposing the bearer', () => {
  const env = gatewayOidcEnv();
  const rows = describeProviderReadiness({ env });
  const gateway = rows.find(row => row.provider === 'ai-gateway');
  assert.equal(gateway.ready, true);
  assert.equal(gateway.credentialPresent, true);
  assert.equal(gateway.pricingEvidencePresent, true);
  assert.equal(JSON.stringify(rows).includes(env.VERCEL_OIDC_TOKEN), false);

  assert.throws(
    () => createModelExecutorFactory({
      env: {
        ...env,
        OPENAI_AGENT_ENABLED: 'true',
        OPENAI_INPUT_USD_PER_MILLION: '1',
        OPENAI_OUTPUT_USD_PER_MILLION: '2',
        OPENAI_PRICING_SOURCE: 'official:test',
        OPENAI_PRICING_VERIFIED_AT: '2026-09-05T00:00:00.000Z'
      }
    })({ provider: 'openai', model: 'gpt-5.4' }),
    /credential is absent/
  );
});

test('canonical ai-gateway executor sends the short-lived Vercel OIDC token only as bearer auth', async () => {
  const env = gatewayOidcEnv();
  let authorization = null;
  const fetchImpl = async (_url, options = {}) => {
    authorization = options.headers?.Authorization || null;
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          id: 'req_oidc_1',
          model: 'openai/gpt-5.4',
          model_revision: 'gpt-5.4-2026-08-31',
          usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ status: 'AVENGER_READY' }) } }]
        });
      }
    };
  };

  const executor = createModelExecutorFactory({ env, fetchImpl })({
    provider: 'ai-gateway',
    model: 'openai/gpt-5.4',
    reasoningEffort: 'xhigh'
  });
  const result = await executor({
    task: { taskId: 'oidc-probe', objective: 'Return readiness JSON.', consequenceClass: 'LOCAL_PREPARATION' },
    model: 'openai/gpt-5.4',
    maxTokens: 64,
    costCeilingCents: 100
  });

  assert.equal(result.ok, true);
  assert.equal(authorization, `Bearer ${env.VERCEL_OIDC_TOKEN}`);
  assert.equal(result.model, 'openai/gpt-5.4');
  assert.equal(result.observedRevision, 'gpt-5.4-2026-08-31');
  assert.equal(result.providerRequestId, 'req_oidc_1');
  assert.equal(JSON.stringify(result).includes(env.VERCEL_OIDC_TOKEN), false);
});
