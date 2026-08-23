// A supplier preference must never take a queue out of service.
//
// routePermittedWorkers answers "which of these candidates should do this job"
// and returns exactly one worker. The mesh's worker list is not a candidate
// set: each worker carries a targetAgent and drains that agent's queue.
// Applying a single-winner router across it is a category error, and a probe
// with four workers on four target agents, routing enabled and fresh
// benchmarks compiled, produced:
//
//   cycle ok: true | status: ADVANCED | routingStatus: ROUTED
//   target agents serviced: chatgpt
//
// A successful-looking cycle in which three quarters of the system had silently
// stopped. Nothing in the receipt said so.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgentMeshCycle } from '../src/agent-mesh-control-plane.mjs';
import { routeWorkersByTargetAgent } from '../src/agent-model-routing-integration.mjs';
import { normalizeModelBenchmark } from '../src/agent-model-router.mjs';

function fakeStore() {
  const auditLog = [];
  let n = 0;
  return {
    auditLog,
    async log(type, detail) {
      const row = { id: `r${++n}`, type, detail: structuredClone(detail), createdAt: new Date().toISOString() };
      auditLog.push(row);
      return row;
    },
    async list(key, options = {}) {
      let rows = [...auditLog];
      if (options.filters?.type) rows = rows.filter(row => row.type === options.filters.type);
      if (options.offset) rows = rows.slice(options.offset);
      if (Number.isInteger(options.limit)) rows = rows.slice(0, Math.max(0, options.limit));
      return rows;
    }
  };
}

function worker(workerId, targetAgent, provider, model) {
  return { workerId, targetAgent, provider, model, budgetId: `b-${workerId}`, modelExecutor: async () => ({ ok: true }) };
}

function benchmark(provider, model, quality) {
  const compiled = normalizeModelBenchmark({
    provider, model, taskClasses: ['general'], taskClass: 'general',
    quality, reliability: 0.9, latencyScore: 0.8,
    economicImpact: 0.5, evidenceConfidence: 0.9, costEfficiency: 0.7
  }, new Date());
  assert.equal(compiled.ok, true, 'the fixture benchmark must actually compile');
  return compiled;
}

async function cycle(workers, env) {
  const serviced = [];
  const result = await runAgentMeshCycle({
    store: fakeStore(),
    enabled: true,
    workers,
    sourceCommit: 'abc123',
    schedulerOccurrenceKey: 'occ-2026-08-23',
    adapterFactory: async () => ({ createTask: async () => ({ ok: true, issueNumber: 1 }), readTask: async () => ({ ok: false, status: 'PENDING' }) }),
    compileRelayTask: intent => ({ ok: true, ...intent }),
    tickRuns: async () => ({ ok: true, results: [] }),
    workerTick: async ({ targetAgent }) => { serviced.push(targetAgent); return { ok: true, processed: 1 }; },
    routingEnv: env,
    routingRandom: () => 0.99,
    date: new Date()
  });
  return { result, serviced };
}

const FOUR_AGENTS = [
  worker('w-chatgpt', 'chatgpt', 'openai', 'gpt-x'),
  worker('w-claude', 'claude', 'anthropic', 'claude-x'),
  worker('w-gemini', 'gemini', 'google', 'gemini-x'),
  worker('w-grok', 'grok', 'xai', 'grok-x')
];

const ROUTING_ON = Object.freeze({
  AGENT_MODEL_ROUTE_ENABLED: 'true',
  AGENT_MODEL_ROUTE_TASK_CLASS: 'general',
  AGENT_MODEL_ROUTE_BENCHMARKS: JSON.stringify([
    benchmark('openai', 'gpt-x', 0.9),
    benchmark('anthropic', 'claude-x', 0.8),
    benchmark('google', 'gemini-x', 0.7),
    benchmark('xai', 'grok-x', 0.6)
  ])
});

test('enabling routing does not take three of four queues out of service', async () => {
  const off = await cycle(FOUR_AGENTS, {});
  const on = await cycle(FOUR_AGENTS, ROUTING_ON);

  assert.deepEqual(off.serviced.sort(), ['chatgpt', 'claude', 'gemini', 'grok']);
  assert.deepEqual(on.serviced.sort(), ['chatgpt', 'claude', 'gemini', 'grok'],
    'a supplier preference removed queues from service');
  assert.equal(on.result.routingStatus, 'ROUTED');
});

test('routing still chooses, within one agent that has several candidates', async () => {
  const workers = [
    worker('w-chatgpt-a', 'chatgpt', 'openai', 'gpt-weak'),
    worker('w-chatgpt-b', 'chatgpt', 'openai', 'gpt-strong'),
    worker('w-claude', 'claude', 'anthropic', 'claude-x')
  ];
  const env = {
    AGENT_MODEL_ROUTE_ENABLED: 'true',
    AGENT_MODEL_ROUTE_TASK_CLASS: 'general',
    AGENT_MODEL_ROUTE_BENCHMARKS: JSON.stringify([
      benchmark('openai', 'gpt-weak', 0.2),
      benchmark('openai', 'gpt-strong', 0.95),
      benchmark('anthropic', 'claude-x', 0.8)
    ])
  };
  const { result, serviced } = await cycle(workers, env);
  assert.deepEqual(serviced.sort(), ['chatgpt', 'claude'], 'both queues must still be served');
  const chatgpt = result.routingSelections.find(item => item.targetAgent === 'chatgpt');
  assert.equal(chatgpt.workerId, 'w-chatgpt-b', 'the stronger benchmarked candidate must win its own group');
  const claude = result.routingSelections.find(item => item.targetAgent === 'claude');
  assert.equal(claude.workerId, 'w-claude');
  assert.equal(claude.evidenceStatus, 'EVIDENCE_BACKED');
});

test('a lone worker is still held to the evidence gate, and the whole cycle blocks', async () => {
  // An earlier draft of the grouping exempted single-candidate groups from
  // `fresh-evidence-backed-route-required`, reasoning that with one candidate
  // there is nothing to prefer. That would have quietly weakened a gate this
  // repository chose on purpose: routing is opt-in, and opting in asserts that
  // fresh evidence exists. With nothing routable the cycle blocks rather than
  // degrades -- "no worker may run" has always failed closed here.
  const { result, serviced } = await cycle([worker('w-solo', 'chatgpt', 'openai', 'gpt-x')], {
    AGENT_MODEL_ROUTE_ENABLED: 'true',
    AGENT_MODEL_ROUTE_TASK_CLASS: 'general',
    AGENT_MODEL_ROUTE_BENCHMARKS: '[]'
  });
  assert.deepEqual(serviced, []);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.reasonCodes.includes('fresh-evidence-backed-route-required'),
    'the operator must see the published reason, not only an agent-qualified variant');
  assert.ok(result.reasonCodes.includes('chatgpt:fresh-evidence-backed-route-required'),
    'and must see which queue it came from');
});

test('an unroutable group is withheld alone, and the cycle refuses to call itself advanced', async () => {
  const workers = [
    worker('w-chatgpt-a', 'chatgpt', 'openai', 'gpt-a'),
    worker('w-chatgpt-b', 'chatgpt', 'openai', 'gpt-b'),
    worker('w-claude', 'claude', 'anthropic', 'claude-x')
  ];
  // Benchmarks for claude only: its group routes, chatgpt's cannot.
  const { result, serviced } = await cycle(workers, {
    AGENT_MODEL_ROUTE_ENABLED: 'true',
    AGENT_MODEL_ROUTE_TASK_CLASS: 'general',
    AGENT_MODEL_ROUTE_BENCHMARKS: JSON.stringify([benchmark('anthropic', 'claude-x', 0.8)])
  });

  assert.deepEqual(serviced, ['claude'], 'one agent\'s missing evidence must not starve the others');
  assert.deepEqual(result.routingBlockedTargetAgents, ['chatgpt']);
  assert.equal(result.status, 'DEGRADED',
    'a cycle that served some queues and not others must not report ADVANCED');
  assert.ok(result.reasonCodes.includes('model-routing-withheld-target-agents'));
});

test('routing can still only narrow: no configuration resurrects a withheld worker', () => {
  const authorized = [worker('w-a', 'chatgpt', 'openai', 'gpt-a')];
  const routed = routeWorkersByTargetAgent({
    workers: authorized,
    benchmarks: [benchmark('openai', 'gpt-a', 0.9), benchmark('anthropic', 'claude-x', 0.99)],
    taskClass: 'general',
    enabled: true
  });
  assert.deepEqual(routed.workers.map(item => item.workerId), ['w-a'],
    'a benchmark for a worker the authority layer did not authorize must not introduce it');
});

test('a worker with no target agent is refused rather than grouped under a blank key', () => {
  const refused = routeWorkersByTargetAgent({ workers: [{ workerId: 'w', provider: 'openai', model: 'm' }], enabled: true });
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.reasonCodes, ['worker-target-agent-required']);
});
