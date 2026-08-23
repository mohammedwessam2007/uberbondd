import test from 'node:test';
import assert from 'node:assert/strict';
import { compileProviderWorkRequest, validateProviderWorkResult, runProviderWorker } from '../src/agent-provider-worker.mjs';
import { ZERO_BUSINESS_EFFECTS, ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

function task(overrides = {}) {
  return {
    ok: true,
    taskId: 'task-1',
    targetAgent: 'chatgpt',
    objective: 'Research a bounded question',
    contextRefs: ['doc:x'],
    evidenceRefs: ['doc:y'],
    requiredOutputs: ['outcome', 'coordination'],
    acceptanceTests: ['evidence-check'],
    constraints: ['local-only'],
    consequenceClass: 'LOCAL_PREPARATION',
    ...overrides
  };
}
function reservation(overrides = {}) {
  return { reservationId: 'r1', taskId: 'task-1', provider: 'openai', status: 'RESERVED', costCeilingCents: 25, tokenCeiling: 1000, ...overrides };
}
function route(overrides = {}) {
  return { ok: true, policyVersion: 'agent-model-router-1.0.0', status: 'ROUTED', selected: { provider: 'openai', model: 'gpt-x', candidateId: 'm1', ...overrides } };
}
function result(overrides = {}) {
  return {
    taskId: 'task-1',
    provider: 'openai',
    model: 'gpt-x',
    outcome: 'Supported by evidence',
    coordination: { action: 'DONE', evidenceRefs: ['doc:result'] },
    evidenceRefs: ['doc:result'],
    usage: { inputTokens: 300, outputTokens: 100, costCents: 10 },
    businessEffectLedger: { ...ZERO_BUSINESS_EFFECTS },
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    ...overrides
  };
}

function request() {
  return compileProviderWorkRequest({ relayTask: task(), modelRoute: route(), computeReservation: reservation() });
}

test('provider request binds exact task, route, and compute reservation', () => {
  const req = compileProviderWorkRequest({ relayTask: task(), modelRoute: route(), computeReservation: reservation(), toolAllowlist: ['web-search'] });
  assert.equal(req.ok, true);
  assert.equal(req.taskId, 'task-1');
  assert.equal(req.provider, 'openai');
  assert.equal(req.compute.reservationId, 'r1');
  assert.equal(req.businessEffectAuthority, 'NONE');
});

test('provider request rejects mismatched compute provider or task', () => {
  assert.equal(compileProviderWorkRequest({ relayTask: task(), modelRoute: route(), computeReservation: reservation({ provider: 'anthropic' }) }).ok, false);
  assert.equal(compileProviderWorkRequest({ relayTask: task(), modelRoute: route(), computeReservation: reservation({ taskId: 'other' }) }).ok, false);
});

test('provider request rejects secret-bearing task', () => {
  const req = compileProviderWorkRequest({ relayTask: task({ metadata: { apiKey: 'secret' } }), modelRoute: route(), computeReservation: reservation() });
  assert.equal(req.ok, false);
  assert.ok(req.reasonCodes.includes('secret-bearing-task-rejected'));
});

test('provider result exact-binds task provider and model', () => {
  const req = request();
  assert.equal(validateProviderWorkResult({ request: req, result: result({ taskId: 'wrong' }) }).ok, false);
  assert.equal(validateProviderWorkResult({ request: req, result: result({ provider: 'anthropic' }) }).ok, false);
  assert.equal(validateProviderWorkResult({ request: req, result: result({ model: 'other' }) }).ok, false);
});

test('provider result rejects compute over reservation', () => {
  const req = request();
  assert.equal(validateProviderWorkResult({ request: req, result: result({ usage: { inputTokens: 900, outputTokens: 200, costCents: 10 } }) }).ok, false);
  assert.equal(validateProviderWorkResult({ request: req, result: result({ usage: { inputTokens: 100, outputTokens: 100, costCents: 26 } }) }).ok, false);
});

test('provider result rejects business or canonical external effects', () => {
  const req = request();
  assert.equal(validateProviderWorkResult({ request: req, result: result({ businessEffectLedger: { ...ZERO_BUSINESS_EFFECTS, messages: 1 } }) }).ok, false);
  assert.equal(validateProviderWorkResult({ request: req, result: result({ externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS, deployments: 1 } }) }).ok, false);
});

test('provider result requires both effect ledgers instead of manufacturing omitted proof', () => {
  const req = request();
  const noBusiness = result();
  delete noBusiness.businessEffectLedger;
  const noExternal = result();
  delete noExternal.externalEffectLedger;
  assert.equal(validateProviderWorkResult({ request: req, result: noBusiness }).ok, false);
  assert.equal(validateProviderWorkResult({ request: req, result: noExternal }).ok, false);
});

test('empty or incomplete effect ledgers cannot impersonate signed zero', () => {
  const req = request();
  assert.equal(validateProviderWorkResult({ request: req, result: result({ businessEffectLedger: {} }) }).ok, false);
  assert.equal(validateProviderWorkResult({ request: req, result: result({ externalEffectLedger: {} }) }).ok, false);

  const business = { ...ZERO_BUSINESS_EFFECTS };
  delete business.businessSpendCents;
  const external = { ...ZERO_EXTERNAL_EFFECTS };
  delete external.providerCalls;
  assert.equal(validateProviderWorkResult({ request: req, result: result({ businessEffectLedger: business }) }).ok, false);
  assert.equal(validateProviderWorkResult({ request: req, result: result({ externalEffectLedger: external }) }).ok, false);
});

test('effect-ledger value coercions, infinities, negatives and extra keys are rejected', () => {
  const req = request();
  for (const malformed of [
    { ...ZERO_EXTERNAL_EFFECTS, messages: '0' },
    { ...ZERO_EXTERNAL_EFFECTS, messages: NaN },
    { ...ZERO_EXTERNAL_EFFECTS, messages: Infinity },
    { ...ZERO_EXTERNAL_EFFECTS, messages: -1 },
    { ...ZERO_EXTERNAL_EFFECTS, mystery: 0 }
  ]) {
    assert.equal(validateProviderWorkResult({ request: req, result: result({ externalEffectLedger: malformed }) }).ok, false);
  }
  for (const malformed of [
    { ...ZERO_BUSINESS_EFFECTS, messages: '0' },
    { ...ZERO_BUSINESS_EFFECTS, businessSpendCents: NaN },
    { ...ZERO_BUSINESS_EFFECTS, businessSpendCents: Infinity },
    { ...ZERO_BUSINESS_EFFECTS, businessSpendCents: -1 },
    { ...ZERO_BUSINESS_EFFECTS, spendCents: 0 }
  ]) {
    assert.equal(validateProviderWorkResult({ request: req, result: result({ businessEffectLedger: malformed }) }).ok, false);
  }
});

test('provider result rejects untyped evidence and secret-bearing output', () => {
  const req = request();
  assert.equal(validateProviderWorkResult({ request: req, result: result({ evidenceRefs: ['https://raw.example'], coordination: { action: 'DONE', evidenceRefs: ['https://raw.example'] } }) }).ok, false);
  assert.equal(validateProviderWorkResult({ request: req, result: result({ notes: 'Bearer abcdefghijklmnopqrstuvwxyz' }) }).ok, false);
});

test('validated provider result records AI compute separately while business effects remain zero', () => {
  const req = request();
  const validated = validateProviderWorkResult({ request: req, result: result() });
  assert.equal(validated.ok, true);
  assert.equal(validated.aiComputeLedger.providerCalls, 1);
  assert.equal(validated.aiComputeLedger.costCents, 10);
  assert.deepEqual(validated.businessEffectLedger, ZERO_BUSINESS_EFFECTS);
  assert.deepEqual(validated.externalEffectLedger, ZERO_EXTERNAL_EFFECTS);
});

test('runProviderWorker accepts only validated structured result', async () => {
  const req = request();
  const ok = await runProviderWorker({ request: req, invoke: async () => result() });
  assert.equal(ok.ok, true);
  const bad = await runProviderWorker({ request: req, invoke: async () => ({ text: 'freeform' }) });
  assert.equal(bad.ok, false);
});

test('provider request rejects an unverified raw route object', () => {
  const req = compileProviderWorkRequest({ relayTask: task(), modelRoute: { selected: { provider: 'openai', model: 'gpt-x' } }, computeReservation: reservation() });
  assert.equal(req.ok, false);
  assert.ok(req.reasonCodes.includes('valid-model-route-required'));
});
