import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const AUTONOMY_COMMAND_CENTER_STATUS_VERSION = 'uberbond.autonomy-command-center-status.v1';

const FILES = Object.freeze({
  selfMaintainer: 'artifacts/cognitive/self-maintainer-latest.json',
  selfMaintainerContinuation: 'artifacts/cognitive/self-maintainer-continuation.json',
  terminalRealization: 'artifacts/sovereign/terminal-realization.json',
  executionGraph: 'artifacts/sovereign/canonical-execution-leaf-graph.json'
});

function scalar(value) {
  return ['string', 'number', 'boolean'].includes(typeof value) ? value : null;
}
function count(value) {
  return Array.isArray(value) ? value.length : null;
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
function timestamp(...documents) {
  for (const doc of documents) {
    const value = firstScalar(doc, ['generatedAt', 'verifiedAt', 'recordedAt', 'createdAt', 'updatedAt']);
    if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  }
  return null;
}
function graphSummary(graph) {
  const leaves = Array.isArray(graph?.leaves) ? graph.leaves : [];
  const orphanRequirementIds = Array.isArray(graph?.orphanRequirementIds) ? graph.orphanRequirementIds : [];
  const floatingLeafIds = Array.isArray(graph?.floatingLeafIds) ? graph.floatingLeafIds : [];
  const dependencyCycles = Array.isArray(graph?.dependencyCycles) ? graph.dependencyCycles : [];
  return {
    status: scalar(graph?.status),
    graphDigest: scalar(graph?.graphDigest),
    leafCount: firstScalar(graph, ['leafCount', 'totalLeaves']) ?? leaves.length,
    orphanRequirementCount: firstScalar(graph, ['orphanRequirementCount']) ?? orphanRequirementIds.length,
    floatingLeafCount: firstScalar(graph, ['floatingLeafCount']) ?? floatingLeafIds.length,
    dependencyCycleCount: firstScalar(graph, ['dependencyCycleCount']) ?? dependencyCycles.length
  };
}
function terminalSummary(terminal) {
  return {
    ok: terminal?.ok === true,
    status: scalar(terminal?.status),
    finiteEngineeringClosure: scalar(terminal?.separatedStatus?.FINITE_ENGINEERING_CLOSURE) || scalar(terminal?.finiteEngineeringClosure) || 'NOT_MEASURED',
    namedRuntimeStatus: scalar(terminal?.separatedStatus?.NAMED_RUNTIME) || scalar(terminal?.namedRuntimeStatus) || 'NOT_MEASURED',
    observedAutonomyStatus: scalar(terminal?.separatedStatus?.OBSERVED_AUTONOMY) || scalar(terminal?.observedAutonomyStatus) || 'NOT_MEASURED',
    externalCommercialStatus: scalar(terminal?.separatedStatus?.EXTERNAL_COMMERCIAL) || scalar(terminal?.externalCommercialStatus) || 'NOT_MEASURED',
    asiEvidenceStatus: scalar(terminal?.separatedStatus?.ASI_EVIDENCE) || scalar(terminal?.asiEvidenceStatus) || 'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',
    reasonCodes: Array.isArray(terminal?.reasonCodes) ? terminal.reasonCodes.slice(0, 24) : []
  };
}
function loopState({ maintainer, continuation, terminal, graph }) {
  const maintainerStatus = String(maintainer?.status || '').toUpperCase();
  const continuationStatus = String(continuation?.status || '').toUpperCase();
  const finite = String(terminal.finiteEngineeringClosure || '').toUpperCase();
  const graphClean = graph.orphanRequirementCount === 0 && graph.floatingLeafCount === 0 && graph.dependencyCycleCount === 0;

  if (finite.includes('CLOSED') || finite.includes('COMPLETE')) return 'FINITE_ENGINEERING_CLOSED__REALITY_PROOF_REMAINS';
  if (/(QUEUED|WAITING|PROMOTED|REVIEW|CANDIDATE|REPAIR|STRATEGY_MUTATION)/.test(maintainerStatus)) return 'SELF_COMPLETION_LOOP_ACTIVE';
  if (/(RUN|RESUME|WAIT|STRATEGY_MUTATION|REVIEW)/.test(continuationStatus)) return 'SELF_COMPLETION_LOOP_ARMED';
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
      mergePolicy: 'INDEPENDENT_EXACT_HEAD_GOVERNOR',
      wakePolicy: 'EVIDENCE_TRIGGERED_PLUS_BOUNDED_PERIODIC_PULSE',
      selfCompletionClaim: 'NOT_ESTABLISHED_UNTIL_REPEATED_OBSERVED_CYCLES'
    },
    graph,
    terminal,
    evidence: Object.fromEntries(entries.map(([id, relativePath, result]) => [id, { path: relativePath, state: result.state }])),
    observedAt: timestamp(maintainer, continuation, documents.terminalRealization.data, documents.executionGraph.data),
    businessEffectAuthority: 'NONE',
    externalEffectAuthority: 'NONE',
    truthBoundary: 'COMMAND_CENTER OBSERVES AUTONOMY RECEIPTS. IT DOES NOT TURN SOURCE READINESS INTO RUNTIME, CUSTOMER, PAYMENT, LIFE-OUTCOME OR ASI EVIDENCE.'
  };
}
