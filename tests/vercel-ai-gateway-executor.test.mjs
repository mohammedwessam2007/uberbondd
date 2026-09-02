// The gateway lane, exercised without a credential and without a network.
//
// Everything here injects `fetchImpl`, so no test can reach ai-gateway.vercel.sh
// even by accident. The key used throughout is a canary: if it ever appears in
// a result, an error, a receipt or a serialized report, the assertion that looks
// for it fails and names where it leaked.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createVercelAIGatewayExecutor,
  qualifyGatewayModel,
  projectGatewayCostCents,
  VERCEL_AI_GATEWAY_ENDPOINT,
  VERCEL_AI_GATEWAY_EXECUTOR_POLICY_VERSION
} from '../src/vercel-ai-gateway-executor.mjs';
import { classifyRouteFailure, ROUTE_FAILURE_CLASSES, TERMINAL_FAILURE_CLASSES } from '../src/agent-model-failover.mjs';
import { isProvenZeroEffect, classifyEffectLedger, EFFECT_STATES } from '../src/effect-ledgers.mjs';
import { containsSecretValue } from '../src/secret-patterns.mjs';

// A key shaped like a real one, so the repository's own secret scanner
// recognises it. Nothing in this file may echo it back.
const CANARY_KEY = 'sk-proj-CANARYdoNOTleak0000111122223333';

const PRICING = Object.freeze({
  inputUsdPerMillion: 3,
  outputUsdPerMillion: 15,
  sourceRef: 'https://vercel.com/docs/ai-gateway/pricing',
  verifiedAt: '2026-09-01'
});

const TASK = Object.freeze({
  taskId: 'task_gateway_1',
  objective: 'a bounded local-preparation objective long enough to be treated as real work',
  originAgent: 'gpt',
  targetAgent: 'claude',
  consequenceClass: 'LOCAL_PREPARATION'
});

const WORKER_RESULT = Object.freeze({
  outcome: 'Completed.',
  changedArtifacts: [],
  testsActuallyRun: [],
  truthTable: [],
  externalEffectLedger: {
    providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
    credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
  },
  decision: 'PROCEED',
  coordination: {
    action: 'DONE', objective: '', summary: 'done', evidenceRefs: [], contextRefs: [],
    acceptanceTests: [], requiredOutputs: [], constraints: [], tokenBudget: 1, confidence: 1
  },
  evidenceRefs: []
});

function completion(overrides = {}) {
  return {
    id: 'chatcmpl_gateway_1',
    object: 'chat.completion',
    model: 'anthropic/claude-sonnet-4',
    choices: [{
      index: 0,
      finish_reason: 'stop',
      message: { role: 'assistant', content: JSON.stringify(WORKER_RESULT) }
    }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    ...overrides
  };
}

/** A fetch stub that records every call, so "exactly one" is checked, not assumed. */
function stubFetch(responder) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return responder(calls.length, init);
  };
  return { calls, impl };
}

const jsonResponse = (status, payload) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(payload)
});

function executor(overrides = {}, fetchImpl = async () => jsonResponse(200, completion())) {
  return createVercelAIGatewayExecutor({
    apiKey: CANARY_KEY,
    enabled: true,
    pricing: PRICING,
    fetchImpl,
    ...overrides
  });
}

const invoke = (exec, overrides = {}) => exec({
  task: TASK,
  model: 'anthropic/claude-sonnet-4',
  maxTokens: 1000,
  costCeilingCents: 500,
  ...overrides
});

// ---------------------------------------------------------------------------
// The contract classifyRouteFailure reads.

test('a completed call returns the same result contract the direct executors return', async () => {
  const { calls, impl } = stubFetch(() => jsonResponse(200, completion()));
  const result = await invoke(executor({}, impl));

  assert.equal(result.ok, true);
  assert.equal(result.outcome, 'COMPLETED');
  assert.equal(result.providerRequestId, 'chatcmpl_gateway_1');
  assert.equal(result.providerStatus, 'stop');
  assert.deepEqual(result.usage, {
    inputTokens: 100, outputTokens: 50, totalTokens: 150,
    costCents: 1, costBasis: 'CONFIGURED_CONSERVATIVE_ESTIMATE'
  });
  assert.equal(result.pricingEvidence.sourceRef, PRICING.sourceRef);
  assert.deepEqual(result.result, WORKER_RESULT);
  assert.equal(result.policyVersion, VERCEL_AI_GATEWAY_EXECUTOR_POLICY_VERSION);
  assert.equal(result.businessEffectAuthority, 'NONE');

  assert.equal(calls.length, 1, 'exactly one call per invocation');
  assert.equal(calls[0].url, VERCEL_AI_GATEWAY_ENDPOINT);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(JSON.parse(calls[0].init.body).model, 'anthropic/claude-sonnet-4');
});

test('the endpoint is allowlisted, not configurable', async () => {
  const { calls, impl } = stubFetch(() => jsonResponse(200, completion()));
  const result = await invoke(executor({ endpoint: 'https://evil.example/v1/chat/completions' }, impl));
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['vercel-ai-gateway-endpoint-not-allowlisted']);
  assert.equal(calls.length, 0, 'a rejected endpoint must not produce a request at all');
});

test('importing and constructing the executor performs no call; being disabled is a refusal', async () => {
  const { calls, impl } = stubFetch(() => jsonResponse(200, completion()));
  const disabled = createVercelAIGatewayExecutor({ apiKey: CANARY_KEY, pricing: PRICING, fetchImpl: impl });
  assert.equal(calls.length, 0, 'construction alone must call nothing');

  const result = await invoke(disabled);
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['vercel-ai-gateway-executor-disabled']);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// A credential without pricing evidence is a refusal, never free compute.

test('a credential without pricing evidence refuses rather than inventing a cost', async () => {
  const { calls, impl } = stubFetch(() => jsonResponse(200, completion()));
  for (const pricing of [
    null,
    { outputUsdPerMillion: 15, sourceRef: 'x', verifiedAt: 'y' },
    { inputUsdPerMillion: 3, outputUsdPerMillion: 15, verifiedAt: 'y' },
    { inputUsdPerMillion: 3, outputUsdPerMillion: 15, sourceRef: 'x' }
  ]) {
    const result = await invoke(executor({ pricing }, impl));
    assert.equal(result.ok, false);
    assert.deepEqual(result.reasonCodes, ['verified-pricing-config-required']);
  }
  assert.equal(calls.length, 0, 'no pricing evidence means no request, not a free one');
});

test('a missing or short credential refuses', async () => {
  const { calls, impl } = stubFetch(() => jsonResponse(200, completion()));
  for (const apiKey of ['', 'short']) {
    const result = await invoke(executor({ apiKey }, impl));
    assert.deepEqual(result.reasonCodes, ['vercel-ai-gateway-api-key-required']);
  }
  assert.equal(calls.length, 0);
});

test('only a local-preparation task is accepted', async () => {
  const { calls, impl } = stubFetch(() => jsonResponse(200, completion()));
  const result = await invoke(executor({}, impl), {
    task: { ...TASK, consequenceClass: 'CUSTOMER_MESSAGE' }
  });
  assert.deepEqual(result.reasonCodes, ['vercel-ai-gateway-worker-only-accepts-local-preparation']);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------------------
// The cost ceiling is enforced before the money is spent, not reported after.

test('a projected cost above the ceiling refuses before any request leaves', async () => {
  const { calls, impl } = stubFetch(() => jsonResponse(200, completion()));
  // 100k output tokens at 15 USD/M is 1.50 USD -- 150 cents against a 50 cent
  // ceiling, decided from the request rather than from the invoice.
  const result = await invoke(executor({}, impl), { maxTokens: 100_000, costCeilingCents: 50 });

  assert.equal(result.ok, false);
  assert.deepEqual(result.reasonCodes, ['vercel-ai-gateway-projected-cost-exceeds-ceiling']);
  assert.ok(result.projectedCostCents > 50);
  assert.equal(result.costCeilingCents, 50);
  assert.equal(calls.length, 0, 'a ceiling checked only after the call is a report, not a limit');
  assert.equal(isProvenZeroEffect('externalEffectLedger', result.externalEffectLedger), true);
});

test('the same request under a sufficient ceiling proceeds', async () => {
  const { calls, impl } = stubFetch(() => jsonResponse(200, completion()));
  const result = await invoke(executor({}, impl), { maxTokens: 100_000, costCeilingCents: 5000 });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
});

test('the projection over-counts input tokens rather than under-counting them', () => {
  const projection = projectGatewayCostCents({ requestBytes: 3000, maxOutputTokens: 100, pricing: PRICING });
  // 3000 bytes at three bytes per token is 1000 -- more than the ~750 an
  // ordinary four-bytes-per-token estimate gives. A ceiling that guesses low is
  // not a ceiling.
  assert.equal(projection.estimatedInputTokens, 1000);
  assert.ok(projection.estimatedInputTokens > Math.ceil(3000 / 4));
  assert.equal(projectGatewayCostCents({ requestBytes: 10, maxOutputTokens: 10, pricing: null }), null);
});

// ---------------------------------------------------------------------------
// Which model actually served.

test('the served model is read from the response, never assumed from the request', async () => {
  const { impl } = stubFetch(() => jsonResponse(200, completion()));
  const result = await invoke(executor({}, impl));

  assert.equal(result.requestedModel, 'anthropic/claude-sonnet-4');
  assert.equal(result.servedModel, 'anthropic/claude-sonnet-4');
  assert.equal(result.identityVerification, 'OBSERVED');
  assert.equal(result.identityMatchesRequest, true);
  assert.deepEqual(result.notices, []);
});

test('a response with no model field is UNVERIFIED, and says so instead of claiming the request', async () => {
  const payload = completion();
  delete payload.model;
  const { impl } = stubFetch(() => jsonResponse(200, payload));
  const result = await invoke(executor({}, impl));

  assert.equal(result.ok, true);
  assert.equal(result.servedModel, null, 'nothing observed the serving model, so nothing may name it');
  assert.equal(result.identityVerification, 'UNVERIFIED');
  assert.equal(result.identityMatchesRequest, null);
  assert.ok(result.notices.includes('SERVING_MODEL_IDENTITY_NOT_OBSERVED'));
  // The compatibility `model` field falls back to the request, which is exactly
  // why identityVerification exists next to it.
  assert.equal(result.model, 'anthropic/claude-sonnet-4');
});

test('a gateway that served a different model is reported, not smoothed over', async () => {
  const { impl } = stubFetch(() => jsonResponse(200, completion({ model: 'openai/gpt-5-mini' })));
  const result = await invoke(executor({}, impl));

  assert.equal(result.ok, true);
  assert.equal(result.servedModel, 'openai/gpt-5-mini');
  assert.equal(result.identityVerification, 'OBSERVED');
  assert.equal(result.identityMatchesRequest, false);
  assert.ok(result.notices.includes('SERVED_MODEL_DIFFERS_FROM_REQUESTED_MODEL'),
    'concealing which model served is exactly what the routing law forbids');
  assert.equal(result.model, 'openai/gpt-5-mini');
});

test('a bare model name is refused unless the lane was told which provider it belongs to', async () => {
  const { calls, impl } = stubFetch(() => jsonResponse(200, completion()));
  const bare = await invoke(executor({}, impl), { model: 'claude-sonnet-4' });
  assert.deepEqual(bare.reasonCodes, ['vercel-ai-gateway-model-must-be-provider-qualified']);
  assert.equal(calls.length, 0);

  const configured = await invoke(executor({ gatewayProvider: 'anthropic' }, impl), { model: 'claude-sonnet-4' });
  assert.equal(configured.ok, true);
  assert.equal(configured.requestedModel, 'anthropic/claude-sonnet-4');

  assert.deepEqual(qualifyGatewayModel('', 'anthropic'), { ok: false, reasonCodes: ['model-required'] });
  assert.deepEqual(qualifyGatewayModel('anthropic/claude-x'), { ok: true, model: 'anthropic/claude-x' });
});

// ---------------------------------------------------------------------------
// Failure vocabulary, read back through the classifier that consumes it.

test('429 moves to another route, and names quota or rate limit from what the gateway said', async () => {
  const quota = await invoke(executor({}, async () => jsonResponse(429, {
    error: { code: 'insufficient_quota', message: 'credit balance exhausted' }
  })));
  assert.equal(quota.outcome, 'CONFIRMED_FAILURE');
  assert.ok(quota.reasonCodes.includes('vercel-ai-gateway-http-429'));
  assert.ok(quota.reasonCodes.includes('vercel-ai-gateway-quota-exhausted'));
  assert.equal(classifyRouteFailure(quota).failureClass, ROUTE_FAILURE_CLASSES.QUOTA_EXHAUSTED);
  assert.equal(classifyRouteFailure(quota).failoverEligible, true,
    'routing around an exhausted provider is pre-authorized');

  const burst = await invoke(executor({}, async () => jsonResponse(429, {
    error: { code: 'rate_limit_exceeded', message: 'slow down' }
  })));
  assert.ok(burst.reasonCodes.includes('vercel-ai-gateway-rate-limited'));
  assert.equal(classifyRouteFailure(burst).failureClass, ROUTE_FAILURE_CLASSES.RATE_LIMITED);
  assert.equal(classifyRouteFailure(burst).failoverEligible, true);
});

test('401 and 403 are terminal credential rejections, not something to try elsewhere', async () => {
  for (const status of [401, 403]) {
    const result = await invoke(executor({}, async () => jsonResponse(status, {
      error: { code: 'invalid_api_key', message: 'bad key' }
    })));
    assert.equal(result.outcome, 'CONFIRMED_FAILURE', String(status));
    assert.ok(result.reasonCodes.includes(`vercel-ai-gateway-http-${status}`));
    assert.ok(result.reasonCodes.includes('vercel-ai-gateway-credential-rejected'));
    const classification = classifyRouteFailure(result);
    assert.equal(classification.failureClass, TERMINAL_FAILURE_CLASSES.CREDENTIAL_REJECTED, String(status));
    assert.equal(classification.failoverEligible, false,
      'trying identities until one is accepted is the behaviour this project forbids outright');
  }
});

test('a model the gateway does not carry is a routable failure, not a broken credential', async () => {
  const result = await invoke(executor({}, async () => jsonResponse(404, {
    error: { code: 'model_not_found', message: 'no such model' }
  })));
  assert.ok(result.reasonCodes.includes('vercel-ai-gateway-model-not-found'));
  assert.equal(classifyRouteFailure(result).failureClass, ROUTE_FAILURE_CLASSES.MODEL_UNAVAILABLE);
  assert.equal(classifyRouteFailure(result).failoverEligible, true);
});

test('a 5xx is uncertain, because the answer may have been lost rather than refused', async () => {
  const { calls, impl } = stubFetch(() => jsonResponse(503, { error: { message: 'upstream unavailable' } }));
  const result = await invoke(executor({}, impl));

  assert.equal(result.outcome, 'UNCERTAIN');
  assert.equal(result.uncertain, true);
  assert.ok(result.reasonCodes.includes('vercel-ai-gateway-provider-outcome-uncertain'));
  const classification = classifyRouteFailure(result);
  assert.equal(classification.failureClass, ROUTE_FAILURE_CLASSES.PROVIDER_OUTAGE);
  assert.equal(classification.requiresIdempotency, true,
    'an uncertain outcome may only be retried when the caller declared the task idempotent');
  assert.equal(calls.length, 1, 'no retry inside the executor, on any branch');
});

test('a definite client rejection is confirmed, and a bad request is not toured across providers', async () => {
  for (const status of [400, 413, 422]) {
    const result = await invoke(executor({}, async () => jsonResponse(status, { error: { message: 'nope' } })));
    assert.equal(result.outcome, 'CONFIRMED_FAILURE', String(status));
    assert.equal(classifyRouteFailure(result).failureClass, TERMINAL_FAILURE_CLASSES.REQUEST_REJECTED, String(status));
  }
});

test('HTTP 200 carrying an error body is uncertain, never a success', async () => {
  const result = await invoke(executor({}, async () => jsonResponse(200, {
    id: 'chatcmpl_x', error: { code: 'upstream_error', message: 'relay failed' }
  })));
  assert.equal(result.ok, false);
  assert.equal(result.outcome, 'UNCERTAIN');
  assert.deepEqual(result.reasonCodes, ['vercel-ai-gateway-body-error-uncertain']);
  assert.equal(result.gatewayErrorCode, 'upstream_error');
});

test('a truncated, unparseable, empty or multi-choice response is uncertain, not a result', async () => {
  const cases = [
    ['finish_reason length', completion({ choices: [{ index: 0, finish_reason: 'length', message: { content: '{}' } }] }),
      'vercel-ai-gateway-max-tokens-before-canonical-result'],
    ['no choices', completion({ choices: [] }), 'vercel-ai-gateway-single-choice-required'],
    ['two choices', completion({ choices: [completion().choices[0], completion().choices[0]] }),
      'vercel-ai-gateway-single-choice-required'],
    ['empty content', completion({ choices: [{ index: 0, finish_reason: 'stop', message: { content: '' } }] }),
      'vercel-ai-gateway-structured-output-missing'],
    ['content that is not JSON', completion({ choices: [{ index: 0, finish_reason: 'stop', message: { content: 'sorry' } }] }),
      'vercel-ai-gateway-structured-output-json-invalid'],
    ['usage missing', completion({ usage: {} }), 'vercel-ai-gateway-usage-or-pricing-invalid'],
    ['usage that does not add up', completion({ usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 3 } }),
      'vercel-ai-gateway-usage-or-pricing-invalid']
  ];
  for (const [label, payload, expected] of cases) {
    const result = await invoke(executor({}, async () => jsonResponse(200, payload)));
    assert.equal(result.ok, false, label);
    assert.equal(result.outcome, 'UNCERTAIN', label);
    assert.ok(result.reasonCodes.includes(expected), `${label}: got ${result.reasonCodes.join(',')}`);
  }
});

test('an unparseable body is uncertain rather than a clean refusal', async () => {
  const result = await invoke(executor({}, async () => ({ ok: true, status: 200, text: async () => '{{{' })));
  assert.equal(result.outcome, 'UNCERTAIN');
  assert.deepEqual(result.reasonCodes, ['vercel-ai-gateway-response-parse-uncertain']);
});

// ---------------------------------------------------------------------------
// Timeout. A hung socket must end the call, and end it as an unknown.

test('a request that outlives the timeout is aborted and reported as uncertain', async () => {
  // A socket that would eventually answer, and a timeout that arrives first.
  // The slow timer is also what keeps the event loop alive: `AbortSignal.timeout`
  // does not hold the loop open on its own, so without a pending socket the
  // process would drain before the abort ever fired.
  const { calls, impl } = stubFetch((_, init) => new Promise((resolve, reject) => {
    const slowSocket = setTimeout(() => resolve(jsonResponse(200, completion())), 5000);
    init.signal.addEventListener('abort', () => {
      clearTimeout(slowSocket);
      const error = new Error('The operation was aborted due to timeout');
      error.name = 'TimeoutError';
      reject(error);
    });
  }));

  const result = await invoke(executor({ timeoutMs: 20 }, impl));

  assert.equal(calls.length, 1);
  assert.ok(calls[0].init.signal instanceof AbortSignal, 'a dispatch with no signal can hang forever');
  assert.equal(result.outcome, 'UNCERTAIN');
  assert.deepEqual(result.reasonCodes, ['vercel-ai-gateway-timeout-uncertain']);
  assert.equal(classifyRouteFailure(result).requiresIdempotency, true);
});

test('a transport failure is uncertain, and its identity claim stays unverified', async () => {
  const result = await invoke(executor({}, async () => { throw new Error('socket hang up'); }));
  assert.equal(result.outcome, 'UNCERTAIN');
  assert.deepEqual(result.reasonCodes, ['vercel-ai-gateway-transport-uncertain']);
  assert.equal(result.servedModel, null);
  assert.equal(result.identityVerification, 'UNVERIFIED');
});

// ---------------------------------------------------------------------------
// The effect ledger. Three different truths, none of them rounded to zero.

test('a refusal before the call is a proven zero; a completed call is not', async () => {
  const refused = await invoke(executor({ enabled: false }));
  assert.equal(isProvenZeroEffect('externalEffectLedger', refused.externalEffectLedger), true);

  const { impl } = stubFetch(() => jsonResponse(200, completion()));
  const served = await invoke(executor({}, impl));
  assert.equal(served.externalEffectLedger.providerCalls, 1);
  assert.equal(served.externalEffectLedger.spendCents, served.usage.costCents);
  assert.equal(isProvenZeroEffect('externalEffectLedger', served.externalEffectLedger), false,
    'a provider call reported as a proven zero would make the compute ledger fictional');
  assert.equal(
    classifyEffectLedger('externalEffectLedger', served.externalEffectLedger).state,
    EFFECT_STATES.EFFECT_OCCURRED);
});

test('an uncertain transport reports unknown effects, not observed zero ones', async () => {
  const result = await invoke(executor({}, async () => { throw new Error('connection reset'); }));
  const classified = classifyEffectLedger('externalEffectLedger', result.externalEffectLedger);

  assert.equal(classified.ok, true);
  assert.equal(classified.state, EFFECT_STATES.EFFECT_UNKNOWN);
  assert.deepEqual(classified.unknownKeys, ['providerCalls', 'spendCents']);
  assert.equal(isProvenZeroEffect('externalEffectLedger', result.externalEffectLedger), false,
    'the provider may have run and billed the work; zero would be a claim nobody observed');
});

// ---------------------------------------------------------------------------
// The credential.

test('the API key reaches the gateway and appears in nothing else', async () => {
  const seen = [];
  const impl = async (url, init) => {
    seen.push(init.headers.Authorization);
    return jsonResponse(200, completion());
  };

  const results = [
    await invoke(executor({}, impl)),
    await invoke(executor({}, async () => jsonResponse(401, { error: { message: CANARY_KEY } }))),
    await invoke(executor({}, async () => { throw new Error(`connect failed using ${CANARY_KEY}`); })),
    await invoke(executor({ enabled: false })),
    await invoke(executor({}, impl), { maxTokens: 100_000, costCeilingCents: 1 })
  ];

  assert.equal(seen[0], `Bearer ${CANARY_KEY}`, 'the key must actually be sent, or the lane is decorative');

  for (const [index, result] of results.entries()) {
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes(CANARY_KEY), false, `result ${index} leaked the credential`);
    assert.equal(serialized.includes('CANARY'), false, `result ${index} leaked part of the credential`);
    assert.equal(containsSecretValue(serialized), false, `result ${index} carries something shaped like a secret`);
  }
});
