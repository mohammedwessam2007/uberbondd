// The Lead-Path Revenue Leak Evidence Sprint, as a state machine.
//
// PAID -> INPUT_READY -> ANALYSIS_RUNNING -> QA_REQUIRED -> QA_PASSED ->
// DELIVERY_READY -> DELIVERED -> (CUSTOMER_ACCEPTED | CUSTOMER_REJECTED |
// CUSTOMER_SILENT) -> SUPPORT_WINDOW -> COMPLETE.
//
// This is a thin layer over `src/service-fulfillment.mjs`, not a second
// fulfilment engine. The canonical engine still owns the transition legality,
// the duplicate-event identity, the revision ceiling, the support-window clock
// and -- the part that matters -- the rule that CUSTOMER_ACCEPTED requires
// EXTERNAL_CUSTOMER evidence. Everything below either delegates to it or adds a
// sprint-shaped gate in front of it. Nothing here can accept a delivery that
// the canonical engine would refuse.
//
// The sprint adds exactly three things the engine does not have:
//
//   1. A payment precondition. A sprint opens at PAID, and in COMMERCIAL mode
//      that requires EXTERNAL_PAYMENT evidence. The engine's PLANNED state has
//      no opinion about whether anyone paid; the sprint does, because the offer
//      is payment-before-fulfilment.
//   2. Two states the engine has no name for: DELIVERY_READY (packaged, not
//      sent) and CUSTOMER_SILENT (delivered, no answer). Silence is not
//      acceptance, and giving it a state stops it being quietly filed as one.
//   3. Origin. Every sprint event declares where it came from, and origin wins
//      over any claim the event makes about itself. A SYNTHETIC event asserting
//      `evidenceClass: 'EXTERNAL_CUSTOMER'` is refused -- not downgraded,
//      refused -- because the only thing an internal test can prove is that the
//      code runs.
//
// `runSyntheticFulfillmentCanary` walks every state in all three branches and
// reports `commercialDeliveryCount: 0`. It is not evidence of a delivery. It is
// evidence that walking the whole machine produces no delivery.
import crypto from 'node:crypto';

import {
  compileFulfillmentPlan,
  applyFulfillmentEvent,
  SERVICE_FULFILLMENT_VERSION
} from './service-fulfillment.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { containsSecretValue } from './secret-patterns.mjs';

export const LEAD_PATH_SPRINT_VERSION = 'uberbond.lead-path-sprint-fulfillment-1.0.0';

export const SPRINT_STATES = Object.freeze([
  'PAID',
  'INPUT_READY',
  'ANALYSIS_RUNNING',
  'QA_REQUIRED',
  'QA_PASSED',
  'DELIVERY_READY',
  'DELIVERED',
  'CUSTOMER_ACCEPTED',
  'CUSTOMER_REJECTED',
  'CUSTOMER_SILENT',
  'SUPPORT_WINDOW',
  'COMPLETE'
]);

export const SPRINT_MODES = Object.freeze(['COMMERCIAL', 'SYNTHETIC_CANARY']);

export const SPRINT_EVENT_ORIGINS = Object.freeze(['EXTERNAL', 'INTERNAL', 'SYNTHETIC']);

/** Which events may fire from which state, and where they land. */
export const SPRINT_TRANSITIONS = Object.freeze({
  PAID: Object.freeze({ INPUTS_RECEIVED: 'INPUT_READY' }),
  INPUT_READY: Object.freeze({ ANALYSIS_STARTED: 'ANALYSIS_RUNNING' }),
  ANALYSIS_RUNNING: Object.freeze({ ANALYSIS_COMPLETE: 'QA_REQUIRED' }),
  // QA_RESULT is the one branching event: it lands on QA_PASSED or walks back
  // to ANALYSIS_RUNNING. The destination is decided by `qaPassed`, below.
  QA_REQUIRED: Object.freeze({ QA_RESULT: 'QA_PASSED' }),
  QA_PASSED: Object.freeze({ DELIVERY_PACKAGED: 'DELIVERY_READY' }),
  DELIVERY_READY: Object.freeze({ DELIVERY_SENT: 'DELIVERED' }),
  DELIVERED: Object.freeze({
    CUSTOMER_ACCEPTED: 'CUSTOMER_ACCEPTED',
    CUSTOMER_REJECTED: 'CUSTOMER_REJECTED',
    CUSTOMER_SILENCE_TIMEOUT: 'CUSTOMER_SILENT'
  }),
  CUSTOMER_ACCEPTED: Object.freeze({ SUPPORT_WINDOW_STARTED: 'SUPPORT_WINDOW' }),
  CUSTOMER_REJECTED: Object.freeze({ SUPPORT_WINDOW_STARTED: 'SUPPORT_WINDOW' }),
  CUSTOMER_SILENT: Object.freeze({ SUPPORT_WINDOW_STARTED: 'SUPPORT_WINDOW' }),
  SUPPORT_WINDOW: Object.freeze({ SUPPORT_WINDOW_ENDED: 'COMPLETE' }),
  COMPLETE: Object.freeze({})
});

/** Sprint events that must reach the canonical engine, and as what. */
const ENGINE_EVENT_FOR = Object.freeze({
  ANALYSIS_STARTED: 'WORK_STARTED',
  ANALYSIS_COMPLETE: 'WORK_COMPLETE',
  QA_RESULT: 'QA_RESULT',
  DELIVERY_SENT: 'DELIVERY_RECORDED',
  CUSTOMER_ACCEPTED: 'CUSTOMER_ACCEPTED',
  CUSTOMER_REJECTED: 'CUSTOMER_REJECTED',
  SUPPORT_WINDOW_ENDED: 'SUPPORT_ENDED'
});

/** Events whose meaning is a customer decision, so only a customer may make them. */
const CUSTOMER_DECISION_EVENTS = Object.freeze(['CUSTOMER_ACCEPTED', 'CUSTOMER_REJECTED']);

const clone = value => structuredClone(value);

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function strings(values, max = 64) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 500)).filter(Boolean))].slice(0, max);
}

function strictDate(value) {
  const date = value instanceof Date ? value : new Date(text(value, 80) || '');
  return Number.isFinite(date.getTime()) ? date : null;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fail(reasonCodes, sprint = null, extra = {}) {
  return {
    ok: false,
    policyVersion: LEAD_PATH_SPRINT_VERSION,
    status: 'BLOCKED',
    state: sprint?.state ?? null,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    sprint,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

function evidenceReferent(value, prefixes) {
  const match = new RegExp(`^(?:${prefixes}):(.*)$`, 'i').exec(text(value, 500));
  return match ? match[1].trim() : '';
}

/**
 * Origin wins.
 *
 * An event says where it came from and what class of evidence it carries. Those
 * are separate claims and only one of them is checkable here, so the checkable
 * one constrains the other: nothing that did not come from outside may describe
 * itself as external evidence. Without this the canary could hand the canonical
 * engine an EXTERNAL_CUSTOMER acceptance and the engine, which has no way to
 * know where the event came from, would take it.
 */
function originConflict({ origin, evidenceClass }) {
  const external = evidenceClass.startsWith('EXTERNAL_');
  if (external && origin !== 'EXTERNAL') return 'synthetic-origin-cannot-claim-external-evidence';
  if (!external && origin === 'EXTERNAL' && evidenceClass) return null;
  return null;
}

function validatePaymentEvidence({ mode, paymentEvidence }) {
  const reasons = [];
  const origin = text(paymentEvidence?.origin, 40).toUpperCase();
  const evidenceClass = text(paymentEvidence?.evidenceClass, 80).toUpperCase();
  const evidenceRef = text(paymentEvidence?.evidenceRef, 500);

  if (!SPRINT_EVENT_ORIGINS.includes(origin)) reasons.push('payment-evidence-origin-required');
  const conflict = originConflict({ origin, evidenceClass });
  if (conflict) reasons.push(conflict);

  if (mode === 'COMMERCIAL') {
    if (origin !== 'EXTERNAL') reasons.push('commercial-sprint-requires-external-payment-origin');
    if (evidenceClass !== 'EXTERNAL_PAYMENT') reasons.push('commercial-sprint-requires-external-payment-evidence');
    if (!evidenceReferent(evidenceRef, 'payment|receipt|subscription')) reasons.push('payment-evidence-reference-required');
  } else {
    if (origin !== 'SYNTHETIC') reasons.push('canary-sprint-requires-synthetic-origin');
    if (evidenceClass !== 'SYNTHETIC_CANARY') reasons.push('canary-sprint-requires-synthetic-canary-evidence-class');
  }
  if (containsSecretValue(evidenceRef)) reasons.push('payment-evidence-secret-detected');

  return { reasons, origin, evidenceClass, evidenceRef };
}

/**
 * Open a sprint. The sprint begins at PAID because the offer is fixed-scope and
 * payment-before-fulfilment: there is no state in which work has started and
 * money has not moved.
 */
export function openLeadPathSprint({
  serviceSkuId = 'lead-path-revenue-leak-evidence-sprint',
  customerRef,
  requirements = [],
  acceptanceCriteria = [],
  priceCents = 45000,
  currency = 'USD',
  paymentEvidence = null,
  supportWindowDays = 14,
  maxRevisions = 1,
  mode = 'COMMERCIAL',
  date = new Date()
} = {}) {
  const normalizedMode = text(mode, 40).toUpperCase();
  if (!SPRINT_MODES.includes(normalizedMode)) return fail(['valid-sprint-mode-required']);
  const at = strictDate(date);
  if (!at) return fail(['valid-sprint-open-time-required']);

  const payment = validatePaymentEvidence({ mode: normalizedMode, paymentEvidence });
  if (payment.reasons.length) return fail(payment.reasons);

  const plan = compileFulfillmentPlan({
    serviceSkuId: text(serviceSkuId, 160),
    customerRef: text(customerRef, 200),
    requirements: strings(requirements),
    acceptanceCriteria: strings(acceptanceCriteria),
    maxRevisions,
    supportWindowDays,
    renewalIntervalDays: null,
    date: at
  });
  if (!plan.ok) return fail(['canonical-fulfillment-plan-required', ...(plan.reasonCodes || [])]);

  const cents = Number(priceCents);
  if (!Number.isSafeInteger(cents) || cents <= 0) return fail(['valid-sprint-price-required']);

  const openedAt = at.toISOString();
  return {
    ok: true,
    policyVersion: LEAD_PATH_SPRINT_VERSION,
    fulfillmentPolicyVersion: SERVICE_FULFILLMENT_VERSION,
    sprintId: `sprint_${digest({ plan: plan.fulfillmentId, mode: normalizedMode, openedAt }).slice(0, 24)}`,
    mode: normalizedMode,
    state: 'PAID',
    serviceSkuId: plan.serviceSkuId,
    customerRef: plan.customerRef,
    priceCents: cents,
    currency: text(currency, 8).toUpperCase() || 'USD',
    paymentOrigin: payment.origin,
    paymentEvidenceClass: payment.evidenceClass,
    paymentEvidenceRef: payment.evidenceRef || null,
    // A synthetic sprint never claims money moved, and a commercial sprint only
    // claims what the provider-origin evidence claimed.
    clearedPayment: normalizedMode === 'COMMERCIAL' ? 'EXTERNAL_PAYMENT_EVIDENCED' : 'NOT_PROVEN',
    acceptedDelivery: false,
    acceptanceEvidenceClass: null,
    fulfillment: plan,
    fulfillmentStatus: plan.status,
    openedAt,
    updatedAt: openedAt,
    eventLog: [],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

function engineEventFor({ sprint, type, event, atIso }) {
  const engineType = ENGINE_EVENT_FOR[type];
  if (!engineType) return null;

  // SUPPORT_ENDED is only legal from SUPPORT_ACTIVE. A sprint that reached
  // SUPPORT_WINDOW without an accepted delivery leaves the engine at
  // ACCEPTANCE_PENDING or REJECTED, and there is nothing to end.
  if (engineType === 'SUPPORT_ENDED' && sprint.fulfillment.status !== 'SUPPORT_ACTIVE') return null;

  return {
    eventId: `${text(event.eventId, 100)}:${engineType.toLowerCase()}`,
    type: engineType,
    at: atIso,
    evidenceClass: text(event.evidenceClass, 80).toUpperCase() || null,
    evidenceRef: text(event.evidenceRef, 500) || null,
    artifactRefs: strings(event.artifactRefs, 128),
    qaPassed: typeof event.qaPassed === 'boolean' ? event.qaPassed : undefined,
    reason: text(event.reason, 800) || null
  };
}

/**
 * Apply one sprint event.
 *
 * Order matters: origin and mode are checked before the transition, and the
 * transition before the canonical engine, so an illegal event never reaches the
 * engine at all and an engine refusal is always about the engine's own rules.
 */
export function applySprintEvent({ sprint, event, date = new Date() } = {}) {
  if (!sprint?.ok || sprint.policyVersion !== LEAD_PATH_SPRINT_VERSION || !sprint.sprintId) {
    return fail(['valid-sprint-state-required']);
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) return fail(['sprint-event-object-required'], sprint);

  const type = text(event.type, 80).toUpperCase();
  const origin = text(event.origin, 40).toUpperCase();
  const evidenceClass = text(event.evidenceClass, 80).toUpperCase();
  const eventId = text(event.eventId, 100);
  const at = strictDate(event.at ?? date);
  if (!at) return fail(['valid-sprint-event-time-required'], sprint);
  const atIso = at.toISOString();

  const reasons = [];
  if (!eventId) reasons.push('durable-sprint-event-id-required');
  if (!SPRINT_EVENT_ORIGINS.includes(origin)) reasons.push('sprint-event-origin-required');

  const conflict = originConflict({ origin, evidenceClass });
  if (conflict) reasons.push(conflict);

  // Mode fences. A commercial sprint may never be driven by a test, and a
  // canary may never be driven by anything that could be mistaken for one.
  if (sprint.mode === 'COMMERCIAL' && origin === 'SYNTHETIC') reasons.push('commercial-sprint-refuses-synthetic-origin');
  if (sprint.mode === 'SYNTHETIC_CANARY' && origin !== 'SYNTHETIC') reasons.push('canary-sprint-requires-synthetic-origin');

  if (CUSTOMER_DECISION_EVENTS.includes(type) && sprint.mode === 'COMMERCIAL') {
    if (origin !== 'EXTERNAL') reasons.push('customer-decision-requires-external-origin');
    if (evidenceClass !== 'EXTERNAL_CUSTOMER') reasons.push('customer-decision-requires-external-customer-evidence');
  }

  const allowed = SPRINT_TRANSITIONS[sprint.state] || {};
  if (!Object.hasOwn(allowed, type)) reasons.push(`invalid-sprint-transition:${sprint.state}->${type || 'UNKNOWN'}`);

  if (containsSecretValue(text(event.evidenceRef, 500)) || strings(event.artifactRefs, 128).some(ref => containsSecretValue(ref))) {
    reasons.push('sprint-event-secret-detected');
  }

  const previousAt = strictDate(sprint.updatedAt);
  if (previousAt && at.getTime() < previousAt.getTime()) reasons.push('sprint-event-time-regression');

  if (reasons.length) return fail(reasons, sprint);

  if (sprint.eventLog.some(entry => entry.eventId === eventId)) {
    return {
      ok: true,
      policyVersion: LEAD_PATH_SPRINT_VERSION,
      status: 'DUPLICATE_IGNORED',
      state: sprint.state,
      sprint,
      reasonCodes: [],
      businessEffectAuthority: 'NONE',
      externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
    };
  }

  // QA is the one branching transition.
  let destination = allowed[type];
  if (type === 'QA_RESULT') {
    if (typeof event.qaPassed !== 'boolean') return fail(['qa-pass-boolean-required'], sprint);
    destination = event.qaPassed ? 'QA_PASSED' : 'ANALYSIS_RUNNING';
  }

  const next = clone(sprint);
  let engineAdvanced = false;
  let engineRefusal = null;

  // A canary may drive the internal half of the canonical engine, because
  // starting work and running QA are internal facts. It may never drive the
  // acceptance half, because acceptance is not an internal fact -- so the engine
  // is deliberately left where it is and the sprint records that it was.
  const engineWouldAdvance = Boolean(ENGINE_EVENT_FOR[type]);
  const acceptanceClass = CUSTOMER_DECISION_EVENTS.includes(type);
  const canaryHoldsEngine = sprint.mode === 'SYNTHETIC_CANARY' && acceptanceClass;

  if (engineWouldAdvance && !canaryHoldsEngine) {
    const engineEvent = engineEventFor({ sprint: next, type, event, atIso });
    if (engineEvent) {
      const applied = applyFulfillmentEvent({ state: next.fulfillment, event: engineEvent, date: at });
      if (!applied.ok) {
        engineRefusal = applied.reasonCodes || ['canonical-fulfillment-refused'];
      } else if (applied.result === 'APPLIED') {
        next.fulfillment = applied.state;
        engineAdvanced = true;
      }
    }
    // DELIVERY_SENT is two engine facts: the artifact left, and an answer is
    // now owed. Sent-with-nobody-asked is not a state worth being able to reach.
    if (!engineRefusal && type === 'DELIVERY_SENT' && next.fulfillment.status === 'DELIVERED') {
      const requested = applyFulfillmentEvent({
        state: next.fulfillment,
        event: { eventId: `${eventId}:acceptance-requested`, type: 'ACCEPTANCE_REQUESTED', at: atIso },
        date: at
      });
      if (requested.ok && requested.result === 'APPLIED') next.fulfillment = requested.state;
      else engineRefusal = requested.reasonCodes || ['canonical-acceptance-request-refused'];
    }
  }

  if (engineRefusal) return fail(['canonical-fulfillment-refused', ...engineRefusal], sprint);

  next.state = destination;
  next.fulfillmentStatus = next.fulfillment.status;
  next.updatedAt = atIso;
  // The only place acceptance is ever recorded, and it reads the canonical
  // engine rather than the sprint's own optimism.
  next.acceptedDelivery = next.fulfillment.economicTruth.acceptedDelivery === true;
  next.acceptanceEvidenceClass = next.acceptedDelivery ? 'EXTERNAL_CUSTOMER' : null;
  next.eventLog = [...next.eventLog, {
    eventId,
    type,
    origin,
    evidenceClass: evidenceClass || null,
    from: sprint.state,
    to: destination,
    at: atIso,
    canonicalFulfillmentAdvanced: engineAdvanced,
    canonicalFulfillmentStatus: next.fulfillment.status
  }].slice(-512);

  return {
    ok: true,
    policyVersion: LEAD_PATH_SPRINT_VERSION,
    status: 'APPLIED',
    state: destination,
    sprint: next,
    reasonCodes: canaryHoldsEngine ? ['synthetic-acceptance-not-applied-to-canonical-engine'] : [],
    canonicalFulfillmentAdvanced: engineAdvanced,
    canonicalFulfillmentStatus: next.fulfillment.status,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

/**
 * A delivery counts commercially only when the sprint was commercial and the
 * canonical engine recorded an externally evidenced acceptance. Two conditions,
 * both required; the whole point of the canary is that it satisfies neither.
 */
export function commercialDeliveryCount(sprints = []) {
  return (Array.isArray(sprints) ? sprints : []).filter(sprint =>
    sprint?.mode === 'COMMERCIAL'
    && sprint?.acceptedDelivery === true
    && sprint?.acceptanceEvidenceClass === 'EXTERNAL_CUSTOMER').length;
}

export function summarizeLeadPathSprint(sprint) {
  if (!sprint?.ok || sprint.policyVersion !== LEAD_PATH_SPRINT_VERSION) return fail(['valid-sprint-state-required']);
  return {
    ok: true,
    policyVersion: LEAD_PATH_SPRINT_VERSION,
    sprintId: sprint.sprintId,
    mode: sprint.mode,
    state: sprint.state,
    canonicalFulfillmentStatus: sprint.fulfillment.status,
    priceCents: sprint.priceCents,
    currency: sprint.currency,
    clearedPayment: sprint.clearedPayment,
    acceptedDelivery: sprint.acceptedDelivery,
    commercialDeliveryCount: commercialDeliveryCount([sprint]),
    eventCount: sprint.eventLog.length,
    claimBoundary: {
      clearedRevenue: 'NOT_INFERRED_FROM_SPRINT_STATE',
      customerAcceptance: sprint.acceptedDelivery ? 'EXTERNALLY_EVIDENCED' : 'NOT_PROVEN',
      retention: 'NOT_PROVEN'
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

const CANARY_BRANCHES = Object.freeze([
  { name: 'ACCEPTED', decision: 'CUSTOMER_ACCEPTED' },
  { name: 'REJECTED', decision: 'CUSTOMER_REJECTED' },
  { name: 'SILENT', decision: 'CUSTOMER_SILENCE_TIMEOUT' }
]);

function canaryEvent(name, index, extra = {}) {
  return { eventId: `canary-${name}-${index}`, origin: 'SYNTHETIC', ...extra };
}

/**
 * Walk the whole machine and prove nothing commercial came out of it.
 *
 * Three branches, because acceptance, rejection and silence are three different
 * futures and a canary that only walks the happy one is a canary that has not
 * looked at the two states an operator actually needs named.
 */
export function runSyntheticFulfillmentCanary({ date = new Date() } = {}) {
  const start = strictDate(date);
  if (!start) return fail(['valid-canary-time-required']);

  const branches = [];
  const visited = new Set();
  const sprints = [];
  const reasonCodes = [];

  for (const branch of CANARY_BRANCHES) {
    let cursor = start.getTime();
    const step = () => new Date(cursor += 60_000).toISOString();

    let sprint = openLeadPathSprint({
      customerRef: `canary:${branch.name.toLowerCase()}`,
      requirements: ['canary requirement: walk every sprint state'],
      acceptanceCriteria: ['canary criterion: no commercial delivery is produced'],
      paymentEvidence: { origin: 'SYNTHETIC', evidenceClass: 'SYNTHETIC_CANARY' },
      supportWindowDays: 0,
      mode: 'SYNTHETIC_CANARY',
      date: new Date(cursor)
    });
    if (!sprint.ok) return fail(['canary-sprint-open-failed', ...(sprint.reasonCodes || [])]);
    visited.add(sprint.state);

    const sequence = [
      canaryEvent(branch.name, 1, { type: 'INPUTS_RECEIVED' }),
      canaryEvent(branch.name, 2, { type: 'ANALYSIS_STARTED' }),
      canaryEvent(branch.name, 3, { type: 'ANALYSIS_COMPLETE' }),
      canaryEvent(branch.name, 4, { type: 'QA_RESULT', qaPassed: true, evidenceRef: 'qa:canary-check' }),
      canaryEvent(branch.name, 5, { type: 'DELIVERY_PACKAGED' }),
      canaryEvent(branch.name, 6, { type: 'DELIVERY_SENT', artifactRefs: ['artifact:canary-evidence-pack'] }),
      canaryEvent(branch.name, 7, { type: branch.decision, evidenceClass: 'SYNTHETIC_CANARY' }),
      canaryEvent(branch.name, 8, { type: 'SUPPORT_WINDOW_STARTED' }),
      canaryEvent(branch.name, 9, { type: 'SUPPORT_WINDOW_ENDED' })
    ];

    for (const event of sequence) {
      const applied = applySprintEvent({ sprint, event: { ...event, at: step() }, date: new Date(cursor) });
      if (!applied.ok) return fail([`canary-branch-${branch.name.toLowerCase()}-blocked`, ...(applied.reasonCodes || [])]);
      sprint = applied.sprint;
      visited.add(sprint.state);
      for (const code of applied.reasonCodes) reasonCodes.push(code);
    }

    sprints.push(sprint);
    branches.push({
      branch: branch.name,
      finalState: sprint.state,
      canonicalFulfillmentStatus: sprint.fulfillment.status,
      acceptedDelivery: sprint.acceptedDelivery,
      clearedPayment: sprint.clearedPayment
    });
  }

  const statesVisited = SPRINT_STATES.filter(state => visited.has(state));
  const unvisited = SPRINT_STATES.filter(state => !visited.has(state));

  return {
    ok: unvisited.length === 0,
    policyVersion: LEAD_PATH_SPRINT_VERSION,
    status: unvisited.length === 0 ? 'SYNTHETIC_CANARY_WALKED_EVERY_STATE' : 'SYNTHETIC_CANARY_INCOMPLETE',
    mode: 'SYNTHETIC_CANARY',
    statesVisited,
    unvisitedStates: unvisited,
    branches,
    reasonCodes: [...new Set(reasonCodes)],
    // The four numbers a synthetic walk may never move.
    commercialDeliveryCount: commercialDeliveryCount(sprints),
    acceptedDeliveryCount: sprints.filter(sprint => sprint.acceptedDelivery === true).length,
    clearedRevenueCents: 0,
    realCustomers: 0,
    truthBoundary: 'A_SYNTHETIC_WALK_PROVES_THE_MACHINE_RUNS__IT_IS_NOT_A_CUSTOMER_A_PAYMENT_OR_A_DELIVERY',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}
