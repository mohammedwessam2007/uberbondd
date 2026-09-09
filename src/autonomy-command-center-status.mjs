import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { summarizeAutonomySovereignReleasePhase } from './autonomy-sovereign-release-phase.mjs';

export const AUTONOMY_COMMAND_CENTER_STATUS_VERSION = 'uberbond.autonomy-command-center-status.v1.2';

const FILES = Object.freeze({
  selfMaintainer: 'artifacts/cognitive/self-maintainer-latest.json',
  selfMaintainerContinuation: 'artifacts/cognitive/self-maintainer-continuation.json',
  terminalRealization: 'artifacts/sovereign/terminal-realization.json',
  executionGraph: 'artifacts/sovereign/canonical-execution-leaf-graph.json',
  sovereignReleaseRequest: 'artifacts/sovereign/sovereign-release-request.json'
});

const CANONICAL_GRAPH_STATUS = 'ZERO_ORPHAN_CANONICAL_EXECUTION_LEAF_GRAPH_COMPILED';
const CANONICAL_TRIBUNAL_STATUS = 'FINITE_REALIZATION_TRIBUNAL_PASSED_WITH_SEPARATE_REALITY_BOUNDARIES';
const CANONICAL_FINITE_CLOSED = '100_PERCENT_OF_DECLARED_FINITE_ENGINEERING_SCOPE';

function scalar(value) {
  return ['string', 'number', 'boolean'].includes(typeof value) ? value : null;
}
function finiteInteger(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
function fixedPath(root, relativePath) {
  const base = path.resolve(root);
  const resolved = path.resolve(base, relativePath);
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) throw new Error('autonomy-status-path-escaped-root');
  return resolved;
}
async function readJson(root, relativePath) {
  try {
    const raw = await readFile(fixedPath(root, relativePath), 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { state: 'INVALID', data: null };
    return { state: 'AVAILABLE', data };
  } catch (error) {
    return { state: error?.code === 'ENOENT' ? 'UNAVAILABLE' : 'INVALID', data: null };
  }
}
function firstScalar(object, keys) {
  for (const key of keys) {
    const value = scalar(object?.[key]);
    if (value !== null) return value;
  }
  return null;
}
function firstInteger(object, keys) {
  for (const key of keys) {
    const value = finiteInteger(object?.[key]);
    if (value !== null) return value;
  }
  return null;
}
function timestamp(...documents) {
  for (const doc of documents) {
    const value = firstScalar(doc, ['generatedAt', 'verifiedAt', 'recordedAt', 'createdAt', 'updatedAt']);
    if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  }
  return null;
}
function graphSummary(graph) {
  const leaves = Array.isArray(graph?.leaves) ? graph.leaves : [];
  const counts = graph?.counts && typeof graph.counts === 'object' && !Array.isArray(graph.counts) ? graph.counts : {};
  const orphanRequirementIds = Array.isArray(graph?.orphanRequirementIds) ? graph.orphanRequirementIds : [];
  const floatingLeafIds = Array.isArray(graph?.floatingLeafIds) ? graph.floatingLeafIds : [];
  const dependencyCycles = Array.isArray(graph?.dependencyCycles) ? graph.dependencyCycles : [];
  return {
    status: scalar(graph?.status),
    graphDigest: scalar(graph?.graphDigest),
    leafCount: firstInteger(counts, ['leaves']) ?? firstInteger(graph, ['leafCount', 'totalLeaves']) ?? leaves.length,
    orphanRequirementCount: firstInteger(counts, ['orphanRequirements']) ?? firstInteger(graph, ['orphanRequirementCount']) ?? orphanRequirementIds.length,
    floatingLeafCount: firstInteger(counts, ['floatingLeaves']) ?? firstInteger(graph, ['floatingLeafCount']) ?? floatingLeafIds.length,
    dependencyCycleCount: firstInteger(counts, ['dependencyCycles']) ?? firstInteger(graph, ['dependencyCycleCount']) ?? dependencyCycles.length
  };
}
function terminalSummary(terminal) {
  const separated = terminal?.separatedStatus && typeof terminal.separatedStatus === 'object' && !Array.isArray(terminal.separatedStatus)
    ? terminal.separatedStatus
    : {};
  const finiteOpenRequirements = Array.isArray(terminal?.finiteOpenRequirements) ? terminal.finiteOpenRequirements.filter(value => typeof value === 'string').slice(0, 200) : [];
  return {
    ok: terminal?.ok === true,
    status: scalar(terminal?.status),
    finiteEngineeringClosure: scalar(separated.FINITE_ENGINEERING_CLOSURE) || scalar(terminal?.finiteEngineeringClosure) || 'NOT_MEASURED',
    namedRuntimeStatus: scalar(separated.NAMED_RUNTIME_STATUS) || scalar(separated.NAMED_RUNTIME) || scalar(terminal?.namedRuntimeStatus) || 'NOT_MEASURED',
    observedAutonomyStatus: scalar(separated.OBSERVED_AUTONOMY_STATUS) || scalar(separated.OBSERVED_AUTONOMY) || scalar(terminal?.observedAutonomyStatus) || 'NOT_MEASURED',
    externalCommercialStatus: scalar(separated.EXTERNAL_COMMERCIAL_STATUS) || scalar(separated.EXTERNAL_COMMERCIAL) || scalar(terminal?.externalCommercialStatus) || 'NOT_MEASURED',
    personalRealityStatus: scalar(separated.PERSONAL_REALITY_STATUS) || scalar(terminal?.personalRealityStatus) || 'NOT_MEASURED',
    asiEvidenceStatus: scalar(separated.ASI_EVIDENCE_STATUS) || scalar(separated.ASI_EVIDENCE) || scalar(terminal?.asiEvidenceStatus) || 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
    openEndedFrontierStatus: scalar(separated.OPEN_ENDED_FRONTIER_STATUS) || scalar(terminal?.openEndedFrontierStatus) || 'OPEN',
    finiteOpenRequirementCount: finiteOpenRequirements.length,
    finiteOpenRequirements,
    reasonCodes: Array.isArray(terminal?.reasonCodes) ? terminal.reasonCodes.slice(0, 24) : []
  };
}
function loopState({ maintainer, continuation, terminal, graph }) {
  const maintainerStatus = String(maintainer?.status || '').toUpperCase();
  const continuationStatus = String(continuation?.status || '').toUpperCase();
  const graphClean = graph.status === CANONICAL_GRAPH_STATUS
    && graph.leafCount > 0
    && graph.orphanRequirementCount === 0
    && graph.floatingLeafCount === 0
    && graph.dependencyCycleCount === 0;
  const finiteClosed = terminal.ok === true
    && terminal.status === CANONICAL_TRIBUNAL_STATUS
    && terminal.finiteEngineeringClosure === CANONICAL_FINITE_CLOSED
    && terminal.finiteOpenRequirementCount === 0;

  if (finiteClosed) return 'FINITE_ENGINEERING_CLOSED__REALITY_PROOF_REMAINS';
  if (/(QUEUED|WAITING|PROMOTED|REVIEW|CANDIDATE|REPAIR|STRATEGY_MUTATION)/.test(maintainerStatus)) return 'SELF_COMPLETION_LOOP_ACTIVE';
  if (/(RUN|RESUME|WAIT|STRATEGY_MUTATION|REVIEW)/.test(continuationStatus)) return 'SELF_COMPLETION_LOOP_ARMED';
  if (terminal.finiteOpenRequirementCount > 0) return 'FINITE_INTERNAL_WORK_REMAINS';
  if (graphClean && terminal.status) return 'FINITE_CLOSURE_TRIBUNAL_REQUIRED';
  return 'EXACT_CURRENT_TRUTH_OR_RUNTIME_EVIDENCE_REQUIRED';
}

export async function buildAutonomyCommandCenterStatus({ root = process.cwd(), now = new Date(), sourceCommit = null } = {}) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error('valid-now-required');

  const entries = await Promise.all(Object.entries(FILES).map(async ([id, relativePath]) => [id, relativePath, await readJson(root, relativePath)]));
  const documents = Object.fromEntries(entries.map(([id, , result]) => [id, result]));
  const maintainer = documents.selfMaintainer.data || {};
  const continuation = documents.selfMaintainerContinuation.data || {};
  const terminal = terminalSummary(documents.terminalRealization.data || {});
  const graph = graphSummary(documents.executionGraph.data || {});
  const release = summarizeAutonomySovereignReleasePhase({
    evidenceState: documents.sovereignReleaseRequest.state,
    request: documents.sovereignReleaseRequest.data,
    currentSourceCommit: sourceCommit,
    namedRuntimeStatus: terminal.namedRuntimeStatus
  });
  const state = loopState({ maintainer, continuation, terminal, graph });

  return {
    schemaVersion: AUTONOMY_COMMAND_CENTER_STATUS_VERSION,
    generatedAt: date.toISOString(),
    sourceCommit: scalar(sourceCommit),
    status: state,
    bootstrapAutonomy: {
      state,
      maintainerStatus: scalar(maintainer?.status) || 'UNAVAILABLE',
      continuationStatus: scalar(continuation?.status) || 'UNAVAILABLE',
      finiteEngineeringClosure: terminal.finiteEngineeringClosure,
      finiteOpenRequirementCount: terminal.finiteOpenRequirementCount,
      releasePhase: release.releasePhase,
      runtimePhase: release.runtimePhase,
      mergePolicy: 'INDEPENDENT_EXACT_HEAD_GOVERNOR',
      wakePolicy: 'EVIDENCE_TRIGGERED_PLUS_BOUNDED_PERIODIC_PULSE',
      selfCompletionClaim: 'NOT_ESTABLISHED_UNTIL_REPEATED_OBSERVED_CYCLES'
    },
    graph,
    terminal,
    sovereignRelease: release,
    evidence: Object.fromEntries(entries.map(([id, relativePath, result]) => [id, { path: relativePath, state: result.state }])),
    observedAt: timestamp(maintainer, continuation, documents.terminalRealization.data, documents.executionGraph.data, documents.sovereignReleaseRequest.data),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    truthBoundary: 'COMMAND CENTER OBSERVES AUTONOMY AND RELEASE-HANDOFF RECEIPTS. A RELEASE REQUEST IS NOT A SIGNED RELEASE OR A DEPLOYMENT. SOURCE READINESS NEVER BECOMES RUNTIME, CUSTOMER, PAYMENT, LIFE-OUTCOME OR ASI EVIDENCE.'
  };
}
