// 24/7 Continuous Revenue Core, section 10: Learning and Capital Allocation.
//
// Extends funnel.mjs's own metrics (reused, not recomputed) with the mission's remaining named
// measures: complaint rate, bounce rate, recurring revenue, and fulfillment capacity. Adds a
// channel-performance evaluator that flags losing channels.
//
// "Automatically reduce or pause losing channels. Do not self-modify production rules. Generate
// reviewable recommendations instead." -- read as the mission's own resolution of that tension:
// evaluateChannelPerformance runs automatically (wired into the scheduler, see scheduler.mjs's
// 'channel-performance-review' mode) and always produces a recommendation record, but this module
// never itself calls distribution.mjs's adapters, campaign-policy.mjs's policy fields,
// scoring.mjs's SCORE_WEIGHTS, or channel-safety.mjs's allowlist -- no production rule or config is
// ever written by this file. An owner (or a separately-approved automation this mission does not
// build) decides whether to act on a recommendation.
import { computeFunnelCounts, computeFunnelRates } from './funnel.mjs';

export class LearningError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'LearningError';
    this.code = code;
  }
}

const DELIVERED_SEND_STATUSES = Object.freeze(['exported', 'fake-sent', 'externally-sent']);
const PAID_STATUSES = Object.freeze(['VERIFIED', 'SETTLED']);

export async function computeComplaintAndBounceRates(store) {
  const [suppressions, sendRecords] = await Promise.all([store.list('suppressions'), store.list('sendRecords')]);
  const delivered = sendRecords.filter(record => DELIVERED_SEND_STATUSES.includes(record.status)).length;
  const complaintCount = suppressions.filter(s => s.reason === 'complaint').length;
  const bounceCount = suppressions.filter(s => s.reason === 'bounce').length;
  return {
    complaintCount, bounceCount, delivered,
    complaintRate: delivered > 0 ? complaintCount / delivered : null,
    bounceRate: delivered > 0 ? bounceCount / delivered : null
  };
}

export async function computeRecurringRevenueCents(store) {
  const activeOffers = await store.list('monitoringOffers', { filters: { active: true } });
  return activeOffers.reduce((sum, offer) => sum + (offer.priceCents || 0), 0);
}

/** "Fulfillment capacity" -- how much open work is in flight versus how long delivered work has
 * actually taken (fulfillment.mjs#recordFulfillmentMetrics's own actualFulfillmentHours, reused,
 * not recomputed). `averageFulfillmentHours` is null, not 0, until at least one project has a
 * recorded metric -- "no data yet" is never reported as "instant fulfillment." */
export async function computeFulfillmentCapacity(store) {
  const projects = await store.list('diagnosticProjects');
  const open = projects.filter(p => !['CLOSED', 'CANCELED', 'REFUNDED', 'DISPUTED'].includes(p.status));
  const withMetrics = projects.filter(p => Number.isFinite(p.data?.fulfillmentMetrics?.actualFulfillmentHours));
  const averageFulfillmentHours = withMetrics.length
    ? withMetrics.reduce((sum, p) => sum + p.data.fulfillmentMetrics.actualFulfillmentHours, 0) / withMetrics.length
    : null;
  return { openCount: open.length, completedWithMetricsCount: withMetrics.length, averageFulfillmentHours };
}

/**
 * The single call that reports every metric the mission names by name. `revenueCents` and the
 * other funnel-rate inputs are caller-supplied (same contract as funnel.mjs#computeFunnelRates
 * itself -- this module does not recompute revenue attribution, it reuses it).
 */
export async function computeLearningMetrics(store, { revenueCents = 0, totalDirectCostCents = 0, totalDeliveryHours = [], totalOwnerMinutes = 0, falsePositiveRateValue = null } = {}) {
  const counts = await computeFunnelCounts(store);
  const rates = computeFunnelRates(counts, { totalRevenueCents: revenueCents, totalDirectCostCents, totalDeliveryHours, totalOwnerMinutes, falsePositiveRateValue });
  const complaintBounce = await computeComplaintAndBounceRates(store);
  const recurringRevenueCents = await computeRecurringRevenueCents(store);
  const fulfillmentCapacity = await computeFulfillmentCapacity(store);
  return {
    paymentProbability: rates.paymentRate,
    qualifiedReplyRate: rates.conversationRate,
    revenuePerProspect: counts.researched > 0 ? revenueCents / counts.researched : null,
    contributionMarginRate: rates.contributionMarginRate,
    repeatPurchaseRate: rates.repeatRate,
    recurringRevenueCents,
    ownerMinutesTotal: rates.ownerMinutesTotal,
    complaintRate: complaintBounce.complaintRate,
    bounceRate: complaintBounce.bounceRate,
    fulfillmentCapacity
  };
}

// ---- channel performance: flag losing channels as recommendations, never self-actuate ----

export const MIN_SAMPLE_FOR_CHANNEL_DECISION = 10;
export const LOSING_CHANNEL_PAYMENT_RATE_THRESHOLD = 0.02;

/**
 * Per-channel sample size, payment rate, and a recommendation -- never a decision. A channel below
 * MIN_SAMPLE_FOR_CHANNEL_DECISION always reports `recommendation: 'insufficient-sample'` rather
 * than a pause/no-action call: a 0-for-3 channel is not "losing," it is "unproven," and the mission
 * itself (funnel.mjs's own summarizeExperiment) already refuses to call anything significant below
 * a minimum sample -- this mirrors that same discipline for channels.
 */
export async function evaluateChannelPerformance(store, { minSample = MIN_SAMPLE_FOR_CHANNEL_DECISION, pauseThreshold = LOSING_CHANNEL_PAYMENT_RATE_THRESHOLD } = {}) {
  const [opportunities, sendRecords, payments] = await Promise.all([
    store.list('opportunities'), store.list('sendRecords'), store.list('payments')
  ]);
  const channels = [...new Set(opportunities.map(o => o.channel))];
  const results = [];
  for (const channel of channels) {
    const orgsForChannel = new Set(opportunities.filter(o => o.channel === channel).map(o => o.organizationDomain));
    const sentForChannel = sendRecords.filter(record => record.data?.channel === channel && DELIVERED_SEND_STATUSES.includes(record.status));
    const paidForChannel = payments.filter(p => PAID_STATUSES.includes(p.status) && orgsForChannel.has(p.data?.organizationDomain));
    const sampleSize = sentForChannel.length;
    const sufficientSample = sampleSize >= minSample;
    const paymentRate = sampleSize > 0 ? paidForChannel.length / sampleSize : null;
    let recommendation = 'insufficient-sample';
    if (sufficientSample) recommendation = (paymentRate !== null && paymentRate < pauseThreshold) ? 'recommend-pause' : 'no-action';
    results.push({ channel, sampleSize, paidCount: paidForChannel.length, paymentRate, sufficientSample, recommendation });
  }
  return results;
}
