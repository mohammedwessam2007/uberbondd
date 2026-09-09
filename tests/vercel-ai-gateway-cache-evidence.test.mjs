import test from 'node:test';
import assert from 'node:assert/strict';
import { createVercelAIGatewayExecutor } from '../src/vercel-ai-gateway-executor.mjs';

const pricing = { inputUsdPerMillion: 1, outputUsdPerMillion: 2, sourceRef: 'official-gateway-pricing:test', verifiedAt: '2026-09-09T00:00:00Z' };
const task = () => ({ taskId: 'cache-test-1', objective: 'Review local source', consequenceClass: 'LOCAL_PREPARATION' });
const workerResult = () => ({ outcome: 'done', changedArtifacts: [], testsActuallyRun: [], truthTable: [], externalEffectLedger: { providerCalls: 0, messages: 0, purchases: 0, deployments: 0, credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0 }, decision: 'PROCEED', coordination: { action: 'DONE', objective: '', summary: 'done', evidenceRefs: [], contextRefs: [], acceptanceTests: [], requiredOutputs: [], constraints: [], tokenBudget: 1, confidence: 1 }, evidenceRefs: [] });
const response = (usage, model = 'openai/gpt-5.4') => ({
  ok: true,
  status: 200,
  async text() {
    return JSON.stringify({
      id: 'gw-cache-1',
      model,
      usage: usage || { prompt_tokens: 100, completion_tokens: 5, total_tokens: 105 },
      choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(workerResult()) } }]
    });
  }
});

function configured(fetchImpl, defaultModel = 'openai/gpt-5.4') {
  return createVercelAIGatewayExecutor({
    enabled: true,
    apiKey: 'gateway-test-secret-123456',
    pricing,
    defaultModel,
    fetchImpl
  });
}

test('OpenAI stable shared context uses implicit prefix caching without inventing AI SDK providerOptions', async () => {
  let body;
  const executor = configured(async (_url, init) => { body = JSON.parse(init.body); return response(); });
  const stable = 'stable repository constitution and source context';
  const out = await executor({ task: task(), maxTokens: 100, costCeilingCents: 50, cacheableContext: stable, cacheableContextDataClass: 'SOURCE_CODE' });
  assert.equal(out.ok, true);
  assert.equal(Object.hasOwn(body, 'providerOptions'), false);
  assert.equal(Object.hasOwn(body.messages[1], 'cache_control'), false);
  assert.equal(body.messages[1].content, stable);
  assert.match(body.messages[2].content, /cache-test-1/);
  assert.equal(JSON.stringify(out).includes(stable), false, 'raw shared context must not be persisted into the result receipt');
  assert.equal(out.cacheEvidence.requested, true);
  assert.equal(out.cacheEvidence.requestMode, 'STABLE_PREFIX_IMPLICIT_PROVIDER_CACHE');
  assert.equal(out.cacheEvidence.dataClass, 'SOURCE_CODE');
  assert.match(out.cacheEvidence.prefixSha256, /^[a-f0-9]{64}$/);
});

test('Anthropic Chat Completions uses the documented cache_control message marker', async () => {
  let body;
  const executor = configured(async (_url, init) => { body = JSON.parse(init.body); return response(undefined, 'anthropic/claude-opus-5'); }, 'anthropic/claude-opus-5');
  const out = await executor({ task: task(), maxTokens: 100, costCeilingCents: 50, cacheableContext: 'stable source context', cacheableContextDataClass: 'SOURCE_CODE' });
  assert.equal(out.ok, true);
  assert.deepEqual(body.messages[1].cache_control, { type: 'ephemeral' });
  assert.equal(Object.hasOwn(body, 'providerOptions'), false);
  assert.equal(out.cacheEvidence.requestMode, 'CHAT_COMPLETIONS_EXPLICIT_EPHEMERAL');
});

test('provider-reported cache reads are evidence while savings remain unclaimed', async () => {
  const executor = configured(async () => response({
    prompt_tokens: 100,
    completion_tokens: 5,
    total_tokens: 105,
    prompt_tokens_details: { cached_tokens: 80 }
  }));
  const out = await executor({ task: task(), maxTokens: 100, costCeilingCents: 50, cacheableContext: 'stable source context', cacheableContextDataClass: 'SOURCE_CODE' });
  assert.equal(out.ok, true);
  assert.equal(out.cacheEvidence.cacheReadTokens, 80);
  assert.equal(out.cacheEvidence.status, 'OBSERVED_CACHE_HIT');
  assert.equal(out.cacheEvidence.observationClass, 'PROVIDER_USAGE_FIELD_OBSERVED');
  assert.equal(out.cacheEvidence.savingsClaim, 'NOT_COMPUTED_WITHOUT_VERIFIED_CACHE_PRICING');
  assert.equal(out.usage.costBasis, 'CONFIGURED_CONSERVATIVE_ESTIMATE');
});

test('no shared context keeps caching opt-in and does not manufacture cache evidence', async () => {
  let body;
  const executor = configured(async (_url, init) => { body = JSON.parse(init.body); return response(); });
  const out = await executor({ task: task(), maxTokens: 100, costCeilingCents: 50 });
  assert.equal(out.ok, true);
  assert.equal(Object.hasOwn(body, 'providerOptions'), false);
  assert.equal(out.cacheEvidence.requested, false);
  assert.equal(out.cacheEvidence.requestMode, 'NOT_REQUESTED');
  assert.equal(out.cacheEvidence.status, 'CACHE_USAGE_FIELDS_NOT_OBSERVED');
  assert.equal(out.cacheEvidence.savingsClaim, 'NOT_COMPUTED_WITHOUT_VERIFIED_CACHE_PRICING');
});

test('unclassified shared context is refused before any provider call', async () => {
  let calls = 0;
  const executor = configured(async () => { calls += 1; return response(); });
  const out = await executor({ task: task(), maxTokens: 100, costCeilingCents: 50, cacheableContext: 'some shared context' });
  assert.equal(out.ok, false);
  assert.equal(calls, 0);
  assert.ok(out.reasonCodes.includes('cacheable-context-explicit-approved-data-class-required'));
});

test('founder-private or otherwise unapproved context is refused before any provider call', async () => {
  let calls = 0;
  const executor = configured(async () => { calls += 1; return response(); });
  const out = await executor({ task: task(), maxTokens: 100, costCeilingCents: 50, cacheableContext: 'private life record', cacheableContextDataClass: 'WESSAM_INNERMOST' });
  assert.equal(out.ok, false);
  assert.equal(calls, 0);
  assert.ok(out.reasonCodes.includes('cacheable-context-explicit-approved-data-class-required'));
});

test('unverified model-family cache wire format is refused before any provider call', async () => {
  let calls = 0;
  const executor = configured(async () => { calls += 1; return response(undefined, 'minimax/example'); }, 'minimax/example');
  const out = await executor({ task: task(), maxTokens: 100, costCeilingCents: 50, cacheableContext: 'stable source context', cacheableContextDataClass: 'SOURCE_CODE' });
  assert.equal(out.ok, false);
  assert.equal(calls, 0);
  assert.ok(out.reasonCodes.includes('cacheable-context-model-caching-wire-format-unverified'));
});

test('impossible provider cache counters fail closed instead of fabricating a hit', async () => {
  const executor = configured(async () => response({
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
    prompt_tokens_details: { cached_tokens: 11 }
  }));
  const out = await executor({ task: task(), maxTokens: 100, costCeilingCents: 50, cacheableContext: 'stable source context', cacheableContextDataClass: 'SOURCE_CODE' });
  assert.equal(out.ok, false);
  assert.equal(out.outcome, 'UNCERTAIN');
  assert.ok(out.reasonCodes.includes('ai-gateway-cache-usage-invalid'));
});
