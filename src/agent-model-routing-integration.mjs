import { normalizeModelCandidate, routeModel } from './agent-model-router.mjs';

export const AGENT_MODEL_ROUTING_INTEGRATION_POLICY_VERSION = 'agent-model-routing-integration-1.0.0';

const MAX_BENCHMARK_AGE_DAYS = 365;

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function finite(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: AGENT_MODEL_ROUTING_INTEGRATION_POLICY_VERSION,
    status: 'BLOCKED',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    providerCalls: 0,
    externalEffects: 0,
    ...extra
  };
}

function parseObservedAt(value) {
  const stamp = Date.parse(value || '');
  return Number.isFinite(stamp) ? stamp : null;
}

/**
 * Narrow an already-authorized worker set using evidence. This function can
 * never make a withheld worker eligible: activation/authority gating must run
 * first, and only the supplied workers are candidates here.
 *
 * Routing is opt-in. With routing disabled the input worker set is returned
 * unchanged. When enabled, stale/future benchmark evidence is ignored and an
 * unbenchmarked selection is refused unless exploration is explicitly enabled.
 */
export function routePermittedWorkers({
  workers = [],
  benchmarks = [],
  taskClass = 'general',
  enabled = false,
  allowUnbenchmarkedExploration = false,
  minimumEvidenceConfidence = 0.5,
  explorationRate = 0,
  maxBenchmarkAgeDays = 30,
  random = Math.random,
  date = new Date()
} = {}) {
  if (!Array.isArray(workers)) return fail(['worker-list-required']);
  if (!enabled) {
    return {
      ok: true,
      policyVersion: AGENT_MODEL_ROUTING_INTEGRATION_POLICY_VERSION,
      status: 'DISABLED',
      mode: 'PASSTHROUGH',
      workers: [...workers],
      withheld: [],
      selected: null,
      businessEffectAuthority: 'NONE',
      providerCalls: 0,
      externalEffects: 0
    };
  }
  if (!workers.length) return fail(['authorized-worker-required']);
  if (!Array.isArray(benchmarks)) return fail(['benchmark-list-required']);

  const now = date instanceof Date ? date.getTime() : Date.parse(date);
  if (!Number.isFinite(now)) return fail(['valid-routing-time-required']);
  const maxAge = finite(maxBenchmarkAgeDays, 0, MAX_BENCHMARK_AGE_DAYS, 30);
  const oldest = now - maxAge * 86_400_000;

  const candidates = [];
  const workerByCandidate = new Map();
  for (const worker of workers) {
    const candidate = normalizeModelCandidate({
      provider: worker?.provider,
      model: worker?.model,
      taskClasses: Array.isArray(worker?.taskClasses) && worker.taskClasses.length
        ? worker.taskClasses
        : ['general']
    });
    if (!candidate.ok) return fail(['authorized-worker-must-declare-routable-provider-model']);
    if (workerByCandidate.has(candidate.candidateId)) {
      return fail(['duplicate-authorized-provider-model-ambiguous']);
    }
    candidates.push(candidate);
    workerByCandidate.set(candidate.candidateId, worker);
  }

  const freshBenchmarks = benchmarks.filter(benchmark => {
    const observed = parseObservedAt(benchmark?.observedAt);
    return observed != null && observed >= oldest && observed <= now;
  });

  const route = routeModel({
    taskClass: text(taskClass, 80).toLowerCase() || 'general',
    candidates,
    benchmarks: freshBenchmarks,
    minimumEvidenceConfidence: finite(minimumEvidenceConfidence, 0, 1, 0.5),
    explorationRate: allowUnbenchmarkedExploration
      ? finite(explorationRate, 0, 0.5, 0.1)
      : 0,
    random
  });
  if (!route.ok) return fail(route.reasonCodes || ['model-routing-failed']);
  if (route.evidenceStatus !== 'EVIDENCE_BACKED' && !allowUnbenchmarkedExploration) {
    return fail(['fresh-evidence-backed-route-required'], { routerMode: route.mode });
  }

  const selectedWorker = workerByCandidate.get(route.selected?.candidateId);
  if (!selectedWorker) return fail(['router-selected-worker-outside-authorized-set']);
  const withheld = workers.filter(worker => worker !== selectedWorker);

  return {
    ok: true,
    policyVersion: AGENT_MODEL_ROUTING_INTEGRATION_POLICY_VERSION,
    status: 'ROUTED',
    mode: route.mode,
    taskClass: route.taskClass,
    workers: [selectedWorker],
    withheld,
    selected: {
      workerId: selectedWorker.workerId || null,
      provider: route.selected.provider,
      model: route.selected.model,
      candidateId: route.selected.candidateId,
      score: route.score,
      evidenceStatus: route.evidenceStatus
    },
    alternatives: route.alternatives,
    businessEffectAuthority: 'NONE',
    providerCalls: 0,
    externalEffects: 0
  };
}
