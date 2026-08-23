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

/**
 * Route within each target agent's own candidate set.
 *
 * `routePermittedWorkers` answers "which of these candidates should do this
 * job" and returns exactly one worker. The agent mesh's worker list is not a
 * candidate set: each worker carries a `targetAgent` and drains that agent's
 * queue. Applying a single-winner router across it is a category error, and it
 * had teeth -- a probe with four workers on four target agents, routing enabled
 * and fresh benchmarks compiled, produced `ok: true, status: 'ADVANCED',
 * routingStatus: 'ROUTED'` while three of the four queues were never touched.
 * A successful-looking cycle in which most of the system silently stopped.
 *
 * Grouping first makes the question the right one: for the chatgpt queue, which
 * of my chatgpt-capable workers should run. A supplier preference can then
 * never remove a queue from service.
 *
 * Every group, including a one-worker group, goes through the same evidence
 * gate. An earlier draft exempted single-candidate groups on the reasoning that
 * with one candidate there is nothing to prefer -- but `fresh-evidence-backed-
 * route-required` is not about preference. Routing is opt-in behind
 * AGENT_MODEL_ROUTE_ENABLED, and opting in is a statement that fresh evidence
 * exists. Exempting the single-candidate case would have quietly weakened a
 * gate this repository chose on purpose, in order to solve a problem that
 * belongs to reporting rather than to policy.
 *
 * A group that cannot be routed is withheld alone and named. Failing the whole
 * cycle would let one agent's stale benchmark starve every other agent -- the
 * same failure arriving from the other direction -- but a partly-served cycle
 * must never report itself as fully served, so the caller gets the blocked
 * agents by name and can degrade honestly. An operator who enables routing
 * without benchmarks now sees exactly which queue stopped and why, instead of
 * either a silent stop or a silent exemption.
 */
export function routeWorkersByTargetAgent({ workers = [], ...options } = {}) {
  if (!Array.isArray(workers)) return fail(['worker-list-required']);

  const groups = new Map();
  for (const worker of workers) {
    const targetAgent = text(worker?.targetAgent, 80).toLowerCase();
    if (!targetAgent) return fail(['worker-target-agent-required']);
    if (!groups.has(targetAgent)) groups.set(targetAgent, []);
    groups.get(targetAgent).push(worker);
  }

  const routed = [];
  const withheld = [];
  const selections = [];
  const blockedTargetAgents = [];
  const reasonCodes = [];

  for (const [targetAgent, group] of groups) {
    const result = routePermittedWorkers({ workers: group, ...options });
    if (!result.ok) {
      blockedTargetAgents.push(targetAgent);
      withheld.push(...group);
      // Both spellings. The bare code is this module's published vocabulary and
      // callers match on it; the qualified one says which agent it came from,
      // which is the only part grouping added.
      for (const code of result.reasonCodes || []) reasonCodes.push(code, `${targetAgent}:${code}`);
      continue;
    }
    routed.push(...result.workers);
    withheld.push(...result.withheld);
    selections.push({
      targetAgent,
      workerId: result.selected?.workerId || null,
      provider: result.selected?.provider || null,
      model: result.selected?.model || null,
      candidateId: result.selected?.candidateId || null,
      score: result.selected?.score ?? null,
      mode: result.mode || result.status,
      evidenceStatus: result.selected?.evidenceStatus || null
    });
  }

  // Nothing routable is a blocked cycle, not a degraded one. Partial service is
  // worth preserving -- one agent's stale benchmark must not starve the rest --
  // but "no worker may run" has always failed closed here and must keep doing
  // so, or a cycle with zero workers reports itself as merely degraded.
  if (!routed.length && blockedTargetAgents.length) {
    return fail(reasonCodes.length ? [...new Set(reasonCodes)] : ['model-routing-blocked-every-target-agent'], {
      blockedTargetAgents,
      withheld
    });
  }

  return {
    ok: true,
    policyVersion: AGENT_MODEL_ROUTING_INTEGRATION_POLICY_VERSION,
    status: blockedTargetAgents.length ? 'PARTIALLY_ROUTED' : 'ROUTED',
    mode: 'PER_TARGET_AGENT',
    workers: routed,
    withheld,
    selections,
    // One target agent is the common shape today, and a single-winner field is
    // meaningful there. With several, naming one winner would be a fiction, so
    // callers read `selections`.
    selected: groups.size === 1 && selections.length === 1 ? { ...selections[0] } : null,
    blockedTargetAgents,
    reasonCodes: [...new Set(reasonCodes)],
    servicedTargetAgents: [...new Set(routed.map(worker => text(worker?.targetAgent, 80).toLowerCase()))],
    businessEffectAuthority: 'NONE',
    providerCalls: 0,
    externalEffects: 0
  };
}
