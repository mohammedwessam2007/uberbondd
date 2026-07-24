// 24/7 Continuous Revenue Core, section 9: Payment, Fulfillment, and Recurrence.
//
// "Only independently confirmed payment may create a fulfillment job." Before this module, nothing
// in revenue-os/src/ ever called `store.add('diagnosticProjects', ...)` at all -- every diagnostic-
// workflow test built a project object inline, in memory, purely to feed deliveryGate/
// implementationGate. createFulfillmentJob is the one function that actually persists a
// diagnosticProjects record, and it is gated on payments.mjs's own `VERIFIED` status -- the same
// vocabulary verifyPayment/applyOwnerException already produce, never a second payment-confirmation
// check invented here.
import { id, now } from './store.mjs';

export class FulfillmentError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'FulfillmentError';
    this.code = code;
  }
}

/**
 * The only path that creates a diagnosticProjects record. Refuses unless `payment.status ===
 * 'VERIFIED'` -- an owner-exception-verified payment (payments.mjs#applyOwnerException) still
 * carries `status: 'VERIFIED'` plus its own visible warning, so it is honored here exactly like an
 * evidence-verified one; anything less (PENDING_VERIFICATION, CUSTOMER_REPORTED, MISMATCH, etc.)
 * is refused outright. Idempotent on `payment.id`: a second call for an already-confirmed payment
 * returns the existing project rather than creating a duplicate fulfillment job.
 */
export async function createFulfillmentJob(store, { payment, organizationDomain, offerKey, siteUrls = [] } = {}) {
  if (!payment) throw new FulfillmentError('payment-required');
  if (payment.status !== 'VERIFIED') throw new FulfillmentError('payment-not-independently-confirmed', `payment status: ${payment.status}`);
  if (!organizationDomain) throw new FulfillmentError('organization-domain-required');
  if (!offerKey) throw new FulfillmentError('offer-key-required');

  const existing = await store.findOne('diagnosticProjects', { paymentId: payment.id });
  if (existing) return existing;

  const project = await store.add('diagnosticProjects', {
    id: id('project'), paymentId: payment.id, organizationDomain, offerKey, status: 'PAID',
    data: { siteUrls, paidAt: now(), evidencePreserved: { paymentEvidenceHash: payment.evidenceHash || null, verifiedAt: payment.verifiedAt || null } }
  });
  await store.log('fulfillment_job_created', { projectId: project.id, paymentId: payment.id });
  return project;
}

// ---- fulfillment metrics: time, cost, margin, false positives, refunds, repeat orders, owner minutes ----

/**
 * Pure calculator, no store access -- computes every metric the mission names by name from
 * already-known inputs. `actualFulfillmentHours`/`withinSla` are null (not false/0) when the
 * inputs needed to compute them are missing, so "we don't know yet" is never confused with "it
 * missed SLA" or "it cost nothing."
 */
export function computeFulfillmentMetrics(project, {
  deliveredAtMs, revenueCents, directCostCents, ownerMinutes = 0,
  falsePositiveCount = 0, totalIncidentCount = 0, refunded = false, isRepeatOrder = false, slaHoursMax
} = {}) {
  const paidAtMs = Date.parse(project?.data?.paidAt || project?.createdAt || '');
  const actualFulfillmentHours = Number.isFinite(deliveredAtMs) && Number.isFinite(paidAtMs) ? (deliveredAtMs - paidAtMs) / 3600000 : null;
  const withinSla = actualFulfillmentHours !== null && Number.isFinite(slaHoursMax) ? actualFulfillmentHours <= slaHoursMax : null;
  const marginCents = Number.isFinite(revenueCents) && Number.isFinite(directCostCents) ? revenueCents - directCostCents : null;
  const marginRate = marginCents !== null && revenueCents > 0 ? marginCents / revenueCents : null;
  const falsePositiveRateValue = totalIncidentCount > 0 ? falsePositiveCount / totalIncidentCount : null;
  return {
    actualFulfillmentHours, withinSla,
    revenueCents: Number.isFinite(revenueCents) ? revenueCents : null,
    directCostCents: Number.isFinite(directCostCents) ? directCostCents : null,
    marginCents, marginRate, ownerMinutes, falsePositiveRateValue, refunded, isRepeatOrder
  };
}

export async function recordFulfillmentMetrics(store, projectId, metricsInput = {}) {
  const project = await store.get('diagnosticProjects', projectId);
  if (!project) throw new FulfillmentError('project-not-found', projectId);
  const metrics = computeFulfillmentMetrics(project, metricsInput);
  const updated = await store.patch('diagnosticProjects', projectId, { data: { ...project.data, fulfillmentMetrics: metrics, isRepeatOrder: metrics.isRepeatOrder } });
  await store.log('fulfillment_metrics_recorded', { projectId, metrics });
  return updated;
}

// ---- recurrence: additional sites, referrals, repeat work, monitoring ----

const DELIVERED_OR_LATER = Object.freeze(['DELIVERED', 'CORRECTION', 'ACCEPTED', 'IMPLEMENTATION_OFFERED', 'MONITORING_OFFERED', 'CLOSED']);

export const RECURRENCE_ACTIONS = Object.freeze(['offer_implementation', 'offer_monitoring', 'offer_additional_sites', 'request_referral']);

/**
 * Every result here is a reviewable recommendation, never an automatic action -- this module never
 * calls implementation.mjs/monitoring.mjs's own activation functions itself; an owner or a
 * downstream, separately-approved step decides whether to act on a recommendation.
 */
export function recommendRecurrenceActions(project, { implementationOffered = false, monitoringOffered = false, additionalSitesKnown = 0, monthsSinceDelivery = 0 } = {}) {
  if (!project || !DELIVERED_OR_LATER.includes(project.status)) return { recommendations: [], reason: 'project-not-yet-delivered' };
  const recommendations = [];
  if (!implementationOffered) recommendations.push({ action: 'offer_implementation', rationale: 'diagnostic delivered, no implementation offered yet' });
  if (!monitoringOffered) recommendations.push({ action: 'offer_monitoring', rationale: 'diagnostic delivered, monitoring not yet offered' });
  if (additionalSitesKnown > 0) recommendations.push({ action: 'offer_additional_sites', rationale: `${additionalSitesKnown} known additional site(s) not yet covered` });
  if (monthsSinceDelivery >= 1) recommendations.push({ action: 'request_referral', rationale: 'enough time has passed since delivery to ask for a referral' });
  return { recommendations, reason: '' };
}
