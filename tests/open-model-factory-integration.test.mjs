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
  assert.equal(AGENT_MODEL_EXECUTOR_FACTORY_POLICY_VERSION, 'agent-model-executor-factory-1.4.0');
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
    () => createModelExecutorFactory({ env: openModelEnv({ OPEN_MODEL_RUNTIME: '' }) })({ provider: 'open-model', model: 'example/model-a' }),
    /OPEN_MODEL_RUNTIME|runtime is absent|runtime/i
  );
});
