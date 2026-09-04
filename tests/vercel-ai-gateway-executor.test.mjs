import test from 'node:test';
import assert from 'node:assert/strict';
import { createVercelAIGatewayExecutor } from '../src/vercel-ai-gateway-executor.mjs';

const pricing = { inputUsdPerMillion: 1, outputUsdPerMillion: 2, sourceRef: 'official-gateway-pricing:test', verifiedAt: '2026-09-01T00:00:00Z' };
const task = () => ({ taskId: 'gateway-test-1', objective: 'Review local code', consequenceClass: 'LOCAL_PREPARATION' });
const result = () => ({ outcome: 'done', changedArtifacts: [], testsActuallyRun: [], truthTable: [], externalEffectLedger: { providerCalls: 0, messages: 0, purchases: 0, deployments: 0, credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0 }, decision: 'PROCEED', coordination: { action: 'DONE', objective: '', summary: 'done', evidenceRefs: [], contextRefs: [], acceptanceTests: [], requiredOutputs: [], constraints: [], tokenBudget: 1, confidence: 1 }, evidenceRefs: [] });
const response = (status = 200, body = { id: 'gw-1', model: 'openai/gpt-5-mini', usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result()) } }] }) => ({ ok: status >= 200 && status < 300, status, async text() { return JSON.stringify(body); } });

test('gateway sends the allowlisted endpoint and provider/model slug', async () => {
  let captured;
  const executor = createVercelAIGatewayExecutor({ enabled: true, apiKey: 'gateway-test-secret-123456', pricing, fetchImpl: async (url, init) => { captured = { url, init }; return response(); } });
  const out = await executor({ task: task(), maxTokens: 1000, costCeilingCents: 50 });
  assert.equal(out.ok, true);
  assert.equal(captured.url, 'https://ai-gateway.vercel.sh/v1/chat/completions');
  const body = JSON.parse(captured.init.body);
  assert.equal(body.model, 'openai/gpt-5.4');
  assert.deepEqual(body.providerOptions, { gateway: { caching: 'auto' } });
  assert.equal(out.identityVerification, 'OBSERVED');
  assert.equal(out.cacheEvidence.requested, true);
  assert.equal(out.cacheEvidence.status, 'CACHE_USAGE_FIELDS_NOT_OBSERVED');
  assert.equal(JSON.stringify(out).includes('gateway-test-secret'), false);
});

test('stable shared context is placed before dynamic task material and never copied into the receipt', async () => {
  let captured;
  const stable = 'ANATOMY SYLLABUS '.repeat(500);
  const executor = createVercelAIGatewayExecutor({ enabled: true, apiKey: 'gateway-test-secret-123456', pricing, fetchImpl: async (url, init) => { captured = { url, init }; return response(); } });
  const out = await executor({ task: task(), maxTokens: 1000, costCeilingCents: 50, cacheableContext: stable });
  assert.equal(out.ok, true);
  const body = JSON.parse(captured.init.body);
  assert.equal(body.messages[1].role, 'system');
  assert.equal(body.messages[1].content, stable.trim());
  assert.equal(body.messages[2].role, 'user');
  assert.equal(out.cacheEvidence.prefixBytes, Buffer.byteLength(stable.trim(), 'utf8'));
  assert.match(out.cacheEvidence.prefixSha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(out).includes('ANATOMY SYLLABUS'), false);
});

test('observed provider cache-read tokens create evidence of a hit without inventing a savings amount', async () => {
  const body = {
    id: 'gw-cache-1', model: 'openai/gpt-5.4',
    usage: { prompt_tokens: 1000, completion_tokens: 10, total_tokens: 1010, prompt_tokens_details: { cached_tokens: 900 } },
    choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(result()) } }]
  };
  const executor = createVercelAIGatewayExecutor({ enabled: true, apiKey: 'gateway-test-secret-123456', pricing, fetchImpl: async () => response(200, body) });
  const out = await executor({ task: task(), maxTokens: 1000, costCeilingCents: 50, cacheableContext: 'stable shared context' });
  assert.equal(out.ok, true);
  assert.equal(out.cacheEvidence.status, 'OBSERVED_CACHE_HIT');
  assert.equal(out.cacheEvidence.cacheReadTokens, 900);
  assert.equal(out.cacheEvidence.savingsClaim, 'NOT_COMPUTED_WITHOUT_VERIFIED_CACHE_PRICING');
  assert.equal(out.usage.costBasis, 'CONFIGURED_CONSERVATIVE_ESTIMATE_CACHE_SAVINGS_NOT_ASSUMED');
});

test('oversized cacheable context fails before any provider call', async () => {
  let calls = 0;
  const executor = createVercelAIGatewayExecutor({ enabled: true, apiKey: 'gateway-test-secret-123456', pricing, fetchImpl: async () => { calls += 1; return response(); } });
  const out = await executor({ task: task(), maxTokens: 100, costCeilingCents: 1000, cacheableContext: 'x'.repeat(200_001) });
  assert.equal(out.ok, false);
  assert.equal(calls, 0);
  assert.ok(out.reasonCodes.includes('ai-gateway-cacheable-context-too-large'));
});

test('429 is failover eligible and auth rejection is terminal', async () => {
  const base = { enabled: true, apiKey: 'gateway-test-secret-123456', pricing, fetchImpl: async () => response(429) };
  const quota = await createVercelAIGatewayExecutor(base)({ task: task(), maxTokens: 10, costCeilingCents: 50 });
  assert.ok(quota.reasonCodes.includes('ai-gateway-quota-or-rate-limit-http-429'));
  const auth = await createVercelAIGatewayExecutor({ ...base, fetchImpl: async () => response(401) })({ task: task(), maxTokens: 10, costCeilingCents: 50 });
  assert.ok(auth.reasonCodes.includes('ai-gateway-credential-rejected'));
});

test('pre-call cost ceiling blocks the network', async () => {
  let calls = 0;
  const executor = createVercelAIGatewayExecutor({ enabled: true, apiKey: 'gateway-test-secret-123456', pricing: { ...pricing, outputUsdPerMillion: 1000 }, fetchImpl: async () => { calls += 1; return response(); } });
  const out = await executor({ task: task(), maxTokens: 10000, costCeilingCents: 1 });
  assert.equal(out.ok, false);
  assert.equal(calls, 0);
  assert.ok(out.reasonCodes.includes('estimated-cost-exceeds-reserved-ceiling'));
});

test('the key never reaches a receipt, including on the paths that carry an error message', async () => {
  // A client that echoes the request it failed on puts the Authorization
  // header in its error message. The success path above already proves the key
  // is absent when nothing went wrong; these are the paths where it appears.
  const apiKey = 'gateway-test-secret-123456';
  const leaks = [
    async () => { throw new Error(`connect ECONNREFUSED using Bearer ${apiKey}`); },
    async () => ({ ok: true, status: 200, async text() { throw new Error(`stream aborted for Bearer ${apiKey}`); } }),
    async () => ({ ok: true, status: 200, async text() { return `not json, sent with Bearer ${apiKey}`; } })
  ];

  for (const [index, fetchImpl] of leaks.entries()) {
    const out = await createVercelAIGatewayExecutor({ enabled: true, apiKey, pricing, fetchImpl })({
      task: task(), maxTokens: 10, costCeilingCents: 50
    });
    const serialized = JSON.stringify(out);
    assert.equal(serialized.includes(apiKey), false, `failure path ${index} wrote the gateway key into its result`);
    assert.equal(serialized.includes('Bearer gateway-test'), false, `failure path ${index} leaked a credential header`);
  }
});
