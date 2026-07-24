// Funnel + experiment tracking (workstream 13). computeFunnelCounts derives every one of the
// mission's 18 named stages from already-persisted records -- never a separately-maintained
// counter that could drift from the store's own truth. Experiment assignment is deterministic
// (hash of experimentName+subjectId), and this module refuses two structural failure modes by
// name: overlapping variants for the same subject+experiment, and a "significant" result read
// before a minimum sample size is met.
import crypto from 'node:crypto';
import { id, now } from './store.mjs';

export const FUNNEL_STAGES = Object.freeze([
  'researched', 'qualified', 'approval_ready', 'approved', 'externally_sent', 'delivered', 'bounced',
  'replied', 'meaningful_reply', 'qualified_conversation', 'proposal', 'payment_request', 'payment',
  'project', 'delivery', 'repeat_order', 'monitoring', 'churn'
]);

const MEANINGFUL_REPLY_CATEGORIES = Object.freeze(['interested', 'pricing', 'proof_request', 'implementation_interest', 'monitoring_interest', 'negotiation']);
const QUALIFIED_CONVERSATION_CATEGORIES = Object.freeze(['interested', 'pricing', 'proof_request', 'implementation_interest']);

export async function computeFunnelCounts(store) {
  const [opportunities, approvals, sendRecords, replies, proposals, invoiceHandoffs, payments, projects, monitoringOffers] = await Promise.all([
    store.list('opportunities'), store.list('approvals'), store.list('sendRecords'), store.list('replies'),
    store.list('proposals'), store.list('invoiceHandoffs'), store.list('payments'), store.list('diagnosticProjects'), store.list('monitoringOffers')
  ]);
  return {
    researched: opportunities.length,
    qualified: opportunities.filter(o => o.score !== null && o.score >= 35).length,
    approval_ready: approvals.length,
    approved: approvals.filter(a => a.status === 'approved').length,
    externally_sent: sendRecords.filter(s => s.data?.externallyPerformedSend === true).length,
    delivered: sendRecords.filter(s => ['exported', 'fake-sent', 'externally-sent'].includes(s.status)).length,
    bounced: replies.filter(r => r.classification === 'bounce').length,
    replied: replies.length,
    meaningful_reply: replies.filter(r => MEANINGFUL_REPLY_CATEGORIES.includes(r.classification)).length,
    qualified_conversation: replies.filter(r => QUALIFIED_CONVERSATION_CATEGORIES.includes(r.classification)).length,
    proposal: proposals.filter(p => p.kind === 'proposal').length,
    payment_request: invoiceHandoffs.length,
    payment: payments.filter(p => ['VERIFIED', 'SETTLED'].includes(p.status)).length,
    project: projects.length,
    delivery: projects.filter(p => ['DELIVERED', 'ACCEPTED', 'IMPLEMENTATION_OFFERED', 'MONITORING_OFFERED', 'CLOSED'].includes(p.status)).length,
    repeat_order: projects.filter(p => p.data?.isRepeatOrder === true).length,
    monitoring: monitoringOffers.filter(m => m.active).length,
    churn: monitoringOffers.filter(m => m.status === 'canceled').length
  };
}

function safeRate(numerator, denominator) { return denominator > 0 ? numerator / denominator : null; }

export function computeFunnelRates(counts, { totalRevenueCents = 0, totalDirectCostCents = 0, totalDeliveryHours = [], totalOwnerMinutes = 0, falsePositiveRateValue = null } = {}) {
  return {
    responseRate: safeRate(counts.replied, counts.externally_sent),
    meaningfulResponseRate: safeRate(counts.meaningful_reply, counts.externally_sent),
    conversationRate: safeRate(counts.qualified_conversation, counts.replied),
    proposalRate: safeRate(counts.proposal, counts.qualified_conversation),
    paymentRate: safeRate(counts.payment, counts.payment_request),
    revenuePerContact: safeRate(totalRevenueCents, counts.externally_sent),
    averageDeliveryHours: totalDeliveryHours.length ? totalDeliveryHours.reduce((a, b) => a + b, 0) / totalDeliveryHours.length : null,
    ownerMinutesTotal: totalOwnerMinutes,
    directCostCents: totalDirectCostCents,
    contributionMarginRate: totalRevenueCents > 0 ? (totalRevenueCents - totalDirectCostCents) / totalRevenueCents : null,
    repeatRate: safeRate(counts.repeat_order, counts.payment),
    monitoringConversionRate: safeRate(counts.monitoring, counts.delivery),
    falsePositiveRate: falsePositiveRateValue
  };
}

// ---- experiments ----

export class ExperimentError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'ExperimentError';
    this.code = code;
  }
}

/** Deterministic hash-based assignment -- the same subject always gets the same variant for the
 * same experiment, and this is checked against any existing assignment before creating a new one
 * so a subject can never be double-assigned to conflicting variants (overlapping-variant
 * prevention). */
export async function assignVariant(store, { experimentName, variable, subjectId, variants }) {
  if (!variable) throw new ExperimentError('variable-required', 'every experiment must name the single variable it changes');
  const existing = await store.findOne('experiments', { name: experimentName, subjectId });
  if (existing) return existing;
  const overlapping = (await store.list('experiments', { filters: { subjectId } })).find(e => e.status === 'active' && e.name !== experimentName);
  if (overlapping) throw new ExperimentError('overlapping-variant', `subject ${subjectId} already has an active variant assignment for a different experiment: ${overlapping.name}`);
  const hash = crypto.createHash('sha256').update(`${experimentName}|${subjectId}`).digest();
  const variant = variants[hash.readUInt32BE(0) % variants.length];
  const record = await store.add('experiments', { id: id('exp'), name: experimentName, variable, subjectId, variant, status: 'active', outcome: null, createdAt: now() });
  return record;
}

const MIN_SAMPLE_SIZE = 30;

/** Refuses to call a result "significant" below a minimum sample size per variant -- prevents
 * "fake significance" from a handful of data points. */
export function summarizeExperiment(assignments = [], { minSampleSize = MIN_SAMPLE_SIZE } = {}) {
  const byVariant = {};
  for (const a of assignments) {
    if (!byVariant[a.variant]) byVariant[a.variant] = { total: 0, converted: 0 };
    byVariant[a.variant].total += 1;
    if (a.outcome === 'converted') byVariant[a.variant].converted += 1;
  }
  const variants = Object.entries(byVariant).map(([variant, stats]) => ({ variant, ...stats, conversionRate: safeRate(stats.converted, stats.total) }));
  const sufficientSample = variants.every(v => v.total >= minSampleSize);
  // `significant` is always false -- this module deliberately does not compute a real statistical
  // significance test (no p-value, no confidence interval); it only ever tells the caller whether
  // there is *enough sample to consider* running one. Claiming "significant" without that
  // computation would be exactly the "fake significance" the mission asks to prevent.
  return { variants, sufficientSample, significant: false };
}

/** Every outcome edit is a store.log event, not a silent field update -- "unaudited outcome edits"
 * is exactly the failure mode this guards against. */
export async function recordExperimentOutcome(store, experimentId, outcome, { actor } = {}) {
  const updated = await store.patch('experiments', experimentId, { outcome });
  if (!updated) throw new ExperimentError('experiment-not-found', experimentId);
  await store.log('experiment_outcome_recorded', { experimentId, outcome, actor });
  return updated;
}
