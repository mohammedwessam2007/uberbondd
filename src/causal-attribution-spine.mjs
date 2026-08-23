import crypto from 'node:crypto';
import { COMMERCIAL_OUTCOME_POLICY_VERSION } from './commercial-outcome.mjs';

export const CAUSAL_ATTRIBUTION_POLICY_VERSION = 'causal-attribution-spine-1.1.0';
export const CAUSAL_NODE_TYPES = Object.freeze([
  'SIGNAL','OPPORTUNITY','EXPERIMENT','OFFER','CHANNEL','TARGET','ACTION','RESPONSE',
  'CHECKOUT','PAYMENT','DELIVERY','ACCEPTANCE','RETENTION','REFUND','DISPUTE','CHURN','FAILURE'
]);
export const CAUSAL_EVIDENCE_CLASSES = Object.freeze(['DIRECT','ATTRIBUTED','INFERRED']);

const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});
const MAX_NODES = 1000;
const MAX_EDGES = 3000;
const MAX_OUTCOMES = 1000;

function text(value, max = 500) { return String(value ?? '').trim().slice(0, max); }
function sha(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function integer(value) { const n = Number(value); return Number.isInteger(n) ? n : null; }
function iso(value) {
  const d = value instanceof Date ? value : new Date(value || '');
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }

/**
 * True when `outcomeId` is the id the commercial-outcome compiler would mint
 * for this provider event. Mirrors that module's derivation exactly; a drift
 * between them shows up as an honest refusal rather than a silent acceptance.
 */
function recomputableOutcomeId(outcomeId, providerEventId) {
  const eventId = text(providerEventId, 300);
  if (!eventId) return false;
  const expected = `out_${sha({ policyVersion: COMMERCIAL_OUTCOME_POLICY_VERSION, eventId }).slice(0, 24)}`;
  return text(outcomeId, 220) === expected;
}

function normalizeNode(node = {}) {
  const nodeId = text(node.nodeId, 220);
  const type = text(node.type, 80).toUpperCase();
  const occurredAt = iso(node.occurredAt);
  const evidenceRefs = Array.isArray(node.evidenceRefs) ? unique(node.evidenceRefs.map(v => text(v, 300))) : [];
  if (!nodeId) return { ok: false, reason: 'node-id-required' };
  if (!CAUSAL_NODE_TYPES.includes(type)) return { ok: false, reason: `unknown-node-type:${type}` };
  if (!occurredAt) return { ok: false, reason: 'node-time-required' };
  const economic = node.economic && typeof node.economic === 'object' ? {
    outcomeId: text(node.economic.outcomeId, 220) || null,
    truthLevel: text(node.economic.truthLevel, 80) || null,
    amountCents: integer(node.economic.amountCents),
    currency: text(node.economic.currency, 3).toUpperCase() || null,
    providerEventId: text(node.economic.providerEventId, 300) || null
  } : null;
  if (economic) {
    const allowed = ['CLEARED_PAYMENT','REFUND_OR_DISPUTE'];
    if (!allowed.includes(economic.truthLevel)) return { ok: false, reason: 'economic-truth-level-not-verified' };
    if (!economic.outcomeId || !economic.providerEventId || economic.amountCents == null || economic.amountCents <= 0 || !/^[A-Z]{3}$/.test(economic.currency || '')) {
      return { ok: false, reason: 'economic-proof-incomplete' };
    }
    // Every check above passes on an object typed by hand. Truth level, a
    // positive integer, a three-letter currency and a plausible event id are all
    // things a forger supplies for free, so the apparatus built to stop revenue
    // being invented was only checking whether the invention was well-formed --
    // a literal with the right field names became a five-thousand-dollar anchor
    // in the graph.
    //
    // A real outcomeId is a digest of the outcome policy version and the
    // provider event id, so it can be recomputed. Requiring it to recompute
    // means a forger has to produce the receipt the compiler would have
    // produced, not merely one shaped like it. Forging the amount is still
    // possible for whoever controls the provider event id; forging it from
    // nothing is not.
    if (!recomputableOutcomeId(economic.outcomeId, economic.providerEventId)) {
      return { ok: false, reason: 'economic-outcome-id-does-not-recompute' };
    }
  }
  return {
    ok: true,
    node: {
      nodeId,
      type,
      occurredAt,
      refs: node.refs && typeof node.refs === 'object' ? clone(node.refs) : {},
      evidenceRefs,
      economic
    }
  };
}

function normalizeEdge(edge = {}) {
  const edgeId = text(edge.edgeId, 220);
  const fromNodeId = text(edge.fromNodeId, 220);
  const toNodeId = text(edge.toNodeId, 220);
  const relation = text(edge.relation, 120).toUpperCase();
  const evidenceClass = text(edge.evidenceClass, 80).toUpperCase();
  const confidence = finite(edge.confidence);
  const evidenceRefs = Array.isArray(edge.evidenceRefs) ? unique(edge.evidenceRefs.map(v => text(v, 300))) : [];
  if (!edgeId) return { ok: false, reason: 'edge-id-required' };
  if (!fromNodeId || !toNodeId) return { ok: false, reason: 'edge-endpoints-required' };
  if (fromNodeId === toNodeId) return { ok: false, reason: 'self-edge-forbidden' };
  if (!relation) return { ok: false, reason: 'edge-relation-required' };
  if (!CAUSAL_EVIDENCE_CLASSES.includes(evidenceClass)) return { ok: false, reason: `unknown-evidence-class:${evidenceClass}` };
  if (confidence == null || confidence < 0 || confidence > 1) return { ok: false, reason: 'edge-confidence-invalid' };
  if (evidenceClass === 'DIRECT' && evidenceRefs.length === 0) return { ok: false, reason: 'direct-edge-evidence-required' };
  return { ok: true, edge: { edgeId, fromNodeId, toNodeId, relation, evidenceClass, confidence, evidenceRefs } };
}

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function hasCycle(nodes, edges) {
  const adjacency = new Map(nodes.map(node => [node.nodeId, []]));
  for (const edge of edges) adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adjacency.get(id) || []) if (visit(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  return nodes.some(node => visit(node.nodeId));
}

function verifiedEconomicOutcome(outcome = {}) {
  if (!outcome || outcome.ok === false) return null;
  const truthLevel = text(outcome.truthLevel, 80);
  const proof = outcome.paymentProof;
  if (!['CLEARED_PAYMENT','REFUND_OR_DISPUTE'].includes(truthLevel) || !proof) return null;
  const amountCents = integer(proof.amountCents);
  const currency = text(proof.currency, 3).toUpperCase();
  const providerEventId = text(proof.providerEventId, 300);
  const outcomeId = text(outcome.outcomeId || outcome.eventId, 220);
  if (!outcomeId || !providerEventId || amountCents == null || amountCents <= 0 || !/^[A-Z]{3}$/.test(currency)) return null;
  return {
    outcomeId,
    truthLevel,
    outcomeType: text(outcome.outcomeType, 80),
    occurredAt: iso(outcome.occurredAt),
    amountCents,
    currency,
    providerEventId,
    lineage: clone(outcome.lineage || {})
  };
}

export function normalizeCausalAttributionGraph({ nodes = [], edges = [], commercialOutcomes = [], date = new Date() } = {}) {
  const timestamp = iso(date) || new Date().toISOString();
  if (!Array.isArray(nodes) || !Array.isArray(edges) || !Array.isArray(commercialOutcomes)) {
    return { ok: false, policyVersion: CAUSAL_ATTRIBUTION_POLICY_VERSION, status: 'REJECTED', reasonCodes: ['arrays-required'], timestamp, externalEffectLedger: { ...ZERO_EFFECTS } };
  }
  if (nodes.length > MAX_NODES || edges.length > MAX_EDGES || commercialOutcomes.length > MAX_OUTCOMES) {
    return { ok: false, policyVersion: CAUSAL_ATTRIBUTION_POLICY_VERSION, status: 'REJECTED', reasonCodes: ['graph-bounds-exceeded'], timestamp, externalEffectLedger: { ...ZERO_EFFECTS } };
  }

  const reasonCodes = [];
  const nodeMap = new Map();
  for (const raw of nodes) {
    const normalized = normalizeNode(raw);
    if (!normalized.ok) { reasonCodes.push(normalized.reason); continue; }
    const prior = nodeMap.get(normalized.node.nodeId);
    if (prior && !same(prior, normalized.node)) reasonCodes.push(`node-identity-conflict:${normalized.node.nodeId}`);
    else nodeMap.set(normalized.node.nodeId, normalized.node);
  }

  const edgeMap = new Map();
  for (const raw of edges) {
    const normalized = normalizeEdge(raw);
    if (!normalized.ok) { reasonCodes.push(normalized.reason); continue; }
    const edge = normalized.edge;
    const prior = edgeMap.get(edge.edgeId);
    if (prior && !same(prior, edge)) reasonCodes.push(`edge-identity-conflict:${edge.edgeId}`);
    else edgeMap.set(edge.edgeId, edge);
  }

  const normalizedNodes = [...nodeMap.values()];
  const normalizedEdges = [...edgeMap.values()];
  const byId = nodeMap;
  for (const edge of normalizedEdges) {
    const from = byId.get(edge.fromNodeId);
    const to = byId.get(edge.toNodeId);
    if (!from || !to) { reasonCodes.push(`edge-endpoint-missing:${edge.edgeId}`); continue; }
    if (new Date(from.occurredAt).getTime() > new Date(to.occurredAt).getTime()) reasonCodes.push(`temporal-reversal:${edge.edgeId}`);
  }
  if (!reasonCodes.some(code => code.startsWith('edge-endpoint-missing:')) && hasCycle(normalizedNodes, normalizedEdges)) reasonCodes.push('causal-cycle-detected');

  const economicAnchors = commercialOutcomes.map(verifiedEconomicOutcome).filter(Boolean);
  const rejectedEconomicOutcomeCount = commercialOutcomes.length - economicAnchors.length;
  if (reasonCodes.length) {
    return {
      ok: false,
      policyVersion: CAUSAL_ATTRIBUTION_POLICY_VERSION,
      status: 'REJECTED',
      reasonCodes: unique(reasonCodes),
      timestamp,
      source: { suppliedNodes: nodes.length, suppliedEdges: edges.length, suppliedCommercialOutcomes: commercialOutcomes.length },
      externalEffectLedger: { ...ZERO_EFFECTS }
    };
  }

  const graphIdentity = {
    nodes: normalizedNodes.map(node => node.nodeId).sort(),
    edges: normalizedEdges.map(edge => edge.edgeId).sort(),
    outcomes: economicAnchors.map(item => item.outcomeId).sort()
  };
  const graphId = `causal_${sha(graphIdentity).slice(0, 28)}`;
  const directEdgeCount = normalizedEdges.filter(edge => edge.evidenceClass === 'DIRECT').length;
  const attributedEdgeCount = normalizedEdges.filter(edge => edge.evidenceClass === 'ATTRIBUTED').length;
  const inferredEdgeCount = normalizedEdges.filter(edge => edge.evidenceClass === 'INFERRED').length;

  return {
    ok: true,
    policyVersion: CAUSAL_ATTRIBUTION_POLICY_VERSION,
    graphId,
    status: economicAnchors.length ? 'VERIFIED_ECONOMIC_ANCHORS_PRESENT' : 'NO_VERIFIED_ECONOMIC_ANCHORS',
    timestamp,
    nodes: normalizedNodes,
    edges: normalizedEdges,
    economicAnchors,
    rejectedEconomicOutcomeCount,
    metrics: { nodeCount: normalizedNodes.length, edgeCount: normalizedEdges.length, directEdgeCount, attributedEdgeCount, inferredEdgeCount },
    causalRule: 'Edges preserve their evidence class. ATTRIBUTED and INFERRED edges never become DIRECT by aggregation. Economic weight comes only from already-normalized verified payment outcomes.',
    authorization: { allocation: 'DISABLED', spend: 'DISABLED', providerCalls: 'DISABLED', businessEffects: 'DISABLED' },
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export function inboundEventToCausalFragment(event, { responseNodeId = '', occurredAt = '', evidenceRefs = [] } = {}) {
  if (!event?.ok || !event.eventId || !event.category) {
    return { ok: false, policyVersion: CAUSAL_ATTRIBUTION_POLICY_VERSION, reasonCodes: ['valid-inbound-event-required'] };
  }
  const nodeId = text(responseNodeId, 220) || `response_${sha({ eventId: event.eventId }).slice(0, 24)}`;
  const at = iso(occurredAt || event.observedAt);
  if (!at) return { ok: false, policyVersion: CAUSAL_ATTRIBUTION_POLICY_VERSION, reasonCodes: ['response-time-required'] };
  const nodes = [{
    nodeId,
    type: 'RESPONSE',
    occurredAt: at,
    refs: { inboundEventId: event.eventId, category: event.category, campaignRef: event.routingRefs?.campaignRef || null, prospectRef: event.routingRefs?.prospectRef || null },
    evidenceRefs: unique([event.eventId, event.eventDigest, ...evidenceRefs])
  }];
  const edges = [];
  const sendRef = text(event.routingRefs?.sendRef, 220);
  if (sendRef) {
    edges.push({
      edgeId: `edge_${sha({ sendRef, nodeId, eventId: event.eventId }).slice(0, 24)}`,
      fromNodeId: sendRef,
      toNodeId: nodeId,
      relation: 'RECEIVED_RESPONSE',
      evidenceClass: event.evidenceClass === 'PROVIDER_OBSERVED' ? 'DIRECT' : 'ATTRIBUTED',
      confidence: event.evidenceClass === 'PROVIDER_OBSERVED' ? 1 : 0.7,
      evidenceRefs: unique([event.eventId, event.eventDigest, ...evidenceRefs])
    });
  }
  return { ok: true, policyVersion: CAUSAL_ATTRIBUTION_POLICY_VERSION, nodes, edges, externalEffectLedger: { ...ZERO_EFFECTS } };
}

export const CAUSAL_ATTRIBUTION_EXTERNAL_EFFECTS = ZERO_EFFECTS;
