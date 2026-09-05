import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AGENT_MODEL_EXECUTOR_FACTORY_POLICY_VERSION,
  createModelExecutorFactory,
  describeProviderReadiness
} from '../src/agent-model-executor-factory.mjs';

function openModelEnv(overrides = {}) {
  return {
    OPEN_MODEL_AGENT_ENABLED: 'true',
    OPEN_MODEL_RUNTIME: 'VLLM',
    OPEN_MODEL_MODEL: 'example/model-a',
    OPEN_MODEL_ENDPOINT: 'http://127.0.0.1:8000',
    OPEN_MODEL_API_STYLE: 'CHAT_COMPLETIONS',
    OPEN_MODEL_INPUT_USD_PER_MILLION: '0',
    OPEN_MODEL_OUTPUT_USD_PER_MILLION: '0',
    OPEN_MODEL_INFRASTRUCTURE_USD_PER_REQUEST: '0',
    OPEN_MODEL_PRICING_SOURCE: 'runtime-observation:test',
    OPEN_MODEL_PRICING_VERIFIED_AT: '2026-09-03T00:00:00Z',
    ...overrides
  };
}

test('factory policy includes first-class open-model runtime without changing legacy providers', () => {
  assert.equal(AGENT_MODEL_EXECUTOR_FACTORY_POLICY_VERSION, 'agent-model-executor-factory-1.3.0');
  const readiness = describeProviderReadiness({ env: openModelEnv() });
  assert.deepEqual(readiness.map(item => item.provider), ['openai', 'anthropic', 'ai-gateway', 'open-model', 'claude-code-sandbox']);
});

test('open-model readiness is disabled by default and does not require a credential', () => {
  const readiness = describeProviderReadiness({ env: openModelEnv({ OPEN_MODEL_AGENT_ENABLED: 'false' }) });
  const openModel = readiness.find(item => item.provider === 'open-model');
  assert.equal(openModel.ready, false);
  assert.ok(openModel.blockers.includes('explicitly-disabled'));
  assert.equal(openModel.credentialRequired, false);
  assert.equal(openModel.credentialPresent, false);
});

test('open-model readiness becomes ready with runtime model endpoint pricing and explicit enablement', () => {
  const openModel = describeProviderReadiness({ env: openModelEnv() }).find(item => item.provider === 'open-model');
  assert.equal(openModel.ready, true);
  assert.deepEqual(openModel.blockers, []);
  assert.equal(openModel.runtimePresent, true);
  assert.equal(openModel.modelIdentityPresent, true);
  assert.equal(openModel.endpointPresent, true);
  assert.equal(openModel.pricingEvidencePresent, true);
});

test('open-model readiness never leaks optional API key values', () => {
  const secret = 'super-secret-runtime-token';
  const readiness = describeProviderReadiness({ env: openModelEnv({ OPEN_MODEL_API_KEY: secret }) });
  assert.equal(JSON.stringify(readiness).includes(secret), false);
  const openModel = readiness.find(item => item.provider === 'open-model');
  assert.equal(openModel.credentialPresent, true);
});

test('factory fails closed when open-model runtime contract is incomplete', () => {
  assert.throws(
    () => createModelExecutorFactory({ env: openModelEnv({ OPEN_MODEL_RUNTIME: '' }) })({ provider: 'open-model' }),
    /OPEN_MODEL_RUNTIME is absent/
  );
  assert.throws(
    () => createModelExecutorFactory({ env: openModelEnv({ OPEN_MODEL_MODEL: '' }) })({ provider: 'open-model' }),
    /model identity is absent/
  );
  assert.throws(
    () => createModelExecutorFactory({ env: openModelEnv({ OPEN_MODEL_ENDPOINT: '' }) })({ provider: 'open-model' }),
    /OPEN_MODEL_ENDPOINT is absent/
  );
  assert.throws(
    () => createModelExecutorFactory({ env: openModelEnv({ OPEN_MODEL_PRICING_SOURCE: '' }) })({ provider: 'open-model' }),
    /pricing evidence is absent or incomplete/
  );
});

test('factory creates open-model executor without a runtime API key', async () => {
  const executor = createModelExecutorFactory({ env: openModelEnv() })({ provider: 'open-model' });
  assert.equal(typeof executor, 'function');
  const result = await executor({
    task: { taskId: 't1', objective: 'must remain local preparation', consequenceClass: 'MESSAGE' },
    maxTokens: 16,
    costCeilingCents: 0
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('open-model-worker-only-accepts-local-preparation'));
});

test('worker model overrides OPEN_MODEL_MODEL while keeping the same governed runtime socket', async () => {
  const executor = createModelExecutorFactory({ env: openModelEnv() })({ provider: 'open-model', model: 'example/model-b' });
  assert.equal(typeof executor, 'function');
  const result = await executor({
    task: { taskId: 't2', objective: 'must remain local preparation', consequenceClass: 'MESSAGE' },
    maxTokens: 16,
    costCeilingCents: 0
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('open-model-worker-only-accepts-local-preparation'));
});

test('AI Gateway exact underscore mapping remains intact after open-model integration', () => {
  const secret = 'gateway-secret';
  const env = {
    ...openModelEnv({ OPEN_MODEL_AGENT_ENABLED: 'false' }),
    AI_GATEWAY_API_KEY: secret,
    AI_GATEWAY_AGENT_ENABLED: 'true',
    AI_GATEWAY_INPUT_USD_PER_MILLION: '1',
    AI_GATEWAY_OUTPUT_USD_PER_MILLION: '2',
    AI_GATEWAY_PRICING_SOURCE: 'pricing:test',
    AI_GATEWAY_PRICING_VERIFIED_AT: '2026-09-03T00:00:00Z'
  };
  const gateway = describeProviderReadiness({ env }).find(item => item.provider === 'ai-gateway');
  assert.equal(gateway.ready, true);
  assert.equal(gateway.credentialPresent, true);
  assert.equal(JSON.stringify(describeProviderReadiness({ env })).includes(secret), false);
});
