import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE,
  selfMaintainerFreeAiRuntimeEnv
} from '../.github/workflows/runtime/self-maintainer-free-ai-profile.mjs';
import {
  createModelExecutorFactory,
  describeProviderReadiness
} from '../src/agent-model-executor-factory.mjs';

function baseTask() {
  return {
    taskId: 'uberbond_self_maintain_aaaaaaaaaaaaaaaaaaaaaaaa',
    objective: 'Inspect exact local source and return one bounded proposal.',
    consequenceClass: 'LOCAL_PREPARATION'
  };
}

test('self-maintainer free profile is immutable, exactly zero priced, and pinned to official Vercel evidence', () => {
  assert.equal(Object.isFrozen(SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE), true);
  assert.equal(SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.provider, 'ai-gateway');
  assert.equal(SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.model, 'minimax/minimax-m2.7-free');
  assert.equal(SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.inputUsdPerMillion, 0);
  assert.equal(SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.outputUsdPerMillion, 0);
  assert.equal(SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.spendCeilingCents, 0);
  assert.equal(SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.businessEffectAuthority, 'NONE');
  assert.equal(SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.pricingSource, 'https://vercel.com/ai-gateway/models/minimax-m2.7-free');
  assert.ok(Number.isFinite(Date.parse(SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.pricingVerifiedAt)));
});

test('paid-model and paid-pricing project env cannot substitute the self-maintainer free profile', () => {
  const runtime = selfMaintainerFreeAiRuntimeEnv({
    AI_GATEWAY_MODEL: 'openai/paid-model',
    AI_GATEWAY_AGENT_ENABLED: 'false',
    AI_GATEWAY_INPUT_USD_PER_MILLION: '99',
    AI_GATEWAY_OUTPUT_USD_PER_MILLION: '999',
    AI_GATEWAY_PRICING_SOURCE: 'attacker:stale-pricing',
    AI_GATEWAY_PRICING_VERIFIED_AT: '2000-01-01T00:00:00.000Z',
    VERCEL_OIDC_TOKEN: 'vercel-oidc-test-token-long-enough'
  });
  assert.equal(runtime.AI_GATEWAY_MODEL, SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.model);
  assert.equal(runtime.AI_GATEWAY_AGENT_ENABLED, 'true');
  assert.equal(runtime.AI_GATEWAY_INPUT_USD_PER_MILLION, '0');
  assert.equal(runtime.AI_GATEWAY_OUTPUT_USD_PER_MILLION, '0');
  assert.equal(runtime.AI_GATEWAY_PRICING_SOURCE, SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.pricingSource);
  assert.equal(runtime.AI_GATEWAY_PRICING_VERIFIED_AT, SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.pricingVerifiedAt);
});

test('free profile creates readiness only when a real Gateway credential identity is present', () => {
  const withoutCredential = describeProviderReadiness({ env: selfMaintainerFreeAiRuntimeEnv({}) });
  const blocked = withoutCredential.find(row => row.provider === 'ai-gateway');
  assert.equal(blocked.ready, false);
  assert.ok(blocked.blockers.includes('credential-absent'));
  assert.equal(blocked.pricingEvidencePresent, true);

  const withVercelOidc = describeProviderReadiness({
    env: selfMaintainerFreeAiRuntimeEnv({ VERCEL_OIDC_TOKEN: 'vercel-oidc-test-token-long-enough' })
  });
  const ready = withVercelOidc.find(row => row.provider === 'ai-gateway');
  assert.equal(ready.ready, true, JSON.stringify(ready));
  assert.equal(ready.credentialPresent, true);
  assert.equal(ready.pricingEvidencePresent, true);
});

test('canonical Gateway executor admits exact free model under a zero-cent ceiling and reports zero metered cost', async () => {
  let request = null;
  const runtime = selfMaintainerFreeAiRuntimeEnv({ VERCEL_OIDC_TOKEN: 'vercel-oidc-test-token-long-enough' });
  const makeExecutor = createModelExecutorFactory({
    env: runtime,
    fetchImpl: async (url, options) => {
      request = { url: String(url), options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({
        id: 'free_req_1',
        model: SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.model,
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ outcome: 'bounded free result' }) } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  const executor = makeExecutor({ provider: 'ai-gateway', model: SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.model });
  const out = await executor({ task: baseTask(), maxTokens: 1000, costCeilingCents: 0 });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.usage.costCents, 0);
  assert.equal(out.pricingEvidence.inputUsdPerMillion, 0);
  assert.equal(out.pricingEvidence.outputUsdPerMillion, 0);
  assert.equal(request.body.model, SELF_MAINTAINER_FREE_AI_GATEWAY_PROFILE.model);
  assert.equal('reasoning' in request.body, false);
});
