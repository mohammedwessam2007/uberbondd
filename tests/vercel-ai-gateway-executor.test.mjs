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
  assert.equal(JSON.parse(captured.init.body).model, 'openai/gpt-5.4');
  assert.equal(out.identityVerification, 'OBSERVED');
  assert.equal(JSON.stringify(out).includes('gateway-test-secret'), false);
});

test('transport error detail is scrubbed before entering a receipt', async () => {
  const executor = createVercelAIGatewayExecutor({
    enabled: true,
    apiKey: 'gateway-test-secret-123456',
    pricing,
    fetchImpl: async () => { throw new Error('provider secret=supersecretvalue'); }
  });
  const out = await executor({ task: task(), maxTokens: 10, costCeilingCents: 50 });
  assert.equal(out.ok, false);
  assert.equal(out.outcome, 'UNCERTAIN');
  assert.equal(JSON.stringify(out).includes('supersecretvalue'), false);
  assert.match(out.detail, /REDACTED/);
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