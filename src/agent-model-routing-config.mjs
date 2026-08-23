import { routePermittedWorkers, routeWorkersByTargetAgent } from './agent-model-routing-integration.mjs';

export const AGENT_MODEL_ROUTING_CONFIG_POLICY_VERSION = 'agent-model-routing-config-1.0.0';

function blocked(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_MODEL_ROUTING_CONFIG_POLICY_VERSION,
    status: 'BLOCKED',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    workers: [],
    withheld: [],
    selected: null,
    businessEffectAuthority: 'NONE',
    providerCalls: 0,
    externalEffects: 0,
    ...extra
  };
}

function parseBenchmarks(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return { ok: true, benchmarks: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { ok: false, reasonCodes: ['routing-benchmarks-must-be-array'] };
    return { ok: true, benchmarks: parsed };
  } catch {
    return { ok: false, reasonCodes: ['routing-benchmarks-invalid-json'] };
  }
}

// This is the only env-to-router bridge the live mesh needs. Its worker input
// must already have passed activation/consequence gating. It deliberately has
// no worker-list env variable, so configuration cannot resurrect a worker that
// an earlier authority gate withheld.
export function routeActivationPermittedWorkers({
  workers = [],
  env = process.env,
  random = Math.random,
  date = new Date()
} = {}) {
  if (!Array.isArray(workers)) return blocked(['activation-permitted-worker-list-required']);

  const enabled = env.AGENT_MODEL_ROUTE_ENABLED === 'true';
  if (!enabled) {
    return routePermittedWorkers({ workers, enabled: false, random, date });
  }

  const parsed = parseBenchmarks(env.AGENT_MODEL_ROUTE_BENCHMARKS);
  if (!parsed.ok) return blocked(parsed.reasonCodes);

  // Grouped by target agent, not routed across them. Each mesh worker drains a
  // different agent's queue, so a single-winner route over the whole list takes
  // every other queue out of service while reporting a routed, successful cycle.
  const result = routeWorkersByTargetAgent({
    workers,
    benchmarks: parsed.benchmarks,
    taskClass: String(env.AGENT_MODEL_ROUTE_TASK_CLASS || 'general'),
    enabled: true,
    allowUnbenchmarkedExploration: env.AGENT_MODEL_ROUTE_ALLOW_UNBENCHMARKED === 'true',
    minimumEvidenceConfidence: env.AGENT_MODEL_ROUTE_MIN_CONFIDENCE ?? 0.5,
    explorationRate: env.AGENT_MODEL_ROUTE_EXPLORATION_RATE ?? 0,
    maxBenchmarkAgeDays: env.AGENT_MODEL_ROUTE_MAX_BENCHMARK_AGE_DAYS ?? 30,
    random,
    date
  });

  return {
    ...result,
    configPolicyVersion: AGENT_MODEL_ROUTING_CONFIG_POLICY_VERSION,
    authorityOrder: 'ACTIVATION_THEN_ROUTING'
  };
}
