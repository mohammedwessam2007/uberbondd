import { id, now } from '../utils.mjs';

export class FulfillmentError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'FulfillmentError';
    this.code = code;
  }
}

export const FULFILLMENT_LANES = Object.freeze(['mohamed', 'contractor', 'client_provider']);
const TASK_STATES = Object.freeze(['assigned', 'in-progress', 'blocked', 'completed', 'cancelled']);
const TASK_TRANSITIONS = Object.freeze({
  assigned: new Set(['in-progress', 'blocked', 'cancelled']),
  'in-progress': new Set(['blocked', 'completed', 'cancelled']),
  blocked: new Set(['in-progress', 'cancelled']),
  completed: new Set([]),
  cancelled: new Set([])
});

/**
 * Lane selection (spec section I): given a paid, delivery-queued order this decides who does the
 * fulfillment work. Deterministic and explainable -- an owner reading `reason` should immediately
 * understand why a given lane was chosen, since this never runs unsupervised without a human able
 * to override it via a direct fulfillmentTasks patch.
 */
export function selectFulfillmentLane(delivery = {}, options = {}) {
  const amountCents = Number(delivery.amountPaid?.amountCents || 0);
  if (options.forceLane && FULFILLMENT_LANES.includes(options.forceLane)) {
    return { lane: options.forceLane, reason: 'owner-forced-lane' };
  }
  if (delivery.testMode) return { lane: 'mohamed', reason: 'test-mode-always-internal' };
  if (amountCents >= 100000) return { lane: 'contractor', reason: 'high-value-delivery-routed-to-contractor' };
  // Detect an implementation-sprint delivery structurally, via the checklist/input items
  // src/delivery.mjs's TEMPLATES.'implementation-sprint' actually generates ('implement-scope',
  // 'access-provisioned', 'written-authorization'), rather than pattern-matching the free-text
  // `selectedIssue.service` label -- that field is sourced from the audit finding's service
  // category (e.g. "Website strategy"), not the offer/delivery type, and does not reliably say
  // whether this delivery requires touching the customer's live site at all.
  const requiresSiteAccess = (delivery.implementationChecklist || []).some(item => item.id === 'implement-scope')
    || (delivery.requiredCustomerInputs || []).some(item => item.id === 'access-provisioned' || item.id === 'written-authorization');
  if (requiresSiteAccess) return { lane: 'client_provider', reason: 'requires-client-authorized-site-access' };
  return { lane: 'mohamed', reason: 'default-internal-lane' };
}

const SLA_HOURS_BY_LANE = Object.freeze({ mohamed: 72, contractor: 120, client_provider: 168 });

export function createFulfillmentTask(delivery = {}, options = {}, at = now()) {
  if (!delivery.id || delivery.status !== 'delivery-queued') throw new FulfillmentError('fulfillment-delivery-not-ready');
  const { lane, reason } = selectFulfillmentLane(delivery, options);
  const slaHours = SLA_HOURS_BY_LANE[lane];
  const slaDueAt = new Date(new Date(at).getTime() + slaHours * 3600000).toISOString();
  return {
    id: id('fulfill'),
    deliveryId: delivery.id,
    prospectId: delivery.prospectId,
    lane,
    laneReason: reason,
    status: 'assigned',
    slaDueAt,
    onboardingChecklist: [
      { id: 'credential-request-sent', title: 'Send the credential/access-request checklist to the customer', status: 'pending' },
      { id: 'lane-briefed', title: `Brief the ${lane.replace('_', ' ')} lane with the implementation brief`, status: 'pending' }
    ],
    qaChecklist: [
      { id: 'functional-check', title: 'Functional check against the approved scope', status: 'pending' },
      { id: 'regression-check', title: 'Regression check on unrelated pages', status: 'pending' },
      { id: 'evidence-diff', title: 'Before/after evidence diff recorded', status: 'pending' }
    ],
    testimonialRequested: false,
    monitoringOffered: false,
    createdAt: at,
    updatedAt: at
  };
}

function checklistDone(list = []) {
  return list.every(item => item.status === 'completed');
}

export function updateFulfillmentTask(task = {}, input = {}, at = now()) {
  const allowed = new Set(['status', 'onboardingChecklistUpdates', 'qaChecklistUpdates', 'testimonialRequested', 'monitoringOffered']);
  const unknown = Object.keys(input).filter(key => !allowed.has(key));
  if (unknown.length) throw new FulfillmentError('fulfillment-update-unknown-field');
  if (!TASK_STATES.includes(task.status)) throw new FulfillmentError('fulfillment-task-invalid');
  const applyUpdates = (list, updates) => {
    if (updates === undefined) return list;
    const byId = new Map(list.map(item => [item.id, item]));
    for (const update of updates) {
      if (!byId.has(update.id) || !['pending', 'completed', 'blocked'].includes(update.status)) throw new FulfillmentError('fulfillment-checklist-update-invalid');
      byId.set(update.id, { ...byId.get(update.id), status: update.status });
    }
    return list.map(item => byId.get(item.id));
  };
  const onboardingChecklist = applyUpdates(task.onboardingChecklist || [], input.onboardingChecklistUpdates);
  const qaChecklist = applyUpdates(task.qaChecklist || [], input.qaChecklistUpdates);
  const next = input.status === undefined ? task.status : input.status;
  if (!TASK_STATES.includes(next)) throw new FulfillmentError('fulfillment-status-invalid');
  if (next !== task.status && !TASK_TRANSITIONS[task.status]?.has(next)) throw new FulfillmentError('fulfillment-transition-invalid');
  if (next === 'completed' && !checklistDone(qaChecklist)) throw new FulfillmentError('fulfillment-qa-incomplete');
  return {
    ...task,
    onboardingChecklist,
    qaChecklist,
    status: next,
    testimonialRequested: input.testimonialRequested === undefined ? task.testimonialRequested : Boolean(input.testimonialRequested),
    monitoringOffered: input.monitoringOffered === undefined ? task.monitoringOffered : Boolean(input.monitoringOffered),
    updatedAt: at
  };
}

export function isFulfillmentTaskOverdue(task = {}, now2 = new Date()) {
  if (!['assigned', 'in-progress', 'blocked'].includes(task.status)) return false;
  const due = Date.parse(task.slaDueAt || 0);
  return Number.isFinite(due) && due < now2.getTime();
}
