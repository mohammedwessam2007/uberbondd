import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AVENGERS_REGISTRY_SCHEMA,
  AVENGERS_READINESS_SCHEMA,
  validateAvengersRegistry,
  probeAvengerProfile,
  executeAvengersPlan
} from '../src/avengers-arsenal.mjs';
import { composeAvengersRegistry } from '../src/avengers-arsenal-config.mjs';
import { compileEvidenceRoutedAvengersSquad } from '../src/avengers-squad-planner.mjs';

const NOW = new Date('2026-09-04T01:20:00Z');

function pricing() {
  return {
    inputUsdPerMillion: 0,
    outputUsdPerMillion: 0,
    infrastructureUsdPerRequest: 0,
    sourceRef: 'test:local-zero-cost',
    verifiedAt: '2026-09-04T00:00:00Z'
  };
}

function rights() {
  return {
    licenseClass: 'PERMISSIVE',
    sourceRef: 'test:license-evidence',
    verifiedAt: '2026-09-04T00:00:00Z',
    executionAllowed: true,
    commercialUseAllowed: true
  };
}

function profile(overrides = {}) {
  return {
    id: 'ollama-builder-a',
    runtime: 'OLLAMA',
    model: 'builder-a:latest',
    endpoint: 'http://127.0.0.1:11434',
    apiStyle: 'CHAT_COMPLETIONS',
    revision: 'sha256:builder-a-revision',
    taskClasses: ['coding', 'review', 'general'],
    roles: ['builder', 'verifier', 'general'],
    pricing: pricing(),
    rights: rights(),
    benchmark: {
      quality: 88,
      reliability: 92,
      latencyMs: 1200,
      observedCostCents: 0,
      sampleSize: 40,
      verifiedAt: '2026-09-04T00:00:00Z'
    },
    enabled: true,
    activationApproved: true,
    inferenceProbeApproved: true,
    notes: [],
    ...overrides
  };
}

function registry(profiles = [profile()], tools = []) {
  return { schemaVersion: AVENGERS_REGISTRY_SCHEMA, profiles, tools };
}

function readinessFor(registryValue, callableIds, tools = []) {
  const valid = validateAvengersRegistry(registryValue);
  assert.equal(valid.ok, true, JSON.stringify(valid.reasonCodes));
  return {
    schemaVersion: AVENGERS_READINESS_SCHEMA,
    registryDigest: valid.registryDigest,
    profiles: valid.registry.profiles.map(item => ({
      profileId: item.id,
      runtime: item.runtime,
      model: item.model,
      revision: item.revision,
      status: callableIds.includes(item.id) ? 'CALLABLE_NOW' : 'MODEL_LISTED_NOT_INFERENCE_PROVEN',
      callableNow: callableIds.includes(item.id)
    })),
    tools
  };
}

function mission(overrides = {}) {
  return {
    id: 'avengers-test-mission',
    objective: 'Produce one bounded implementation result.',
    dataClass: 'SOURCE_CODE',
    consequenceClass: 'LOCAL_PREPARATION',
    nodes: [{
      id: 'build',
      purpose: 'Build the bounded result.',
      taskClass: 'coding',
      role: 'builder',
      dependencies: [],
      toolIds: [],
      acceptanceTests: ['return valid structured result']
    }],
    ...overrides
  };
}

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(payload); }
  };
}

function successfulInference(model, result = { status: 'AVENGER_READY' }) {
  return {
    id: `req-${model}`,
    model,
    choices: [{ message: { content: JSON.stringify(result) } }],
    usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 }
  };
}

test('registry rejects embedded secrets and invalid runtime identities', () => {
  const secret = profile({ apiKey: 'sk-do-not-store' });
  const result = validateAvengersRegistry(registry([secret]));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('secret-bearing-profile-prohibited:ollama-builder-a'));

  const bogus = validateAvengersRegistry(registry([profile({ runtime: 'MADE_UP_RUNTIME' })]));
  assert.equal(bogus.ok, false);
  assert.ok(bogus.reasonCodes.includes('unsupported-runtime:ollama-builder-a'));
});

test('remote HTTPS profile cannot enter the resolved roster without explicit approval evidence', () => {
  assert.throws(() => composeAvengersRegistry({
    baseRegistry: registry([]),
    externalCapabilityRegistry: { entries: [] },
    profileOverrides: [profile({
      id: 'remote-model',
      endpoint: 'https://models.example.com',
      runtime: 'CUSTOM_OPENAI_COMPATIBLE'
    })]
  }), /requires explicit approval evidence/);

  const approved = composeAvengersRegistry({
    baseRegistry: registry([]),
    externalCapabilityRegistry: { entries: [] },
    profileOverrides: [profile({
      id: 'remote-model',
      endpoint: 'https://models.example.com',
      runtime: 'CUSTOM_OPENAI_COMPATIBLE',
      remoteApproved: true,
      remoteApprovalRef: 'owner-approved-provider-record:test',
      remoteApprovalVerifiedAt: '2026-09-04T00:00:00Z'
    })]
  });
  assert.equal(approved.profiles.length, 1);
});

test('model listing alone never becomes CALLABLE_NOW', async () => {
  const p = profile();
  const fetchImpl = async (_url, init = {}) => {
    assert.equal(init.method, 'GET');
    return response({ models: [{ name: p.model }] });
  };
  const result = await probeAvengerProfile(p, { fetchImpl, probeInference: false, date: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'MODEL_LISTED_NOT_INFERENCE_PROVEN');
  assert.equal(result.callableNow, false);
  assert.equal(result.modelListProven, true);
});

test('real listing plus identity-matched inference probe earns CALLABLE_NOW', async () => {
  const p = profile();
  const fetchImpl = async (_url, init = {}) => {
    if (init.method === 'GET') return response({ models: [{ name: p.model }] });
    if (init.method === 'POST') return response(successfulInference(p.model));
    throw new Error('unexpected request');
  };
  const result = await probeAvengerProfile(p, { fetchImpl, probeInference: true, date: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'CALLABLE_NOW');
  assert.equal(result.callableNow, true);
  assert.equal(result.identityVerification, 'MATCHED');
});

test('identity mismatch during inference keeps the profile out of the squad', async () => {
  const p = profile();
  const fetchImpl = async (_url, init = {}) => {
    if (init.method === 'GET') return response({ models: [{ name: p.model }] });
    return response(successfulInference('different-model'));
  };
  const result = await probeAvengerProfile(p, { fetchImpl, probeInference: true, date: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'INFERENCE_PROBE_FAILED');
  assert.equal(result.callableNow, false);
  assert.ok(result.reasonCodes.includes('open-model-runtime-model-identity-mismatch'));
});

test('fresh canonical routing evidence selects the strongest callable Avenger and preserves evidence-backed fallback', () => {
  const strong = profile({ id: 'strong', model: 'strong', benchmark: { quality: 95, reliability: 98, latencyMs: 700, observedCostCents: 0, sampleSize: 50, verifiedAt: '2026-09-04T00:00:00Z' } });
  const backup = profile({ id: 'backup', model: 'backup', benchmark: { quality: 82, reliability: 94, latencyMs: 900, observedCostCents: 0, sampleSize: 50, verifiedAt: '2026-09-04T00:00:00Z' } });
  const reg = registry([strong, backup]);
  const readiness = readinessFor(reg, ['strong', 'backup']);
  const result = compileEvidenceRoutedAvengersSquad({ registry: reg, readiness, mission: mission(), date: NOW, maxFallbacks: 2 });
  assert.equal(result.ok, true, JSON.stringify(result.reasonCodes));
  assert.equal(result.plan.assignments[0].primary.profileId, 'strong');
  assert.deepEqual(result.plan.assignments[0].fallbacks.map(item => item.profileId), ['backup']);
  assert.equal(result.plan.routing.policy, 'CANONICAL_AGENT_MODEL_ROUTER');
  assert.equal(result.plan.routing.unbenchmarkedExploration, false);
});

test('stale benchmark evidence benches a callable model instead of exploiting stale reputation', () => {
  const stale = profile({ id: 'stale', model: 'stale', benchmark: { quality: 100, reliability: 100, latencyMs: 1, observedCostCents: 0, sampleSize: 100, verifiedAt: '2026-06-01T00:00:00Z' } });
  const reg = registry([stale]);
  const readiness = readinessFor(reg, ['stale']);
  const result = compileEvidenceRoutedAvengersSquad({ registry: reg, readiness, mission: mission(), date: NOW, maxBenchmarkAgeDays: 30 });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.some(code => code.includes('fresh-evidence-backed-route-required')));
});

test('a newly configured but not inference-proven model cannot be selected', () => {
  const unproven = profile({ id: 'unproven', model: 'unproven' });
  const reg = registry([unproven]);
  const readiness = readinessFor(reg, []);
  const result = compileEvidenceRoutedAvengersSquad({ registry: reg, readiness, mission: mission(), date: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.some(code => code.includes('authorized-worker-required') || code.includes('no-callable-avenger')));
});

test('non-callable required tool blocks the mission instead of being treated as a prompt decoration', () => {
  const p = profile({ id: 'builder', model: 'builder' });
  const reg = registry([p], [{ id: 'strix', name: 'Strix', kind: 'OPTIONAL_RUNTIME', path: null, sourceRef: 'test', roles: ['verifier'], runtimeRequired: true, notes: [] }]);
  const readiness = readinessFor(reg, ['builder'], [{ id: 'strix', status: 'RUNTIME_PROOF_REQUIRED', callableNow: false }]);
  const result = compileEvidenceRoutedAvengersSquad({
    registry: reg,
    readiness,
    mission: mission({ nodes: [{ ...mission().nodes[0], toolIds: ['strix'] }] }),
    date: NOW
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.some(code => code.includes('tool-not-callable:build:strix')));
});

test('fallback executes after confirmed primary provider failure and records both attempts', async () => {
  const primary = profile({ id: 'primary', model: 'primary', benchmark: { quality: 98, reliability: 99, latencyMs: 500, observedCostCents: 0, sampleSize: 60, verifiedAt: '2026-09-04T00:00:00Z' } });
  const fallback = profile({ id: 'fallback', model: 'fallback', benchmark: { quality: 84, reliability: 96, latencyMs: 700, observedCostCents: 0, sampleSize: 60, verifiedAt: '2026-09-04T00:00:00Z' } });
  const reg = registry([primary, fallback]);
  const readiness = readinessFor(reg, ['primary', 'fallback']);
  const planned = compileEvidenceRoutedAvengersSquad({ registry: reg, readiness, mission: mission(), date: NOW, maxFallbacks: 1 });
  assert.equal(planned.ok, true, JSON.stringify(planned.reasonCodes));
  assert.equal(planned.plan.assignments[0].primary.profileId, 'primary');

  const fetchImpl = async (_url, init = {}) => {
    const body = JSON.parse(init.body);
    if (body.model === 'primary') return response({ error: 'provider down' }, 503);
    return response(successfulInference('fallback', { artifact: 'built' }));
  };
  const executed = await executeAvengersPlan({ registry: reg, plan: planned.plan, fetchImpl, date: NOW });
  assert.equal(executed.ok, true, JSON.stringify(executed.reasonCodes));
  assert.equal(executed.receipt.results[0].selectedProfileId, 'fallback');
  assert.equal(executed.receipt.results[0].attempts.length, 2);
  assert.equal(executed.receipt.results[0].attempts[0].ok, false);
  assert.equal(executed.receipt.results[0].attempts[1].ok, true);
  assert.equal(executed.receipt.businessEffectAuthority, 'NONE');
});

test('tampering with a compiled graph is rejected before any provider call', async () => {
  const p = profile({ id: 'builder', model: 'builder' });
  const reg = registry([p]);
  const readiness = readinessFor(reg, ['builder']);
  const planned = compileEvidenceRoutedAvengersSquad({ registry: reg, readiness, mission: mission(), date: NOW });
  assert.equal(planned.ok, true);
  const tampered = structuredClone(planned.plan);
  tampered.graph.nodes[0].purpose = 'quietly do something else';
  let calls = 0;
  const executed = await executeAvengersPlan({ registry: reg, plan: tampered, fetchImpl: async () => { calls += 1; throw new Error('should not call'); } });
  assert.equal(executed.ok, false);
  assert.ok(executed.reasonCodes.includes('plan-graph-integrity-failed'));
  assert.equal(calls, 0);
});

test('parallel-ready independent nodes run as one bounded batch while integration waits', () => {
  const researcher = profile({ id: 'researcher', model: 'researcher', taskClasses: ['research', 'general'], roles: ['researcher', 'general'] });
  const builder = profile({ id: 'builder', model: 'builder', taskClasses: ['coding', 'general'], roles: ['builder', 'general'] });
  const reviewer = profile({ id: 'reviewer', model: 'reviewer', taskClasses: ['review', 'general'], roles: ['verifier', 'general'] });
  const reg = registry([researcher, builder, reviewer]);
  const readiness = readinessFor(reg, ['researcher', 'builder', 'reviewer']);
  const multi = mission({ nodes: [
    { id: 'research', purpose: 'Research.', taskClass: 'research', role: 'researcher', dependencies: [], toolIds: [], acceptanceTests: ['structured'] },
    { id: 'build', purpose: 'Build.', taskClass: 'coding', role: 'builder', dependencies: [], toolIds: [], acceptanceTests: ['structured'] },
    { id: 'review', purpose: 'Review both.', taskClass: 'review', role: 'verifier', dependencies: ['research', 'build'], toolIds: [], acceptanceTests: ['structured'] }
  ] });
  const result = compileEvidenceRoutedAvengersSquad({ registry: reg, readiness, mission: multi, date: NOW });
  assert.equal(result.ok, true, JSON.stringify(result.reasonCodes));
  assert.equal(result.plan.maxParallel, 3);
  assert.equal(result.plan.graph.nodes.find(node => node.id === 'review').dependencies.length, 2);
});
