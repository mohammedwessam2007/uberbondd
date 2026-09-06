import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBERBOND_COGNITIVE_GRAPH_SCHEMA = 'uberbond.cognitive-graph.v1';
export const UBERBOND_COGNITIVE_GRAPH_POLICY_VERSION = 'uberbond-cognitive-graph-1.1.0';

const EDGE_TYPES = new Set([
  'FEEDS', 'SENSES_FOR', 'ATOMIZES_FOR', 'RECOMBINES_FOR', 'CHALLENGES',
  'SUPPLIES', 'REQUIRES', 'ALLOCATES', 'VERIFIES', 'PROMOTES', 'LEARNS_FROM',
  'REVOKES', 'CONSTRAINS', 'GOVERNS', 'EXECUTES_FOR', 'MEASURES',
  'RESURRECTS_FOR', 'ESCALATES_TO', 'FEEDBACK_TO', 'PROVES_FOR'
]);

const CORE_NODES = Object.freeze([
  ['world-sensing', 'SENSORIUM', 'World Sensing / Public Intelligence', 'VERIFIED_CURRENT'],
  ['truth-evidence', 'EVIDENCE_TRUTH', 'Truth & Evidence Kernel', 'VERIFIED_CURRENT'],
  ['gamechanger', 'INTELLIGENCE', 'Gamechanger Intelligence Mesh', 'VERIFIED_CURRENT'],
  ['context-spine', 'CONTEXT_MEMORY', 'Frontier Context Spine', 'VERIFIED_CURRENT'],
  ['genesis', 'IMAGINATION', 'Perpetual Frontier GENESIS', 'VERIFIED_CURRENT'],
  ['genesis-evolution', 'EVOLUTION', 'Genesis Evolution Engine', 'VERIFIED_CURRENT'],
  ['genesis-scientist', 'SCIENCE', 'Genesis Scientist / Prediction Society', 'VERIFIED_CURRENT'],
  ['genesis-ontology', 'ONTOLOGY', 'Genesis Ontology', 'VERIFIED_CURRENT'],
  ['genesis-metabolism', 'METABOLISM', 'Genesis Metabolism', 'VERIFIED_CURRENT'],
  ['business-genome', 'MECHANISM_MEMORY', 'Business Genome', 'CHAT_SPEC_GOAL'],
  ['idea-generator', 'IMAGINATION', 'Mechanism Lab / Idea Generator', 'CHAT_SPEC_GOAL'],
  ['opportunity-factory', 'OPPORTUNITY', 'Opportunity Factory', 'CHAT_SPEC_GOAL'],
  ['event-horizon', 'ECONOMIC_ALLOCATOR', 'Event Horizon', 'VERIFIED_CURRENT'],
  ['capability-genome', 'CAPABILITY_MARKET', 'World Capability Genome', 'VERIFIED_CURRENT'],
  ['saas-cannibal', 'CAPABILITY_ECONOMICS', 'SaaS Cannibal', 'CHAT_SPEC_GOAL'],
  ['open-model-universe', 'MODEL_MARKET', 'Open Model Universe', 'VERIFIED_CURRENT'],
  ['world-brain', 'COGNITIVE_SPINE', 'Prometheus / World Brain / Cognitive Bus', 'CHAT_SPEC_GOAL'],
  ['agent-mesh', 'COORDINATION', 'Agent Mesh / Trinity Coordination', 'VERIFIED_CURRENT'],
  ['avengers', 'SPECIALIST_ORCHESTRATION', 'Avengers Arsenal', 'VERIFIED_CURRENT'],
  ['max-council', 'ADVERSARIAL_COUNCIL', 'Frontier MAX Council', 'VERIFIED_CURRENT'],
  ['wallbreaker', 'PROBLEM_SOLVING', 'Wallbreaker', 'VERIFIED_CURRENT'],
  ['self-maintainer', 'ENGINEERING', 'Trusted Self-Maintainer', 'DRAFT_BRANCH'],
  ['omnia', 'CONSTITUTIONAL_RUNTIME', 'OMNIA Constitutional Lineage', 'VERIFIED_CURRENT'],
  ['kilimanjaro', 'ARCHITECTURE_GOVERNANCE', 'Kilimanjaro Architecture Closure Law', 'HISTORICAL_DONOR'],
  ['distribution-os', 'DISTRIBUTION', 'Distribution OS / Lead Intelligence', 'VERIFIED_CURRENT'],
  ['payment-reconciliation', 'MONEY_TRUTH', 'Payment / Reconciliation', 'VERIFIED_CURRENT'],
  ['fulfilment-qa', 'DELIVERY', 'Fulfilment / QA / Acceptance', 'VERIFIED_CURRENT'],
  ['retention-learning', 'RETENTION', 'Retention / Renewal / Expansion Learning', 'CHAT_SPEC_GOAL'],
  ['economic-memory', 'LEARNING', 'Economic Memory / Trusted Learning', 'CHAT_SPEC_GOAL']
].map(([id, kind, label, truthClass]) => Object.freeze({ id, kind, label, truthClass })));

const CORE_EDGES = Object.freeze([
  ['world-sensing', 'truth-evidence', 'FEEDS'],
  ['world-sensing', 'gamechanger', 'FEEDS'],
  ['truth-evidence', 'gamechanger', 'SUPPLIES'],
  ['truth-evidence', 'context-spine', 'SUPPLIES'],
  ['gamechanger', 'context-spine', 'FEEDS'],
  ['gamechanger', 'genesis', 'FEEDS'],
  ['gamechanger', 'business-genome', 'ATOMIZES_FOR'],
  ['genesis', 'context-spine', 'FEEDS'],
  ['genesis', 'genesis-evolution', 'FEEDS'],
  ['genesis', 'genesis-ontology', 'FEEDS'],
  ['genesis', 'genesis-metabolism', 'FEEDS'],
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
  ['context-spine', 'world-brain', 'SUPPLIES'],
  ['context-spine', 'agent-mesh', 'SUPPLIES'],
  ['world-brain', 'agent-mesh', 'ALLOCATES'],
  ['world-brain', 'avengers', 'ALLOCATES'],
  ['agent-mesh', 'avengers', 'EXECUTES_FOR'],
  ['agent-mesh', 'max-council', 'SUPPLIES'],
  ['avengers', 'max-council', 'SUPPLIES'],
  ['world-brain', 'max-council', 'FEEDS'],
  ['max-council', 'wallbreaker', 'ESCALATES_TO'],
  ['wallbreaker', 'max-council', 'FEEDBACK_TO'],
  ['max-council', 'self-maintainer', 'PROMOTES'],
  ['self-maintainer', 'truth-evidence', 'PROVES_FOR'],
  ['self-maintainer', 'genesis-scientist', 'PROVES_FOR'],
  ['self-maintainer', 'economic-memory', 'FEEDS'],
  ['distribution-os', 'payment-reconciliation', 'FEEDS'],
  ['payment-reconciliation', 'truth-evidence', 'PROVES_FOR'],
  ['payment-reconciliation', 'fulfilment-qa', 'FEEDS'],
  ['fulfilment-qa', 'truth-evidence', 'PROVES_FOR'],
  ['fulfilment-qa', 'retention-learning', 'FEEDS'],
  ['retention-learning', 'economic-memory', 'FEEDS'],
  ['truth-evidence', 'economic-memory', 'FEEDS'],
  ['economic-memory', 'context-spine', 'FEEDBACK_TO'],
  ['economic-memory', 'gamechanger', 'FEEDBACK_TO'],
  ['economic-memory', 'genesis', 'FEEDBACK_TO'],
  ['economic-memory', 'business-genome', 'FEEDBACK_TO'],
  ['economic-memory', 'opportunity-factory', 'FEEDBACK_TO'],
  ['economic-memory', 'event-horizon', 'FEEDBACK_TO'],
  ['economic-memory', 'capability-genome', 'FEEDBACK_TO'],
  ['economic-memory', 'open-model-universe', 'FEEDBACK_TO'],
  ['economic-memory', 'world-brain', 'FEEDBACK_TO'],
  ['economic-memory', 'omnia', 'PROVES_FOR'],
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

const zeroEffects = () => structuredClone(ZERO_EXTERNAL_EFFECTS);
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function text(value, max = 500) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function normalizeNode(node) {
  const id = text(node?.id, 120)?.toLowerCase();
  const kind = text(node?.kind, 120)?.toUpperCase();
  const label = text(node?.label, 240);
  const truthClass = text(node?.truthClass, 80)?.toUpperCase();
  return id && /^[a-z0-9][a-z0-9._-]*$/.test(id) && kind && label && truthClass ? { id, kind, label, truthClass } : null;
}
function normalizeEdge(edge, nodeIds) {
  const from = text(edge?.from, 120)?.toLowerCase();
  const to = text(edge?.to, 120)?.toLowerCase();
  const type = text(edge?.type, 80)?.toUpperCase();
  return from && to && from !== to && nodeIds.has(from) && nodeIds.has(to) && EDGE_TYPES.has(type) ? { from, to, type } : null;
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
  if (reasons.length) return {
    ok: false,
    policyVersion: UBERBOND_COGNITIVE_GRAPH_POLICY_VERSION,
    status: 'COGNITIVE_GRAPH_INVALID',
    reasonCodes: [...new Set(reasons)],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
  const graphCore = { schemaVersion: UBERBOND_COGNITIVE_GRAPH_SCHEMA, nodes, edges };
  return {
    ok: true,
    policyVersion: UBERBOND_COGNITIVE_GRAPH_POLICY_VERSION,
    status: 'COGNITIVE_GRAPH_READY',
    ...graphCore,
    graphDigest: hash(graphCore),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'THE_COGNITIVE_GRAPH_CONNECTS_INFORMATION_EVIDENCE_HYPOTHESES_CAPABILITIES_CONTEXT_COORDINATION_AND_FEEDBACK_BUT_NEVER_GRANTS_CONSEQUENCE_AUTHORITY'
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
  const orphanNodes = nodeIds.filter(id => !outgoing.has(id) && !incoming.has(id));
  const fromWorld = new Set(reachableNodes({ graph, startNodeId: 'world-sensing' }));
  const unreachableFromWorld = nodeIds.filter(id => !fromWorld.has(id));
  const cannotReturnToLearning = nodeIds.filter(id => !new Set(reachableNodes({ graph, startNodeId: id })).has('economic-memory'));
  const reasonCodes = [];
  if (orphanNodes.length) reasonCodes.push('orphan-nodes');
  if (unreachableFromWorld.length) reasonCodes.push('world-sensing-cannot-reach-all-organs');
  if (cannotReturnToLearning.length) reasonCodes.push('organs-without-learning-return-path');
  return {
    ok: reasonCodes.length === 0,
    policyVersion: UBERBOND_COGNITIVE_GRAPH_POLICY_VERSION,
    status: reasonCodes.length ? 'COGNITIVE_GRAPH_DISCONNECTED' : 'COGNITIVE_GRAPH_INTEGRITY_PASS',
    reasonCodes,
    orphanNodes,
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
