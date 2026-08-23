import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';
import { routePermittedWorkers } from '../src/agent-model-routing-integration.mjs';

const NOW = new Date('2026-08-23T03:00:00.000Z');
const openai = { workerId: 'openai-1', provider: 'openai', model: 'gpt-x', taskClasses: ['coding'] };
const anthropic = { workerId: 'anthropic-1', provider: 'anthropic', model: 'claude-x', taskClasses: ['coding'] };

function benchmark(worker, overrides = {}, observedAt = NOW) {
  return normalizeModelBenchmark({
    provider: worker.provider,
    model: worker.model,
    taskClasses: worker.taskClasses,
    taskClass: 'coding',
    quality: 0.8,
    reliability: 0.8,
    latencyScore: 0.8,
    economicImpact: 0.8,
    evidenceConfidence: 0.9,
    costEfficiency: 0.8,
    ...overrides
  }, observedAt);
}

test('routing disabled preserves the already-authorized worker set exactly', () => {
  const result = routePermittedWorkers({ workers: [openai, anthropic], enabled: false });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'DISABLED');
  assert.deepEqual(result.workers, [openai, anthropic]);
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.providerCalls, 0);
});

test('evidence routing selects only from workers already permitted by the activation gate', () => {
  const result = routePermittedWorkers({ workers: [openai], benchmarks: [benchmark(openai), benchmark(anthropic, { quality: 1, reliability: 1 })], taskClass: 'coding', enabled: true, date: NOW, random: () => 0.99 });
  assert.equal(result.ok, true);
  assert.equal(result.workers.length, 1);
  assert.equal(result.workers[0], openai);
});

test('higher evidence-backed score narrows an authorized rehearsal to one worker', () => {
  const result = routePermittedWorkers({ workers: [openai, anthropic], benchmarks: [benchmark(openai, { quality: 0.7, reliability: 0.75, economicImpact: 0.6 }), benchmark(anthropic, { quality: 0.95, reliability: 0.95, economicImpact: 0.9 })], taskClass: 'coding', enabled: true, date: NOW, random: () => 0.99 });
  assert.equal(result.selected.workerId, 'anthropic-1');
  assert.deepEqual(result.withheld, [openai]);
  assert.equal(result.externalEffects, 0);
});

test('stale benchmark evidence cannot authorize routing', () => {
  const result = routePermittedWorkers({ workers: [openai], benchmarks: [benchmark(openai, {}, new Date('2026-06-01T00:00:00Z'))], taskClass: 'coding', enabled: true, maxBenchmarkAgeDays: 30, date: NOW, random: () => 0.99 });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('fresh-evidence-backed-route-required'));
});

test('future-dated benchmark evidence cannot authorize routing', () => {
  const result = routePermittedWorkers({ workers: [openai], benchmarks: [benchmark(openai, {}, new Date('2026-08-24T00:00:00Z'))], taskClass: 'coding', enabled: true, date: NOW, random: () => 0.99 });
  assert.equal(result.ok, false);
});

test('low-confidence evidence cannot silently become a route', () => {
  const result = routePermittedWorkers({ workers: [openai], benchmarks: [benchmark(openai, { evidenceConfidence: 0.2 })], taskClass: 'coding', enabled: true, minimumEvidenceConfidence: 0.5, date: NOW, random: () => 0.99 });
  assert.equal(result.ok, false);
});

test('unbenchmarked exploration requires a separate explicit opt-in', () => {
  const blocked = routePermittedWorkers({ workers: [openai], benchmarks: [], taskClass: 'coding', enabled: true, date: NOW, random: () => 0 });
  assert.equal(blocked.ok, false);
  const allowed = routePermittedWorkers({ workers: [openai], benchmarks: [], taskClass: 'coding', enabled: true, allowUnbenchmarkedExploration: true, explorationRate: 0.1, date: NOW, random: () => 0 });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.selected.evidenceStatus, 'UNBENCHMARKED');
});

test('duplicate provider/model workers fail closed because routing identity is ambiguous', () => {
  const result = routePermittedWorkers({ workers: [openai, { ...openai, workerId: 'openai-2' }], benchmarks: [benchmark(openai)], taskClass: 'coding', enabled: true, date: NOW });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('duplicate-authorized-provider-model-ambiguous'));
});

test('routing-enabled worker must declare a concrete provider and model', () => {
  const result = routePermittedWorkers({ workers: [{ workerId: 'bad', provider: 'openai' }], benchmarks: [], taskClass: 'coding', enabled: true, date: NOW });
  assert.equal(result.ok, false);
});
