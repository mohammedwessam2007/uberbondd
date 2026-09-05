import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERBOND_COGNITIVE_GRAPH_SCHEMA = 'uberbond.cognitive-graph.v1';
export const UBERBOND_COGNITIVE_GRAPH_POLICY_VERSION = 'uberbond-cognitive-graph-1.0.0';

const EDGE_TYPES = new Set([
  'FEEDS', 'SENSES_FOR', 'ATOMIZES_FOR', 'RECOMBINES_FOR', 'CHALLENGES',
  'SUPPLIES', 'REQUIRES', 'ALLOCATES', 'VERIFIES', 'PROMOTES', 'LELEARNS_FROM',
  'LEARNS_FROM', 'REVOKES', 'CONSTRAINS', 'GOVERNS', 'EXECUTES_FOR',
  'MEASURES', 'RESURRECTS_FOR', 'ESCALATES_TO', 'FEEDBACK_TO', 'PROVES_FOR'
]);

const CORE_NODES = Object.freeze([
  { id: 'world-sensing', kind: 'SENSORIUM', label: 'World Sensing / Public Intelligence', truthClass: 'VERIFIED_CURRENT' },
  { id: 'gamechanger', kind: 'INTELLIGENCE', label: 'Gamechanger Intelligence Mesh', truthClass: 'VERIFIED_CURRENT' },
  { id: 'genesis', kind: 'IMAGINATION', label: 'Perpetual Frontier GENESIS', truthClass: 'VERIFIED_CURRENT' },
  { id: 'genesis-evolution', kind: 'EVOLUTION', label: 'Genesis Evolution Engine', truthClass: 'VERIFIED_CURRENT' },
  { id: 'genesis-scientist', kind: 'SCIENCE', label: 'Genesis Scientist / Prediction Society', truthClass: 'VERIFIED_CURRENT' },
  { id: 'genesis-ontology', kind: 'ONTOLOGY', label: 'Genesis Ontology', truthClass: 'VERIFIED_CURRENT' },
  { id: 'genesis-metabolism', kind: 'METABOLISM', label: 'Genesis Metabolism', truthClass: 'VERIFIED_CURRENT' },
  { id: 'business-genome', kind: 'MECHANISM_MEMORY', label: 'Business Genome', truthClass: 'CHAT_SPEC_GOAL' },
  { id: 'idea-generator', kind: 'IMAGINATION', label: 'Mechanism Lab / Idea Generator', truthClass: 'CHAT_SPEC_GOAL' },
  { id: 'opportunity-factory', kind: 'OPPORTUNITY', label: 'Opportunity Factory', truthClass: 'CHAT_SPEC_GOAL' },
  { id: 'event-horizon', kind: 'ECONOMIC_ALLOCATOR', label: 'Event Horizon', truthClass: 'VERIFIED_CURRENT' },
  { id: 'capability-genome', kind: 'CAPABILITY_MARKET', label: 'World Capability Genome', truthClass: 'VERIFIED_CURRENT' },
  { id: 'saas-cannibal', kind: 'CAPABILITY_ECONOMICS', label: 'SaaS Cannibal', truthClass: 'CHAT_SPEC_GOAL' },
  { id: 'open-model-universe', kind: 'MODEL_MARKET', label: 'Open Model Universe', truthClass: 'VERIFIED_CURRENT' },
  { id: 'world-brain', kind: 'COGNITIVE_SPINE', label: 'Prometheus / World Brain / Cognitive Bus', truthClass: 'CHAT_SPEC_GOAL' },
  { id: 'avengers', kind: 'SPECIALIST_ORCHESTRATION', label: 'Avengers Arsenal', truthClass: 'VERIFIED_CURRENT' },
  { id: 'max-council', kind: 'ADVERSARIAL_COUNCIL', label: 'Frontier MAX Council', truthClass: 'VERIFIED_CURRENT' },
  { id: 'wallbreaker', kind: 'PROBLEM_SOLVING', label: 'Wallbreaker', truthClass: 'VERIFIED_CURRENT' },
  { id: 'self-maintainer', kind: 'ENGINEERING', label: 'Trusted Self-Maintainer', truthClass: 'DRAFT_BRANCH' },
  { id: 'omnia', kind: 'CONSTITUTIONAL_RUNTIME', label: 'OMNIA Constitutional Lineage', truthClass: 'VERIFIED_CURRENT' },
  { id: 'kilimanjaro', kind: 'ARCHITECTURE_GOVERNANCE', label: 'Kilimanjaro Architecture Closure Law', truthClass: 'HISTORICAL_DONOR' },
  { id: 'distribution-os', kind: 'DISTRIBUTION', label: 'Distribution OS / Lead Intelligence', truthClass: 'VERIFIED_CURRENT' },
  { id: 'payment-reconciliation', kind: 'MONEY_TRUTH', label: 'Payment / Reconciliation', truthClass: 'VERIFIED_CURRENT' },
  { id: 'fulfilment-qa', kind: 'DELIVERY', label: 'Fulfilment / QA / Acceptance', truthClass: 'VERIFIED_CURRENT' },
  { id: 'retention-learning', kind: 'RETENTION', label: 'Retention / Renewal / Expansion Learning', truthClass: 'CHAT_SPEC_GOAL' },
  { id: 'economic-memory', kind: 'LEARNING', label: 'Economic Memory / Trusted Learning', truthClass: 'CHAT_SPEC_GOAL' }
]);

const CORE_EDGES = Object.freeze([
  ['world-sensing', 'gamechanger', 'FEEDS'],
  ['gamechanger', 'genesis', 'FEEDS'],
  ['gamechanger', 'business-genome', 'ATOMIZES_FOR'],
  ['genesis', 'genesis-evolution', 'FEEDS'],
  ['genesis', 'idea-generator', 'FEEDS'],
  ['genesis', 'opportunity-factory', 'RESURRECTS_FOR'],
  ['business-genome', 'idea-generator', 'SUPPLIES'],
  ['idea-generator', 'opportunity-factory', 'RECOMBINES_FOR'],
  ['genesis-evolution', 'opportunity-factory', 'FEEDS'],
  ['genesis-scientist', 'event-horizon', 'PROVES_FOR'],
  ['genesis-ontology', 'world-brain', 'SUPPLIES'],
  ['genesis-metabolism', 'economic-memory', 'FEEDS'],
  ['opportunity-factory', 'event-horizon', 'FEEDS'],
  ['event-horizon', 'capability-genome', 'REQUIRES'],
  ['event-horizon', 'distribution-os', 'ALLOCATES'],
  ['capability-genome', 'saas-cannibal', 'FEEDS'],
  ['saas-cannibal', 'capability-genome', 'FEEDBACK_TO'],
  ['capability-genome', 'avengers', 'SUPPLIES'],
  ['open-model-universe', 'avengers', 'SUPPLIES'],
  ['world-brain', 'avengers', 'ALLOCATES'],
  ['avengers', 'max-council', 'SUPPLIES'],
  ['world-brain', 'max-council', 'FEEDS'],
  ['max-council', 'wallbreaker', 'ESCALATES_TO'],
  ['wallbreaker', 'max-council', 'FEEDBACK_TO'],
  ['max-council', 'self-maintainer', 'PROMOTES'],
  ['self-maintainer', 'genesis-scientist', 'PROVES_FOR'],
  ['self-maintainer', 'economic-memory', 'FEEDS'],
  ['event-horizon', 'distribution-os', 'FEEDS'],
  ['distribution-os', 'payment-reconciliation', 'FEEDS'],
  ['payment-reconciliation', 'fulfilment-qa', 'FEEDS'],
  ['fulfilment-qa', 'retention-learning', 'FEEDS'],
  ['retention-learning', 'economic-memory', 'FEEDS'],
  ['economic-memory', 'gamechanger', 'FEEDBACK_TO'],
  ['economic-memory', 'genesis', 'FEEDBACK_TO'],
  ['economic-memory', 'business-genome', 'FEEDBACK_TO'],
  ['economic-memory', 'opportunity-factory', 'FEEDBACK_TO'],
  ['economic-memory', 'event-horizon', 'FEEDBACK_TO'],
  ['economic-memory', 'capability-genome', 'FEEDBACK_TO'],
  ['economic-memory', 'open-model-universe', 'FEEDBACK_TO'],
  ['economic-memory', 'world-brain', 'FEEDBACK_TO'],
  ['omnia', 'distribution-os', 'GOVERNS'],
  ['omnia', 'payment-reconciliation', 'GOVERNS'],
  ['omnia', 'self-maintainer', 'CONSTRAINS'],
  ['omnia', 'max-council', 'CONSTRAINS'],
  ['kilimanjaro', 'world-brain', 'CONSTRAINS'],
  ['kilimanjaro', 'self-maintainer', 'CONSTRAINS'],
  ['kilimanjaro', 'event-horizon', 'CONSTRAINS'],
  ['max-council', 'kilimanjaro', 'PROVES_FOR'],
  ['self-maintainer', 'kilimanjaro', 'PROVES_FOR']
].map(([from, to, type]) => Object.freeze({ from, to, type })));

function zeroEffects() {
  return structuredClone(ZERO_EXTERNAL_EFFECTS);
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function text(value, max = 500) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}

function normalizeNode(node) {
  const id = text(node?.id, 120)?.toLowerCase();
  const kind = text(node?.kind, 120)?.toUpperCase();
  const label = text(node?.label, 240);
  const truthClass = text(node?.truthClass, 80)?.toUpperCase();
  if (!id || !/^[a-z0-9][a-z0-9._-]*$/.test(id) || !kind || !label || !truthClass) return null;
  return { id, kind, label, truthClass };
}

function normalizeEdge(edge, nodeIds) {
  const from = text(edge?.from, 120)?.toLowerCase();
  const to = text(edge?.to, 120)?.toLowerCase();
  const type = text(edge?.type, 80)?.toUpperCase();
  if (!from || !to || from === to || !nodeIds.has(from) || !nodeIds.has(to) || !EDGE_TYPES.has(type)) return null;
  return { from, to, type };
}

export function compileUberBondCognitiveGraph({ extraNodes = [], extraEdges = [] } = {}) {
  const reasons = [];
  const nodes = [];
  const nodeIds = new Set();
  for (const raw of [...CORE_NODES, ...(Array.isArray(extraNodes) ? extraNodes : [])]) {
    const node = normalizeNode(raw);
    if (!node) { reasons.push('invalid-node'); continue; }
    if (nodeIds.has(node.id)) { reasons.push(`duplicate-node:${node.id}`); continue; }
    nodeIds.add(node.id);
    nodes.push(node);
  }
  const edges = [];
  const edgeIds = new Set();
  for (const raw of [...CORE_EDGES, ...(Array.isArray(extraEdges) ? extraEdges : [])]) {
    const edge = normalizeEdge(raw, nodeIds);
    if (!edge) { reasons.push('invalid-edge'); continue; }
    const id = `${edge.from}:${edge.type}:${edge.to}`;
    if (edgeIds.has(id)) continue;
    edgeIds.add(id);
    edges.push({ id, ...edge });
  }
  if (reasons.length) {
    return {
      ok: false,
      policyVersion: UBERBOND_COGNITIVE_GRAPH_POLICY_VERSION,
      status: 'COGNITIVE_GRAPH_INVALID',
      reasonCodes: [...new Set(reasons)],
      businessEffectAuthority: 'NONE',
      externalEffectLedger: zeroEffects()
    };
  }
  const graphCore = { schemaVersion: UBERBOND_COGNITIVE_GRAPH_SCHEMA, nodes, edges };
  return {
    ok: true,
    policyVersion: UBERBOND_COGNITIVE_GRAPH_POLICY_VERSION,
    status: 'COGNITIVE_GRAPH_READY',
    ...graphCore,
    graphDigest: hash(graphCore),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'THE_COGNITIVE_GRAPH CONNECTS INFORMATION, EVIDENCE, HYPOTHESES, CAPABILITIES AND FEEDBACK; IT NEVER GRANTS CONSEQUENCE AUTHORITY'
  };
}

export function reachableNodes({ graph, startNodeId, maxDepth = 64 } = {}) {
  if (!graph?.ok || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return [];
  const start = text(startNodeId, 120)?.toLowerCase();
  if (!start || !graph.nodes.some(node => node.id === start)) return [];
  const depthLimit = Number.isSafeInteger(Number(maxDepth)) ? Math.max(0, Math.min(256, Number(maxDepth))) : 64;
  const adjacency = new Map();
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push(edge.to);
  }
  const seen = new Set([start]);
  const queue = [{ id: start, depth: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (current.depth >= depthLimit) continue;
    for (const next of adjacency.get(current.id) || []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ id: next, depth: current.depth + 1 });
    }
  }
  return [...seen];
}

export function cognitiveGraphIntegrity(graph = compileUberBondCognitiveGraph()) {
  if (!graph?.ok) return { ok: false, reasonCodes: ['valid-cognitive-graph-required'] };
  const nodeIds = graph.nodes.map(node => node.id);
  const outgoing = new Set(graph.edges.map(edge => edge.from));
  const incoming = new Set(graph.edges.map(edge => edge.to));
  const orphans = nodeIds.filter(id => !outgoing.has(id) && !incoming.has(id));
  const fromWorld = new Set(reachableNodes({ graph, startNodeId: 'world-sensing' }));
  const unreachableFromWorld = nodeIds.filter(id => !fromWorld.has(id));
  const cannotReturnToLearning = [];
  for (const id of nodeIds) {
    const reach = new Set(reachableNodes({ graph, startNodeId: id }));
    if (!reach.has('economic-memory')) cannotReturnToLearning.push(id);
  }
  const reasons = [];
  if (orphans.length) reasons.push('orphan-nodes');
  if (unreachableFromWorld.length) reasons.push('world-sensing-cannot-reach-all-organs');
  if (cannotReturnToLearning.length) reasons.push('organs-without-learning-return-path');
  return {
    ok: reasons.length === 0,
    policyVersion: UBERBOND_COGNITIVE_GRAPH_POLICY_VERSION,
    status: reasons.length ? 'COGNITIVE_GRAPH_DISCONNECTED' : 'COGNITIVE_GRAPH_INTEGRITY_PASS',
    reasonCodes: reasons,
    orphanNodes: orphans,
    unreachableFromWorld,
    cannotReturnToLearning,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export const UBERBOND_CORE_COGNITIVE_NODES = CORE_NODES;
export const UBERBOND_CORE_COGNITIVE_EDGES = CORE_EDGES;
