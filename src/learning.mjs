import crypto from 'node:crypto';

export const LEARNING_DIMENSIONS = Object.freeze([
  'campaign', 'country', 'niche', 'evidenceType', 'subjectVariant',
  'messageVariant', 'cta', 'recipientRole', 'sendTime', 'inbox'
]);

export const LEARNING_METRICS = Object.freeze([
  'qualificationRate', 'draftApprovalRate', 'replyRate', 'positiveReplyRate',
  'meetingRate', 'checkoutRate', 'paidRate', 'bounceRate', 'unsubscribeRate'
]);

const DIMENSION_SET = new Set(LEARNING_DIMENSIONS);
const METRIC_SET = new Set(LEARNING_METRICS);
const LOWER_IS_BETTER = new Set(['bounceRate', 'unsubscribeRate']);
const POSITIVE_REPLY_LABELS = new Set(['interested', 'meeting-requested', 'asks-for-information']);
const HUMAN_REPLY_EXCLUSIONS = new Set(['automatic-reply', 'bounce', 'complaint']);
const EVENT_KEYS = Object.freeze([
  'discovered', 'qualified', 'draftApproved', 'sent', 'delivered', 'bounced',
  'unsubscribed', 'replied', 'positivelyReplied', 'meetingRequested',
  'proposalSent', 'checkoutSent', 'paid', 'deliveryCompleted'
]);
const EXPERIMENT_FIELDS = new Set([
  'campaignId', 'name', 'dimension', 'variants', 'primaryMetric',
  'minimumSampleSize', 'minimumAbsoluteLift', 'minimumRelativeLift'
]);

export class LearningError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'LearningError';
    this.code = code;
    this.status = status;
  }
}

function clean(value = '', maximum = 160) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function safeLabel(value, fallback = 'unassigned') {
  const label = clean(value, 180);
  if (!label || /\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(label)) return fallback;
  return label;
}

function dateValue(...values) {
  for (const value of values) {
    const parsed = Date.parse(value || '');
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function inDateRange(prospect, filters) {
  const timestamp = dateValue(prospect.discoveredAt, prospect.createdAt, prospect.updatedAt);
  const from = filters.dateFrom ? Date.parse(`${filters.dateFrom}T00:00:00.000Z`) : 0;
  const to = filters.dateTo ? Date.parse(`${filters.dateTo}T23:59:59.999Z`) : 0;
  if (from && (!timestamp || timestamp < from)) return false;
  if (to && (!timestamp || timestamp > to)) return false;
  return true;
}

function matchesFilters(prospect, campaign, filters = {}) {
  if (filters.campaignId && prospect.campaignId !== filters.campaignId) return false;
  if (filters.country && clean(prospect.country).toLowerCase() !== clean(filters.country).toLowerCase()) return false;
  if (filters.niche && clean(prospect.niche || campaign?.niche).toLowerCase() !== clean(filters.niche).toLowerCase()) return false;
  return inDateRange(prospect, filters);
}

function liveRecord(record = {}) {
  return record.simulated !== true && record.testMode !== true && record.provider !== 'test' && record.providerMode !== 'test';
}

function initialOutreachMessage(record = {}) {
  return liveRecord(record) && record.kind !== 'transactional-report' && Number(record.followup || 0) === 0;
}

function firstByTime(rows = [], ...fields) {
  return [...rows].sort((left, right) => dateValue(...fields.map(field => left[field])) - dateValue(...fields.map(field => right[field])))[0] || null;
}

function sendTimeBucket(message) {
  if (!message) return 'unassigned';
  const timestamp = new Date(message.sentAt || message.createdAt || '');
  if (Number.isNaN(timestamp.getTime())) return 'unassigned';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `${days[timestamp.getUTCDay()]} ${String(timestamp.getUTCHours()).padStart(2, '0')}:00 UTC`;
}

function credibleQualification(prospect, campaign = {}) {
  const issue = prospect.issue || {};
  const confidence = Number(issue.confidence || 0);
  const minimumConfidence = Number(campaign.minimumEvidenceConfidence ?? campaign.minEvidenceConfidence ?? 0.72);
  const minimumScore = Number(campaign.minimumProspectScore ?? campaign.minScore ?? 0);
  return Boolean(
    issue.safeForOutreach !== false && issue.evidenceValidation?.valid !== false &&
    clean(issue.evidenceUrl || issue.evidence?.url, 2000) && clean(issue.evidenceExcerpt || issue.evidence?.excerpt, 500) &&
    confidence >= minimumConfidence && Number(prospect.score?.total || 0) >= minimumScore
  );
}

function emptyCounts() {
  return Object.fromEntries(EVENT_KEYS.map(key => [key, 0]));
}

function ratesFor(counts) {
  const rate = (numerator, denominator) => denominator ? Number((numerator / denominator * 100).toFixed(2)) : 0;
  return {
    qualificationRate: rate(counts.qualified, counts.discovered),
    draftApprovalRate: rate(counts.draftApproved, counts.qualified),
    deliveryKnownRate: rate(counts.delivered, counts.sent),
    bounceRate: rate(counts.bounced, counts.sent),
    unsubscribeRate: rate(counts.unsubscribed, counts.sent),
    replyRate: rate(counts.replied, counts.sent),
    positiveReplyRate: rate(counts.positivelyReplied, counts.sent),
    meetingRate: rate(counts.meetingRequested, counts.sent),
    checkoutRate: rate(counts.checkoutSent, counts.sent),
    paidRate: rate(counts.paid, counts.sent),
    deliveryCompletionRate: rate(counts.deliveryCompleted, counts.paid)
  };
}

function sampleSizesFor(counts) {
  return {
    qualificationRate: counts.discovered,
    draftApprovalRate: counts.qualified,
    replyRate: counts.sent,
    positiveReplyRate: counts.sent,
    meetingRate: counts.sent,
    checkoutRate: counts.sent,
    paidRate: counts.sent,
    bounceRate: counts.sent,
    unsubscribeRate: counts.sent
  };
}

function addRowCounts(target, row) {
  for (const key of EVENT_KEYS) if (row.events[key]) target[key] += 1;
  return target;
}

function revenueTotals(events, testOfferIds, eligibleIds) {
  const totals = new Map();
  for (const event of events) {
    if (!eligibleIds.has(event.prospectId) || !liveRecord(event) || testOfferIds.has(event.offerId)) continue;
    const amount = Number(event.amountCents || 0);
    const currency = clean(event.currency, 3).toUpperCase();
    if (!Number.isSafeInteger(amount) || !/^[A-Z]{3}$/.test(currency)) continue;
    totals.set(currency, (totals.get(currency) || 0) + amount);
  }
  return [...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, amountCents]) => ({ currency, amountCents }));
}

function buildRows(input, filters) {
  const campaigns = new Map((input.campaigns || []).map(campaign => [campaign.id, campaign]));
  const messagesByProspect = new Map();
  const repliesByProspect = new Map();
  const ordersByProspect = new Map();
  const deliveriesByProspect = new Map();
  const eventsByProspect = new Map();
  const group = (map, rows) => rows.forEach(row => {
    if (!row.prospectId) return;
    if (!map.has(row.prospectId)) map.set(row.prospectId, []);
    map.get(row.prospectId).push(row);
  });
  group(messagesByProspect, input.messages || []);
  group(repliesByProspect, input.replies || []);
  group(ordersByProspect, input.orders || []);
  group(deliveriesByProspect, input.deliveries || []);
  group(eventsByProspect, input.outboundEvents || []);

  const rows = [];
  for (const prospect of input.prospects || []) {
    const campaign = campaigns.get(prospect.campaignId) || {};
    if (!matchesFilters(prospect, campaign, filters)) continue;
    const messages = messagesByProspect.get(prospect.id) || [];
    const replies = repliesByProspect.get(prospect.id) || [];
    const orders = ordersByProspect.get(prospect.id) || [];
    const deliveries = deliveriesByProspect.get(prospect.id) || [];
    const outboundEvents = eventsByProspect.get(prospect.id) || [];
    const liveMessages = messages.filter(initialOutreachMessage);
    const firstMessage = firstByTime(liveMessages, 'sentAt', 'createdAt');
    const sent = Boolean(firstMessage);
    const liveReplies = replies.filter(liveRecord);
    const labels = new Set(liveReplies.map(reply => clean(reply.classification?.label || reply.label).toLowerCase()));
    const humanReply = [...labels].some(label => label && !HUMAN_REPLY_EXCLUSIONS.has(label));
    const explicitDelivery = sent && (
      liveMessages.some(message => message.deliveredAt || message.deliveryStatus === 'delivered' || message.providerStatus === 'delivered') ||
      outboundEvents.some(event => liveRecord(event) && event.eventType === 'delivered')
    );
    const bounce = sent && (labels.has('bounce') || outboundEvents.some(event => liveRecord(event) && event.eventType === 'hard_bounce'));
    const unsubscribe = sent && (labels.has('unsubscribe') || Boolean(prospect.unsubscribedAt));
    const complaint = sent && (labels.has('complaint') || outboundEvents.some(event => liveRecord(event) && event.eventType === 'complaint'));
    const liveOrders = orders.filter(liveRecord);
    const qualified = credibleQualification(prospect, campaign);
    const checkoutSent = sent && liveOrders.some(order => order.paymentState === 'checkout-sent' || order.status === 'checkout-sent' || order.eventName === 'checkout_sent');
    const paid = sent && liveOrders.some(order => (order.paymentState === 'paid' || order.status === 'paid') && order.verified === true);
    const deliveryCompleted = sent && deliveries.some(delivery => liveRecord(delivery) && delivery.status === 'delivered');
    const proposalSent = sent && (Boolean(prospect.proposalSentAt) || messages.some(message => liveRecord(message) && message.kind === 'proposal'));
    const selected = prospect.outreach?.selected || {};
    const dimensions = {
      campaign: safeLabel(campaign.id || prospect.campaignId),
      country: safeLabel(prospect.country),
      niche: safeLabel(prospect.niche || campaign.niche),
      evidenceType: safeLabel(prospect.issue?.evidence?.type || prospect.issue?.code),
      subjectVariant: safeLabel(selected.campaignSubjectVariant || prospect.outreach?.selection?.subjectVariant),
      messageVariant: safeLabel(selected.campaignMessageVariant || prospect.outreach?.selection?.messageVariant),
      cta: safeLabel(prospect.outreach?.context?.callToAction || campaign.callToAction),
      recipientRole: safeLabel(prospect.outreach?.context?.recipientRole || prospect.contact?.position || prospect.contact?.role),
      sendTime: sendTimeBucket(firstMessage),
      inbox: safeLabel(firstMessage?.inbox || prospect.inbox)
    };
    rows.push({
      prospectId: prospect.id,
      dimensions,
      events: {
        discovered: true,
        qualified,
        draftApproved: qualified && prospect.draftApproval?.status === 'approved',
        sent,
        delivered: explicitDelivery,
        bounced: bounce,
        unsubscribed: unsubscribe,
        replied: sent && humanReply && !complaint,
        positivelyReplied: sent && [...labels].some(label => POSITIVE_REPLY_LABELS.has(label)),
        meetingRequested: sent && labels.has('meeting-requested'),
        proposalSent,
        checkoutSent,
        paid,
        deliveryCompleted
      },
      simulations: {
        sent: messages.some(message => !liveRecord(message) && message.kind !== 'transactional-report' && Number(message.followup || 0) === 0),
        replied: replies.some(reply => !liveRecord(reply)),
        paid: orders.some(order => !liveRecord(order) && (order.paymentState === 'paid' || order.status === 'paid')),
        deliveryCompleted: deliveries.some(delivery => !liveRecord(delivery) && delivery.status === 'delivered')
      }
    });
  }
  return rows;
}

function dimensionBreakdown(rows, dimension) {
  const grouped = new Map();
  for (const row of rows) {
    const value = row.dimensions[dimension] || 'unassigned';
    if (!grouped.has(value)) grouped.set(value, emptyCounts());
    addRowCounts(grouped.get(value), row);
  }
  return [...grouped.entries()].map(([value, counts]) => ({
    value,
    counts,
    rates: ratesFor(counts),
    sampleSizes: sampleSizesFor(counts)
  })).sort((left, right) => right.counts.sent - left.counts.sent || right.counts.discovered - left.counts.discovered || left.value.localeCompare(right.value));
}

function publicExperiment(record = {}) {
  return {
    id: record.id,
    campaignId: record.campaignId || '',
    name: record.name,
    dimension: record.dimension,
    variants: record.variants,
    primaryMetric: record.primaryMetric,
    minimumSampleSize: record.minimumSampleSize,
    minimumAbsoluteLift: record.minimumAbsoluteLift,
    minimumRelativeLift: record.minimumRelativeLift,
    status: record.status,
    latestEvaluation: record.latestEvaluation || null,
    recommendation: record.recommendation || null,
    history: record.history || [],
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

export function buildAcquisitionLearning(input = {}, filters = {}) {
  const rows = buildRows(input, filters);
  const counts = rows.reduce(addRowCounts, emptyCounts());
  const simulations = rows.reduce((totals, row) => {
    for (const key of Object.keys(totals)) if (row.simulations[key]) totals[key] += 1;
    return totals;
  }, { sent: 0, replied: 0, paid: 0, deliveryCompleted: 0 });
  const eligibleIds = new Set(rows.map(row => row.prospectId));
  const testOfferIds = new Set((input.orders || []).filter(order => !liveRecord(order)).map(order => order.offerId).filter(Boolean));
  const dimensions = Object.fromEntries(LEARNING_DIMENSIONS.map(dimension => [dimension, dimensionBreakdown(rows, dimension)]));
  const funnelLabels = {
    discovered: 'Discovered', qualified: 'Qualified', draftApproved: 'Draft approved', sent: 'Sent',
    delivered: 'Delivered (known only)', bounced: 'Bounced', unsubscribed: 'Unsubscribed', replied: 'Replied',
    positivelyReplied: 'Positive reply', meetingRequested: 'Meeting requested', proposalSent: 'Proposal sent',
    checkoutSent: 'Checkout sent', paid: 'Paid', deliveryCompleted: 'Delivery completed'
  };
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    cohortDefinition: 'Prospects are filtered by discovery date; downstream outcomes remain attributed to that cohort.',
    counts,
    rates: ratesFor(counts),
    sampleSizes: sampleSizesFor(counts),
    funnel: EVENT_KEYS.map(key => ({ key, label: funnelLabels[key], count: counts[key] })),
    revenueByCurrency: revenueTotals(input.revenueEvents || [], testOfferIds, eligibleIds),
    simulations: { ...simulations, excludedFromCommercialResults: true },
    dimensions,
    experiments: (input.experiments || []).map(publicExperiment).sort((left, right) => dateValue(right.updatedAt, right.createdAt) - dateValue(left.updatedAt, left.createdAt)),
    trackingPolicy: {
      openTracking: false,
      trackingPixels: false,
      optimizationBasis: ['replies', 'verified payment events', 'delivery completion'],
      deliveredMeaning: 'Counted only when an explicit provider delivery signal is stored; never inferred from send success.',
      automaticCapChanges: false
    }
  };
}

function safeExperimentVariant(value) {
  if (typeof value !== 'string') throw new LearningError('experiment-variant-invalid');
  const variant = clean(value, 180);
  if (variant.length < 1 || /https?:\/\/|www\.|\b(?:password|secret|token|api[_ -]?key|credential|oauth)\b/i.test(variant)) {
    throw new LearningError('experiment-variant-invalid');
  }
  if (/\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(variant)) throw new LearningError('experiment-variant-invalid');
  return variant;
}

export function createExperimentRecord(input = {}, at = new Date().toISOString()) {
  const unknown = Object.keys(input).filter(key => !EXPERIMENT_FIELDS.has(key));
  if (unknown.length) throw new LearningError(`experiment-unknown-fields:${unknown.sort().join(',')}`);
  const dimension = clean(input.dimension, 40);
  const primaryMetric = clean(input.primaryMetric, 40);
  if (!DIMENSION_SET.has(dimension)) throw new LearningError('experiment-dimension-invalid');
  if (!METRIC_SET.has(primaryMetric)) throw new LearningError('experiment-metric-invalid');
  const variants = [...new Set((Array.isArray(input.variants) ? input.variants : []).map(safeExperimentVariant))];
  if (variants.length < 2 || variants.length > 4) throw new LearningError('experiment-variants-must-contain-two-to-four-unique-values');
  const minimumSampleSize = Number(input.minimumSampleSize ?? 30);
  const minimumAbsoluteLift = Number(input.minimumAbsoluteLift ?? 2);
  const minimumRelativeLift = Number(input.minimumRelativeLift ?? 0.1);
  if (!Number.isInteger(minimumSampleSize) || minimumSampleSize < 20 || minimumSampleSize > 100000) throw new LearningError('experiment-minimum-sample-invalid');
  if (!Number.isFinite(minimumAbsoluteLift) || minimumAbsoluteLift < 0.5 || minimumAbsoluteLift > 100) throw new LearningError('experiment-absolute-lift-invalid');
  if (!Number.isFinite(minimumRelativeLift) || minimumRelativeLift < 0.01 || minimumRelativeLift > 10) throw new LearningError('experiment-relative-lift-invalid');
  const name = clean(input.name || `${dimension} · ${primaryMetric}`, 120);
  if (!name) throw new LearningError('experiment-name-required');
  if (/https?:\/\/|www\.|\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(name)) throw new LearningError('experiment-name-invalid');
  return {
    id: `exp_${crypto.randomUUID()}`,
    campaignId: clean(input.campaignId, 80) || null,
    name,
    dimension,
    variants,
    primaryMetric,
    minimumSampleSize,
    minimumAbsoluteLift,
    minimumRelativeLift,
    status: 'insufficient-data',
    latestEvaluation: null,
    recommendation: null,
    history: [],
    automaticApply: false,
    automaticCapChange: false,
    createdAt: at,
    updatedAt: at
  };
}

export function evaluateExperimentRecord(record, dashboard, at = new Date().toISOString()) {
  if (!record?.id) throw new LearningError('experiment-not-found', 404);
  if (['approved', 'rejected'].includes(record.status)) throw new LearningError('experiment-decision-is-terminal', 409);
  const segments = new Map((dashboard.dimensions?.[record.dimension] || []).map(segment => [segment.value, segment]));
  const results = record.variants.map(variant => {
    const segment = segments.get(variant);
    return {
      variant,
      sampleSize: Number(segment?.sampleSizes?.[record.primaryMetric] || 0),
      rate: Number(segment?.rates?.[record.primaryMetric] || 0)
    };
  });
  const enough = results.every(result => result.sampleSize >= record.minimumSampleSize);
  const ordered = [...results].sort((left, right) => LOWER_IS_BETTER.has(record.primaryMetric) ? left.rate - right.rate : right.rate - left.rate);
  const winner = ordered[0];
  const runnerUp = ordered[1];
  const absoluteLift = Number(Math.abs(winner.rate - runnerUp.rate).toFixed(2));
  const relativeLift = Number((absoluteLift / Math.max(Math.abs(runnerUp.rate), 0.01)).toFixed(4));
  const meaningful = enough && absoluteLift >= record.minimumAbsoluteLift && relativeLift >= record.minimumRelativeLift;
  const status = !enough ? 'insufficient-data' : meaningful ? 'review-ready' : 'no-clear-signal';
  const evaluation = {
    evaluatedAt: at,
    metric: record.primaryMetric,
    lowerIsBetter: LOWER_IS_BETTER.has(record.primaryMetric),
    results,
    status,
    absoluteLift,
    relativeLift
  };
  const recommendation = meaningful ? {
    variant: winner.variant,
    metric: record.primaryMetric,
    rate: winner.rate,
    absoluteLift,
    relativeLift,
    ownerDecision: 'pending',
    automaticApply: false,
    automaticCapChange: false,
    createdAt: at
  } : null;
  return {
    ...record,
    status,
    latestEvaluation: evaluation,
    recommendation,
    history: [...(record.history || []), evaluation].slice(-100),
    automaticApply: false,
    automaticCapChange: false,
    updatedAt: at
  };
}

export function recordExperimentDecision(record, decision, note = '', at = new Date().toISOString()) {
  if (!record?.id) throw new LearningError('experiment-not-found', 404);
  if (record.status !== 'review-ready' || record.recommendation?.ownerDecision !== 'pending') {
    throw new LearningError('experiment-not-ready-for-decision', 409);
  }
  const normalized = clean(decision, 20).toLowerCase();
  if (!['approve', 'reject'].includes(normalized)) throw new LearningError('experiment-decision-invalid');
  const ownerDecision = normalized === 'approve' ? 'approved' : 'rejected';
  return {
    ...record,
    status: ownerDecision,
    recommendation: {
      ...record.recommendation,
      ownerDecision,
      ownerNote: clean(note, 500),
      decidedAt: at,
      automaticApply: false,
      automaticCapChange: false
    },
    automaticApply: false,
    automaticCapChange: false,
    updatedAt: at
  };
}

export class LearningEngine {
  constructor(store, { clock = () => new Date() } = {}) {
    this.store = store;
    this.clock = clock;
  }

  async dashboard(filters = {}) {
    const keys = ['prospects', 'campaigns', 'messages', 'replies', 'orders', 'revenueEvents', 'deliveries', 'outboundEvents', 'experiments'];
    const values = await Promise.all(keys.map(key => this.store.list(key)));
    return buildAcquisitionLearning(Object.fromEntries(keys.map((key, index) => [key, values[index]])), filters);
  }

  async create(input = {}) {
    if (input.campaignId && !(await this.store.get('campaigns', input.campaignId))) throw new LearningError('experiment-campaign-not-found', 404);
    const at = this.clock().toISOString();
    let record = createExperimentRecord(input, at);
    const dashboard = await this.dashboard(record.campaignId ? { campaignId: record.campaignId } : {});
    record = evaluateExperimentRecord(record, dashboard, at);
    await this.store.add('experiments', record);
    await this.store.log('experiment_created', { experimentId: record.id, campaignId: record.campaignId, dimension: record.dimension, metric: record.primaryMetric });
    return publicExperiment(record);
  }

  async refresh(experimentId) {
    const record = await this.store.get('experiments', experimentId);
    if (!record) throw new LearningError('experiment-not-found', 404);
    const dashboard = await this.dashboard(record.campaignId ? { campaignId: record.campaignId } : {});
    const updated = evaluateExperimentRecord(record, dashboard, this.clock().toISOString());
    await this.store.upsert('experiments', updated);
    await this.store.log('experiment_evaluated', { experimentId, status: updated.status, sampleSizes: updated.latestEvaluation.results.map(item => item.sampleSize) });
    return publicExperiment(updated);
  }

  async decide(experimentId, input = {}) {
    const record = await this.store.get('experiments', experimentId);
    if (!record) throw new LearningError('experiment-not-found', 404);
    const updated = recordExperimentDecision(record, input.decision, input.note, this.clock().toISOString());
    await this.store.upsert('experiments', updated);
    await this.store.log('experiment_owner_decision', { experimentId, decision: updated.recommendation.ownerDecision, automaticApply: false, automaticCapChange: false });
    return publicExperiment(updated);
  }
}
