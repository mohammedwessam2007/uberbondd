import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { containsSecretValue, redactSecrets } from './secret-patterns.mjs';
import { normalizeCapabilityAtom } from './capability-genome-schema.mjs';

export const CONTINUATION_GRAPH_SCHEMA = 'uberbond.continuation-graph.v1';
export const CONTINUATION_GRAPH_POLICY_VERSION = 'continuation-graph-runtime-1.0.0';

const NODE_ID = /^[a-z0-9][a-z0-9._:/-]{0,119}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_NODES = 256;
const MAX_LIST = 256;
const SENSITIVE_KEY = /token|secret|password|passwd|credential|authorization|cookie|api[_-]?key|private[_-]?key|access[_-]?token/i;

function clone(value) { return structuredClone(value); }
function zeroEffects() { return clone(ZERO_EXTERNAL_EFFECTS); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function text(value, max = 4000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function strings(value, max = MAX_LIST, itemMax = 1000) {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const normalized = text(item, itemMax);
    if (!normalized) return null;
    if (!seen.has(normalized)) { seen.add(normalized); out.push(normalized); }
  }
  return out;
}
function hasSecret(value, depth = 0) {
  if (depth > 12 || value == null) return false;
  if (typeof value === 'string') return containsSecretValue(value);
  if (typeof value !== 'object') return false;
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) return true;
    if (hasSecret(child, depth + 1)) return true;
  }
  return false;
}
function fail(status, reasonCodes, extra = {}) {
  return {
    ok: false,
    schemaVersion: CONTINUATION_GRAPH_SCHEMA,
    policyVersion: CONTINUATION_GRAPH_POLICY_VERSION,
    status,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}
function normalizeNode(raw = {}) {
  const id = text(raw.id, 120)?.toLowerCase();
  const objective = text(raw.objective, 4000);
  const dependsOn = strings(raw.dependsOn || [], MAX_NODES, 120)?.map(item => item.toLowerCase());
  const requiredCapabilities = strings(raw.requiredCapabilities || [], 128, 200);
  const proofRequirements = strings(raw.proofRequirements || [], 128, 500);
  const maxAttempts = Number(raw.maxAttempts ?? 3);
  if (!id || !NODE_ID.test(id) || !objective || !dependsOn || !requiredCapabilities || !proofRequirements
    || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) return null;
  return { id, objective, dependsOn, requiredCapabilities, proofRequirements, maxAttempts };
}
function topologicalOrder(nodes) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const incoming = new Map(nodes.map(node => [node.id, 0]));
  const outgoing = new Map(nodes.map(node => [node.id, []]));
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      if (!byId.has(dep) || dep === node.id) return null;
      incoming.set(node.id, incoming.get(node.id) + 1);
      outgoing.get(dep).push(node.id);
    }
  }
  const queue = [...nodes.filter(node => incoming.get(node.id) === 0).map(node => node.id)].sort();
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const child of outgoing.get(id).sort()) {
      incoming.set(child, incoming.get(child) - 1);
      if (incoming.get(child) === 0) {
        queue.push(child);
        queue.sort();
      }
    }
  }
  return order.length === nodes.length ? order : null;
}
function definitionOf(graph) {
  return {
    schemaVersion: graph.schemaVersion,
    policyVersion: graph.policyVersion,
    objective: graph.objective,
    nodes: graph.nodes,
    topologicalOrder: graph.topologicalOrder,
    maxParallel: graph.maxParallel,
    resourceLaw: graph.resourceLaw
  };
}
function stateDigest(state) { return digest(state); }
function completedSet(graph) {
  return new Set(Object.entries(graph.state.nodes).filter(([, state]) => state.status === 'COMPLETED').map(([id]) => id));
}
function runnableNodeIds(graph) {
  const completed = completedSet(graph);
  return graph.topologicalOrder.filter(id => {
    const runtime = graph.state.nodes[id];
    if (!runtime || !['PENDING', 'PENDING_RETRY'].includes(runtime.status)) return false;
    const node = graph.nodes.find(item => item.id === id);
    return node.dependsOn.every(dep => completed.has(dep));
  }).slice(0, graph.maxParallel);
}
function refreshState(graph) {
  graph.state.runnableNodeIds = runnableNodeIds(graph);
  graph.state.completedNodeIds = graph.topologicalOrder.filter(id => graph.state.nodes[id].status === 'COMPLETED');
  graph.state.terminalFailedNodeIds = graph.topologicalOrder.filter(id => graph.state.nodes[id].status === 'FAILED_TERMINAL');
  graph.state.blockedNodeIds = graph.topologicalOrder.filter(id => graph.state.nodes[id].status === 'BLOCKED');
  graph.state.status = graph.state.completedNodeIds.length === graph.nodes.length
    ? 'COMPLETED'
    : graph.state.terminalFailedNodeIds.length || graph.state.blockedNodeIds.length
      ? 'DEGRADED'
      : 'RUNNABLE';
  graph.state.stateDigest = stateDigest({
    nodes: graph.state.nodes,
    resultReceipts: graph.state.resultReceipts,
    runnableNodeIds: graph.state.runnableNodeIds,
    completedNodeIds: graph.state.completedNodeIds,
    terminalFailedNodeIds: graph.state.terminalFailedNodeIds,
    blockedNodeIds: graph.state.blockedNodeIds,
    status: graph.state.status
  });
  return graph;
}

export function compileContinuationGraph({ objective, nodes = [], maxParallel = 4 } = {}) {
  const goal = text(objective, 8000);
  if (!goal) return fail('CONTINUATION_GRAPH_INVALID', ['objective-required']);
  if (!Array.isArray(nodes) || nodes.length < 1 || nodes.length > MAX_NODES) {
    return fail('CONTINUATION_GRAPH_INVALID', ['bounded-node-array-required']);
  }
  const normalized = nodes.map(normalizeNode);
  if (normalized.some(node => !node)) return fail('CONTINUATION_GRAPH_INVALID', ['valid-node-contract-required']);
  const ids = normalized.map(node => node.id);
  if (new Set(ids).size !== ids.length) return fail('CONTINUATION_GRAPH_INVALID', ['unique-node-ids-required']);
  const order = topologicalOrder(normalized);
  if (!order) return fail('CONTINUATION_GRAPH_INVALID', ['acyclic-existing-dependencies-required']);
  const parallel = Number(maxParallel);
  if (!Number.isSafeInteger(parallel) || parallel < 1 || parallel > 32) {
    return fail('CONTINUATION_GRAPH_INVALID', ['bounded-max-parallel-required']);
  }
  const graph = {
    ok: true,
    schemaVersion: CONTINUATION_GRAPH_SCHEMA,
    policyVersion: CONTINUATION_GRAPH_POLICY_VERSION,
    status: 'CONTINUATION_GRAPH_READY',
    objective: goal,
    nodes: normalized,
    topologicalOrder: order,
    maxParallel: parallel,
    resourceLaw: {
      providerLimitsAreHardConstraints: true,
      quotaEvasionAllowed: false,
      identityCyclingAllowed: false,
      hiddenContinuationAuthority: false,
      rule: 'CONTINUATION_MAY_MOVE_WORK_ACROSS_SESSIONS_OR_PROVIDERS_ONLY_WHERE_CURRENT_AUTHORIZED_CAPACITY_EXISTS; IT MAY NOT EVADE_PROVIDER_LIMITS_OR_CREATE_AUTHORITY.'
    },
    state: {
      nodes: Object.fromEntries(normalized.map(node => [node.id, { status: 'PENDING', attempts: 0 }])),
      resultReceipts: {},
      runnableNodeIds: [],
      completedNodeIds: [],
      terminalFailedNodeIds: [],
      blockedNodeIds: [],
      status: 'RUNNABLE',
      stateDigest: null
    },
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
  graph.graphDigest = digest(definitionOf(graph));
  refreshState(graph);
  return graph;
}

export function recordContinuationResult({ graph, nodeId, result = {} } = {}) {
  if (!graph?.ok || graph?.schemaVersion !== CONTINUATION_GRAPH_SCHEMA || graph.graphDigest !== digest(definitionOf(graph))) {
    return fail('CONTINUATION_RESULT_REJECTED', ['valid-untampered-graph-required']);
  }
  const id = text(nodeId, 120)?.toLowerCase();
  const node = graph.nodes.find(item => item.id === id);
  if (!node) return fail('CONTINUATION_RESULT_REJECTED', ['known-node-required']);
  const resultStatus = text(result.status, 40)?.toUpperCase();
  if (!['COMPLETED', 'FAILED', 'BLOCKED'].includes(resultStatus)) {
    return fail('CONTINUATION_RESULT_REJECTED', ['recognized-result-status-required']);
  }
  const receiptDigest = text(result.receiptDigest, 64)?.toLowerCase();
  if (!receiptDigest || !SHA256.test(receiptDigest)) return fail('CONTINUATION_RESULT_REJECTED', ['sha256-receipt-digest-required']);
  const evidencePointers = strings(result.evidencePointers || [], 128, 800);
  if (!evidencePointers) return fail('CONTINUATION_RESULT_REJECTED', ['bounded-evidence-pointers-required']);
  if (hasSecret(result)) return fail('CONTINUATION_RESULT_REJECTED', ['secret-material-prohibited']);
  const current = graph.state.nodes[id];
  const prior = graph.state.resultReceipts[id];
  if (prior) {
    if (prior.receiptDigest === receiptDigest && prior.status === resultStatus) {
      return { ...clone(graph), ok: true, status: 'CONTINUATION_RESULT_IDEMPOTENT', idempotent: true };
    }
    return fail('CONTINUATION_RESULT_REJECTED', ['conflicting-terminal-replay']);
  }
  if (!runnableNodeIds(graph).includes(id)) {
    return fail('CONTINUATION_RESULT_REJECTED', ['node-not-currently-runnable']);
  }
  const next = clone(graph);
  const runtime = next.state.nodes[id];
  runtime.attempts += 1;
  const summary = text(result.summary, 2000);
  const receipt = {
    nodeId: id,
    status: resultStatus,
    receiptDigest,
    evidencePointers,
    summary: summary ? redactSecrets(summary) : null,
    attempt: runtime.attempts
  };
  if (resultStatus === 'COMPLETED') {
    runtime.status = 'COMPLETED';
    next.state.resultReceipts[id] = receipt;
  } else if (resultStatus === 'FAILED') {
    if (runtime.attempts < node.maxAttempts) {
      runtime.status = 'PENDING_RETRY';
      // A retry is not a terminal result. Keep the latest failure receipt in a
      // bounded history while leaving the node runnable on its own frontier.
      runtime.lastFailure = receipt;
    } else {
      runtime.status = 'FAILED_TERMINAL';
      next.state.resultReceipts[id] = receipt;
    }
  } else {
    runtime.status = 'BLOCKED';
    next.state.resultReceipts[id] = receipt;
  }
  refreshState(next);
  return { ...next, status: 'CONTINUATION_RESULT_RECORDED', idempotent: false };
}

export function buildContinuationCheckpoint({ graph, sourceRevision, memoryPointers = [] } = {}) {
  if (!graph?.ok || graph.graphDigest !== digest(definitionOf(graph))) {
    return fail('CONTINUATION_CHECKPOINT_REJECTED', ['valid-untampered-graph-required']);
  }
  const revision = text(sourceRevision, 240);
  const pointers = strings(memoryPointers, 256, 800);
  if (!revision || !pointers) return fail('CONTINUATION_CHECKPOINT_REJECTED', ['source-revision-and-bounded-memory-pointers-required']);
  if (hasSecret({ sourceRevision: revision, memoryPointers: pointers })) {
    return fail('CONTINUATION_CHECKPOINT_REJECTED', ['secret-material-prohibited']);
  }
  const core = {
    schemaVersion: 'uberbond.continuation-checkpoint.v1',
    graphDigest: graph.graphDigest,
    stateDigest: graph.state.stateDigest,
    sourceRevision: revision,
    completedNodeIds: [...graph.state.completedNodeIds],
    runnableNodeIds: [...graph.state.runnableNodeIds],
    terminalFailedNodeIds: [...graph.state.terminalFailedNodeIds],
    blockedNodeIds: [...graph.state.blockedNodeIds],
    memoryPointers: pointers,
    status: graph.state.status
  };
  return {
    ok: true,
    policyVersion: CONTINUATION_GRAPH_POLICY_VERSION,
    status: 'CONTINUATION_CHECKPOINT_READY',
    checkpoint: { ...core, checkpointDigest: digest(core) },
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function resumeContinuationGraph({ graph, checkpoint, currentSourceRevision } = {}) {
  if (!graph?.ok || graph.graphDigest !== digest(definitionOf(graph))) {
    return fail('CONTINUATION_RESUME_REJECTED', ['valid-untampered-graph-required']);
  }
  if (!checkpoint || checkpoint.checkpointDigest !== digest({
    schemaVersion: checkpoint.schemaVersion,
    graphDigest: checkpoint.graphDigest,
    stateDigest: checkpoint.stateDigest,
    sourceRevision: checkpoint.sourceRevision,
    completedNodeIds: checkpoint.completedNodeIds,
    runnableNodeIds: checkpoint.runnableNodeIds,
    terminalFailedNodeIds: checkpoint.terminalFailedNodeIds,
    blockedNodeIds: checkpoint.blockedNodeIds,
    memoryPointers: checkpoint.memoryPointers,
    status: checkpoint.status
  })) return fail('CONTINUATION_RESUME_REJECTED', ['valid-checkpoint-digest-required']);
  if (checkpoint.graphDigest !== graph.graphDigest || checkpoint.stateDigest !== graph.state.stateDigest) {
    return fail('CONTINUATION_RESUME_REJECTED', ['checkpoint-does-not-bind-current-graph-state']);
  }
  const revision = text(currentSourceRevision, 240);
  if (!revision || revision !== checkpoint.sourceRevision) {
    return fail('CONTINUATION_RESUME_RECONCILIATION_REQUIRED', ['source-revision-changed']);
  }
  return {
    ...clone(graph),
    ok: true,
    status: 'CONTINUATION_RESUME_READY',
    resumedFromCheckpointDigest: checkpoint.checkpointDigest,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export function continuationCapabilityAtom() {
  return normalizeCapabilityAtom({
    id: 'uberbond.continuation.compile-resumable-work-graph',
    verb: 'compile',
    noun: 'resumable-work-graph',
    description: 'Compile a long-horizon objective into an acyclic dependency graph with bounded local retry, proof-carrying completion, durable checkpoint identity, and provider-independent lawful continuation.',
    inputs: ['objective', 'work-nodes', 'dependency-edges', 'source-revision'],
    outputs: ['validated-dag', 'runnable-frontier', 'checkpoint', 'continuation-receipts'],
    sideEffectClass: 'NONE'
  });
}
