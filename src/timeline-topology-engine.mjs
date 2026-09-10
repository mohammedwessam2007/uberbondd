import crypto from 'node:crypto';

export const TIMELINE_TOPOLOGY_ENGINE_VERSION = 'uberbond.timeline-topology-engine.v1';

export const TIMELINE_BOUNDARY_CLASSES = Object.freeze([
  'COMPUTE',
  'INFORMATION_ARRIVAL',
  'NETWORK_PROPAGATION',
  'MATTER_TRANSFORMATION',
  'BIOLOGICAL_ADAPTATION',
  'EXTERNAL_ACTOR',
  'REGULATORY_PROCESS',
  'ELAPSED_EVIDENCE',
  'ARCHITECTURAL_CONVENTION',
  'COORDINATION_OVERHEAD',
  'REDUNDANT_WORK',
  'INTERFACE_FRICTION',
  'REPRESENTATION_LIMIT',
  'UNKNOWN'
]);

export const TIMELINE_NECESSITY_STATES = Object.freeze([
  'EVIDENCE_BOUND_CAUSAL_FLOOR',
  'REQUIRED_BUT_COMPRESSIBLE',
  'ASSUMPTION_ONLY',
  'UNKNOWN'
]);

export const WORMHOLE_MECHANISM_CLASSES = Object.freeze([
  'DELETE_REQUIREMENT',
  'SUBSTITUTE_TRANSFORMATION',
  'REPRESENTATION_ESCAPE',
  'PARALLELIZE_DEPENDENCIES',
  'PRECOMPUTE',
  'CACHE_OR_DISTILL',
  'REUSE_EXISTING_CAPABILITY',
  'PROXY_OBSERVABLE',
  'CHANGE_BOUNDARY_CONDITIONS',
  'INVENT_INTERMEDIATE',
  'OUTSOURCE_EXISTING_INFRASTRUCTURE',
  'MOVE_FUNCTION_TO_ENVIRONMENT'
]);

export const WORMHOLE_EVIDENCE_CLASSES = Object.freeze([
  'HYPOTHESIS',
  'SIMULATION',
  'EXECUTED_INTERNAL',
  'OBSERVED_REALITY'
]);

const ZERO_EXTERNAL_EFFECTS = Object.freeze({
  customerMessages: 0,
  providerCalls: 0,
  spendCents: 0,
  deployments: 0,
  dnsChanges: 0,
  credentialChanges: 0,
  paymentMutations: 0,
  productionMutations: 0
});

const text = (value, max = 2000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const list = (value, max = 2048, itemMax = 1000) => {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    const item = text(raw, itemMax);
    if (!item) return null;
    if (!seen.has(item)) { seen.add(item); out.push(item); }
  }
  return out;
};
const duration = value => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER ? n : null;
};
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const envelope = extra => ({
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE',
  externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
  ...extra
});
const fail = (status, reasonCodes, extra = {}) => envelope({
  ok: false,
  status,
  version: TIMELINE_TOPOLOGY_ENGINE_VERSION,
  reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
  ...extra
});

function normalizeNode(raw) {
  const id = text(raw?.id, 240)?.toLowerCase();
  const label = text(raw?.label, 1000);
  const durationMs = duration(raw?.durationMs);
  const requires = list(raw?.requires || [], 2048, 240)?.map(v => v.toLowerCase());
  const boundaryClass = text(raw?.boundaryClass, 80);
  const necessity = text(raw?.necessity, 80);
  const evidenceRefs = list(raw?.evidenceRefs || [], 256, 1000);
  if (!id || !label || durationMs === null || !requires || !TIMELINE_BOUNDARY_CLASSES.includes(boundaryClass)
    || !TIMELINE_NECESSITY_STATES.includes(necessity) || !evidenceRefs) return null;
  if (necessity === 'EVIDENCE_BOUND_CAUSAL_FLOOR' && evidenceRefs.length === 0) return null;
  return { id, label, durationMs, requires, boundaryClass, necessity, evidenceRefs };
}

function normalizeGraph({ objective, nodes, terminalIds } = {}) {
  const goal = text(objective, 4000);
  if (!goal || !Array.isArray(nodes) || nodes.length < 1 || nodes.length > 20_000) {
    return { ok: false, reasonCodes: ['bounded-objective-and-node-graph-required'] };
  }
  const normalized = nodes.map(normalizeNode);
  if (normalized.some(node => !node)) return { ok: false, reasonCodes: ['valid-timeline-nodes-required'] };
  const byId = new Map();
  for (const node of normalized) {
    if (byId.has(node.id)) return { ok: false, reasonCodes: ['unique-node-ids-required'], nodeId: node.id };
    byId.set(node.id, node);
  }
  for (const node of normalized) {
    const missing = node.requires.filter(dep => !byId.has(dep));
    if (missing.length) return { ok: false, reasonCodes: ['dependency-reference-missing'], nodeId: node.id, missing };
    if (node.requires.includes(node.id)) return { ok: false, reasonCodes: ['self-dependency-refused'], nodeId: node.id };
  }
  const terminals = list(terminalIds || [], 256, 240)?.map(v => v.toLowerCase());
  if (!terminals || terminals.length < 1) return { ok: false, reasonCodes: ['terminal-ids-required'] };
  const missingTerminals = terminals.filter(id => !byId.has(id));
  if (missingTerminals.length) return { ok: false, reasonCodes: ['terminal-id-missing'], missing: missingTerminals };

  const indegree = new Map(normalized.map(node => [node.id, node.requires.length]));
  const children = new Map(normalized.map(node => [node.id, []]));
  for (const node of normalized) for (const dep of node.requires) children.get(dep).push(node.id);
  const ready = normalized.filter(node => indegree.get(node.id) === 0).map(node => node.id).sort();
  const order = [];
  while (ready.length) {
    const id = ready.shift();
    order.push(id);
    for (const child of children.get(id).sort()) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) {
        ready.push(child);
        ready.sort();
      }
    }
  }
  if (order.length !== normalized.length) return { ok: false, reasonCodes: ['dependency-cycle-refused'] };

  const core = { objective: goal, nodes: normalized, terminalIds: terminals };
  return { ok: true, graph: { ...core, graphDigest: digest(core) }, order, byId, children };
}

function computeCriticalPath(normalized) {
  const { graph, order, byId } = normalized;
  const finish = new Map();
  const predecessor = new Map();
  for (const id of order) {
    const node = byId.get(id);
    let bestDep = null;
    let bestFinish = 0;
    for (const dep of [...node.requires].sort()) {
      const f = finish.get(dep) || 0;
      if (f > bestFinish || (f === bestFinish && bestDep !== null && dep < bestDep)) {
        bestFinish = f;
        bestDep = dep;
      }
    }
    finish.set(id, bestFinish + node.durationMs);
    predecessor.set(id, bestDep);
  }
  let terminal = graph.terminalIds[0];
  for (const id of graph.terminalIds.slice(1).sort()) {
    if ((finish.get(id) || 0) > (finish.get(terminal) || 0)) terminal = id;
  }
  const path = [];
  for (let id = terminal; id; id = predecessor.get(id)) path.push(id);
  path.reverse();
  return { terminalId: terminal, durationMs: finish.get(terminal) || 0, path, finish, predecessor };
}

function descendantCounts(normalized) {
  const counts = new Map();
  for (const node of normalized.graph.nodes) {
    const seen = new Set();
    const stack = [...normalized.children.get(node.id)];
    while (stack.length) {
      const id = stack.pop();
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...normalized.children.get(id));
    }
    counts.set(node.id, seen.size);
  }
  return counts;
}

function nodeAttackModes(node) {
  const modes = [];
  if (node.necessity !== 'EVIDENCE_BOUND_CAUSAL_FLOOR') {
    modes.push('DELETE_REQUIREMENT', 'SUBSTITUTE_TRANSFORMATION', 'PARALLELIZE_DEPENDENCIES');
  }
  if (['COMPUTE','REPRESENTATION_LIMIT','UNKNOWN'].includes(node.boundaryClass)) modes.push('REPRESENTATION_ESCAPE','PRECOMPUTE','CACHE_OR_DISTILL');
  if (['COORDINATION_OVERHEAD','REDUNDANT_WORK','INTERFACE_FRICTION','ARCHITECTURAL_CONVENTION'].includes(node.boundaryClass)) modes.push('REUSE_EXISTING_CAPABILITY','CHANGE_BOUNDARY_CONDITIONS');
  if (['MATTER_TRANSFORMATION','EXTERNAL_ACTOR','REGULATORY_PROCESS','NETWORK_PROPAGATION','INFORMATION_ARRIVAL'].includes(node.boundaryClass)) modes.push('OUTSOURCE_EXISTING_INFRASTRUCTURE','PROXY_OBSERVABLE');
  modes.push('INVENT_INTERMEDIATE','MOVE_FUNCTION_TO_ENVIRONMENT');
  return [...new Set(modes.filter(mode => WORMHOLE_MECHANISM_CLASSES.includes(mode)))];
}

export function analyzeTimelineTopology(input = {}) {
  const normalized = normalizeGraph(input);
  if (!normalized.ok) return fail('TIMELINE_TOPOLOGY_REFUSED', normalized.reasonCodes, normalized.nodeId ? { nodeId: normalized.nodeId, missing: normalized.missing } : normalized.missing ? { missing: normalized.missing } : {});
  const critical = computeCriticalPath(normalized);
  const counts = descendantCounts(normalized);
  const criticalSet = new Set(critical.path);
  const floorPath = critical.path.filter(id => normalized.byId.get(id).necessity === 'EVIDENCE_BOUND_CAUSAL_FLOOR');
  const declaredFloorMs = floorPath.reduce((sum, id) => sum + normalized.byId.get(id).durationMs, 0);
  const totalWorkMs = normalized.graph.nodes.reduce((sum, node) => sum + node.durationMs, 0);
  const attackTargets = normalized.graph.nodes
    .filter(node => criticalSet.has(node.id) && node.durationMs > 0)
    .map(node => ({
      id: node.id,
      label: node.label,
      durationMs: node.durationMs,
      boundaryClass: node.boundaryClass,
      necessity: node.necessity,
      descendantsUnlocked: counts.get(node.id) || 0,
      attackPriority: node.necessity === 'EVIDENCE_BOUND_CAUSAL_FLOOR' ? 0 : node.durationMs * (1 + (counts.get(node.id) || 0)),
      attackModes: nodeAttackModes(node),
      question: node.necessity === 'EVIDENCE_BOUND_CAUSAL_FLOOR'
        ? 'WHAT_EVIDENCE_WOULD_FALSIFY_THIS_DECLARED_CAUSAL_FLOOR_WITHOUT_CHANGING_THE_TERMINAL_CONTRACT'
        : 'WHAT_ROUTE_MAKES_THIS_TRANSFORMATION_OR_ITS_WAIT_DISAPPEAR_RATHER_THAN_MERELY_RUN_FASTER'
    }))
    .sort((a, b) => b.attackPriority - a.attackPriority || b.durationMs - a.durationMs || a.id.localeCompare(b.id));

  return envelope({
    ok: true,
    status: 'TIMELINE_TOPOLOGY_ANALYZED',
    version: TIMELINE_TOPOLOGY_ENGINE_VERSION,
    objective: normalized.graph.objective,
    graphDigest: normalized.graph.graphDigest,
    terminalIds: normalized.graph.terminalIds,
    nodeCount: normalized.graph.nodes.length,
    criticalPathNodeIds: critical.path,
    criticalPathDurationMs: critical.durationMs,
    declaredEvidenceBoundFloorMs: declaredFloorMs,
    attackableCriticalPathMs: critical.durationMs - declaredFloorMs,
    totalWorkMs,
    parallelismPotentialRatio: critical.durationMs > 0 ? Number((totalWorkMs / critical.durationMs).toFixed(6)) : 1,
    attackTargets,
    law: 'DO_NOT_OPTIMIZE_THE_ROUTE_UNTIL_YOU_HAVE_TRIED_TO_DELETE_OR_RETOPOLOGIZE_THE_ROUTE',
    floorBoundary: 'EVIDENCE_BOUND_CAUSAL_FLOOR_IS_A_BOUND_WITHIN_THE_DECLARED_GRAPH_AND_CURRENT_EVIDENCE__NOT_UNIVERSAL_PROOF_OF_PHYSICAL_IMPOSSIBILITY',
    terminalBoundary: 'THE_TERMINAL_CONTRACT_MUST_SURVIVE_TOPOLOGY_COMPRESSION__CHANGING_THE_GOAL_IS_NOT_A_WORMHOLE'
  });
}

function graphNodeMap(graph) {
  return new Map(graph.nodes.map(node => [node.id, node]));
}

export function evaluateWormholeCandidate({ baseline = null, candidate = null } = {}) {
  if (!baseline?.ok || baseline.status !== 'TIMELINE_TOPOLOGY_ANALYZED' || !baseline.graphDigest) {
    return fail('WORMHOLE_CANDIDATE_REFUSED', ['valid-baseline-analysis-required']);
  }
  const name = text(candidate?.name, 500);
  const mechanismClass = text(candidate?.mechanismClass, 100);
  const evidenceClass = text(candidate?.evidenceClass, 80);
  const evidenceRefs = list(candidate?.evidenceRefs || [], 256, 1000);
  const transformations = Array.isArray(candidate?.transformations) ? candidate.transformations : null;
  const baseDigest = text(candidate?.baseGraphDigest, 128);
  if (!name || !WORMHOLE_MECHANISM_CLASSES.includes(mechanismClass) || !WORMHOLE_EVIDENCE_CLASSES.includes(evidenceClass)
    || !evidenceRefs || !transformations || transformations.length < 1 || transformations.length > 512 || baseDigest !== baseline.graphDigest) {
    return fail('WORMHOLE_CANDIDATE_REFUSED', ['bounded-candidate-bound-to-exact-baseline-required']);
  }
  const projected = normalizeGraph(candidate?.projectedGraph || {});
  if (!projected.ok) return fail('WORMHOLE_CANDIDATE_REFUSED', ['valid-projected-graph-required', ...projected.reasonCodes]);
  if (projected.graph.objective !== baseline.objective) return fail('WORMHOLE_CANDIDATE_REFUSED', ['terminal-objective-mutation-refused']);
  if (JSON.stringify([...projected.graph.terminalIds].sort()) !== JSON.stringify([...baseline.terminalIds].sort())) {
    return fail('WORMHOLE_CANDIDATE_REFUSED', ['terminal-id-mutation-refused']);
  }

  const transformationEvidence = new Map();
  const boundaryRebuttals = new Map();
  for (const raw of transformations) {
    const targetId = text(raw?.targetId, 240)?.toLowerCase();
    const kind = text(raw?.kind, 100);
    const refs = list(raw?.evidenceRefs || [], 64, 1000);
    const rebuttal = list(raw?.causalBoundaryRebuttalRefs || [], 64, 1000);
    if (!targetId || !WORMHOLE_MECHANISM_CLASSES.includes(kind) || !refs || refs.length === 0 || !rebuttal) {
      return fail('WORMHOLE_CANDIDATE_REFUSED', ['every-topology-transformation-requires-evidence']);
    }
    transformationEvidence.set(targetId, true);
    if (rebuttal.length) boundaryRebuttals.set(targetId, rebuttal);
  }

  const baselineGraph = candidate?.baselineGraph ? normalizeGraph(candidate.baselineGraph) : null;
  if (!baselineGraph?.ok || baselineGraph.graph.graphDigest !== baseline.graphDigest) {
    return fail('WORMHOLE_CANDIDATE_REFUSED', ['baseline-graph-body-must-match-analysis-digest']);
  }
  const beforeMap = graphNodeMap(baselineGraph.graph);
  const afterMap = graphNodeMap(projected.graph);
  const changedIds = [];
  for (const [id, before] of beforeMap) {
    const after = afterMap.get(id);
    const changed = !after
      || after.durationMs !== before.durationMs
      || JSON.stringify([...after.requires].sort()) !== JSON.stringify([...before.requires].sort())
      || after.boundaryClass !== before.boundaryClass
      || after.necessity !== before.necessity;
    if (!changed) continue;
    changedIds.push(id);
    if (!transformationEvidence.has(id)) return fail('WORMHOLE_CANDIDATE_REFUSED', [`unexplained-topology-change:${id}`]);
    if (before.necessity === 'EVIDENCE_BOUND_CAUSAL_FLOOR' && !boundaryRebuttals.has(id)) {
      return fail('WORMHOLE_CANDIDATE_REFUSED', [`evidence-bound-causal-floor-mutation-without-rebuttal:${id}`]);
    }
  }
  for (const id of afterMap.keys()) {
    if (!beforeMap.has(id) && !transformationEvidence.has(id)) return fail('WORMHOLE_CANDIDATE_REFUSED', [`unexplained-topology-addition:${id}`]);
  }

  const projectedAnalysis = analyzeTimelineTopology(candidate.projectedGraph);
  if (!projectedAnalysis.ok) return projectedAnalysis;
  const savingsMs = baseline.criticalPathDurationMs - projectedAnalysis.criticalPathDurationMs;
  if (!(savingsMs > 0)) return fail('WORMHOLE_CANDIDATE_REFUSED', ['candidate-must-reduce-critical-path']);
  const independent = candidate?.independentlyVerified === true;
  if (['EXECUTED_INTERNAL','OBSERVED_REALITY'].includes(evidenceClass) && (!independent || evidenceRefs.length === 0)) {
    return fail('WORMHOLE_CANDIDATE_REFUSED', ['executed-or-observed-compression-requires-independent-evidence']);
  }

  return envelope({
    ok: true,
    status: evidenceClass === 'OBSERVED_REALITY'
      ? 'WORMHOLE_REALITY_EVIDENCE_CANDIDATE'
      : evidenceClass === 'EXECUTED_INTERNAL'
        ? 'WORMHOLE_INTERNAL_EVIDENCE_CANDIDATE'
        : 'WORMHOLE_HYPOTHESIS_ONLY',
    version: TIMELINE_TOPOLOGY_ENGINE_VERSION,
    name,
    mechanismClass,
    evidenceClass,
    evidenceRefs,
    independentlyVerified: independent,
    baseGraphDigest: baseline.graphDigest,
    projectedGraphDigest: projectedAnalysis.graphDigest,
    changedNodeIds: [...new Set(changedIds)].sort(),
    criticalPathBeforeMs: baseline.criticalPathDurationMs,
    criticalPathAfterMs: projectedAnalysis.criticalPathDurationMs,
    criticalPathSavingsMs: savingsMs,
    compressionRatio: projectedAnalysis.criticalPathDurationMs > 0
      ? Number((baseline.criticalPathDurationMs / projectedAnalysis.criticalPathDurationMs).toFixed(6))
      : null,
    projectedCriticalPathNodeIds: projectedAnalysis.criticalPathNodeIds,
    remainingDeclaredEvidenceBoundFloorMs: projectedAnalysis.declaredEvidenceBoundFloorMs,
    promotionBoundary: 'A_WORMHOLE_CANDIDATE_MAY_CHANGE_THE_SEARCH_OR_ENGINEERING_PLAN_BUT_DOES_NOT_BY_ITSELF_PROVE_COMPLETION_OR_GRANT_EFFECT_AUTHORITY',
    realityBoundary: evidenceClass === 'OBSERVED_REALITY'
      ? 'OBSERVED_REALITY_SUPPORTS_ONLY_THE_MEASURED_ROUTE_AND_CONDITIONS'
      : 'SOURCE_SIMULATION_OR_INTERNAL_EXECUTION_DOES_NOT_PROVE_PHYSICAL_BIOLOGICAL_EXTERNAL_OR_LONGITUDINAL_SPEEDUP'
  });
}

export function buildTimelineCannibalismPacket({ analysis = null, maxTargets = 12 } = {}) {
  const n = Number(maxTargets);
  if (!analysis?.ok || analysis.status !== 'TIMELINE_TOPOLOGY_ANALYZED' || !Number.isInteger(n) || n < 1 || n > 64) {
    return fail('TIMELINE_CANNIBALISM_REFUSED', ['valid-analysis-and-target-limit-required']);
  }
  const selected = analysis.attackTargets.slice(0, n);
  return envelope({
    ok: true,
    status: selected.length ? 'TIMELINE_CANNIBALISM_READY' : 'DECLARED_CRITICAL_PATH_IS_EVIDENCE_BOUND_OR_ZERO_DURATION',
    version: TIMELINE_TOPOLOGY_ENGINE_VERSION,
    graphDigest: analysis.graphDigest,
    criticalPathDurationMs: analysis.criticalPathDurationMs,
    declaredEvidenceBoundFloorMs: analysis.declaredEvidenceBoundFloorMs,
    selectedTargets: selected,
    searchOrders: [
      'DELETE_THE_STEP_BEFORE_OPTIMIZING_THE_STEP',
      'ASK_WHETHER_THE_TERMINAL_FUNCTION_CAN_BE_REPRESENTED_DIFFERENTLY',
      'START_ALL_CAUSALLY_INDEPENDENT_WORK_NOW',
      'PRECOMPUTE_BRANCHES_BEFORE_INFORMATION_ARRIVES',
      'REUSE_OR_RENT_EXISTING_CAPABILITY_BEFORE_BUILDING_INFRASTRUCTURE',
      'SEARCH_FOR_PROXY_OBSERVABLES_THAT_COLLAPSE_WAITING_WITHOUT_LAUNDERING_EVIDENCE',
      'CHANGE_BOUNDARY_CONDITIONS_SO_THE_OBSTACLE_STOPS_EXISTING',
      'INVENT_A_NEW_INTERMEDIATE_IF_CURRENT_ONTOLOGY_FORCES_THE_LONG_ROUTE',
      'REJECT_ANY_DURATION_JUSTIFIED_ONLY_BY_HOW_LONG_HUMANS_NORMALLY_TAKE',
      'STOP_ONLY_AT_A_CURRENTLY_EVIDENCE_BOUND_CAUSAL_FLOOR'
    ],
    handoff: 'FEED_THE_STRONGEST_FALSIFIABLE_TOPOLOGY_CHANGE_INTO_WALLBREAKER_OR_SANDWICH__DO_NOT_SELF_ATTEST_THE_SHORTCUT'
  });
}
