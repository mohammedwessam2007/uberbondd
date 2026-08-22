import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS as ZERO_EFFECTS } from './effect-ledger.mjs';
import { COMMERCIAL_OUTCOME_POLICY_VERSION } from './commercial-outcome.mjs';

export const CAUSAL_ATTRIBUTION_POLICY_VERSION = 'causal-attribution-spine-1.0.0';

export const ATTRIBUTION_NODE_TYPES = Object.freeze([
  'SIGNAL', 'OPPORTUNITY', 'EXPERIMENT', 'OFFER', 'CHANNEL', 'TARGET',
  'ACTION', 'RESPONSE', 'CHECKOUT', 'PAYMENT', 'DELIVERY', 'ACCEPTANCE',
  'RETENTION', 'REFUND', 'DISPUTE', 'FAILURE'
]);

export const ATTRIBUTION_EDGE_BASES = Object.freeze(['DIRECT', 'ATTRIBUTED', 'INFERRED']);

const MAX_NODES = 1000;
const MAX_EDGES = 3000;
const MAX_REFS = 50;
const MAX_TRACE_DEPTH = 32;

const EVIDENCE_REF = /^(evidence|audit|test|doc|outcome|signal|task|proposal|mission|receipt|payment|delivery|github|provider|experiment|offer|channel|target|action|response|checkout|retention):/i;

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function strings(values, max = MAX_REFS) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 500)).filter(Boolean))].slice(0, max);
}

function evidenceRefs(values) {
  const refs = strings(values);
  return { refs, ok: refs.every(ref => EVIDENCE_REF.test(ref)) };
}

function normalizedConfidence(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : null;
}

function failure(reasonCodes, status = 'REJECTED', extra = {}) {
  return {
    ok: false,
    policyVersion: CAUSAL_ATTRIBUTION_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    externalEffectLedger: { ...ZERO_EFFECTS },
    ...extra
  };
}

/**
 * True only for a receipt the commercial-outcome compiler actually produced.
 *
 * The shape checks below are necessary and were not sufficient: a hand-written
 * object with the right field names minted a five-thousand-dollar economic
 * anchor, which is the precise failure the whole evidence-class apparatus
 * exists to prevent. An outcomeId is a digest of the policy version and the
 * event id, so it can be recomputed -- meaning a forger has to produce a
 * consistent receipt rather than a plausible-looking one, and a receipt that
 * consistent is one the compiler made.
 */
function isCompiledCommercialOutcome(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value.ok !== true) return false;
  if (value.policyVersion !== COMMERCIAL_OUTCOME_POLICY_VERSION) return false;
  const eventId = text(value.eventId, 300);
  const outcomeId = text(value.outcomeId, 300);
  if (!eventId || !outcomeId) return false;
  const expected = `out_${crypto.createHash('sha256')
    .update(JSON.stringify(canonical({ policyVersion: COMMERCIAL_OUTCOME_POLICY_VERSION, eventId })))
    .digest('hex').slice(0, 24)}`;
  return outcomeId === expected;
}

function safeEconomicProof(value) {
  if (!isCompiledCommercialOutcome(value)) return null;
  const truthLevel = text(value.truthLevel, 80).toUpperCase();
  const outcomeType = text(value.outcomeType, 80).toUpperCase();
  const paymentProof = value.paymentProof && typeof value.paymentProof === 'object' ? value.paymentProof : null;
  const amountCents = Number(paymentProof?.amountCents);
  const currency = text(paymentProof?.currency, 8).toUpperCase();
  const providerEventId = text(paymentProof?.providerEventId, 300);
  const validPayment = Number.isInteger(amountCents) && amountCents > 0 && /^[A-Z]{3}$/.test(currency) && providerEventId;

  if (truthLevel === 'CLEARED_PAYMENT' && ['PAYMENT_CLEARED', 'RENEWAL_CLEARED'].includes(outcomeType) && validPayment) {
    return {
      kind: outcomeType === 'RENEWAL_CLEARED' ? 'RENEWAL' : 'PAYMENT',
      amountCents,
      signedCashImpactCents: amountCents,
      currency,
      providerEventId,
      truthLevel
    };
  }
  if (truthLevel === 'REFUND_OR_DISPUTE' && ['REFUND', 'DISPUTE'].includes(outcomeType) && validPayment) {
    return {
      kind: outcomeType,
      amountCents,
      signedCashImpactCents: -amountCents,
      currency,
      providerEventId,
      truthLevel
    };
  }
  return null;
}

export function normalizeAttributionNode(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return failure(['node-object-required']);
  const nodeId = text(input.nodeId || input.id, 240);
  const type = text(input.type, 80).toUpperCase();
  const occurredAt = timestamp(input.occurredAt);
  const evidence = evidenceRefs(input.evidenceRefs || []);
  const truthLevel = text(input.truthLevel, 80).toUpperCase() || 'UNKNOWN';
  const reasons = [];
  if (!nodeId) reasons.push('node-id-required');
  if (!ATTRIBUTION_NODE_TYPES.includes(type)) reasons.push('known-node-type-required');
  if (!occurredAt) reasons.push('valid-node-time-required');
  if (!evidence.ok) reasons.push('evidence-reference-format-invalid');
  if (reasons.length) return failure(reasons);

  const economicProof = safeEconomicProof(input.economicProof || input.commercialOutcome);
  const claimsEconomicValue = input.amountCents != null || input.currency != null || input.providerEventId != null;
  if (claimsEconomicValue && !economicProof) return failure(['economic-value-requires-normalized-commercial-proof']);

  return {
    ok: true,
    policyVersion: CAUSAL_ATTRIBUTION_POLICY_VERSION,
    nodeId,
    type,
    occurredAt,
    truthLevel,
    evidenceRefs: evidence.refs,
    entityRef: text(input.entityRef, 240) || null,
    economicProof,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export function commercialOutcomeToAttributionNode(outcome = {}) {
  // The adapter's whole job is turning a commercial receipt into a node, so it
  // takes commercial receipts -- not objects that resemble them. Admitting a
  // forgery here and merely withholding its economic proof would still put a
  // node typed PAYMENT into the graph, which reads as a payment to everything
  // downstream that counts node types.
  if (!isCompiledCommercialOutcome(outcome)) {
    return failure(['normalized-commercial-outcome-required']);
  }
  const outcomeType = text(outcome.outcomeType, 80).toUpperCase();
  const type = ['PAYMENT_CLEARED', 'RENEWAL_CLEARED'].includes(outcomeType)
    ? (outcomeType === 'RENEWAL_CLEARED' ? 'RETENTION' : 'PAYMENT')
    : outcomeType === 'REFUND' ? 'REFUND'
      : outcomeType === 'DISPUTE' ? 'DISPUTE'
        : outcomeType === 'DELIVERY_ACCEPTED' ? 'ACCEPTANCE'
          : outcomeType === 'CHECKOUT_STARTED' ? 'CHECKOUT'
            : outcomeType === 'FAILURE' || outcomeType === 'CHURN' ? 'FAILURE'
              : 'OPPORTUNITY';
  return normalizeAttributionNode({
    nodeId: `outcome:${outcome.outcomeId}`,
    type,
    occurredAt: outcome.occurredAt,
    truthLevel: outcome.truthLevel || 'OBSERVED_OUTCOME',
    evidenceRefs: [`outcome:${outcome.outcomeId}`],
    entityRef: outcome.lineage?.opportunityId ? `opportunity:${outcome.lineage.opportunityId}` : null,
    commercialOutcome: outcome
  });
}

export function normalizeAttributionEdge(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return failure(['edge-object-required']);
  const sourceId = text(input.sourceId, 240);
  const targetId = text(input.targetId, 240);
  const relation = text(input.relation, 120).toUpperCase();
  const basis = text(input.basis, 80).toUpperCase() || 'INFERRED';
  const evidence = evidenceRefs(input.evidenceRefs || []);
  const confidence = normalizedConfidence(input.confidence);
  const reasons = [];
  if (!sourceId || !targetId) reasons.push('edge-endpoints-required');
  if (sourceId && targetId && sourceId === targetId) reasons.push('self-edge-rejected');
  if (!/^[A-Z][A-Z0-9_]{1,79}$/.test(relation)) reasons.push('edge-relation-required');
  if (!ATTRIBUTION_EDGE_BASES.includes(basis)) reasons.push('known-edge-basis-required');
  if (!evidence.ok) reasons.push('evidence-reference-format-invalid');
  if (input.confidence != null && confidence == null) reasons.push('edge-confidence-0-to-1-required');
  if (basis === 'DIRECT' && evidence.refs.length === 0) reasons.push('direct-edge-evidence-required');
  if (reasons.length) return failure(reasons);
  const identity = { sourceId, targetId, relation, basis, evidenceRefs: evidence.refs };
  return {
    ok: true,
    policyVersion: CAUSAL_ATTRIBUTION_POLICY_VERSION,
    edgeId: text(input.edgeId, 240) || `edge_${digest(identity).slice(0, 24)}`,
    sourceId,
    targetId,
    relation,
    basis,
    confidence: confidence ?? (basis === 'DIRECT' ? 1 : basis === 'ATTRIBUTED' ? 0.75 : 0.25),
    evidenceRefs: evidence.refs,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

function dedupeById(items, idField) {
  const kept = new Map();
  const conflicts = [];
  let duplicateCount = 0;
  for (const item of items) {
    const id = item[idField];
    const fingerprint = digest(item);
    const prior = kept.get(id);
    if (!prior) kept.set(id, { item, fingerprint });
    else if (prior.fingerprint === fingerprint) duplicateCount += 1;
    else conflicts.push(id);
  }
  return {
    items: [...kept.entries()].filter(([id]) => !conflicts.includes(id)).map(([, record]) => record.item),
    conflicts: [...new Set(conflicts)],
    duplicateCount
  };
}

function detectCycle(nodeIds, edges) {
  const graph = new Map([...nodeIds].map(id => [id, []]));
  for (const edge of edges) if (graph.has(edge.sourceId) && graph.has(edge.targetId)) graph.get(edge.sourceId).push(edge.targetId);
  const visiting = new Set();
  const visited = new Set();
  const path = [];
  function walk(id) {
    if (visiting.has(id)) return [...path, id];
    if (visited.has(id)) return null;
    visiting.add(id); path.push(id);
    for (const next of graph.get(id) || []) {
      const cycle = walk(next);
      if (cycle) return cycle;
    }
    path.pop(); visiting.delete(id); visited.add(id);
    return null;
  }
  for (const id of graph.keys()) {
    const cycle = walk(id);
    if (cycle) return cycle;
  }
  return null;
}

export function buildCausalAttributionGraph({ nodes = [], edges = [], commercialOutcomes = [] } = {}) {
  if (!Array.isArray(nodes) || !Array.isArray(edges) || !Array.isArray(commercialOutcomes)) return failure(['nodes-edges-outcomes-arrays-required']);
  if (nodes.length + commercialOutcomes.length > MAX_NODES) return failure(['node-limit-exceeded']);
  if (edges.length > MAX_EDGES) return failure(['edge-limit-exceeded']);

  const rejectedNodes = [];
  const normalizedNodes = [];
  for (const input of nodes) {
    const node = normalizeAttributionNode(input);
    if (node.ok) normalizedNodes.push(node); else rejectedNodes.push(node.reasonCodes);
  }
  for (const outcome of commercialOutcomes) {
    const node = commercialOutcomeToAttributionNode(outcome);
    if (node.ok) normalizedNodes.push(node); else rejectedNodes.push(node.reasonCodes);
  }

  const rejectedEdges = [];
  const normalizedEdges = [];
  for (const input of edges) {
    const edge = normalizeAttributionEdge(input);
    if (edge.ok) normalizedEdges.push(edge); else rejectedEdges.push(edge.reasonCodes);
  }

  const nodeDedupe = dedupeById(normalizedNodes, 'nodeId');
  const edgeDedupe = dedupeById(normalizedEdges, 'edgeId');
  const nodeMap = new Map(nodeDedupe.items.map(node => [node.nodeId, node]));
  const missingEndpointEdges = edgeDedupe.items
    .filter(edge => !nodeMap.has(edge.sourceId) || !nodeMap.has(edge.targetId))
    .map(edge => edge.edgeId);
  const presentEdges = edgeDedupe.items.filter(edge => !missingEndpointEdges.includes(edge.edgeId));
  const cycle = detectCycle(new Set(nodeMap.keys()), presentEdges);
  const timeReversalEdges = presentEdges.filter(edge => {
    const source = nodeMap.get(edge.sourceId);
    const target = nodeMap.get(edge.targetId);
    return Date.parse(source.occurredAt) > Date.parse(target.occurredAt);
  }).map(edge => edge.edgeId);

  const contradictions = [
    ...nodeDedupe.conflicts.map(id => `node:${id}`),
    ...edgeDedupe.conflicts.map(id => `edge:${id}`)
  ];
  const economicAnchors = nodeDedupe.items
    .filter(node => node.economicProof)
    .map(node => ({ nodeId: node.nodeId, ...node.economicProof }));

  let status = 'VERIFIED_SHAPE';
  if (contradictions.length || cycle) status = 'CONTRADICTED';
  else if (rejectedNodes.length || rejectedEdges.length || missingEndpointEdges.length || timeReversalEdges.length) status = 'DEGRADED';

  return {
    ok: status !== 'CONTRADICTED',
    policyVersion: CAUSAL_ATTRIBUTION_POLICY_VERSION,
    status,
    nodes: nodeDedupe.items,
    edges: presentEdges,
    economicAnchors,
    diagnostics: {
      rejectedNodeCount: rejectedNodes.length,
      rejectedEdgeCount: rejectedEdges.length,
      duplicateNodeCount: nodeDedupe.duplicateCount,
      duplicateEdgeCount: edgeDedupe.duplicateCount,
      nodeIdentityConflicts: nodeDedupe.conflicts,
      edgeIdentityConflicts: edgeDedupe.conflicts,
      missingEndpointEdges,
      timeReversalEdges,
      cycle: cycle || null,
      contradictions
    },
    economicRule: 'Economic weight is accepted only from already-normalized cleared-payment/refund commercial outcome receipts. Graph edges never create revenue or prove causality.',
    authorization: { allocation: 'DISABLED', spend: 'DISABLED', externalActions: 'DISABLED' },
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

function associationClass(edges) {
  if (!edges.length) return 'UNCONNECTED';
  if (edges.some(edge => edge.basis === 'INFERRED')) return 'HYPOTHESIS';
  if (edges.some(edge => edge.basis === 'ATTRIBUTED')) return 'ATTRIBUTED_ASSOCIATION';
  return 'DIRECT_EVIDENCE_CHAIN';
}

export function traceEconomicAttribution({ graph, economicNodeId, maxDepth = MAX_TRACE_DEPTH } = {}) {
  if (!graph?.nodes || !graph?.edges || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) return failure(['valid-attribution-graph-required']);
  const depthLimit = Number.isSafeInteger(Number(maxDepth)) ? Math.max(1, Math.min(MAX_TRACE_DEPTH, Number(maxDepth))) : MAX_TRACE_DEPTH;
  const nodeMap = new Map(graph.nodes.map(node => [node.nodeId, node]));
  const anchor = nodeMap.get(text(economicNodeId, 240));
  if (!anchor) return failure(['economic-anchor-node-not-found']);
  if (!anchor.economicProof) return failure(['economic-proof-required-on-anchor']);

  const incoming = new Map();
  for (const edge of graph.edges) {
    if (!incoming.has(edge.targetId)) incoming.set(edge.targetId, []);
    incoming.get(edge.targetId).push(edge);
  }
  const ancestors = new Map();
  const traversedEdges = new Map();
  const queue = [{ nodeId: anchor.nodeId, depth: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (current.depth >= depthLimit) continue;
    for (const edge of incoming.get(current.nodeId) || []) {
      traversedEdges.set(edge.edgeId, edge);
      const priorDepth = ancestors.get(edge.sourceId);
      const nextDepth = current.depth + 1;
      if (priorDepth == null || nextDepth < priorDepth) {
        ancestors.set(edge.sourceId, nextDepth);
        queue.push({ nodeId: edge.sourceId, depth: nextDepth });
      }
    }
  }
  const usedEdges = [...traversedEdges.values()];
  const weakestConfidence = usedEdges.length ? Math.min(...usedEdges.map(edge => edge.confidence)) : null;
  const ancestorNodes = [...ancestors.entries()]
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([nodeId, depth]) => ({ nodeId, depth, type: nodeMap.get(nodeId)?.type || 'UNKNOWN' }));
  return {
    ok: true,
    policyVersion: CAUSAL_ATTRIBUTION_POLICY_VERSION,
    status: 'TRACE_ONLY',
    economicAnchor: { nodeId: anchor.nodeId, type: anchor.type, economicProof: anchor.economicProof },
    associationClass: associationClass(usedEdges),
    weakestConfidence,
    ancestorNodes,
    traversedEdges: usedEdges.map(edge => ({ edgeId: edge.edgeId, sourceId: edge.sourceId, targetId: edge.targetId, relation: edge.relation, basis: edge.basis, confidence: edge.confidence })),
    attributionWarning: 'Ancestor inclusion does not allocate or causally assign the anchor payment. It records an evidence-backed association path only.',
    allocationAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}


// How an observed inbound reply becomes a node in this graph.
//
// The mapping is deliberately lossy in one direction: an inbound event's
// evidence class caps the edge basis it can produce, and nothing a caller
// passes can lift that cap. A message the provider actually handed us is
// DIRECT; a payload somebody typed into a fixture is INFERRED, forever. That
// is the whole boundary between "a customer replied" and "somebody says a
// customer replied".
const INBOUND_EVIDENCE_TO_EDGE_BASIS = Object.freeze({
  PROVIDER_OBSERVED: 'DIRECT',
  UNVERIFIED_INPUT: 'ATTRIBUTED',
  TEST_FIXTURE: 'INFERRED'
});

// A reply proves someone read a message. It proves nothing about money, so an
// inbound event may never mint a PAYMENT/RETENTION/ACCEPTANCE node -- those
// come only from normalized cleared-payment receipts.
const INBOUND_CATEGORY_TO_NODE_TYPE = Object.freeze({
  REPLY: 'RESPONSE',
  OUT_OF_OFFICE: 'RESPONSE',
  BOUNCE: 'FAILURE',
  COMPLAINT: 'FAILURE',
  UNSUBSCRIBE: 'FAILURE',
  AUTO_REPLY: 'RESPONSE',
  UNKNOWN: 'RESPONSE'
});

/**
 * Turn one compiled inbound feedback event into graph fragments.
 *
 * Returns nodes/edges in this module's own normalized shape, so the result can
 * be handed straight to buildCausalAttributionGraph without a second, drifting
 * translation living at the call site.
 */
export function inboundEventToAttributionFragment(event, { responseNodeId = '', occurredAt = '', evidenceRefs: extraRefs = [] } = {}) {
  if (!event || typeof event !== 'object' || event.ok !== true || !event.eventId || !event.category) {
    return failure(['valid-inbound-event-required']);
  }
  const basis = INBOUND_EVIDENCE_TO_EDGE_BASIS[text(event.evidenceClass, 80).toUpperCase()];
  if (!basis) return failure(['known-inbound-evidence-class-required']);
  const type = INBOUND_CATEGORY_TO_NODE_TYPE[text(event.category, 80).toUpperCase()] || 'RESPONSE';
  const at = timestamp(occurredAt || event.observedAt);
  if (!at) return failure(['response-time-required']);

  const nodeId = text(responseNodeId, 240) || `response:${digest({ eventId: event.eventId }).slice(0, 24)}`;
  // Inbound identifiers are prefixed so they satisfy the same evidence-ref
  // grammar every other ref in this graph obeys. An unprefixed opaque id would
  // simply be dropped, and the node would silently lose its provenance.
  const refs = strings([
    `response:${event.eventId}`,
    event.eventDigest ? `evidence:${event.eventDigest}` : '',
    ...(Array.isArray(extraRefs) ? extraRefs : [])
  ]);

  const node = normalizeAttributionNode({
    nodeId,
    type,
    occurredAt: at,
    truthLevel: event.evidenceClass,
    evidenceRefs: refs,
    entityRef: event.routingRefs?.prospectRef ? `target:${event.routingRefs.prospectRef}` : null
  });
  if (!node.ok) return node;

  const edges = [];
  const sendRef = text(event.routingRefs?.sendRef, 240);
  if (sendRef) {
    const edge = normalizeAttributionEdge({
      sourceId: sendRef,
      targetId: nodeId,
      relation: 'RECEIVED_RESPONSE',
      basis,
      confidence: basis === 'DIRECT' ? 1 : basis === 'ATTRIBUTED' ? 0.7 : 0.25,
      evidenceRefs: refs
    });
    if (!edge.ok) return edge;
    edges.push(edge);
  }

  return {
    ok: true,
    policyVersion: CAUSAL_ATTRIBUTION_POLICY_VERSION,
    nodes: [node],
    edges,
    edgeBasis: basis,
    suppressionRecommended: ['BOUNCE', 'COMPLAINT', 'UNSUBSCRIBE'].includes(text(event.category, 80).toUpperCase()),
    authorization: { allocation: 'DISABLED', spend: 'DISABLED', externalActions: 'DISABLED' },
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export const CAUSAL_ATTRIBUTION_EXTERNAL_EFFECTS = ZERO_EFFECTS;
