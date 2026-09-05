import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileUberBondCognitiveGraph } from './uberbond-cognitive-graph.mjs';

export const UBERBOND_COGNITIVE_EVENT_SCHEMA = 'uberbond.cognitive-event.v1';
export const UBERBOND_COGNITIVE_BUS_POLICY_VERSION = 'uberbond-cognitive-bus-1.1.0';

const EVENT_KINDS = new Set([
  'WORLD_SIGNAL', 'GAMECHANGER_CANDIDATE', 'GENESIS_HYPOTHESIS', 'GENESIS_SCIENTIST_AGENDA',
  'ONTOLOGY_CANDIDATE', 'METABOLISM_UPDATE', 'MECHANISM_ATOM', 'IDEA_CANDIDATE',
  'OPPORTUNITY_CANDIDATE', 'CAPABILITY_GAP', 'CAPABILITY_CANDIDATE', 'MODEL_CANDIDATE',
  'EXPERIMENT_RESULT', 'CONTRADICTION', 'BLOCKER', 'CODE_DEFECT', 'CODE_CHANGE_CANDIDATE',
  'VERIFICATION_RESULT', 'DISTRIBUTION_RESULT', 'PAYMENT_RESULT', 'DELIVERY_RESULT',
  'RETENTION_RESULT', 'COMMERCIAL_OUTCOME', 'ECONOMIC_LEARNING', 'REVOCATION'
]);

const EVENT_TARGET_HINTS = Object.freeze({
  WORLD_SIGNAL: ['gamechanger'],
  GAMECHANGER_CANDIDATE: ['genesis', 'business-genome'],
  GENESIS_HYPOTHESIS: ['genesis-evolution', 'idea-generator', 'opportunity-factory'],
  GENESIS_SCIENTIST_AGENDA: ['genesis-scientist', 'event-horizon', 'max-council'],
  ONTOLOGY_CANDIDATE: ['genesis-ontology', 'world-brain', 'gamechanger'],
  METABOLISM_UPDATE: ['genesis-metabolism', 'economic-memory', 'gamechanger', 'genesis'],
  MECHANISM_ATOM: ['business-genome', 'idea-generator'],
  IDEA_CANDIDATE: ['opportunity-factory', 'event-horizon', 'max-council'],
  OPPORTUNITY_CANDIDATE: ['event-horizon', 'capability-genome', 'max-council'],
  CAPABILITY_GAP: ['capability-genome', 'saas-cannibal', 'wallbreaker'],
  CAPABILITY_CANDIDATE: ['capability-genome', 'avengers', 'max-council'],
  MODEL_CANDIDATE: ['open-model-universe', 'avengers'],
  EXPERIMENT_RESULT: ['genesis-scientist', 'event-horizon', 'economic-memory'],
  CONTRADICTION: ['genesis', 'genesis-scientist', 'max-council'],
  BLOCKER: ['wallbreaker', 'max-council'],
  CODE_DEFECT: ['max-council', 'wallbreaker'],
  CODE_CHANGE_CANDIDATE: ['max-council', 'self-maintainer'],
  VERIFICATION_RESULT: ['genesis-scientist', 'kilimanjaro', 'economic-memory'],
  DISTRIBUTION_RESULT: ['event-horizon', 'economic-memory'],
  PAYMENT_RESULT: ['payment-reconciliation', 'economic-memory'],
  DELIVERY_RESULT: ['fulfilment-qa', 'economic-memory'],
  RETENTION_RESULT: ['retention-learning', 'economic-memory'],
  COMMERCIAL_OUTCOME: ['event-horizon', 'business-genome', 'opportunity-factory', 'capability-genome', 'economic-memory'],
  ECONOMIC_LEARNING: ['gamechanger', 'genesis', 'business-genome', 'event-horizon', 'capability-genome', 'world-brain'],
  REVOCATION: ['genesis-metabolism', 'capability-genome', 'open-model-universe', 'world-brain']
});

function zeroEffects() {
  return structuredClone(ZERO_EXTERNAL_EFFECTS);
}

function text(value, max = 1000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function timestamp(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function list(value, max = 128, itemMax = 1000) {
  if (!Array.isArray(value) || value.length > max) return null;
  const out = [];
  const seen = new Set();
  for (const item of value) {
    const normalized = text(item, itemMax);
    if (!normalized) return null;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function fail(reasonCodes, status = 'COGNITIVE_EVENT_REJECTED', extra = {}) {
  return {
    ok: false,
    policyVersion: UBERBOND_COGNITIVE_BUS_POLICY_VERSION,
    status,
    reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    ...extra
  };
}

export function compileCognitiveEvent({
  kind,
  sourceNodeId,
  subjectType,
  subjectId,
  summary,
  evidenceRefs = [],
  payloadRef = null,
  truthClass = 'RESEARCH_ASSET',
  observedAt = new Date(),
  parentEventIds = []
} = {}) {
  const reasons = [];
  const eventKind = text(kind, 80)?.toUpperCase();
  const source = text(sourceNodeId, 120)?.toLowerCase();
  const type = text(subjectType, 120)?.toUpperCase();
  const id = text(subjectId, 300);
  const synopsis = text(summary, 4000);
  const refs = list(evidenceRefs, 128, 1500);
  const parents = list(parentEventIds, 64, 160);
  const at = timestamp(observedAt);
  const truth = text(truthClass, 80)?.toUpperCase();
  const payload = payloadRef == null ? null : text(payloadRef, 1500);
  const graph = compileUberBondCognitiveGraph();
  if (!eventKind || !EVENT_KINDS.has(eventKind)) reasons.push('recognized-event-kind-required');
  if (!source || !graph.ok || !graph.nodes.some(node => node.id === source)) reasons.push('known-source-node-required');
  if (!type || !id || !synopsis) reasons.push('subject-and-summary-required');
  if (!refs) reasons.push('bounded-evidence-refs-required');
  if (!parents) reasons.push('bounded-parent-events-required');
  if (!at || !truth) reasons.push('truth-class-and-observed-at-required');
  if (reasons.length) return fail(reasons);

  const core = {
    schemaVersion: UBERBOND_COGNITIVE_EVENT_SCHEMA,
    kind: eventKind,
    sourceNodeId: source,
    subjectType: type,
    subjectId: id,
    summary: synopsis,
    evidenceRefs: refs,
    payloadRef: payload,
    truthClass: truth,
    observedAt: at,
    parentEventIds: parents,
    consequenceAuthority: 'NONE',
    businessEffectAuthority: 'NONE'
  };
  return {
    ok: true,
    policyVersion: UBERBOND_COGNITIVE_BUS_POLICY_VERSION,
    status: 'COGNITIVE_EVENT_READY',
    eventId: `brain_evt_${hash(core).slice(0, 24)}`,
    event: core,
    externalEffectLedger: zeroEffects()
  };
}

export function routeCognitiveEvent({ graph = compileUberBondCognitiveGraph(), compiledEvent } = {}) {
  if (!graph?.ok) return fail(['valid-cognitive-graph-required'], 'COGNITIVE_ROUTE_BLOCKED');
  if (!compiledEvent?.ok || compiledEvent.status !== 'COGNITIVE_EVENT_READY') return fail(['compiled-cognitive-event-required'], 'COGNITIVE_ROUTE_BLOCKED');
  const event = compiledEvent.event;
  const hints = EVENT_TARGET_HINTS[event.kind] || [];
  const graphTargets = graph.edges.filter(edge => edge.from === event.sourceNodeId).map(edge => edge.to);
  const targets = [...new Set([...hints, ...graphTargets])].filter(id => graph.nodes.some(node => node.id === id));
  const activations = targets.map(targetNodeId => {
    const direct = graph.edges.filter(edge => edge.from === event.sourceNodeId && edge.to === targetNodeId).map(edge => edge.type);
    return {
      activationId: `brain_act_${hash({ eventId: compiledEvent.eventId, targetNodeId }).slice(0, 24)}`,
      eventId: compiledEvent.eventId,
      sourceNodeId: event.sourceNodeId,
      targetNodeId,
      relations: direct.length ? direct : ['SEMANTIC_WAKE'],
      inheritedEvidenceRefs: [...event.evidenceRefs],
      inheritedTruthClass: event.truthClass,
      consequenceAuthority: 'NONE',
      businessEffectAuthority: 'NONE'
    };
  });
  return {
    ok: true,
    policyVersion: UBERBOND_COGNITIVE_BUS_POLICY_VERSION,
    status: activations.length ? 'COGNITIVE_EVENT_ROUTED' : 'COGNITIVE_EVENT_NO_ROUTE',
    eventId: compiledEvent.eventId,
    sourceNodeId: event.sourceNodeId,
    activations,
    activationCount: activations.length,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects(),
    truthBoundary: 'ACTIVATION IS ATTENTION AND CONTEXT ROUTING ONLY; IT DOES NOT AUTHORIZE EXECUTION OR EXTERNAL CONSEQUENCES'
  };
}

export function compileClosedLoopActivation({ events = [], graph = compileUberBondCognitiveGraph() } = {}) {
  if (!Array.isArray(events) || events.length > 1000) return fail(['bounded-event-list-required'], 'COGNITIVE_CYCLE_BLOCKED');
  const routes = [];
  const reasons = [];
  for (const event of events) {
    const route = routeCognitiveEvent({ graph, compiledEvent: event });
    if (!route.ok) reasons.push(...route.reasonCodes);
    else routes.push(route);
  }
  if (reasons.length) return fail(reasons, 'COGNITIVE_CYCLE_BLOCKED');
  const targetCounts = {};
  for (const route of routes) {
    for (const activation of route.activations) targetCounts[activation.targetNodeId] = (targetCounts[activation.targetNodeId] || 0) + 1;
  }
  return {
    ok: true,
    policyVersion: UBERBOND_COGNITIVE_BUS_POLICY_VERSION,
    status: 'COGNITIVE_CYCLE_COMPILED',
    eventCount: events.length,
    activationCount: routes.reduce((sum, route) => sum + route.activationCount, 0),
    targetCounts,
    routes,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
}

export const UBERBOND_COGNITIVE_EVENT_KINDS = Object.freeze([...EVENT_KINDS]);
