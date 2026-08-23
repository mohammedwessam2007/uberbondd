import crypto from 'node:crypto';

export const SERVICE_FULFILLMENT_VERSION = 'uberbond.service-fulfillment.v1.1';

export const FULFILLMENT_STATUSES = Object.freeze([
  'PLANNED',
  'IN_PROGRESS',
  'READY_FOR_QA',
  'QA_FAILED',
  'READY_FOR_DELIVERY',
  'DELIVERED',
  'ACCEPTANCE_PENDING',
  'ACCEPTED',
  'REJECTED',
  'REVISION_REQUESTED',
  'SUPPORT_ACTIVE',
  'RENEWAL_DUE',
  'RENEWED',
  'CHURNED',
  'CANCELLED'
]);

const ZERO_EFFECTS = Object.freeze({
  customerMessages: 0,
  providerCalls: 0,
  spendCents: 0,
  deployments: 0,
  dnsChanges: 0,
  credentialChanges: 0,
  paymentMutations: 0,
  productionMutations: 0
});

const MAX_REQUIREMENTS = 64;
const MAX_CRITERIA = 64;
const MAX_ARTIFACTS = 128;
const MAX_EVENTS = 512;

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function strings(values, max) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 500)).filter(Boolean))].slice(0, max);
}

function int(value, min, max, fallback = null) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= min && number <= max ? number : fallback;
}

function iso(value, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(value || fallback);
  return Number.isNaN(date.getTime()) ? new Date(fallback).toISOString() : date.toISOString();
}

function strictDate(value) {
  const date = value instanceof Date ? value : new Date(value || '');
  return Number.isNaN(date.getTime()) ? null : date;
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fail(reasonCodes, state = null, extra = {}) {
  return {
    ok: false,
    policyVersion: SERVICE_FULFILLMENT_VERSION,
    status: 'BLOCKED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    state,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS },
    ...extra
  };
}

function validEvidenceRef(value) {
  return /^(customer|receipt|evidence|artifact|qa|payment|subscription|support|delivery):/i.test(text(value, 500));
}

function validCustomerEvidence(event) {
  return event?.evidenceClass === 'EXTERNAL_CUSTOMER' && validEvidenceRef(event?.evidenceRef) && /^(customer|receipt):/i.test(text(event.evidenceRef, 500));
}

function validPaymentEvidence(event) {
  return event?.evidenceClass === 'EXTERNAL_PAYMENT' && /^(payment|receipt|subscription):/i.test(text(event?.evidenceRef, 500));
}

function cloneState(state) {
  return {
    ...state,
    requirements: [...state.requirements],
    acceptanceCriteria: [...state.acceptanceCriteria],
    artifactRefs: [...state.artifactRefs],
    qaReceipts: [...state.qaReceipts],
    eventLog: state.eventLog.map(item => ({ ...item }))
  };
}

function eventIdentity(event) {
  const canonical = {
    type: text(event?.type, 80).toUpperCase(),
    at: iso(event?.at),
    evidenceClass: text(event?.evidenceClass, 80).toUpperCase() || null,
    evidenceRef: text(event?.evidenceRef, 500) || null,
    artifactRefs: strings(event?.artifactRefs, MAX_ARTIFACTS),
    qaPassed: typeof event?.qaPassed === 'boolean' ? event.qaPassed : null,
    reason: text(event?.reason, 800) || null,
    paymentRef: text(event?.paymentRef, 500) || null
  };
  const eventId = text(event?.eventId, 120);
  return { eventId, canonical, digest: hash(canonical) };
}

export function compileFulfillmentPlan({
  serviceSkuId,
  customerRef,
  requirements,
  acceptanceCriteria,
  maxRevisions = 2,
  supportWindowDays = 30,
  renewalIntervalDays = null,
  date = new Date()
} = {}) {
  const sku = text(serviceSkuId, 160);
  const customer = text(customerRef, 200);
  const reqs = strings(requirements, MAX_REQUIREMENTS);
  const criteria = strings(acceptanceCriteria, MAX_CRITERIA);
  const revisions = int(maxRevisions, 0, 20);
  const support = int(supportWindowDays, 0, 3650);
  const renewal = renewalIntervalDays == null ? null : int(renewalIntervalDays, 1, 3650);
  const reasons = [];
  if (!sku) reasons.push('service-sku-required');
  if (!customer) reasons.push('customer-ref-required');
  if (!reqs.length) reasons.push('customer-requirements-required');
  if (!criteria.length) reasons.push('acceptance-criteria-required');
  if (revisions == null) reasons.push('bounded-max-revisions-required');
  if (support == null) reasons.push('bounded-support-window-required');
  if (renewalIntervalDays != null && renewal == null) reasons.push('valid-renewal-interval-required');
  if (reasons.length) return fail(reasons);

  const createdAt = iso(date);
  const planIdentity = { sku, customer, reqs, criteria, revisions, support, renewal };
  return {
    ok: true,
    policyVersion: SERVICE_FULFILLMENT_VERSION,
    fulfillmentId: `fulfill_${hash(planIdentity).slice(0, 24)}`,
    serviceSkuId: sku,
    customerRef: customer,
    status: 'PLANNED',
    requirements: reqs,
    acceptanceCriteria: criteria,
    maxRevisions: revisions,
    revisionCount: 0,
    supportWindowDays: support,
    renewalIntervalDays: renewal,
    recurring: renewal != null,
    artifactRefs: [],
    qaReceipts: [],
    acceptanceEvidenceRef: null,
    renewalPaymentRef: null,
    createdAt,
    updatedAt: createdAt,
    deliveredAt: null,
    acceptedAt: null,
    supportEndsAt: null,
    renewalDueAt: null,
    eventLog: [],
    economicTruth: {
      clearedRevenue: 'NOT_INFERRED',
      acceptedDelivery: false,
      retainedCustomer: 'NOT_INFERRED'
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export function applyFulfillmentEvent({ state, event, date = new Date() } = {}) {
  if (!state?.ok || state.policyVersion !== SERVICE_FULFILLMENT_VERSION || !state.fulfillmentId) {
    return fail(['valid-fulfillment-state-required']);
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) return fail(['event-object-required'], state);

  const eventAt = strictDate(event.at ?? date);
  if (!eventAt) return fail(['valid-event-time-required'], state);
  const updatedAt = strictDate(state.updatedAt);
  if (!updatedAt) return fail(['valid-state-time-required'], state);
  if (eventAt.getTime() < updatedAt.getTime()) return fail(['event-time-regression'], state);

  const identity = eventIdentity({ ...event, at: eventAt.toISOString() });
  if (!identity.eventId) return fail(['durable-event-id-required'], state);
  const prior = state.eventLog.find(item => item.eventId === identity.eventId);
  if (prior) {
    if (prior.digest !== identity.digest) return fail(['event-id-identity-collision'], state);
    return {
      ok: true,
      policyVersion: SERVICE_FULFILLMENT_VERSION,
      status: state.status,
      result: 'DUPLICATE_IGNORED',
      state,
      businessEffectAuthority: 'NONE',
      externalEffectLedger: { ...ZERO_EFFECTS }
    };
  }

  const next = cloneState(state);
  const type = identity.canonical.type;
  const reasons = [];
  let transition = null;

  const requireStatus = (...allowed) => {
    if (!allowed.includes(next.status)) reasons.push(`invalid-transition:${next.status}->${type}`);
  };
  const eventMillis = eventAt.getTime();

  switch (type) {
    case 'WORK_STARTED':
      requireStatus('PLANNED', 'QA_FAILED', 'REVISION_REQUESTED');
      transition = 'IN_PROGRESS';
      break;
    case 'WORK_COMPLETE':
      requireStatus('IN_PROGRESS');
      transition = 'READY_FOR_QA';
      break;
    case 'QA_RESULT': {
      requireStatus('READY_FOR_QA');
      if (typeof event.qaPassed !== 'boolean') reasons.push('qa-pass-boolean-required');
      if (!validEvidenceRef(event.evidenceRef) || !/^qa:/i.test(text(event.evidenceRef, 500))) reasons.push('qa-evidence-ref-required');
      if (!reasons.length) {
        next.qaReceipts.push(text(event.evidenceRef, 500));
        transition = event.qaPassed ? 'READY_FOR_DELIVERY' : 'QA_FAILED';
      }
      break;
    }
    case 'DELIVERY_RECORDED': {
      requireStatus('READY_FOR_DELIVERY');
      const artifacts = strings(event.artifactRefs, MAX_ARTIFACTS);
      if (!artifacts.length || artifacts.some(ref => !/^artifact:/i.test(ref))) reasons.push('delivery-artifact-refs-required');
      if (!reasons.length) {
        next.artifactRefs = [...new Set([...next.artifactRefs, ...artifacts])].slice(0, MAX_ARTIFACTS);
        next.deliveredAt = identity.canonical.at;
        transition = 'DELIVERED';
      }
      break;
    }
    case 'ACCEPTANCE_REQUESTED':
      requireStatus('DELIVERED');
      transition = 'ACCEPTANCE_PENDING';
      break;
    case 'CUSTOMER_ACCEPTED':
      requireStatus('ACCEPTANCE_PENDING');
      if (!validCustomerEvidence(event)) reasons.push('external-customer-acceptance-evidence-required');
      if (!reasons.length) {
        next.acceptanceEvidenceRef = text(event.evidenceRef, 500);
        next.acceptedAt = identity.canonical.at;
        next.economicTruth.acceptedDelivery = true;
        const supportEnd = new Date(Date.parse(next.acceptedAt) + next.supportWindowDays * 86400000);
        next.supportEndsAt = supportEnd.toISOString();
        if (next.recurring) {
          const due = new Date(Date.parse(next.acceptedAt) + next.renewalIntervalDays * 86400000);
          next.renewalDueAt = due.toISOString();
        }
        transition = next.supportWindowDays > 0 ? 'SUPPORT_ACTIVE' : 'ACCEPTED';
      }
      break;
    case 'CUSTOMER_REJECTED':
      requireStatus('ACCEPTANCE_PENDING');
      if (!validCustomerEvidence(event)) reasons.push('external-customer-rejection-evidence-required');
      transition = reasons.length ? null : 'REJECTED';
      break;
    case 'REVISION_REQUESTED':
      requireStatus('ACCEPTANCE_PENDING', 'REJECTED');
      if (!validCustomerEvidence(event)) reasons.push('external-customer-revision-evidence-required');
      if (next.revisionCount >= next.maxRevisions) reasons.push('revision-limit-reached');
      if (!reasons.length) {
        next.revisionCount += 1;
        transition = 'REVISION_REQUESTED';
      }
      break;
    case 'REVISION_STARTED':
      requireStatus('REVISION_REQUESTED', 'QA_FAILED');
      transition = 'IN_PROGRESS';
      break;
    case 'SUPPORT_ENDED': {
      requireStatus('SUPPORT_ACTIVE');
      const supportEnds = strictDate(next.supportEndsAt);
      if (!supportEnds) reasons.push('support-end-time-required');
      else if (eventMillis < supportEnds.getTime()) reasons.push('support-window-not-ended');
      if (!reasons.length) {
        const renewalDue = next.recurring ? strictDate(next.renewalDueAt) : null;
        transition = next.recurring && renewalDue && eventMillis >= renewalDue.getTime() ? 'RENEWAL_DUE' : 'ACCEPTED';
      }
      break;
    }
    case 'RENEWAL_DUE': {
      requireStatus('ACCEPTED', 'SUPPORT_ACTIVE', 'RENEWED');
      if (!next.recurring) reasons.push('nonrecurring-service-has-no-renewal');
      const renewalDue = strictDate(next.renewalDueAt);
      if (next.recurring && !renewalDue) reasons.push('renewal-due-time-required');
      else if (renewalDue && eventMillis < renewalDue.getTime()) reasons.push('renewal-not-due');
      transition = reasons.length ? null : 'RENEWAL_DUE';
      break;
    }
    case 'RENEWAL_CONFIRMED':
      requireStatus('RENEWAL_DUE');
      if (!next.recurring) reasons.push('nonrecurring-service-has-no-renewal');
      if (!validPaymentEvidence(event)) reasons.push('external-payment-evidence-required-for-renewal');
      if (!reasons.length) {
        next.renewalPaymentRef = text(event.evidenceRef, 500);
        next.economicTruth.retainedCustomer = true;
        transition = 'RENEWED';
      }
      break;
    case 'CUSTOMER_CHURNED':
      requireStatus('ACCEPTED', 'SUPPORT_ACTIVE', 'RENEWAL_DUE', 'RENEWED');
      if (!validCustomerEvidence(event)) reasons.push('external-customer-churn-evidence-required');
      if (!reasons.length) {
        next.economicTruth.retainedCustomer = false;
        transition = 'CHURNED';
      }
      break;
    case 'CANCELLED':
      requireStatus('PLANNED', 'IN_PROGRESS', 'READY_FOR_QA', 'QA_FAILED', 'READY_FOR_DELIVERY', 'DELIVERED', 'ACCEPTANCE_PENDING', 'REJECTED', 'REVISION_REQUESTED');
      transition = reasons.length ? null : 'CANCELLED';
      break;
    default:
      reasons.push('unsupported-fulfillment-event');
  }

  if (reasons.length || !transition) return fail(reasons.length ? reasons : ['transition-not-produced'], state);

  next.status = transition;
  next.updatedAt = identity.canonical.at;
  next.eventLog.push({
    eventId: identity.eventId,
    digest: identity.digest,
    type,
    fromStatus: state.status,
    toStatus: transition,
    at: identity.canonical.at,
    evidenceClass: identity.canonical.evidenceClass,
    evidenceRef: identity.canonical.evidenceRef
  });
  next.eventLog = next.eventLog.slice(-MAX_EVENTS);

  return {
    ok: true,
    policyVersion: SERVICE_FULFILLMENT_VERSION,
    status: transition,
    result: 'APPLIED',
    state: next,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

export function summarizeFulfillment(state) {
  if (!state?.ok || state.policyVersion !== SERVICE_FULFILLMENT_VERSION) return fail(['valid-fulfillment-state-required']);
  return {
    ok: true,
    policyVersion: SERVICE_FULFILLMENT_VERSION,
    fulfillmentId: state.fulfillmentId,
    serviceSkuId: state.serviceSkuId,
    customerRef: state.customerRef,
    status: state.status,
    revisionCount: state.revisionCount,
    maxRevisions: state.maxRevisions,
    qaReceiptCount: state.qaReceipts.length,
    artifactCount: state.artifactRefs.length,
    acceptedDelivery: state.economicTruth.acceptedDelivery,
    retainedCustomer: state.economicTruth.retainedCustomer,
    clearedRevenue: state.economicTruth.clearedRevenue,
    claimBoundary: {
      customerAcceptance: state.economicTruth.acceptedDelivery === true ? 'EXTERNALLY_EVIDENCED' : 'NOT_PROVEN',
      clearedRevenue: 'NOT_INFERRED_FROM_FULFILLMENT',
      renewalPayment: state.renewalPaymentRef ? 'EXTERNAL_PAYMENT_EVIDENCE_PRESENT' : 'NOT_PROVEN'
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
