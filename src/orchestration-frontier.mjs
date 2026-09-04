import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const ORCHESTRATION_FRONTIER_VERSION = 'uberbond.orchestration-frontier-1.0.0';

export const ORCHESTRATION_REFERENCE_PACK = Object.freeze([
  Object.freeze({
    id: 'fable-orchestrator',
    name: 'Fable Orchestrator',
    upstream: 'codejunkie99/fable-orchestrator',
    sourceRef: '3b653701d48095a488c350f7a9d5b1fca4d37183',
    license: 'MIT',
    role: 'planner-adjudicator split and bounded task graph baseline'
  }),
  Object.freeze({
    id: 'metaswarm',
    name: 'Metaswarm',
    upstream: 'dsifry/metaswarm',
    sourceRef: '33d39f776f7fe29098dcf048955756a237e8cb40',
    license: 'MIT',
    role: 'recursive orchestration, adversarial review, durable task state and knowledge priming donor'
  }),
  Object.freeze({
    id: 'superpowers',
    name: 'Superpowers',
    upstream: 'obra/superpowers',
    sourceRef: 'b36e0829c6d0140e93cfef2ca599b1b07d4a7797',
    license: 'MIT',
    role: 'TDD, systematic debugging, behavioral verification and subagent workflow donor'
  })
]);

const MODES = new Set(['DIRECT', 'FABLE_GRAPH', 'SWARM', 'RECURSIVE_SWARM']);
const SAFE_DATA_CLASSES = new Set(['PUBLIC', 'INTERNAL_NON_SECRET', 'SOURCE_CODE']);
const SENSITIVE_DATA_CLASSES = new Set(['SECRET', 'CREDENTIAL', 'AUTH_COOKIE', 'PRIVATE_CUSTOMER_RAW', 'PAYMENT_RAW']);
const AUTHORITY_RANK = Object.freeze({ NONE: 0, LOCAL_PREPARATION: 1, SECURITY_TEST_ONLY: 1 });
const ALLOWED_LICENSES = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'CC-BY-4.0']);

const SCORE_WEIGHTS = Object.freeze({
  plannerWorkerSeparation: 11,
  boundedDag: 11,
  callableWorkerValidation: 9,
  ownershipDiscipline: 8,
  safeParallelism: 8,
  independentVerification: 11,
  adversarialReview: 7,
  durableState: 6,
  contextRecovery: 5,
  providerNeutrality: 5,
  authorityPreservation: 8,
  secretBoundary: 5,
  replaceability: 3,
  founderMinuteLeverage: 3
});

function clone(value) {
  return structuredClone(value);
}

function boundedText(value, max = 1000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}

function boundedList(value, max = 64, itemMax = 300) {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const normalized = boundedText(item, itemMax);
    if (!normalized) return null;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

function envelope(extra = {}) {
  return {
    policyVersion: ORCHESTRATION_FRONTIER_VERSION,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function authorityAllows(parent, child) {
  const p = AUTHORITY_RANK[parent];
  const c = AUTHORITY_RANK[child];
  return Number.isInteger(p) && Number.isInteger(c) && c <= p;
}

function normalizeNode(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: `invalid-node:${index}` };
  const id = boundedText(raw.id, 120)?.toLowerCase();
  const purpose = boundedText(raw.purpose, 1200);
  const dependencies = boundedList(raw.dependencies ?? [], 64, 120);
  const workerRequirement = boundedText(raw.workerRequirement, 300);
  const ownedFilesOrResponsibility = boundedList(raw.ownedFilesOrResponsibility ?? [], 128, 500);
  const inputs = boundedList(raw.inputs ?? [], 128, 1000);
  const expectedOutput = boundedText(raw.expectedOutput, 1200);
  const verification = boundedList(raw.verification ?? [], 64, 1000);
  const stopCondition = boundedText(raw.stopCondition, 1000);
  const authorityCeiling = boundedText(raw.authorityCeiling ?? 'NONE', 80)?.toUpperCase();
  const implementation = raw.implementation !== false;
  const callableWorkerVerified = raw.callableWorkerVerified === true;

  const reasons = [];
  if (!id || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) reasons.push(`invalid-node-id:${index}`);
  if (!purpose) reasons.push(`purpose-required:${id ?? index}`);
  if (!dependencies) reasons.push(`dependencies-invalid:${id ?? index}`);
  if (!workerRequirement) reasons.push(`worker-requirement-required:${id ?? index}`);
  if (!ownedFilesOrResponsibility || ownedFilesOrResponsibility.length === 0) reasons.push(`ownership-required:${id ?? index}`);
  if (!inputs) reasons.push(`inputs-invalid:${id ?? index}`);
  if (!expectedOutput) reasons.push(`expected-output-required:${id ?? index}`);
  if (!verification || verification.length === 0) reasons.push(`verification-required:${id ?? index}`);
  if (!stopCondition) reasons.push(`stop-condition-required:${id ?? index}`);
  if (!(authorityCeiling in AUTHORITY_RANK)) reasons.push(`recognized-authority-required:${id ?? index}`);
  if (implementation && !callableWorkerVerified) reasons.push(`callable-worker-must-be-verified:${id ?? index}`);

  if (reasons.length) return { ok: false, reasons };
  return {
    ok: true,
    node: {
      id,
      purpose,
      dependencies: dependencies.map(item => item.toLowerCase()),
      workerRequirement,
      ownedFilesOrResponsibility,
      inputs,
      expectedOutput,
      verification,
      stopCondition,
      authorityCeiling,
      implementation,
      callableWorkerVerified
    }
  };
}

function findCycle(nodesById) {
  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function visit(id) {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      return [...stack.slice(start), id];
    }
    if (visited.has(id)) return null;
    visiting.add(id);
    stack.push(id);
    for (const dep of nodesById.get(id).dependencies) {
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  }

  for (const id of nodesById.keys()) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return null;
}

export function validateOrchestrationGraph(graph = {}) {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    return envelope({ ok: false, status: 'ORCHESTRATION_GRAPH_INVALID', reasonCodes: ['graph-object-required'] });
  }

  const mode = boundedText(graph.mode, 40)?.toUpperCase();
  const parentAuthority = boundedText(graph.parentAuthority ?? 'NONE', 80)?.toUpperCase();
  const dataClass = boundedText(graph.dataClass ?? 'INTERNAL_NON_SECRET', 80)?.toUpperCase();
  const maxDepth = Number(graph.maxDepth ?? 1);
  const maxIterations = Number(graph.maxIterations ?? 3);
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : null;
  const reasonCodes = [];

  if (!mode || !MODES.has(mode)) reasonCodes.push('recognized-mode-required');
  if (!(parentAuthority in AUTHORITY_RANK)) reasonCodes.push('recognized-parent-authority-required');
  if (SENSITIVE_DATA_CLASSES.has(dataClass)) reasonCodes.push('sensitive-data-not-approved-for-orchestration-packet');
  else if (!SAFE_DATA_CLASSES.has(dataClass)) reasonCodes.push('recognized-data-class-required');
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > 4) reasonCodes.push('bounded-max-depth-required');
  if (!Number.isSafeInteger(maxIterations) || maxIterations < 1 || maxIterations > 8) reasonCodes.push('bounded-max-iterations-required');
  if (!nodes || nodes.length === 0 || nodes.length > 64) reasonCodes.push('bounded-nodes-required');
  if (mode === 'DIRECT' && nodes?.length !== 1) reasonCodes.push('direct-mode-requires-one-node');
  if (mode !== 'RECURSIVE_SWARM' && maxDepth > 1) reasonCodes.push('recursive-depth-requires-recursive-swarm');

  const normalized = [];
  const ids = new Set();
  if (nodes) {
    for (let i = 0; i < nodes.length; i += 1) {
      const result = normalizeNode(nodes[i], i);
      if (!result.ok) {
        reasonCodes.push(...(result.reasons ?? [result.reason]));
        continue;
      }
      if (ids.has(result.node.id)) reasonCodes.push(`duplicate-node-id:${result.node.id}`);
      ids.add(result.node.id);
      if (!authorityAllows(parentAuthority, result.node.authorityCeiling)) reasonCodes.push(`child-authority-widens-parent:${result.node.id}`);
      normalized.push(result.node);
    }
  }

  const nodesById = new Map(normalized.map(node => [node.id, node]));
  for (const node of normalized) {
    for (const dep of node.dependencies) {
      if (!nodesById.has(dep)) reasonCodes.push(`unknown-dependency:${node.id}:${dep}`);
      if (dep === node.id) reasonCodes.push(`self-dependency:${node.id}`);
    }
  }

  if (!reasonCodes.length) {
    const cycle = findCycle(nodesById);
    if (cycle) reasonCodes.push(`dependency-cycle:${cycle.join('>')}`);
  }

  if (reasonCodes.length) {
    return envelope({
      ok: false,
      status: 'ORCHESTRATION_GRAPH_INVALID',
      reasonCodes: [...new Set(reasonCodes)],
      normalizedNodes: normalized
    });
  }

  const identity = {
    mode,
    parentAuthority,
    dataClass,
    maxDepth,
    maxIterations,
    nodes: normalized
  };

  return envelope({
    ok: true,
    status: 'ORCHESTRATION_GRAPH_READY',
    graph: identity,
    graphDigest: digest(identity),
    runtimeValidationRequired: true,
    commercialTruthAuthority: 'NONE'
  });
}

export function readyOrchestrationNodes(graph = {}, completedNodeIds = []) {
  const validated = validateOrchestrationGraph(graph);
  if (!validated.ok) return validated;
  const completed = new Set((Array.isArray(completedNodeIds) ? completedNodeIds : []).map(item => String(item).toLowerCase()));
  const known = new Set(validated.graph.nodes.map(node => node.id));
  for (const id of completed) {
    if (!known.has(id)) {
      return envelope({ ok: false, status: 'ORCHESTRATION_PROGRESS_INVALID', reasonCodes: [`unknown-completed-node:${id}`] });
    }
  }
  const ready = validated.graph.nodes.filter(node => !completed.has(node.id) && node.dependencies.every(dep => completed.has(dep)));
  return envelope({
    ok: true,
    status: ready.length ? 'ORCHESTRATION_NODES_READY' : (completed.size === known.size ? 'ORCHESTRATION_COMPLETE' : 'ORCHESTRATION_WAITING'),
    readyNodes: ready,
    completedNodeIds: [...completed],
    remainingNodeCount: known.size - completed.size,
    parallelDispatchAllowed: validated.graph.mode !== 'DIRECT' && ready.length > 1
  });
}

function normalizeCandidate(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = boundedText(raw.id, 120)?.toLowerCase();
  const name = boundedText(raw.name, 200);
  const upstream = boundedText(raw.upstream, 300);
  const sourceRef = boundedText(raw.sourceRef, 80)?.toLowerCase();
  const license = boundedText(raw.license, 120);
  if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id) || !name || !upstream || !sourceRef || !/^[a-f0-9]{40}$/.test(sourceRef) || !license) return null;

  const dimensions = {};
  for (const key of Object.keys(SCORE_WEIGHTS)) {
    const value = Number(raw[key]);
    if (!Number.isFinite(value) || value < 0 || value > 100) return null;
    dimensions[key] = value;
  }

  return {
    id,
    name,
    upstream,
    sourceRef,
    license,
    dimensions,
    runtimeRequired: raw.runtimeRequired === true,
    unboundedRecursion: raw.unboundedRecursion === true,
    silentCredentialAccess: raw.silentCredentialAccess === true,
    authorityExpansion: raw.authorityExpansion === true,
    notes: boundedList(raw.notes ?? [], 64, 1000) ?? []
  };
}

export function scoreOrchestrationCandidate(raw = {}) {
  const candidate = normalizeCandidate(raw);
  if (!candidate) return envelope({ ok: false, status: 'ORCHESTRATION_CANDIDATE_INVALID', reasonCodes: ['valid-candidate-contract-required'] });

  const hardReject = [];
  if (!ALLOWED_LICENSES.has(candidate.license)) hardReject.push('license-not-preapproved-for-automatic-composition');
  if (candidate.unboundedRecursion) hardReject.push('unbounded-recursion-prohibited');
  if (candidate.silentCredentialAccess) hardReject.push('silent-credential-access-prohibited');
  if (candidate.authorityExpansion) hardReject.push('orchestrator-authority-expansion-prohibited');

  const weighted = Object.entries(SCORE_WEIGHTS).reduce((sum, [key, weight]) => sum + candidate.dimensions[key] * weight, 0);
  const weightTotal = Object.values(SCORE_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  const score = Number((weighted / weightTotal).toFixed(2));

  return envelope({
    ok: hardReject.length === 0,
    status: hardReject.length ? 'ORCHESTRATION_CANDIDATE_REJECTED' : 'ORCHESTRATION_CANDIDATE_SCORED',
    reasonCodes: hardReject,
    candidate,
    score,
    scoreWeights: clone(SCORE_WEIGHTS)
  });
}

export function buildOrchestrationFrontierTournament({ candidates = [], currentBaselineId = 'fable-orchestrator' } = {}) {
  if (!Array.isArray(candidates) || candidates.length > 256) {
    return envelope({ ok: false, status: 'ORCHESTRATION_TOURNAMENT_INVALID', reasonCodes: ['bounded-candidate-list-required'] });
  }
  const scored = [];
  const rejected = [];
  for (const raw of candidates) {
    const result = scoreOrchestrationCandidate(raw);
    if (!result.ok) {
      rejected.push({ id: raw?.id ?? null, reasonCodes: result.reasonCodes ?? ['invalid-candidate'] });
      continue;
    }
    scored.push({ ...result.candidate, score: result.score });
  }
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const baseline = scored.find(item => item.id === currentBaselineId) ?? null;
  const champion = scored[0] ?? null;
  let decision = 'NO_ELIGIBLE_CANDIDATE';
  if (champion) {
    if (!baseline) decision = 'RESEARCH_CHAMPION_AGAINST_MISSING_BASELINE';
    else if (champion.id === baseline.id) decision = 'KEEP_CURRENT_BASELINE';
    else if (champion.score >= baseline.score + 8) decision = 'PROMOTION_CANDIDATE';
    else if (champion.score > baseline.score) decision = 'COMPOSE_CHALLENGER_MECHANISMS';
    else decision = 'KEEP_CURRENT_BASELINE';
  }
  return envelope({
    ok: true,
    status: 'ORCHESTRATION_TOURNAMENT_READY',
    baseline,
    champion,
    ranked: scored,
    rejected,
    decision,
    promotionAuthority: 'RESEARCH_AND_PROPOSAL_ONLY',
    requiredPromotionEvidence: [
      'provenance-license-security-review',
      'bounded-sandbox-behavioral-tests',
      'held-out-task-comparison',
      'provider-model-identity-observable',
      'no-authority-expansion',
      'founder-minute-or-economic-benefit'
    ]
  });
}

export function buildOrchestratorDiscoveryPlan() {
  return envelope({
    ok: true,
    status: 'ORCHESTRATION_DISCOVERY_PLAN_READY',
    cadenceMinutes: 120,
    sources: ['GAMECHANGER_MESH', 'FIND_SKILLS', 'PUBLIC_GITHUB', 'OFFICIAL_PLUGIN_MARKETPLACES', 'CAPABILITY_GENOME'],
    searchThemes: [
      'agent orchestration DAG planner worker verification',
      'Claude Code multi agent orchestration skill subagents worktrees',
      'Codex multi agent orchestration skill planner verifier',
      'recursive swarm agent orchestration adversarial review',
      'agent task graph durable state context recovery',
      'TDD systematic debugging verification coding agent skills',
      'cross model review coding agents provider neutral orchestration'
    ],
    referencePack: clone(ORCHESTRATION_REFERENCE_PACK),
    decisionStates: ['REJECT', 'WATCH', 'REFERENCE_DONOR', 'COMPOSE_MECHANISMS', 'PROJECT_SKILL_CANDIDATE', 'OPTIONAL_RUNTIME_CANDIDATE', 'PROMOTION_CANDIDATE'],
    installationAuthority: 'NONE',
    promotionAuthority: 'NONE'
  });
}
