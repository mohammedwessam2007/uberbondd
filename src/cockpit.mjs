import { contactEligibility, evidenceEligibility } from './send-safety.mjs';
import { normalizeDomain } from './utils.mjs';

export const ACQUISITION_STATUSES = Object.freeze([
  'discovered', 'queued', 'crawling', 'audit-failed', 'rejected', 'qualified',
  'contact-found', 'draft-ready', 'needs-review', 'approved', 'scheduled', 'sent',
  'replied', 'interested', 'objection', 'not-interested', 'unsubscribed', 'bounced',
  'complaint', 'proposal-ready', 'checkout-sent', 'paid', 'delivery-queued', 'delivered'
]);

const STATUS_SET = new Set(ACQUISITION_STATUSES);
const POSITIVE_REPLY = new Set(['positive', 'interested', 'meeting-requested', 'asks-for-information']);
const OBJECTION_REPLY = new Set(['price-objection', 'already-has-provider', 'not-now']);
const NEGATIVE_REPLY = new Set(['negative', 'not-interested']);
const UNSUBSCRIBE_REPLY = new Set(['optout', 'unsubscribe', 'unsubscribed']);
const PAID_STATES = new Set(['paid', 'order_created', 'subscription_created', 'transaction.completed', 'completed']);
const PAYMENT_ALERT_STATES = new Set(['refunded', 'disputed', 'cancelled', 'failed']);

function text(value = '', maximum = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function normalizedState(value = '') {
  return text(value, 80).toLowerCase().replace(/[ _]+/g, '-');
}

function timestamp(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latest(items = [], fields = ['updatedAt', 'createdAt']) {
  return [...items].sort((left, right) => {
    const leftTime = Math.max(...fields.map(field => timestamp(left?.[field])));
    const rightTime = Math.max(...fields.map(field => timestamp(right?.[field])));
    return rightTime - leftTime;
  })[0] || null;
}

function replyStatus(reply = {}, prospect = {}) {
  const label = normalizedState(reply.classification?.label || prospect.replyLabel);
  if (label === 'complaint') return 'complaint';
  if (label === 'bounce') return 'bounced';
  if (UNSUBSCRIBE_REPLY.has(label)) return 'unsubscribed';
  if (POSITIVE_REPLY.has(label)) return 'interested';
  if (OBJECTION_REPLY.has(label)) return 'objection';
  if (NEGATIVE_REPLY.has(label)) return 'not-interested';
  if (label) return 'replied';
  return '';
}

function paymentState(order = {}, prospect = {}) {
  const state = normalizedState(order.status || order.eventName || prospect.paymentStatus);
  if (PAID_STATES.has(text(order.status, 80).toLowerCase()) || PAID_STATES.has(text(order.eventName, 80).toLowerCase()) || state === 'paid') return 'paid';
  if (state.includes('checkout') && state.includes('sent')) return 'checkout-sent';
  return state;
}

function deliveryState(prospect = {}) {
  const state = normalizedState(prospect.delivery?.status || prospect.deliveryStatus);
  if (['delivered', 'complete', 'completed'].includes(state)) return 'delivered';
  if (['queued', 'delivery-queued', 'pending', 'in-progress', 'in_progress'].includes(state)) return 'delivery-queued';
  return '';
}

export function deriveAcquisitionStatus(prospect = {}, context = {}) {
  const explicit = normalizedState(prospect.acquisitionStatus || prospect.lifecycleStatus);
  const source = normalizedState(prospect.status);
  const delivery = deliveryState(prospect);
  if (delivery) return delivery;
  const payment = paymentState(context.order || {}, prospect);
  if (payment === 'paid') return 'paid';
  if (source === 'complaint') return 'complaint';
  if (['bounce', 'bounced'].includes(source)) return 'bounced';
  if (['suppressed', 'unsubscribe', 'unsubscribed'].includes(source) || prospect.unsubscribedAt) return 'unsubscribed';
  const reply = replyStatus(context.reply || {}, prospect);
  if (reply) return reply;
  if (STATUS_SET.has(explicit)) return explicit;
  if (STATUS_SET.has(source)) return source;
  if (prospect.checkoutSentAt || payment === 'checkout-sent') return 'checkout-sent';
  if (prospect.proposalReadyAt || source === 'proposal-ready') return 'proposal-ready';
  if (source === 'sent' || prospect.sentAt) return 'sent';
  if (source === 'scheduled' || prospect.scheduledAt) return 'scheduled';
  if (['audit-failed', 'error', 'send-uncertain'].includes(source)) return 'audit-failed';
  if (source === 'rejected' || prospect.rejectionReason) return 'rejected';
  if (prospect.draftApproval?.status === 'approved' || source === 'approved') return 'approved';
  if (prospect.draftApproval?.status === 'pending' && prospect.outreach?.selected?.quality?.passed) return 'needs-review';
  if (prospect.outreach?.selected?.quality?.passed || prospect.draft) return 'draft-ready';
  if (prospect.contact?.email || prospect.contacts?.selected?.email) return 'contact-found';
  if (prospect.issue && Number(prospect.score?.total || 0) >= 0) return 'qualified';
  if (source === 'crawling' || source === 'claimed') return 'crawling';
  if (['queued', 'new', 'retry'].includes(source)) return 'queued';
  return 'discovered';
}

function eventTime(prospect = {}, reply = {}, order = {}) {
  return [
    prospect.updatedAt, prospect.completedAt, prospect.createdAt,
    reply.receivedAt, reply.createdAt,
    order.updatedAt, order.createdAt
  ].sort((left, right) => timestamp(right) - timestamp(left))[0] || '';
}

function projectProspect(prospect, context = {}) {
  const status = deriveAcquisitionStatus(prospect, context);
  const payment = paymentState(context.order || {}, prospect);
  const replyLabel = normalizedState(context.reply?.classification?.label || prospect.replyLabel);
  const replyReviewRequired = context.reply?.classification?.humanReviewRequired === true || replyLabel === 'unknown-needs-review';
  const urgentReasons = [];
  if (['audit-failed', 'bounced', 'complaint'].includes(status)) urgentReasons.push(status);
  if (normalizedState(prospect.status) === 'send-uncertain') urgentReasons.push('ambiguous-provider-result');
  if (PAYMENT_ALERT_STATES.has(payment)) urgentReasons.push(`payment-${payment}`);
  if (prospect.failure?.retryable === false && prospect.error) urgentReasons.push('terminal-processing-failure');
  if (replyReviewRequired) urgentReasons.push('reply-needs-review');
  return {
    id: prospect.id,
    campaignId: prospect.campaignId || '',
    company: text(prospect.company, 160),
    website: String(prospect.website || '').slice(0, 1000),
    country: text(prospect.country, 80),
    city: text(prospect.city, 100),
    niche: text(prospect.niche || prospect.industry, 160),
    score: Number(prospect.score?.total || 0),
    tier: text(prospect.score?.tier, 20),
    status,
    sourceStatus: normalizedState(prospect.status),
    issueTitle: text(prospect.issue?.title, 220),
    issueService: text(prospect.issue?.service, 160),
    hasEvidence: Boolean(prospect.issue?.evidenceUrl && prospect.issue?.evidenceExcerpt),
    contactMode: text(prospect.contactReadiness?.mode || prospect.contact?.eligibilityMode || '', 40),
    draftQuality: Number(prospect.outreach?.selected?.quality?.score || 0),
    draftApproval: text(prospect.draftApproval?.status, 40),
    replyId: context.reply?.id || '',
    replyLabel,
    replyReviewRequired,
    responseDraftStatus: text(context.reply?.responseDraft?.status, 40),
    paymentState: payment,
    deliveryState: deliveryState(prospect),
    deliveryMode: text(prospect.deliveryMode || prospect.sendSafety?.provider, 20),
    urgentReasons,
    updatedAt: eventTime(prospect, context.reply, context.order)
  };
}

function valuesByProspect(items = [], fields = ['updatedAt', 'createdAt']) {
  const grouped = new Map();
  for (const item of items) {
    if (!item?.prospectId) continue;
    if (!grouped.has(item.prospectId)) grouped.set(item.prospectId, []);
    grouped.get(item.prospectId).push(item);
  }
  return new Map([...grouped].map(([id, records]) => [id, latest(records, fields)]));
}

function filterRows(rows, filters = {}) {
  const campaign = text(filters.campaign || filters.campaignId, 120);
  const country = text(filters.country, 80).toLowerCase();
  const niche = text(filters.niche, 160).toLowerCase();
  const status = normalizedState(filters.status);
  const minimumScore = Math.max(0, Math.min(100, Number(filters.minimumScore || filters.minScore || 0)));
  const dateFrom = timestamp(filters.dateFrom ? `${filters.dateFrom}T00:00:00.000Z` : 0);
  const dateTo = timestamp(filters.dateTo ? `${filters.dateTo}T23:59:59.999Z` : 0);
  return rows.filter(row => {
    const rowTime = timestamp(row.updatedAt);
    if (campaign && row.campaignId !== campaign) return false;
    if (country && row.country.toLowerCase() !== country) return false;
    if (niche && !row.niche.toLowerCase().includes(niche)) return false;
    if (status && row.status !== status) return false;
    if (row.score < minimumScore) return false;
    if (dateFrom && rowTime < dateFrom) return false;
    if (dateTo && rowTime > dateTo) return false;
    return true;
  });
}

function paymentEvents(orders = [], visibleIds = new Set()) {
  return orders
    .filter(order => !order.prospectId || visibleIds.has(order.prospectId))
    .map(order => ({
      id: order.id,
      prospectId: order.prospectId || '',
      status: paymentState(order),
      amountCents: Number(order.amountCents || 0),
      currency: text(order.currency || 'USD', 8),
      occurredAt: order.updatedAt || order.createdAt || ''
    }))
    .filter(event => event.status && (event.status === 'paid' || PAYMENT_ALERT_STATES.has(event.status) || event.status === 'checkout-sent'))
    .sort((left, right) => timestamp(right.occurredAt) - timestamp(left.occurredAt));
}

export function buildCockpitSnapshot(input = {}, filters = {}) {
  const prospects = input.prospects || [];
  const repliesByProspect = valuesByProspect(input.replies || [], ['receivedAt', 'createdAt']);
  const ordersByProspect = valuesByProspect(input.orders || []);
  const allRows = prospects.map(prospect => projectProspect(prospect, {
    reply: repliesByProspect.get(prospect.id),
    order: ordersByProspect.get(prospect.id)
  })).sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt));
  const rows = filterRows(allRows, filters);
  const visibleIds = new Set(rows.map(row => row.id));
  const counts = Object.fromEntries(ACQUISITION_STATUSES.map(status => [status, rows.filter(row => row.status === status).length]));
  const campaigns = (input.campaigns || []).filter(campaign => !campaign.systemKey).map(campaign => ({
    id: campaign.id,
    name: text(campaign.name, 160),
    enabled: campaign.enabled !== false,
    paused: Boolean(campaign.pausedAt),
    disabled: campaign.enabled === false && !campaign.pausedAt,
    dryRun: campaign.dryRun !== false,
    autoSend: campaign.autoSend === true
  }));
  const inboxes = (input.senderHealth || []).map(health => ({
    slot: text(health.inbox, 4),
    paused: health.paused === true,
    pauseReason: text(health.pauseReason, 160),
    hardBouncesToday: Number(health.hardBouncesToday || 0),
    complaintsToday: Number(health.complaintsToday || 0),
    failureStreak: Number(health.failureStreak || 0)
  }));
  const unmatchedReplyAlerts = (input.replies || [])
    .filter(reply => !reply.prospectId && (reply.match?.ambiguous || reply.classification?.humanReviewRequired || reply.classification?.label))
    .map(reply => ({
      id: `reply:${reply.id}`,
      replyId: reply.id,
      company: reply.match?.ambiguous ? 'Ambiguous inbox reply' : 'Unmatched inbox reply',
      status: 'replied',
      score: 0,
      replyLabel: normalizedState(reply.classification?.label),
      replyReviewRequired: true,
      responseDraftStatus: '',
      urgentReasons: [reply.match?.ambiguous ? 'ambiguous-reply-match' : 'unmatched-reply'],
      updatedAt: reply.receivedAt || reply.createdAt || ''
    }));
  const attention = {
    urgent: [...rows.filter(row => row.urgentReasons.length), ...unmatchedReplyAlerts]
      .sort((left, right) => timestamp(right.updatedAt) - timestamp(left.updatedAt)),
    drafts: rows.filter(row => row.status === 'needs-review'),
    positiveReplies: rows.filter(row => row.status === 'interested'),
    payments: paymentEvents(input.orders || [], visibleIds),
    delivery: rows.filter(row => row.status === 'delivery-queued')
  };
  return {
    generatedAt: new Date().toISOString(),
    defaultView: 'attention',
    statuses: ACQUISITION_STATUSES,
    counts,
    attention,
    rows,
    filters: {
      campaigns,
      countries: [...new Set(allRows.map(row => row.country).filter(Boolean))].sort(),
      niches: [...new Set(allRows.map(row => row.niche).filter(Boolean))].sort()
    },
    controls: {
      globalOutboundPaused: input.settings?.outboundPaused === true,
      globalPauseReason: text(input.settings?.outboundPauseReason, 160),
      systemOutbound: {
        provider: input.outbound?.provider === 'gmail' ? 'gmail' : 'test',
        enabled: input.outbound?.enabled === true,
        dryRun: input.outbound?.dryRun !== false,
        liveSendApproved: input.outbound?.liveSendApproved === true
      },
      campaigns,
      inboxes
    }
  };
}

export function cockpitExportRows(snapshot = {}) {
  return (snapshot.rows || []).map(row => ({
    campaignId: row.campaignId,
    company: row.company,
    website: row.website,
    country: row.country,
    city: row.city,
    niche: row.niche,
    score: row.score,
    tier: row.tier,
    acquisitionStatus: row.status,
    sourceStatus: row.sourceStatus,
    issueTitle: row.issueTitle,
    issueService: row.issueService,
    hasEvidence: row.hasEvidence,
    contactMode: row.contactMode,
    draftQuality: row.draftQuality,
    draftApproval: row.draftApproval,
    replyLabel: row.replyLabel,
    paymentState: row.paymentState,
    deliveryState: row.deliveryState,
    deliveryMode: row.deliveryMode,
    updatedAt: row.updatedAt
  }));
}

export function evaluateDraftApproval({ prospect = {}, campaign = {}, cfg = {}, suppressions = [] } = {}) {
  if (!prospect.id || !campaign.id) return { ok: false, reason: 'prospect-or-campaign-missing' };
  if (!campaign.approved || campaign.enabled === false) return { ok: false, reason: 'campaign-not-enabled' };
  if (['sent', 'replied', 'complaint', 'bounce', 'bounced', 'suppressed', 'paid', 'delivered'].includes(normalizedState(prospect.status))) {
    return { ok: false, reason: 'prospect-terminal' };
  }
  if (prospect.draftApproval?.status === 'rejected') return { ok: false, reason: 'draft-was-rejected' };
  const selected = prospect.outreach?.selected;
  if (prospect.outreach?.status !== 'needs-review' || selected?.quality?.passed !== true) return { ok: false, reason: 'draft-quality-gate' };
  if (String(selected.body || '').trim() !== String(prospect.draft || '').trim() || String(selected.subject || '').trim() !== String(prospect.subject || '').trim()) {
    return { ok: false, reason: 'draft-record-mismatch' };
  }
  const contact = contactEligibility(prospect.contact || {}, prospect);
  if (!contact.ok) return contact;
  const evidence = evidenceEligibility(prospect, campaign, cfg);
  if (!evidence.ok) return evidence;
  const email = String(prospect.contact?.email || '').toLowerCase();
  const domain = normalizeDomain(prospect.website);
  if (suppressions.some(item => item.value === email || item.value === domain)) return { ok: false, reason: 'suppressed' };
  return {
    ok: true,
    approvalMode: campaign.dryRun !== false || cfg.outbound?.dryRun !== false ? 'dry-run' : 'live-configured',
    liveSendEligible: false,
    qualityScore: Number(selected.quality.score || 0)
  };
}

export function approvedDraftPatch(prospect = {}, approvedAt = new Date().toISOString()) {
  return {
    status: 'approved',
    acquisitionStatus: 'approved',
    draftApproval: { status: 'approved', approvedAt, qualityScore: Number(prospect.outreach?.selected?.quality?.score || 0) },
    outreach: { ...(prospect.outreach || {}), ownerApproval: 'approved', liveSendEligible: false, approvedAt },
    approvedAt,
    nextFollowupAt: null,
    updatedAt: approvedAt
  };
}

export function rejectedDraftPatch(reason = 'owner-rejected', rejectedAt = new Date().toISOString()) {
  return {
    status: 'rejected',
    acquisitionStatus: 'rejected',
    draftApproval: { status: 'rejected', reason: text(reason, 160), rejectedAt },
    rejectionReason: 'owner_rejected_draft',
    nextFollowupAt: null,
    rejectedAt,
    updatedAt: rejectedAt
  };
}
