import crypto from 'node:crypto';
import { compileAvengersSquad, AVENGERS_PLAN_SCHEMA } from './avengers-arsenal.mjs';
import { routePermittedWorkers } from './agent-model-routing-integration.mjs';
import { normalizeModelBenchmark } from './agent-model-router.mjs';
import { validateOrchestrationGraph } from './orchestration-frontier.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const AVENGERS_SQUAD_PLANNER_VERSION = 'uberbond.avengers-squad-planner-1.0.0';
const ROUTER_TASK_CLASSES = new Set(['research', 'strategy', 'coding', 'review', 'classification', 'browser', 'security', 'math', 'commercial-analysis', 'general']);

function clone(value) { return structuredClone(value); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: AVENGERS_SQUAD_PLANNER_VERSION,
    status: 'AVENGERS_PLAN_BLOCKED',
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

function workerFor(profile) {
  return {
    workerId: profile.id,
    provider: 'avengers',
    model: profile.id,
    taskClasses: profile.taskClasses
  };
}

function confidence(sampleSize) {
  const n = Math.max(0, Number(sampleSize || 0));
  if (!n) return 0;
  return Math.min(1, 0.35 + Math.log10(n + 1) * 0.25);
}

function latencyScore(ms) {
  const n = Math.max(0, Number(ms || 0));
  return Math.max(0, Math.min(1, 1 - n / 60_000));
}

function costEfficiency(cents) {
  const n = Math.max(0, Number(cents || 0));
  return Math.max(0, Math.min(1, 1 - n / 100));
}

function benchmarkFor(profile, taskClass) {
  if (!profile?.benchmark?.verifiedAt) return null;
  const stamp = new Date(profile.benchmark.verifiedAt);
  if (Number.isNaN(stamp.getTime())) return null;
  const normalized = normalizeModelBenchmark({
    provider: 'avengers',
    model: profile.id,
    taskClasses: profile.taskClasses,
    taskClass,
    quality: Number(profile.benchmark.quality) / 100,
    reliability: Number(profile.benchmark.reliability) / 100,
    latencyScore: latencyScore(profile.benchmark.latencyMs),
    economicImpact: Math.max(0, Math.min(1, Number(profile.benchmark.quality) / 100)),
    evidenceConfidence: confidence(profile.benchmark.sampleSize),
    costEfficiency: costEfficiency(profile.benchmark.observedCostCents)
  }, stamp);
  return normalized.ok ? normalized : null;
}

export function compileEvidenceRoutedAvengersSquad({
  registry,
  readiness,
  mission,
  maxFallbacks = 2,
  maxBenchmarkAgeDays = 30,
  minimumEvidenceConfidence = 0.5,
  date = new Date()
} = {}) {
  const preliminary = compileAvengersSquad({ registry, readiness, mission, maxFallbacks });
  if (!preliminary.ok) return preliminary;

  const callable = new Set((readiness?.profiles || readiness?.receipt?.profiles || [])
    .filter(item => item.callableNow === true)
    .map(item => item.profileId));
  const tools = new Map((readiness?.tools || readiness?.receipt?.tools || []).map(item => [item.id, item]));
  const assignments = [];
  const reasons = [];

  for (const node of preliminary.plan.mission.nodes) {
    if (!ROUTER_TASK_CLASSES.has(node.taskClass)) {
      reasons.push(`router-task-class-unsupported:${node.id}:${node.taskClass}`);
      continue;
    }
    for (const toolId of node.toolIds) {
      const tool = tools.get(toolId);
      if (!tool) reasons.push(`unknown-tool:${node.id}:${toolId}`);
      else if (!tool.callableNow) reasons.push(`tool-not-callable:${node.id}:${toolId}:${tool.status}`);
    }
    const profiles = registry.profiles
      .filter(profile => callable.has(profile.id))
      .filter(profile => profile.taskClasses.includes(node.taskClass) || profile.taskClasses.includes('general'))
      .filter(profile => profile.roles.includes(node.role) || profile.roles.includes('general'));
    const workers = profiles.map(workerFor);
    const benchmarks = profiles.map(profile => benchmarkFor(profile, node.taskClass)).filter(Boolean);
    const routed = routePermittedWorkers({
      workers,
      benchmarks,
      taskClass: node.taskClass,
      enabled: true,
      allowUnbenchmarkedExploration: false,
      minimumEvidenceConfidence,
      explorationRate: 0,
      maxBenchmarkAgeDays,
      random: () => 0.999999,
      date
    });
    if (!routed.ok || !routed.selected) {
      reasons.push(...(routed.reasonCodes || [`no-fresh-evidence-backed-avenger:${node.id}`]).map(code => `${node.id}:${code}`));
      continue;
    }
    const byId = new Map(profiles.map(profile => [profile.id, profile]));
    const ordered = (routed.failoverOrder || [])
      .filter(item => item.evidenceStatus === 'EVIDENCE_BACKED')
      .map(item => byId.get(item.workerId))
      .filter(Boolean);
    const selectedProfile = byId.get(routed.selected.workerId);
    if (!selectedProfile) {
      reasons.push(`router-selected-profile-outside-callable-roster:${node.id}`);
      continue;
    }
    const primary = {
      profileId: selectedProfile.id,
      score: routed.selected.score ?? null,
      model: selectedProfile.model,
      runtime: selectedProfile.runtime,
      revision: selectedProfile.revision,
      evidenceStatus: routed.selected.evidenceStatus
    };
    const fallbacks = ordered
      .filter(profile => profile.id !== selectedProfile.id)
      .slice(0, Math.max(0, Number(maxFallbacks || 0)))
      .map(profile => ({
        profileId: profile.id,
        score: routed.failoverOrder.find(item => item.workerId === profile.id)?.score ?? null,
        model: profile.model,
        runtime: profile.runtime,
        revision: profile.revision,
        evidenceStatus: 'EVIDENCE_BACKED'
      }));
    assignments.push({
      nodeId: node.id,
      role: node.role,
      taskClass: node.taskClass,
      primary,
      fallbacks,
      toolIds: node.toolIds,
      routingMode: routed.mode,
      routerPolicyVersion: routed.policyVersion
    });
  }

  if (reasons.length || assignments.length !== preliminary.plan.mission.nodes.length) {
    return fail(reasons.length ? reasons : ['every-node-requires-evidence-backed-assignment'], { assignments });
  }

  const graph = {
    ...preliminary.plan.graph,
    nodes: preliminary.plan.graph.nodes.map(node => ({
      ...node,
      workerRequirement: `avenger:${assignments.find(item => item.nodeId === node.id).primary.profileId}`,
      callableWorkerVerified: true
    }))
  };
  const graphCheck = validateOrchestrationGraph(graph);
  if (!graphCheck.ok) return fail(graphCheck.reasonCodes, { assignments });

  const plan = {
    ...preliminary.plan,
    schemaVersion: AVENGERS_PLAN_SCHEMA,
    graph: graphCheck.graph,
    graphDigest: graphCheck.graphDigest,
    assignments,
    routing: {
      policy: 'CANONICAL_AGENT_MODEL_ROUTER',
      maximumBenchmarkAgeDays: Number(maxBenchmarkAgeDays),
      minimumEvidenceConfidence: Number(minimumEvidenceConfidence),
      unbenchmarkedExploration: false
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
  return {
    ok: true,
    policyVersion: AVENGERS_SQUAD_PLANNER_VERSION,
    status: 'AVENGERS_SQUAD_READY',
    plan,
    planDigest: digest(plan),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}
