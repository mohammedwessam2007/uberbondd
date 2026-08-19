import { normalizeDomain } from './utils.mjs';
import { normalizeSequence } from './outreach-workbench.mjs';
import { buildSenderRoutingPlan } from './outreach-operator.mjs';

/*
 * Owner-first upgrades for the comparison loop.
 *
 * These functions deliberately improve the jobs around Instantly's campaign
 * options, deliverability checks and portability without pretending to own a
 * mailbox fleet, a warmup network, a lead database, or an inbox-placement
 * provider. Every result is a local plan or an export contract.
 */

export const OUTREACH_UPGRADES_VERSION = 'uberbond.outreach-upgrades.v1';

const asArray = value => Array.isArray(value) ? value : [];
const text = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const lower = value => text(value, 2000).toLowerCase();
const iso = value => {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
};
const dateMs = value => {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
};
const today = value => iso(value).slice(0, 10);
const emailDomain = value => lower(value).split('@').pop() || '';
const providerFor = value => {
  const domain = emailDomain(value);
  if (['gmail.com', 'googlemail.com'].includes(domain)) return 'gmail';
  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com'].includes(domain)) return 'outlook';
  return '';
};

function countBy(items, key) {
  const result = new Map();
  for (const item of asArray(items)) {
    const value = key(item);
    if (!value) continue;
    result.set(value, (result.get(value) || 0) + 1);
  }
  return result;
}

function scoreProspect(prospect = {}) {
  return Number(prospect.score?.total ?? prospect.score ?? 0) || 0;
}

function dueForPlanning(prospect, at) {
  const state = prospect.sequenceState || {};
  if (['ready_for_review', 'approved'].includes(lower(state.status))) return true;
  const due = dateMs(state.nextStepAt || prospect.nextFollowupAt);
  return state.status === 'active' && due > 0 && due <= at.getTime();
}

function stepKind(prospect) {
  return Number(prospect.sequenceState?.currentStepIndex || 0) > 0 ? 'followup' : 'new_lead';
}

function activeEvent(event = {}) {
  return ['sent', 'accepted', 'provider_accepted', 'email_sent'].includes(lower(event.eventType || event.outcome));
}

const ACTIVE_RESERVATION_STATUSES = new Set(['reserved', 'dispatching', 'sent', 'uncertain']);

function buildSendRecords({ messages = [], outboundEvents = [], outboundReservations = [] } = {}) {
  const records = [];
  const seen = new Set();
  const add = (item, source) => {
    const detail = item.detail && typeof item.detail === 'object' ? item.detail : {};
    const reservationId = text(item.reservationId || detail.reservationId, 160);
    const prospectId = text(item.prospectId || detail.prospectId, 160);
    const recipientEmail = lower(item.recipientEmail || item.to || detail.recipientEmail);
    const followup = Number(item.followup ?? detail.followup ?? 0) || 0;
    const sentAt = item.sentAt || item.occurredAt || item.reservedAt || item.createdAt || '';
    const semanticKey = reservationId || `${prospectId}|${recipientEmail}|${followup}|${sentAt}`;
    if (seen.has(semanticKey)) return;
    seen.add(semanticKey);
    records.push({
      source, id: text(item.id, 160), reservationId, prospectId,
      campaignId: text(item.campaignId || detail.campaignId, 160),
      kind: lower(item.kind || detail.kind) === 'followup' || followup > 0 ? 'followup' : 'initial',
      followup, recipientEmail,
      businessDomain: normalizeDomain(item.businessDomain || detail.businessDomain || item.domain || item.website || recipientEmail) || emailDomain(recipientEmail),
      sentAt
    });
  };
  asArray(outboundReservations).filter(item => ACTIVE_RESERVATION_STATUSES.has(lower(item.status))).forEach(item => add(item, 'reservation'));
  asArray(messages).forEach(item => add(item, 'message'));
  asArray(outboundEvents).filter(activeEvent).forEach(item => add(item, 'provider-event'));
  return records;
}

/**
 * Evaluates campaign-level volume controls immediately before reservation.
 * The caller still performs the durable idempotency reservation; this helper
 * only returns an admission decision and never changes state.
 */
export function evaluateCampaignSendControls({ campaign = {}, prospect = {}, messages = [], outboundEvents = [], outboundReservations = [], followup = 0, now = new Date() } = {}) {
  const sequence = normalizeSequence(campaign.sequence || {}, { campaign });
  const settings = sequence.settings || {};
  const maxNewLeadsPerDay = Number(settings.maxNewLeadsPerDay || 0);
  const companyLimit = Number(settings.limitEmailsPerCompanyPerDay || 0);
  if (maxNewLeadsPerDay <= 0 && companyLimit <= 0) return { allowed: true, reasons: [], newLeadsSentToday: 0, companySentToday: 0, policy: 'no campaign volume caps configured' };
  const records = buildSendRecords({ messages, outboundEvents, outboundReservations });
  const prospectId = String(prospect.id || '');
  const campaignId = String(campaign.id || '');
  const matchesCampaign = record => String(record.campaignId || '') === campaignId || (!record.campaignId && record.prospectId === prospectId);
  const existingForProspect = records.some(record => matchesCampaign(record) && record.prospectId === prospectId && record.followup === Number(followup || 0));
  if (existingForProspect) return { allowed: true, reasons: [], duplicateCandidate: true, newLeadsSentToday: 0, companySentToday: 0, policy: 'existing idempotency candidate left for durable reservation handling' };
  const day = today(now);
  const sentToday = records.filter(record => matchesCampaign(record) && today(record.sentAt || now) === day);
  const initialProspects = new Set(sentToday.filter(record => record.kind === 'initial' && record.prospectId).map(record => record.prospectId));
  const companyDomain = normalizeDomain(prospect.website || prospect.domain || prospect.contact?.email) || emailDomain(prospect.contact?.email);
  const companySentToday = sentToday.filter(record => record.businessDomain && record.businessDomain === companyDomain).length;
  const reasons = [];
  if (Number(followup || 0) === 0 && maxNewLeadsPerDay > 0 && initialProspects.size >= maxNewLeadsPerDay) reasons.push('new-lead-daily-limit');
  if (companyLimit > 0 && companySentToday >= companyLimit) reasons.push('company-daily-limit');
  return {
    allowed: reasons.length === 0, reasons, companyDomain,
    newLeadsSentToday: initialProspects.size, companySentToday,
    limits: { maxNewLeadsPerDay, limitEmailsPerCompanyPerDay: companyLimit },
    policy: 'campaign volume controls are local admission checks; durable reservation remains authoritative'
  };
}

/**
 * Mirrors the useful campaign controls documented by Instantly and adds
 * auditable reasons for every item that will not enter the next local queue.
 * The plan never reserves a sender and never calls a provider.
 */
export function buildCampaignControlPlan({ campaign = {}, prospects = [], messages = [], outboundEvents = [], outboundReservations = [], accounts = [], senderHealth = [], suppressions = [], now = new Date() } = {}) {
  const at = new Date(iso(now));
  const sequence = normalizeSequence(campaign.sequence || {}, { campaign });
  const settings = sequence.settings || {};
  const campaignProspects = asArray(prospects).filter(item => String(item.campaignId || item.sequenceState?.campaignId || '') === String(campaign.id || ''));
  const suppressionSet = new Set(asArray(suppressions).map(item => lower(item.value)).filter(Boolean));
  const sentToday = buildSendRecords({ messages, outboundEvents, outboundReservations }).filter(item => today(item.sentAt || at) === today(at));
  const sentByProspect = countBy(sentToday, item => String(item.prospectId || ''));
  const sentByCompany = countBy(sentToday, item => item.businessDomain || '');
  const campaignProspectIds = new Set(campaignProspects.map(item => String(item.id)));
  const campaignSentToday = sentToday.filter(item => String(item.campaignId || '') === String(campaign.id || '') || (!item.campaignId && campaignProspectIds.has(String(item.prospectId || ''))));
  const newLeadSent = new Set(campaignSentToday.filter(item => item.kind === 'initial' && item.prospectId).map(item => String(item.prospectId))).size;
  const routing = buildSenderRoutingPlan({ prospects: campaignProspects, campaigns: [campaign], accounts, senderHealth, outboundEvents, now: at });
  const routeByProspect = new Map(routing.assignments.map(item => [String(item.prospectId), item]));
  const maxNewLeadsPerDay = Number(settings.maxNewLeadsPerDay || 0);
  const companyLimit = Number(settings.limitEmailsPerCompanyPerDay || 0);
  const prioritizeNewLeads = settings.prioritizeNewLeads === true;
  const rows = campaignProspects.map(prospect => {
    const kind = stepKind(prospect);
    const due = dueForPlanning(prospect, at);
    const domain = normalizeDomain(prospect.website || prospect.domain || emailDomain(prospect.contact?.email));
    const recipient = lower(prospect.contact?.email);
    const route = routeByProspect.get(String(prospect.id));
    const reasons = [];
    if (['suppressed', 'bounce', 'complaint'].includes(lower(prospect.status))) reasons.push('prospect-stopped');
    if (suppressionSet.has(recipient) || suppressionSet.has(domain)) reasons.push('suppressed');
    if (!recipient) reasons.push('recipient-missing');
    if (!prospect.issue?.evidenceUrl) reasons.push('evidence-missing');
    if (!due) reasons.push('not-due');
    if (route?.blocked) reasons.push(...String(route.reason || 'sender-routing-blocked').split('|'));
    const companyCount = sentByCompany.get(domain) || 0;
    if (companyLimit > 0 && companyCount >= companyLimit) reasons.push('company-daily-limit');
    if (kind === 'new_lead' && maxNewLeadsPerDay > 0 && newLeadSent >= maxNewLeadsPerDay) reasons.push('new-lead-daily-limit');
    const priority = (prioritizeNewLeads ? (kind === 'new_lead' ? 100 : 0) : (kind === 'followup' ? 100 : 0))
      + (due ? 30 : 0) + scoreProspect(prospect) * 0.5 - companyCount * 2;
    return {
      prospectId: prospect.id,
      company: text(prospect.company, 180),
      domain: text(domain, 240),
      kind,
      stepIndex: Number(prospect.sequenceState?.currentStepIndex || 0),
      due,
      dueAt: prospect.sequenceState?.nextStepAt || prospect.nextFollowupAt || null,
      score: scoreProspect(prospect),
      provider: providerFor(recipient),
      route: route?.slot || '',
      routeReason: route?.reason || 'no-route-record',
      sentToday: sentByProspect.get(String(prospect.id)) || 0,
      companySentToday: companyCount,
      eligible: reasons.length === 0,
      reasons: [...new Set(reasons)],
      priority: Math.round(priority * 100) / 100
    };
  }).sort((a, b) => b.priority - a.priority || String(a.dueAt || '').localeCompare(String(b.dueAt || '')) || a.company.localeCompare(b.company));
  const dueRows = rows.filter(row => row.due);
  const eligibleRows = rows.filter(row => row.eligible);
  return {
    version: `${OUTREACH_UPGRADES_VERSION}.campaign-control`,
    generatedAt: at.toISOString(),
    campaignId: campaign.id || '',
    settings: {
      maxNewLeadsPerDay,
      prioritizeNewLeads,
      limitEmailsPerCompanyPerDay: companyLimit,
      randomGapMinutes: Number(settings.sendWindow?.randomGapMinutes || 0),
      minGapMinutes: Number(settings.sendWindow?.minGapMinutes || 0),
      providerMatching: settings.providerMatching || 'same_esp',
      deliveryOptimization: settings.deliveryOptimization || 'default'
    },
    summary: {
      assigned: rows.length,
      due: dueRows.length,
      eligible: eligibleRows.length,
      blocked: rows.length - eligibleRows.length,
      newLeadsDue: dueRows.filter(row => row.kind === 'new_lead').length,
      followupsDue: dueRows.filter(row => row.kind === 'followup').length,
      newLeadLimit: maxNewLeadsPerDay || null,
      newLeadLimitUsed: newLeadSent,
      companiesAtLimit: rows.filter(row => companyLimit > 0 && row.companySentToday >= companyLimit).length,
      routed: rows.filter(row => row.route).length,
      noRoute: rows.filter(row => !row.route).length
    },
    queue: rows.slice(0, 100),
    policy: 'local schedule and control plan only; no sender reservation, provider call, or external effect'
  };
}

const SPAM_WORDS = Object.freeze(['act now', '100% free', 'guarantee', 'risk-free', 'urgent', 'winner', 'buy now', 'limited time']);

function contentChecks({ subject, body, settings = {}, authentication = {} } = {}) {
  const subjectText = text(subject, 240);
  const bodyText = text(body, 20000);
  const checks = [];
  const add = (id, status, detail, severity = status === 'blocked' ? 'blocking' : status === 'warn' ? 'warning' : 'ok') => checks.push({ id, status, severity, detail });
  if (!subjectText) add('subject', 'blocked', 'Subject is empty.');
  else if (subjectText.length > 120) add('subject', 'warn', 'Subject is long; keep it easy to scan.');
  else add('subject', 'pass', 'Subject length is within the local preflight limit.');
  if (!bodyText) add('body', 'blocked', 'Body is empty.');
  else if (bodyText.length > 12000) add('body', 'warn', 'Body is large; review formatting and unnecessary claims.');
  else add('body', 'pass', 'Body length is within the local preflight limit.');
  const spamHits = SPAM_WORDS.filter(word => lower(bodyText).includes(word) || lower(subjectText).includes(word));
  add('spam-language', spamHits.length ? 'warn' : 'pass', spamHits.length ? `Review language: ${spamHits.join(', ')}.` : 'No bounded local trigger phrase found.');
  const links = (bodyText.match(/https?:\/\/[^\s)]+/gi) || []).length;
  add('link-density', links > 3 ? 'warn' : 'pass', `${links} URL(s) observed in the rendered message.`);
  const uppercaseLetters = (bodyText.match(/[A-Z]/g) || []).length;
  const letters = (bodyText.match(/[A-Za-z]/g) || []).length;
  add('uppercase-ratio', letters > 40 && uppercaseLetters / letters > 0.45 ? 'warn' : 'pass', 'Uppercase ratio is within the local heuristic.');
  add('evidence-binding', /\{\{\s*(issueTitle|issueExcerpt)\s*\}\}/i.test(bodyText) ? 'pass' : 'warn', /\{\{\s*(issueTitle|issueExcerpt)\s*\}\}/i.test(bodyText) ? 'Rendered copy contains an evidence-bound tag.' : 'No issue evidence tag was found; owner should confirm the claim source.');
  const hasUnsubscribe = /unsubscribe|opt.?out|stop receiving/i.test(bodyText) || Boolean(settings.insertUnsubscribeHeader);
  add('opt-out-path', hasUnsubscribe ? 'pass' : 'warn', hasUnsubscribe ? 'A local opt-out signal is present.' : 'No opt-out signal was found in the rendered copy. Route-specific policy may still require a different treatment.');
  const authCount = ['spf', 'dkim', 'dmarc'].filter(key => authentication[key] === true || lower(authentication[key]) === 'pass').length;
  add('authentication', authCount === 3 ? 'pass' : authCount ? 'warn' : 'not-run', authCount === 3 ? 'SPF, DKIM and DMARC are observed as passing.' : 'Provider/DNS authentication is not fully observed locally.');
  return checks;
}

/**
 * Local content and sender preflight. Provider placement is intentionally a
 * separate not-run result; this is stronger than silently treating health as
 * inbox placement.
 */
export function buildDeliverabilityPreflight({ campaign = {}, accounts = [], senderHealth = [], now = new Date() } = {}) {
  const at = new Date(iso(now));
  const sequence = normalizeSequence(campaign.sequence || {}, { campaign });
  const healthBySlot = new Map(asArray(senderHealth).map(item => [String(item.inbox || item.slot || ''), item]));
  const variants = sequence.steps.flatMap(step => step.variants.map(variant => ({ stepId: step.id, variantId: variant.id, subject: variant.subject, body: variant.body })));
  const senderRows = asArray(accounts).map(account => {
    const health = healthBySlot.get(String(account.slot || '')) || {};
    const checks = variants.slice(0, 26).flatMap(variant => contentChecks({ subject: variant.subject, body: variant.body, settings: sequence.settings, authentication: account.authentication || account.dns || {} }).map(check => ({ ...check, stepId: variant.stepId, variantId: variant.variantId })));
    const blocking = checks.filter(check => check.status === 'blocked').length;
    const warnings = checks.filter(check => check.status === 'warn' || check.status === 'not-run').length;
    const score = Math.max(0, Math.min(100, 100 - blocking * 25 - warnings * 3 - (health.paused ? 30 : 0)));
    return {
      slot: String(account.slot || ''),
      email: text(account.email, 320),
      provider: providerFor(account.email),
      connected: account.connected === true,
      paused: health.paused === true,
      score,
      checks,
      providerPlacement: { status: 'not-run', detail: 'No provider inbox/spam test was called.' }
    };
  });
  const allChecks = senderRows.flatMap(row => row.checks);
  const blocking = allChecks.filter(check => check.status === 'blocked').length;
  const warnings = allChecks.filter(check => check.status === 'warn' || check.status === 'not-run').length;
  return {
    version: `${OUTREACH_UPGRADES_VERSION}.deliverability-preflight`,
    generatedAt: at.toISOString(),
    campaignId: campaign.id || '',
    sequence: { steps: sequence.steps.length, variants: variants.length, settings: sequence.settings },
    senders: senderRows,
    summary: {
      senders: senderRows.length,
      connected: senderRows.filter(row => row.connected).length,
      blockingChecks: blocking,
      warnings,
      providerPlacementTests: 0,
      score: Math.max(0, 100 - blocking * 10 - warnings * 2)
    },
    policy: 'local copy/authentication preflight only; no provider placement guarantee and no external call'
  };
}

/**
 * An explicit integration contract for Instantly-like webhook providers.
 * It documents what UberBond can ingest and what remains provider-specific.
 */
export function buildProviderIntegrationSpec({ baseUrl = '', provider = 'instantly', webhookSecretConfigured = false } = {}) {
  const normalizedBase = text(baseUrl, 500).replace(/\/$/, '');
  const endpoint = `${normalizedBase || '<UBERBOND_BASE_URL>'}/webhooks/outreach/${text(provider, 80).toLowerCase()}`;
  const eventTypes = ['email_sent', 'email_opened', 'email_link_clicked', 'reply_received', 'auto_reply_received', 'email_bounced', 'lead_unsubscribed', 'account_error', 'campaign_completed', 'lead_neutral', 'lead_interested', 'lead_not_interested', 'lead_meeting_booked', 'lead_meeting_completed', 'lead_closed', 'lead_out_of_office', 'lead_wrong_person', 'lead_no_show', 'supersearch_enrichment_completed'];
  return {
    version: `${OUTREACH_UPGRADES_VERSION}.provider-contract`,
    provider: text(provider, 80).toLowerCase(),
    webhook: {
      method: 'POST', endpoint,
      signature: { required: true, configured: webhookSecretConfigured, headers: ['x-uberbond-webhook-signature', 'x-uberbond-webhook-timestamp'], algorithm: 'HMAC-SHA256 over timestamp.body' },
      acceptedEvents: eventTypes,
      idempotency: 'provider event id when present; otherwise provider + normalized event + raw-body digest',
      requiredPayloadFields: ['event_type', 'timestamp', 'campaign_id'],
      optionalPayloadFields: ['lead_email', 'email_account', 'step', 'variant', 'email_id', 'email_subject', 'reply_text', 'reply_html', 'unibox_url']
    },
    mapping: {
      providerEvent: 'provider event ledger',
      emailSent: 'message + outbound event',
      reply: 'Unibox reply + stop-on-reply + automation trigger',
      bounceOrUnsubscribe: 'suppression + sequence stop + sender-health signal',
      meetingOrClosed: 'commercial opportunity state; payment still requires proof'
    },
    sendBoundary: { providerAdapter: 'GmailEffectAdapter or deliberate provider adapter', ownerApproval: true, v9Admission: true, externalEffects: 'not created by this contract' },
    policy: 'contract and mapping only; configure a provider intentionally before accepting live traffic'
  };
}

/**
 * Exports a campaign in a provider-neutral shape and includes a conservative
 * Instantly mapping. Exact recipients remain marked with evidence and contact
 * provenance so export cannot silently turn prior-contact records into new
 * send authorization.
 */
export function buildPortableCampaignExport({ campaign = {}, prospects = [], suppressions = [], now = new Date() } = {}) {
  const sequence = normalizeSequence(campaign.sequence || {}, { campaign });
  const blocked = new Set(asArray(suppressions).map(item => lower(item.value)).filter(Boolean));
  const leads = asArray(prospects).filter(item => String(item.campaignId || '') === String(campaign.id || '')).map(prospect => {
    const email = lower(prospect.contact?.email);
    const domain = normalizeDomain(prospect.website || prospect.domain || emailDomain(email));
    const suppressed = blocked.has(email) || blocked.has(domain) || ['suppressed', 'bounce', 'complaint'].includes(lower(prospect.status));
    return {
      id: prospect.id,
      company: text(prospect.company, 180),
      domain: text(domain, 240),
      email: text(email, 320),
      status: text(prospect.status, 60),
      doNotSend: suppressed || !email || !prospect.issue?.evidenceUrl,
      evidence: { url: text(prospect.issue?.evidenceUrl, 600), title: text(prospect.issue?.title, 300), excerpt: text(prospect.issue?.evidenceExcerpt, 1000), observedAt: prospect.issue?.evidenceObservedAt || prospect.evidenceObservedAt || null },
      contactProvenance: text(prospect.contact?.source || '', 240),
      sequenceState: prospect.sequenceState || null
    };
  });
  return {
    exportVersion: 'uberbond.portable-campaign.v2',
    exportedAt: iso(now),
    externalEffects: 0,
    campaign: { id: campaign.id || '', name: text(campaign.name, 180), niche: text(campaign.niche, 240), offer: text(campaign.offer, 500), minScore: campaign.minScore || 60, sequence },
    providerNeutral: {
      steps: sequence.steps.map((step, index) => ({ step: index + 1, id: step.id, name: step.name, kind: step.kind, delay: { value: step.delayValue, unit: step.delayUnit }, condition: step.condition, variants: step.variants.map(variant => ({ id: variant.id, enabled: variant.enabled, weight: variant.weight, subject: variant.subject, body: variant.body })) })),
      controls: sequence.settings
    },
    instantlyMapping: {
      accountsToUse: 'map sender slots intentionally',
      stopSendingOnReply: sequence.settings.stopOnReply,
      stopCampaignForCompanyOnReply: sequence.settings.stopCompanyOnReply,
      stopSendingOnAutoReply: sequence.settings.stopOnAutoReply,
      providerMatching: sequence.settings.providerMatching,
      maxNewLeads: sequence.settings.maxNewLeadsPerDay || null,
      prioritizeNewLeads: sequence.settings.prioritizeNewLeads,
      limitEmailsPerCompany: sequence.settings.limitEmailsPerCompanyPerDay || null,
      minimumTimeGapMinutes: sequence.settings.sendWindow.minGapMinutes,
      randomAdditionalTimeMinutes: sequence.settings.sendWindow.randomGapMinutes,
      autoOptimizeMetric: sequence.settings.autoOptimizeMetric,
      resetVariantUsageDaily: sequence.settings.resetVariantDistributionDaily
    },
    leads,
    importSafety: {
      eligibleLeadCount: leads.filter(item => !item.doNotSend).length,
      blockedLeadCount: leads.filter(item => item.doNotSend).length,
      requiresOwnerReapproval: true,
      reason: 'Provider import is not send authorization; exact route evidence, suppression and V9 admission remain required.'
    },
    policy: 'portable export only; no provider API call, lead upload, account connection, or message send'
  };
}
