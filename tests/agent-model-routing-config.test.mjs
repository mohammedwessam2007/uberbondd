import test from 'node:test';
import assert from 'node:assert/strict';
import { routeActivationPermittedWorkers } from '../src/agent-model-routing-config.mjs';

const NOW = new Date('2026-08-23T03:45:00.000Z');

function worker(workerId, provider, model) {
  return { workerId, provider, model, taskClasses: ['coding'] };
}

function benchmark(provider, model, score, observedAt = '2026-08-23T03:40:00.000Z') {
  return {
    provider,
    model,
    taskClass: 'coding',
    quality: score,
    reliability: score,
    latencyScore: score,
    economicImpact: score,
    evidenceConfidence: 0.95,
    costEfficiency: score,
    observedAt
  };
}

test('routing disabled preserves the activation-permitted worker set exactly', () => {
  const workers = [worker('w1', 'openai', 'gpt-x'), worker('w2', 'anthropic', 'claude-x')];
  const result = routeActivationPermittedWorkers({ workers, env: {}, date: NOW, random: () => 0.9 });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'DISABLED');
  assert.deepEqual(result.workers, workers);
  assert.equal(result.providerCalls, 0);
  assert.equal(result.externalEffects, 0);
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('enabled routing narrows the permitted set to the strongest fresh evidence-backed worker', () => {
  const workers = [worker('w1', 'openai', 'gpt-x'), worker('w2', 'anthropic', 'claude-x')];
  const env = {
    AGENT_MODEL_ROUTE_ENABLED: 'true',
    AGENT_MODEL_ROUTE_TASK_CLASS: 'coding',
    AGENT_MODEL_ROUTE_BENCHMARKS: JSON.stringify([
      benchmark('openai', 'gpt-x', 0.65),
      benchmark('anthropic', 'claude-x', 0.95)
    ])
  };
  const result = routeActivationPermittedWorkers({ workers, env, date: NOW, random: () => 0.9 });
  assert.equal(result.ok, true, JSON.stringify(result.reasonCodes || []));
  assert.equal(result.status, 'ROUTED');
  assert.deepEqual(result.workers.map(item => item.workerId), ['w2']);
  assert.deepEqual(result.withheld.map(item => item.workerId), ['w1']);
  assert.equal(result.selected.workerId, 'w2');
  assert.equal(result.authorityOrder, 'ACTIVATION_THEN_ROUTING');
});

test('benchmark evidence cannot resurrect a worker withheld before routing', () => {
  const workers = [worker('allowed', 'openai', 'gpt-x')];
  const env = {
    AGENT_MODEL_ROUTE_ENABLED: 'true',
    AGENT_MODEL_ROUTE_TASK_CLASS: 'coding',
    AGENT_MODEL_ROUTE_BENCHMARKS: JSON.stringify([
      benchmark('openai', 'gpt-x', 0.7),
      benchmark('anthropic', 'withheld-model', 1)
    ])
  };
  const result = routeActivationPermittedWorkers({ workers, env, date: NOW, random: () => 0.9 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.workers.map(item => item.workerId), ['allowed']);
  assert.equal(result.selected.provider, 'openai');
  assert.equal(result.selected.model, 'gpt-x');
});

test('enabled routing fails closed on malformed benchmark JSON', () => {
  const result = routeActivationPermittedWorkers({
    workers: [worker('w1', 'openai', 'gpt-x')],
    env: { AGENT_MODEL_ROUTE_ENABLED: 'true', AGENT_MODEL_ROUTE_BENCHMARKS: '{bad' },
    date: NOW
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'BLOCKED');
  assert.deepEqual(result.workers, []);
  assert.deepEqual(result.reasonCodes, ['routing-benchmarks-invalid-json']);
});

test('enabled routing fails closed on stale-only evidence unless exploration is separately allowed', () => {
  const result = routeActivationPermittedWorkers({
    workers: [worker('w1', 'openai', 'gpt-x')],
    env: {
      AGENT_MODEL_ROUTE_ENABLED: 'true',
      AGENT_MODEL_ROUTE_TASK_CLASS: 'coding',
      AGENT_MODEL_ROUTE_MAX_BENCHMARK_AGE_DAYS: '30',
      AGENT_MODEL_ROUTE_BENCHMARKS: JSON.stringify([
        benchmark('openai', 'gpt-x', 1, '2026-01-01T00:00:00.000Z')
      ])
    },
    date: NOW,
    random: () => 0.9
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reasonCodes.includes('fresh-evidence-backed-route-required'), true);
});

test('routing decision never invokes or replaces the permitted worker executor', () => {
  let calls = 0;
  const modelExecutor = async () => { calls += 1; };
  const workers = [{ ...worker('w1', 'openai', 'gpt-x'), modelExecutor }];
  const env = {
    AGENT_MODEL_ROUTE_ENABLED: 'true',
    AGENT_MODEL_ROUTE_TASK_CLASS: 'coding',
    AGENT_MODEL_ROUTE_BENCHMARKS: JSON.stringify([benchmark('openai', 'gpt-x', 0.9)])
  };
  const result = routeActivationPermittedWorkers({ workers, env, date: NOW, random: () => 0.9 });
  assert.equal(result.ok, true);
  assert.equal(calls, 0);
  assert.equal(result.workers[0].modelExecutor, modelExecutor);
  assert.equal(result.providerCalls, 0);
});
