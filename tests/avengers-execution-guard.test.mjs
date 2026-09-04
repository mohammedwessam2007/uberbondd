import test from 'node:test';
import assert from 'node:assert/strict';
import { AVENGERS_REGISTRY_SCHEMA, AVENGERS_READINESS_SCHEMA, validateAvengersRegistry } from '../src/avengers-arsenal.mjs';
import { compileEvidenceRoutedAvengersSquad } from '../src/avengers-squad-planner.mjs';
import { executeCanonicallyVerifiedAvengersPlan } from '../src/avengers-execution-guard.mjs';

const NOW = new Date('2026-09-04T02:30:00Z');
const pricing = { inputUsdPerMillion: 0, outputUsdPerMillion: 0, infrastructureUsdPerRequest: 0, sourceRef: 'test:zero', verifiedAt: '2026-09-04T00:00:00Z' };
const rights = { licenseClass: 'PERMISSIVE', sourceRef: 'test:rights', verifiedAt: '2026-09-04T00:00:00Z', executionAllowed: true, commercialUseAllowed: true };

function profile(id, quality) {
  return {
    id,
    runtime: 'OLLAMA',
    model: id,
    endpoint: 'http://127.0.0.1:11434',
    apiStyle: 'CHAT_COMPLETIONS',
    revision: `sha256:${id}`,
    taskClasses: ['coding', 'general'],
    roles: ['builder', 'general'],
    pricing,
    rights,
    benchmark: { quality, reliability: quality, latencyMs: 500, observedCostCents: 0, sampleSize: 50, verifiedAt: '2026-09-04T00:00:00Z' },
    enabled: true,
    activationApproved: true,
    inferenceProbeApproved: true,
    notes: []
  };
}

function setup() {
  const registry = { schemaVersion: AVENGERS_REGISTRY_SCHEMA, profiles: [profile('alpha', 95), profile('beta', 80)], tools: [] };
  const checked = validateAvengersRegistry(registry);
  assert.equal(checked.ok, true);
  const readiness = {
    schemaVersion: AVENGERS_READINESS_SCHEMA,
    registryDigest: checked.registryDigest,
    profiles: checked.registry.profiles.map(item => ({ profileId: item.id, runtime: item.runtime, model: item.model, revision: item.revision, status: 'CALLABLE_NOW', callableNow: true })),
    tools: []
  };
  const mission = {
    id: 'guard-test',
    objective: 'Return one structured local result.',
    dataClass: 'SOURCE_CODE',
    consequenceClass: 'LOCAL_PREPARATION',
    nodes: [{ id: 'build', purpose: 'Build.', taskClass: 'coding', role: 'builder', dependencies: [], toolIds: [], acceptanceTests: ['structured result'] }]
  };
  const planned = compileEvidenceRoutedAvengersSquad({ registry, readiness, mission, date: NOW, maxFallbacks: 1 });
  assert.equal(planned.ok, true, JSON.stringify(planned.reasonCodes));
  return { registry, readiness, plan: planned.plan };
}

function response(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, async text() { return JSON.stringify(payload); } };
}

function modelResponse(model) {
  return {
    id: `req-${model}`,
    model,
    choices: [{ message: { content: JSON.stringify({ artifact: model }) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
  };
}

test('assignment tampering is rejected by canonical reroute before a provider call', async () => {
  const { registry, readiness, plan } = setup();
  const tampered = structuredClone(plan);
  tampered.assignments[0].primary = structuredClone(plan.assignments[0].fallbacks[0]);
  tampered.assignments[0].fallbacks = [structuredClone(plan.assignments[0].primary)];
  let calls = 0;
  const result = await executeCanonicallyVerifiedAvengersPlan({ registry, readiness, plan: tampered, date: NOW, fetchImpl: async () => { calls += 1; throw new Error('must not call'); } });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('plan-routing-integrity-failed'));
  assert.equal(calls, 0);
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('providerCalls counts actual network calls rather than executor construction attempts', async () => {
  const { registry, readiness, plan } = setup();
  let calls = 0;
  const result = await executeCanonicallyVerifiedAvengersPlan({
    registry,
    readiness,
    plan,
    date: NOW,
    fetchImpl: async (_url, init = {}) => {
      calls += 1;
      const body = JSON.parse(init.body);
      if (body.model === 'alpha') return response({ error: 'down' }, 503);
      return response(modelResponse('beta'));
    }
  });
  assert.equal(result.ok, true, JSON.stringify(result.reasonCodes));
  assert.equal(calls, 2);
  assert.equal(result.providerCalls, 2);
  assert.equal(result.receipt.providerCalls, 2);
  assert.equal(result.receipt.externalEffectLedger.providerCalls, 2);
  assert.equal(result.receipt.results[0].selectedProfileId, 'beta');
  assert.equal(result.businessEffectAuthority, 'NONE');
});