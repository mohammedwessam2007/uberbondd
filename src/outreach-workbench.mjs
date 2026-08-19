import crypto from 'node:crypto';
import { normalizeDomain } from './utils.mjs';

/*
 * The workbench is intentionally single-user and provider-neutral.  It owns
 * the operator experience, sequence planning, evidence-aware previews and
 * revenue-weighted reporting.  It does not send mail and it does not turn a
 * campaign record into authority to create an external effect.
 */

export const OUTREACH_WORKBENCH_VERSION = 'uberbond.outreach-workbench.v1';
export const MAX_SEQUENCE_STEPS = 12;
export const MAX_VARIANTS_PER_STEP = 26;

export const OUTREACH_STAGES = Object.freeze([
  'new', 'researched', 'contacted', 'replied', 'opportunity', 'meeting',
  'offer', 'invoice', 'paid', 'delivery', 'accepted', 'recurring', 'lost'
]);

const ALLOWED_STEP_KINDS = new Set(['initial', 'followup', 'breakup']);
const ALLOWED_CONDITIONS = new Set([
  'always', 'no_reply', 'positive_reply', 'opened_no_reply', 'clicked_no_reply',
  'not_interested', 'out_of_office', 'manual'
]);
const ALLOWED_TAGS = new Set([
  'company', 'firstName', 'lastName', 'contactName', 'website', 'city',
  'country', 'issueTitle', 'issueExcerpt', 'service', 'senderName',
  'senderCompany', 'offer', 'unsubscribeUrl'
]);

const text = (value, max = 10000) => String(value ?? '').trim().slice(0, max);
const unique = values => [...new Set(values)];
const asArray = value => Array.isArray(value) ? value : [];

function finiteNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function iso(value, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(value || fallback);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(fallback).toISOString();
}

function emailDomain(email = '') {
  return text(email, 320).toLowerCase().split('@')[1] || '';
}

export function defaultSequence(campaign = {}) {
  const offer = text(campaign.offer || 'a focused website review', 240) || 'a focused website review';
  return {
    schemaVersion: OUTREACH_WORKBENCH_VERSION,
    version: 1,
    settings: {
      stopOnReply: true,
      stopOnPositiveReply: true,
      stopOnUnsubscribe: true,
      stopOnBounce: true,
      stopOnOpportunity: true,
      stopOnPayment: true,
      maxNewLeadsPerDay: 0,
      prioritizeNewLeads: false,
      limitEmailsPerCompanyPerDay: 0,
      deliveryOptimization: 'default',
      insertUnsubscribeHeader: false,
      sendWindow: { start: 9, end: 17, weekdays: [1, 2, 3, 4, 5], timezone: 'recipient', minGapMinutes: 5, randomGapMinutes: 0 }
    },
    steps: [
      {
        id: 'step-1', name: 'Initial observation', kind: 'initial', delayDays: 0, condition: 'always',
        variants: [{
          id: 'A', weight: 100,
          subject: 'A quick observation about {{company}}',
          body: 'Hi {{company}} team,\n\nI reviewed the public website and noticed:\n\n{{issueTitle}}\n{{issueExcerpt}}\n\nI can help with {{offer}}. If useful, I can send a concise evidence-backed starting point.\n\nBest,\n{{senderName}}\n{{senderCompany}}\n\nP.S. If this is not relevant, {{unsubscribeUrl}}'
        }]
      },
      {
        id: 'step-2', name: 'Useful follow-up', kind: 'followup', delayDays: 3, condition: 'no_reply',
        variants: [{
          id: 'A', weight: 100,
          subject: 'Re: A quick observation about {{company}}',
          body: 'Hi {{company}} team,\n\nA short follow-up on the observation above. The practical starting point would be {{offer}}; the goal is to give you a small, reviewable repair queue rather than a broad redesign.\n\nShould I prepare the outline?\n\nBest,\n{{senderName}}'
        }]
      },
      {
        id: 'step-3', name: 'Close the loop', kind: 'breakup', delayDays: 5, condition: 'no_reply',
        variants: [{
          id: 'A', weight: 100,
          subject: 'Close the loop — {{company}}',
          body: 'Hi {{company}} team,\n\nI will close the loop here so I do not crowd your inbox. If {{offer}} becomes useful later, this thread will remain easy to find.\n\nBest,\n{{senderName}}'
        }]
      }
    ]
  };
}

function normalizeVariant(input = {}, index = 0) {
  const subject = text(input.subject, 200);
  const body = text(input.body, 12000);
  if (!subject || !body) throw new Error(`Sequence variant ${index + 1} needs a subject and body`);
  const weight = finiteNumber(input.weight, 100, 1, 100);
  return {
    id: text(input.id || String.fromCharCode(65 + index), 24) || String.fromCharCode(65 + index),
    label: text(input.label || `Variant ${String.fromCharCode(65 + index)}`, 80),
    weight,
    enabled: input.enabled !== false,
    subject,
    body
  };
}

function normalizeWeights(variants) {
  const enabled = variants.filter(variant => variant.enabled !== false);
  const active = enabled.length ? enabled : [variants[0]];
  const total = active.reduce((sum, variant) => sum + Number(variant.weight || 0), 0);
  if (!total) return variants.map((variant, index) => ({ ...variant, enabled: index === 0 || variant.enabled !== false, weight: active.includes(variant) ? Math.round(100 / active.length) : 0 }));
  const exactActive = active.map(variant => Number(variant.weight || 0) / total * 100);
  const exact = variants.map(variant => {
    const index = active.indexOf(variant);
    return index >= 0 ? exactActive[index] : 0;
  });
  const weights = exact.map(value => Math.floor(value));
  let remainder = 100 - weights.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let index = 0; index < order.length && remainder > 0; index += 1, remainder -= 1) {
    weights[order[index].index] += 1;
  }
  return variants.map((variant, index) => ({ ...variant, enabled: active.includes(variant), weight: weights[index] }));
}

function customVariableNames(campaign = {}, settings = {}) {
  const candidates = [
    ...Object.keys(campaign.customVariables || {}),
    ...Object.keys(campaign.customFields || {}),
    ...Object.keys(settings.placeholderValues || {})
  ];
  return new Set(candidates.map(item => String(item || '').trim()).filter(item => /^[A-Za-z][A-Za-z0-9_]*$/.test(item)));
}

function validateMergeTags(value, allowedTags = ALLOWED_TAGS) {
  const unknown = [];
  const tags = [];
  const source = String(value || '');
  const expression = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;
  let match;
  while ((match = expression.exec(source))) {
    const tag = match[1];
    if (!allowedTags.has(tag)) unknown.push(tag);
    else tags.push(tag);
  }
  const conditionalExpression = /\{%\s*if\s+([A-Za-z][A-Za-z0-9_]*)\s*%\}/g;
  while ((match = conditionalExpression.exec(source))) {
    if (!allowedTags.has(match[1])) unknown.push(match[1]);
  }
  if (unknown.length) throw new Error(`Unsupported merge tag: ${unknown[0]}`);
  return unique(tags);
}

export function normalizeSequence(input = {}, options = {}) {
  const source = input && Array.isArray(input.steps) ? input : defaultSequence(options.campaign || {});
  const rawSettings = source.settings && typeof source.settings === 'object' ? source.settings : {};
  const allowedTags = new Set([...ALLOWED_TAGS, ...customVariableNames(options.campaign || {}, rawSettings)]);
  const rawSteps = asArray(source.steps).slice(0, MAX_SEQUENCE_STEPS);
  if (!rawSteps.length) throw new Error('A sequence needs at least one step');
  const seen = new Set();
  const steps = rawSteps.map((raw, index) => {
    const id = text(raw.id || `step-${index + 1}`, 48) || `step-${index + 1}`;
    if (seen.has(id)) throw new Error(`Duplicate sequence step id: ${id}`);
    seen.add(id);
    const kind = text(raw.kind || (index === 0 ? 'initial' : index === rawSteps.length - 1 ? 'breakup' : 'followup'), 24).toLowerCase();
    if (!ALLOWED_STEP_KINDS.has(kind)) throw new Error(`Unsupported sequence step kind: ${kind}`);
    const condition = text(raw.condition || (index === 0 ? 'always' : 'no_reply'), 24).toLowerCase();
    if (!ALLOWED_CONDITIONS.has(condition)) throw new Error(`Unsupported sequence condition: ${condition}`);
    const delayUnit = ['minutes', 'hours', 'days'].includes(String(raw.delayUnit || '').toLowerCase())
      ? String(raw.delayUnit).toLowerCase() : 'days';
    const delayMax = delayUnit === 'days' ? 30 : delayUnit === 'hours' ? 720 : 43200;
    const delayValue = finiteNumber(raw.delayValue ?? raw.delay ?? raw.delayDays, index === 0 ? 0 : 1, 0, delayMax);
    const rawVariants = asArray(raw.variants).length ? asArray(raw.variants) : [raw];
    if (rawVariants.length > MAX_VARIANTS_PER_STEP) throw new Error(`A step may contain at most ${MAX_VARIANTS_PER_STEP} variants`);
    const variants = rawVariants.map((variant, variantIndex) => {
      const normalized = normalizeVariant(variant, variantIndex);
      validateMergeTags(normalized.subject, allowedTags);
      validateMergeTags(normalized.body, allowedTags);
      return normalized;
    });
    const variantIds = variants.map(variant => variant.id);
    if (new Set(variantIds).size !== variantIds.length) throw new Error(`Duplicate variant id in ${id}`);
    return {
      id,
      name: text(raw.name || `Step ${index + 1}`, 100),
      kind,
      delayValue,
      delayUnit,
      delayDays: delayUnit === 'days' ? Math.min(30, delayValue) : finiteNumber(raw.delayDays, index === 0 ? 0 : 1, 0, 30),
      condition,
      variants: normalizeWeights(variants)
    };
  });
  const rawWindow = rawSettings.sendWindow && typeof rawSettings.sendWindow === 'object' ? rawSettings.sendWindow : {};
  const weekdays = unique(asArray(rawWindow.weekdays).map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= 7));
  const optimizeMetric = ['replyRate', 'clickRate', 'openRate', 'opportunityRate', 'clearedRevenueUsd'].includes(String(rawSettings.autoOptimizeMetric || rawSettings.optimizeMetric || 'replyRate'))
    ? String(rawSettings.autoOptimizeMetric || rawSettings.optimizeMetric || 'replyRate') : 'replyRate';
  const placeholderValues = Object.fromEntries(Object.entries(rawSettings.placeholderValues || {})
    .filter(([key, value]) => /^[A-Za-z][A-Za-z0-9_]*$/.test(key) && String(value ?? '').trim())
    .slice(0, 80)
    .map(([key, value]) => [key, text(value, 500)]));
  const rawEspRouting = rawSettings.espRouting && typeof rawSettings.espRouting === 'object' ? rawSettings.espRouting : {};
  const providerMatching = ['same_esp', 'any', 'gmail_to_gmail', 'outlook_to_outlook'].includes(String(rawSettings.providerMatching || '').toLowerCase())
    ? String(rawSettings.providerMatching).toLowerCase() : 'same_esp';
  return {
    schemaVersion: OUTREACH_WORKBENCH_VERSION,
    version: Math.max(1, Number(source.version || 1)),
    steps,
    settings: {
      stopOnReply: bool(rawSettings.stopOnReply, true),
      stopOnPositiveReply: bool(rawSettings.stopOnPositiveReply, true),
      stopOnUnsubscribe: bool(rawSettings.stopOnUnsubscribe, true),
      stopOnBounce: bool(rawSettings.stopOnBounce, true),
      stopOnOpportunity: bool(rawSettings.stopOnOpportunity, true),
      stopOnPayment: bool(rawSettings.stopOnPayment, true),
      stopOnAutoReply: bool(rawSettings.stopOnAutoReply, true),
      stopOnOutOfOffice: bool(rawSettings.stopOnOutOfOffice, false),
      stopCompanyOnReply: bool(rawSettings.stopCompanyOnReply, true),
      stickySendingAccount: bool(rawSettings.stickySendingAccount, true),
      maxNewLeadsPerDay: Math.round(finiteNumber(rawSettings.maxNewLeadsPerDay, 0, 0, 10000)),
      prioritizeNewLeads: bool(rawSettings.prioritizeNewLeads, false),
      limitEmailsPerCompanyPerDay: Math.round(finiteNumber(rawSettings.limitEmailsPerCompanyPerDay, 0, 0, 100)),
      deliveryOptimization: ['default', 'text_only', 'first_text_only'].includes(String(rawSettings.deliveryOptimization || '').toLowerCase())
        ? String(rawSettings.deliveryOptimization).toLowerCase() : 'default',
      insertUnsubscribeHeader: bool(rawSettings.insertUnsubscribeHeader, false),
      providerMatching,
      trackOpens: bool(rawSettings.trackOpens, false),
      trackClicks: bool(rawSettings.trackClicks, false),
      espRouting: {
        include: unique(asArray(rawEspRouting.include).map(value => text(value, 60).toLowerCase()).filter(Boolean)).slice(0, 20),
        exclude: unique(asArray(rawEspRouting.exclude).map(value => text(value, 60).toLowerCase()).filter(Boolean)).slice(0, 20)
      },
      autoOptimize: bool(rawSettings.autoOptimize, false),
      autoOptimizeMetric: optimizeMetric,
      minimumOptimizationSamples: Math.round(finiteNumber(rawSettings.minimumOptimizationSamples, 25, 1, 10000)),
      resetVariantDistributionDaily: bool(rawSettings.resetVariantDistributionDaily, false),
      placeholderValues,
      sendWindow: {
        start: finiteNumber(rawWindow.start, 9, 0, 23),
        end: finiteNumber(rawWindow.end, 17, 1, 24),
        weekdays: weekdays.length ? weekdays : [1, 2, 3, 4, 5],
        timezone: text(rawWindow.timezone || 'recipient', 80),
        sendBehavior: ['one_at_a_time', 'parallel'].includes(String(rawWindow.sendBehavior || '').toLowerCase()) ? String(rawWindow.sendBehavior).toLowerCase() : 'one_at_a_time',
        minGapMinutes: Math.round(finiteNumber(rawWindow.minGapMinutes, 5, 0, 1440)),
        randomGapMinutes: Math.round(finiteNumber(rawWindow.randomGapMinutes, 0, 0, 120))
      }
    }
  };
}

function mergeValues(prospect = {}, campaign = {}, sender = {}, settings = {}) {
  const contact = prospect.contact || {};
  const values = {
    company: text(prospect.company, 180),
    firstName: text(contact.firstName || prospect.firstName, 120),
    lastName: text(contact.lastName || prospect.lastName, 120),
    contactName: text(contact.name || prospect.contactName, 120),
    website: text(prospect.website, 500),
    city: text(prospect.city, 120),
    country: text(prospect.country, 120),
    issueTitle: text(prospect.issue?.title, 400),
    issueExcerpt: text(prospect.issue?.evidenceExcerpt, 1400),
    service: text(prospect.issue?.service, 160),
    senderName: text(sender.name || 'Mohamed Wessam', 120),
    senderCompany: text(sender.company || 'UberBond', 120),
    offer: text(campaign.offer || '', 300),
    unsubscribeUrl: text(prospect.unsubscribeUrl || prospect.oneClickUnsubscribeUrl, 1000),
    ...Object.fromEntries(Object.entries(prospect.customVariables || prospect.customFields || {})
      .filter(([key]) => /^[A-Za-z][A-Za-z0-9_]*$/.test(key))
      .slice(0, 80)
      .map(([key, value]) => [key, text(value, 2000)])),
    ...Object.fromEntries(Object.entries(campaign.customVariables || {})
      .filter(([key]) => /^[A-Za-z][A-Za-z0-9_]*$/.test(key))
      .slice(0, 80)
      .map(([key, value]) => [key, text(value, 2000)]))
  };
  for (const [key, value] of Object.entries(settings.placeholderValues || {})) {
    if (!String(values[key] || '').trim()) values[key] = text(value, 500);
  }
  return values;
}

function deterministicSpintax(source, seed) {
  let output = String(source || '');
  for (let pass = 0; pass < 5; pass += 1) {
    const next = output.replace(/\{([^{}|]+\|[^{}]+)\}/g, (match, options) => {
      const values = options.split('|');
      const digest = crypto.createHash('sha256').update(`${seed}:${match}:${pass}`).digest('hex');
      return values[parseInt(digest.slice(0, 8), 16) % values.length].trim();
    });
    if (next === output) break;
    output = next;
  }
  return output;
}

function renderConditionals(source, values) {
  let output = String(source || '');
  for (let pass = 0; pass < 5; pass += 1) {
    const next = output.replace(/\{%\s*if\s+([A-Za-z][A-Za-z0-9_]*)\s*%\}([\s\S]*?)(?:\{%\s*else\s*%\}([\s\S]*?))?\{%\s*endif\s*%\}/g, (_match, tag, truthy, falsy = '') => String(values[tag] || '').trim() ? truthy : falsy);
    if (next === output) break;
    output = next;
  }
  return output;
}

export function renderMergeTags(template, prospect = {}, campaign = {}, sender = {}, options = {}) {
  const settings = campaign.sequence?.settings || campaign.settings || {};
  const values = mergeValues(prospect, campaign, sender, settings);
  let source = renderConditionals(template, values);
  source = deterministicSpintax(source, `${prospect.id || prospect.domain || prospect.company || 'preview'}:${options.seed || ''}`);
  const usedTags = [];
  const missingTags = [];
  const placeholderTags = [];
  const rendered = source.replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (match, tag) => {
    usedTags.push(tag);
    const value = values[tag];
    if (!String(value || '').trim()) missingTags.push(tag);
    return String(value || '');
  });
  const sourceValues = { ...(prospect.customVariables || {}), ...(prospect.customFields || {}) };
  for (const tag of usedTags) {
    if (settings.placeholderValues?.[tag] && !String(sourceValues[tag] || '').trim()) placeholderTags.push(tag);
  }
  return { text: rendered, usedTags: unique(usedTags), missingTags: unique(missingTags), placeholderTags: unique(placeholderTags) };
}

function variantFor(prospect = {}, step = {}) {
  const variants = (step.variants || []).filter(variant => variant.enabled !== false && Number(variant.weight || 0) > 0);
  if (variants.length <= 1) return variants[0];
  const key = `${prospect.id || prospect.domain || prospect.company || 'preview'}:${step.id}`;
  const digest = crypto.createHash('sha256').update(key).digest('hex');
  const bucket = (parseInt(digest.slice(0, 8), 16) % 10000) / 100;
  let cursor = 0;
  for (const variant of variants) {
    cursor += Number(variant.weight || 0);
    if (bucket < cursor) return variant;
  }
  return variants[variants.length - 1];
}

function addDays(date, days) {
  return new Date(date.getTime() + Number(days || 0) * 86400000);
}

function delayMilliseconds(step = {}) {
  const unit = String(step.delayUnit || 'days').toLowerCase();
  const value = Number(step.delayValue ?? step.delayDays ?? 0);
  if (!Number.isFinite(value)) return 0;
  if (unit === 'minutes') return value * 60_000;
  if (unit === 'hours') return value * 3_600_000;
  return value * 86_400_000;
}

function validTimeZone(value) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date()); return true; }
  catch { return false; }
}

function localTimeParts(value, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(value).filter(item => item.type !== 'literal').map(item => [item.type, item.value]));
  const weekdayName = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(value);
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName) || 7
  };
}

function absoluteForLocalTime(parts, timeZone) {
  let candidate = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = localTimeParts(new Date(candidate), timeZone);
    const observedAsUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute, 0, 0);
    candidate += desired - observedAsUtc;
  }
  return new Date(candidate);
}

export function nextSendWindowAt(value, sendWindow = {}, timeZone = '') {
  let source = new Date(iso(value));
  const requestedZone = String(timeZone || sendWindow.timezone || '').trim();
  const zone = requestedZone && requestedZone.toLowerCase() !== 'recipient' && validTimeZone(requestedZone) ? requestedZone : 'UTC';
  const start = Math.max(0, Math.min(23, Number(sendWindow.start ?? 9)));
  const end = Math.max(start + 1, Math.min(24, Number(sendWindow.end ?? 17)));
  const startHour = Math.floor(start);
  const startMinute = Math.min(59, Math.round((start - startHour) * 60));
  const weekdays = new Set(asArray(sendWindow.weekdays).map(Number).filter(day => day >= 1 && day <= 7));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const local = localTimeParts(source, zone);
    const day = local.weekday;
    const hour = local.hour + local.minute / 60;
    if ((!weekdays.size || weekdays.has(day)) && hour >= start && hour < end) return source.toISOString();
    const nextDay = hour >= end || (weekdays.size && !weekdays.has(day));
    const localDate = new Date(Date.UTC(local.year, local.month - 1, local.day + (nextDay ? 1 : 0), startHour, startMinute, 0, 0));
    source = absoluteForLocalTime({ year: localDate.getUTCFullYear(), month: localDate.getUTCMonth() + 1, day: localDate.getUTCDate(), hour: localDate.getUTCHours(), minute: localDate.getUTCMinutes() }, zone);
  }
  return source.toISOString();
}

export function previewSequence({ sequence, prospect = {}, campaign = {}, sender = {}, startAt = new Date() } = {}) {
  const normalized = normalizeSequence(sequence, { campaign });
  let scheduled = new Date(iso(startAt));
  const steps = normalized.steps.map((step, index) => {
    if (index > 0) scheduled = new Date(scheduled.getTime() + delayMilliseconds(step));
    const selected = variantFor(prospect, step);
    const variants = step.variants.map(variant => {
      const subject = renderMergeTags(variant.subject, prospect, campaign, sender);
      const body = renderMergeTags(variant.body, prospect, campaign, sender);
      return {
        ...variant,
        subject: subject.text,
        body: body.text,
        usedTags: unique([...subject.usedTags, ...body.usedTags]),
        missingTags: unique([...subject.missingTags, ...body.missingTags]),
        placeholderTags: unique([...subject.placeholderTags, ...body.placeholderTags])
      };
    });
    const selectedVariant = variants.find(variant => variant.id === selected?.id) || variants[0];
    return {
      ...step,
      index,
      scheduledAt: scheduled.toISOString(),
      selectedVariantId: selectedVariant?.id || '',
      variants,
      selected: selectedVariant || null,
      missingTags: selectedVariant?.missingTags || [],
      placeholderTags: selectedVariant?.placeholderTags || [],
      nextWindowAt: nextSendWindowAt(scheduled, normalized.settings.sendWindow, prospect.timeZone || prospect.timezone || '')
    };
  });
  return { ...normalized, steps };
}

export function stopReason({ prospect = {}, suppressions = [], settings = {} } = {}) {
  const email = text(prospect.contact?.email).toLowerCase();
  const domain = normalizeDomain(prospect.website || prospect.domain || '') || emailDomain(email);
  const suppressed = new Set(asArray(suppressions).map(item => text(item.value).toLowerCase()).filter(Boolean));
  if (settings.stopOnUnsubscribe !== false && (prospect.status === 'suppressed' || suppressed.has(email) || suppressed.has(domain))) return 'suppressed';
  if (settings.stopOnBounce !== false && ['bounce', 'complaint'].includes(String(prospect.replyLabel || '').toLowerCase())) return prospect.replyLabel.toLowerCase();
  if (settings.stopOnAutoReply !== false && ['automatic', 'out_of_office'].includes(String(prospect.replyLabel || '').toLowerCase())) return 'automatic-reply';
  if (settings.stopOnOutOfOffice === true && String(prospect.replyLabel || '').toLowerCase() === 'out_of_office') return 'out-of-office';
  if (settings.stopOnReply !== false && prospect.repliedAt) return 'reply-received';
  if (settings.stopOnPositiveReply !== false && String(prospect.replyLabel || '').toLowerCase() === 'positive') return 'positive-reply';
  if (settings.stopOnPayment !== false && ['paid', 'cleared', 'settled', 'accepted', 'recurring'].includes(String(prospect.paymentStatus || '').toLowerCase())) return 'payment-state';
  if (settings.stopOnOpportunity !== false && ['opportunity', 'meeting', 'offer', 'invoice', 'paid', 'delivery', 'accepted', 'recurring'].includes(String(prospect.opportunityStage || '').toLowerCase())) return 'commercial-opportunity';
  return '';
}

export function enrollProspect({ prospect = {}, campaign = {}, now = new Date(), sender = {} } = {}) {
  const sequence = normalizeSequence(campaign.sequence, { campaign });
  const preview = previewSequence({ sequence, prospect, campaign, sender, startAt: now });
  const selectedVariants = Object.fromEntries(preview.steps.map(step => [step.id, step.selectedVariantId]));
  const stepStates = preview.steps.map(step => ({
    stepId: step.id,
    status: step.index === 0 ? 'scheduled' : 'pending',
    scheduledAt: step.scheduledAt,
    selectedVariantId: step.selectedVariantId
  }));
  return {
    schemaVersion: 'uberbond.sequence-state.v1',
    campaignId: campaign.id || '',
    sequenceVersion: sequence.version,
    status: 'active',
    enrolledAt: iso(now),
    currentStepIndex: 0,
    nextStepAt: stepStates[0]?.scheduledAt || iso(now),
    selectedVariants,
    stepStates,
    stoppedReason: ''
  };
}

function conditionReady(condition, prospect = {}) {
  const replyLabel = lower(prospect.replyLabel);
  if (condition === 'always') return true;
  if (condition === 'no_reply') return !prospect.repliedAt && !['positive', 'negative', 'optout', 'bounce', 'complaint'].includes(replyLabel);
  if (condition === 'positive_reply') return replyLabel === 'positive' || Boolean(prospect.positiveReplyAt);
  if (condition === 'opened_no_reply') return Boolean(prospect.openedAt || prospect.engagement?.openedAt) && !prospect.repliedAt;
  if (condition === 'clicked_no_reply') return Boolean(prospect.clickedAt || prospect.engagement?.clickedAt) && !prospect.repliedAt;
  if (condition === 'not_interested') return replyLabel === 'negative' || replyLabel === 'not_interested';
  if (condition === 'out_of_office') return replyLabel === 'automatic' || replyLabel === 'out_of_office';
  return false;
}

export function advanceSequence({ state = {}, sequence, prospect = {}, campaign = {}, suppressions = [], now = new Date(), sender = {} } = {}) {
  const normalized = normalizeSequence(sequence || campaign.sequence, { campaign });
  const currentIndex = Math.max(0, Math.min(Number(state.currentStepIndex || 0), normalized.steps.length - 1));
  const preview = previewSequence({
    sequence: normalized,
    prospect,
    campaign,
    sender,
    startAt: state.enrolledAt || now
  });
  const current = normalized.steps[currentIndex];
  const planned = preview.steps[currentIndex];
  const timestamp = new Date(iso(now));
  const stepStates = (state.stepStates || preview.steps.map(step => ({
    stepId: step.id,
    status: step.index === 0 ? 'scheduled' : 'pending',
    scheduledAt: step.scheduledAt,
    selectedVariantId: step.selectedVariantId
  }))).map(step => ({ ...step }));
  const setStepStatus = (status, extra = {}) => {
    const index = stepStates.findIndex(step => step.stepId === current.id);
    if (index >= 0) stepStates[index] = { ...stepStates[index], status, ...extra };
  };
  const base = {
    ...state,
    schemaVersion: state.schemaVersion || 'uberbond.sequence-state.v1',
    campaignId: campaign.id || state.campaignId || '',
    sequenceVersion: normalized.version,
    currentStepIndex: currentIndex,
    stepStates
  };
  const reason = stopReason({ prospect, suppressions, settings: normalized.settings });
  if (reason) {
    setStepStatus('stopped', { stoppedAt: timestamp.toISOString(), stoppedReason: reason });
    return {
      action: 'stopped', reason, step: null,
      state: { ...base, status: 'stopped', stoppedReason: reason, nextStepAt: null }
    };
  }
  const missingTags = unique(preview.steps[currentIndex]?.missingTags || []);
  const planningBlock = !campaign.approved ? 'campaign-not-approved'
    : !prospect.contact?.email ? 'recipient-missing'
      : (!prospect.issue?.title || prospect.issue?.safeForOutreach === false) ? 'evidence-not-ready'
        : Number(prospect.score?.total || 0) < Number(campaign.minScore || 0) ? 'score-below-campaign-threshold'
          : missingTags.length ? `missing-merge-data:${missingTags.join(',')}` : '';
  if (planningBlock) {
    return { action: 'blocked', reason: planningBlock, step: planned, state: { ...base, status: 'active', stoppedReason: '', nextStepAt: state.nextStepAt || planned.scheduledAt } };
  }
  if (state.status === 'approved') {
    return {
      action: 'approved', reason: '', step: planned,
      state: { ...base, status: 'approved', stoppedReason: '', nextStepAt: state.nextStepAt || planned.nextWindowAt || planned.scheduledAt }
    };
  }
  if (state.status === 'ready_for_review') {
    return {
      action: 'ready_for_review', reason: '', step: planned,
      state: { ...base, status: 'ready_for_review', stoppedReason: '', nextStepAt: state.nextStepAt || planned.nextWindowAt || planned.scheduledAt }
    };
  }
  if (state.status === 'paused' || state.status === 'stopped' || state.status === 'completed') {
    return { action: state.status, reason: state.stoppedReason || '', step: null, state: base };
  }
  const nextStepAt = state.nextStepAt || planned.scheduledAt;
  if (Date.parse(nextStepAt) > timestamp.getTime()) {
    return { action: 'waiting', reason: 'not-due', step: planned, state: { ...base, status: 'active', nextStepAt } };
  }
  if (!conditionReady(current.condition, prospect)) {
    const action = current.condition === 'manual' ? 'manual_review' : 'waiting_condition';
    return { action, reason: current.condition, step: planned, state: { ...base, status: 'active', nextStepAt } };
  }
  setStepStatus('ready_for_review', { readyAt: timestamp.toISOString() });
  return {
    action: 'ready_for_review', reason: '', step: planned,
    state: { ...base, status: 'ready_for_review', stoppedReason: '', nextStepAt }
  };
}

/**
 * Advances durable sequence state after a provider result has been observed.
 * This helper deliberately does not call a provider and is safe to replay
 * after a worker restart; the caller supplies the exact step and result
 * metadata that was authorized by the send path.
 */
export function markSequenceStepSent({ state = {}, sequence, prospect = {}, campaign = {}, sender = {}, stepIndex, sentAt = new Date(), message = {}, approvalId = '' } = {}) {
  const normalized = normalizeSequence(sequence || campaign.sequence, { campaign });
  const index = Number.isInteger(Number(stepIndex)) ? Number(stepIndex) : Number(state.currentStepIndex || 0);
  if (index < 0 || index >= normalized.steps.length) throw new Error('Sequence step index is out of bounds');
  const timestamp = new Date(iso(sentAt));
  const preview = previewSequence({ sequence: normalized, prospect, campaign, sender, startAt: state.enrolledAt || timestamp });
  const stepStates = (state.stepStates || preview.steps.map(step => ({
    stepId: step.id,
    status: step.index === 0 ? 'scheduled' : 'pending',
    scheduledAt: step.nextWindowAt || step.scheduledAt,
    selectedVariantId: step.selectedVariantId
  }))).map(step => ({ ...step }));
  const current = normalized.steps[index];
  const currentStateIndex = stepStates.findIndex(step => step.stepId === current.id);
  if (currentStateIndex >= 0) {
    stepStates[currentStateIndex] = {
      ...stepStates[currentStateIndex],
      status: 'sent',
      sentAt: timestamp.toISOString(),
      messageId: message.id || stepStates[currentStateIndex].messageId || '',
      gmailId: message.gmailId || stepStates[currentStateIndex].gmailId || '',
      threadId: message.threadId || stepStates[currentStateIndex].threadId || '',
      approvalId: approvalId || stepStates[currentStateIndex].approvalId || ''
    };
  }
  const nextIndex = index + 1;
  if (nextIndex >= normalized.steps.length) {
    return {
      ...state,
      schemaVersion: state.schemaVersion || 'uberbond.sequence-state.v1',
      campaignId: campaign.id || state.campaignId || '',
      sequenceVersion: normalized.version,
      status: 'completed',
      currentStepIndex: index,
      nextStepAt: null,
      approvedStepIndex: null,
      approvedAt: '',
      approvedVariantId: '',
      approvedMessageDigest: '',
      stepStates,
      completedAt: timestamp.toISOString(),
      stoppedReason: ''
    };
  }
  const nextStep = normalized.steps[nextIndex];
  const nextPreview = preview.steps[nextIndex];
  const rawNextAt = new Date(timestamp.getTime() + delayMilliseconds(nextStep));
  const nextAt = nextSendWindowAt(rawNextAt, normalized.settings.sendWindow, prospect.timeZone || prospect.timezone || '');
  const nextStateIndex = stepStates.findIndex(step => step.stepId === nextStep.id);
  if (nextStateIndex >= 0) {
    stepStates[nextStateIndex] = {
      ...stepStates[nextStateIndex],
      status: 'scheduled',
      scheduledAt: nextAt,
      selectedVariantId: state.selectedVariants?.[nextStep.id] || nextPreview?.selectedVariantId || stepStates[nextStateIndex].selectedVariantId
    };
  }
  return {
    ...state,
    schemaVersion: state.schemaVersion || 'uberbond.sequence-state.v1',
    campaignId: campaign.id || state.campaignId || '',
    sequenceVersion: normalized.version,
    status: 'active',
    currentStepIndex: nextIndex,
    nextStepAt: nextAt,
    approvedStepIndex: null,
    approvedAt: '',
    approvedVariantId: '',
    approvedMessageDigest: '',
    stepStates,
    stoppedReason: ''
  };
}

export function buildSequencePlan({ campaign = {}, prospects = [], suppressions = [], now = new Date(), sender = {} } = {}) {
  const sequence = normalizeSequence(campaign.sequence, { campaign });
  return asArray(prospects).map(prospect => {
    const reason = stopReason({ prospect, suppressions, settings: sequence.settings });
    const preview = previewSequence({ sequence, prospect, campaign, sender, startAt: now });
    const reasons = [];
    if (!campaign.approved) reasons.push('campaign-not-approved');
    if (!prospect.contact?.email) reasons.push('recipient-missing');
    if (!prospect.issue?.title || prospect.issue?.safeForOutreach === false) reasons.push('evidence-not-ready');
    if (Number(prospect.score?.total || 0) < Number(campaign.minScore || 0)) reasons.push('score-below-campaign-threshold');
    if (reason) reasons.push(reason);
    const missingTags = unique(preview.steps.flatMap(step => step.missingTags || []));
    if (missingTags.length) reasons.push(`missing-merge-data:${missingTags.join(',')}`);
    const eligible = reasons.length === 0;
    return {
      prospectId: prospect.id,
      company: prospect.company,
      recipientEmail: prospect.contact?.email || '',
      eligible,
      reasons,
      externalEffects: 0,
      steps: preview.steps.map(step => ({
        stepId: step.id,
        name: step.name,
        kind: step.kind,
        scheduledAt: step.scheduledAt,
        variantId: step.selectedVariantId,
        subject: step.selected?.subject || '',
        body: step.selected?.body || '',
        missingTags: step.missingTags || []
      }))
    };
  });
}

function lower(value) { return String(value || '').trim().toLowerCase(); }

export function buildRevenueWeightedAnalytics({ prospects = [], messages = [], replies = [], orders = [], subscriptions = [], revenueEvents = [] } = {}) {
  const allProspects = asArray(prospects);
  const sentProspectIds = new Set(asArray(messages).map(item => item.prospectId).filter(Boolean));
  allProspects.forEach(item => { if (item.sentAt) sentProspectIds.add(item.id); });
  const replyProspectIds = new Set(asArray(replies).map(item => item.prospectId).filter(Boolean));
  allProspects.forEach(item => { if (item.repliedAt) replyProspectIds.add(item.id); });
  const positive = new Set(allProspects.filter(item => lower(item.replyLabel) === 'positive').map(item => item.id));
  asArray(replies).filter(item => lower(item.classification?.label) === 'positive').forEach(item => positive.add(item.prospectId));
  const stage = stageName => new Set(allProspects.filter(item => lower(item.opportunityStage) === stageName).map(item => item.id));
  const opportunity = new Set([...stage('opportunity'), ...stage('meeting'), ...stage('offer'), ...stage('invoice'), ...positive]);
  const meeting = new Set([...stage('meeting')]);
  const offer = new Set([...stage('offer'), ...stage('invoice')]);
  const claimedOrders = asArray(orders).filter(order => order.status !== 'failed' && order.status !== 'cancelled');
  const settledOrders = claimedOrders.filter(order => ['paid', 'settled', 'cleared', 'completed'].includes(lower(order.status)) || /paid|settled|cleared|completed/.test(lower(order.eventName)));
  const paid = new Set([...stage('paid'), ...stage('delivery'), ...stage('accepted'), ...stage('recurring')]);
  const accepted = new Set([...stage('accepted'), ...stage('recurring')]);
  const recurring = new Set([...stage('recurring'), ...asArray(subscriptions).filter(item => ['active', 'trialing'].includes(lower(item.status))).map(item => item.prospectId).filter(Boolean)]);
  const clearedRevenueUsd = settledOrders.reduce((sum, order) => sum + Number(order.amountCents || 0) / 100, 0)
    + asArray(revenueEvents).filter(item => ['cleared', 'settled', 'paid'].includes(lower(item.status))).reduce((sum, item) => sum + Number(item.amountCents || 0) / 100, 0);
  const counts = {
    prospects: allProspects.length,
    researched: allProspects.filter(item => ['ready', 'research-complete', 'sent', 'replied'].includes(lower(item.status))).length,
    scheduled: allProspects.filter(item => item.sequenceState?.status === 'active').length,
    sent: sentProspectIds.size,
    replies: replyProspectIds.size,
    positiveReplies: positive.size,
    opportunities: opportunity.size,
    meetings: meeting.size,
    offers: offer.size,
    paymentClaimed: new Set([...paid, ...claimedOrders.map(item => item.prospectId).filter(Boolean)]).size,
    paymentSettled: settledOrders.length,
    deliveryAccepted: accepted.size,
    recurring: recurring.size
  };
  const rate = denominator => denominator ? Math.round((counts[denominator] / Math.max(1, counts.prospects)) * 1000) / 10 : 0;
  return {
    counts,
    rates: {
      replyFromSent: counts.sent ? Math.round(counts.replies / counts.sent * 1000) / 10 : 0,
      positiveFromReplies: counts.replies ? Math.round(counts.positiveReplies / counts.replies * 1000) / 10 : 0,
      opportunityFromReplies: counts.replies ? Math.round(counts.opportunities / counts.replies * 1000) / 10 : 0,
      settledFromOpportunities: counts.opportunities ? Math.round(counts.paymentSettled / counts.opportunities * 1000) / 10 : 0,
      recurringFromSettled: counts.paymentSettled ? Math.round(counts.recurring / counts.paymentSettled * 1000) / 10 : 0,
      researchedFromProspects: rate('researched')
    },
    clearedRevenueUsd: Math.round(clearedRevenueUsd * 100) / 100,
    weightedOutcomeScore: counts.recurring * 1000 + counts.paymentSettled * 800 + counts.deliveryAccepted * 650 + counts.opportunities * 400 + counts.positiveReplies * 250 + counts.replies * 100 + counts.sent * 10,
    metricOrder: ['clearedRevenue', 'recurring', 'deliveryAccepted', 'opportunities', 'positiveReplies', 'replies', 'sent']
  };
}

function ratio(numerator, denominator) {
  return denominator ? Math.round(numerator / denominator * 10000) / 100 : 0;
}

export function buildVariantAnalytics({ campaignId = '', campaign = {}, prospects = [], messages = [], replies = [], orders = [], revenueEvents = [], outboundEvents = [] } = {}) {
  const campaignMessages = asArray(messages).filter(item => !campaignId || String(item.campaignId || '') === String(campaignId));
  const prospectIds = new Set(campaignMessages.map(item => item.prospectId).filter(Boolean));
  const campaignProspects = asArray(prospects).filter(item => !campaignId || String(item.campaignId || '') === String(campaignId) || prospectIds.has(item.id));
  const prospectById = new Map(campaignProspects.map(item => [item.id, item]));
  const repliesByProspect = new Map();
  asArray(replies).forEach(reply => {
    if (!prospectById.has(reply.prospectId)) return;
    repliesByProspect.set(reply.prospectId, [...(repliesByProspect.get(reply.prospectId) || []), reply]);
  });
  const eventsByMessage = new Map();
  asArray(outboundEvents).forEach(event => {
    const messageKey = event.messageId || event.detail?.messageId || event.gmailId || event.detail?.gmailId;
    if (messageKey) eventsByMessage.set(messageKey, [...(eventsByMessage.get(messageKey) || []), event]);
  });
  const groups = new Map();
  const ensure = (stepId = 'unknown', variantId = 'unknown') => {
    const key = `${stepId}:${variantId}`;
    if (!groups.has(key)) groups.set(key, { stepId, variantId, sent: 0, opened: 0, clicked: 0, replies: 0, positiveReplies: 0, opportunities: 0, clearedRevenueUsd: 0, prospectIds: new Set() });
    return groups.get(key);
  };
  for (const message of campaignMessages) {
    const group = ensure(message.stepId || 'legacy', message.variantId || 'unknown');
    group.sent += 1;
    if (message.prospectId) group.prospectIds.add(message.prospectId);
    const events = eventsByMessage.get(message.id) || eventsByMessage.get(message.gmailId) || [];
    const opened = Boolean(message.opened || message.openedAt || events.some(item => ['opened', 'email_opened'].includes(lower(item.eventType))));
    const clicked = Boolean(message.clicked || message.clickedAt || events.some(item => ['clicked', 'email_link_clicked'].includes(lower(item.eventType))));
    group.opened += opened ? 1 : 0;
    group.clicked += clicked ? 1 : 0;
  }
  for (const [prospectId, prospectReplies] of repliesByProspect) {
    const prospect = prospectById.get(prospectId);
    const latestMessage = [...campaignMessages].reverse().find(item => item.prospectId === prospectId);
    const group = ensure(latestMessage?.stepId || 'legacy', latestMessage?.variantId || 'unknown');
    if (prospectReplies.length) group.replies += 1;
    if (prospectReplies.some(item => lower(item.classification?.label || item.label) === 'positive') || lower(prospect?.replyLabel) === 'positive') group.positiveReplies += 1;
    if (['opportunity', 'meeting', 'offer', 'invoice', 'paid', 'delivery', 'accepted', 'recurring'].includes(lower(prospect?.opportunityStage))) group.opportunities += 1;
  }
  for (const order of asArray(orders)) {
    if (!prospectById.has(order.prospectId) || ['failed', 'cancelled'].includes(lower(order.status))) continue;
    if (['paid', 'settled', 'cleared', 'completed'].includes(lower(order.status)) || /paid|settled|cleared|completed/.test(lower(order.eventName))) {
      const latestMessage = [...campaignMessages].reverse().find(item => item.prospectId === order.prospectId);
      ensure(latestMessage?.stepId || 'legacy', latestMessage?.variantId || 'unknown').clearedRevenueUsd += Number(order.amountCents || 0) / 100;
    }
  }
  for (const event of asArray(revenueEvents)) {
    if (!prospectById.has(event.prospectId) || !['cleared', 'settled', 'paid'].includes(lower(event.status))) continue;
    const latestMessage = [...campaignMessages].reverse().find(item => item.prospectId === event.prospectId);
    ensure(latestMessage?.stepId || 'legacy', latestMessage?.variantId || 'unknown').clearedRevenueUsd += Number(event.amountCents || 0) / 100;
  }
  const steps = [...groups.values()].map(group => ({
    ...group,
    prospectIds: [...group.prospectIds],
    openRate: ratio(group.opened, group.sent),
    clickRate: ratio(group.clicked, group.sent),
    replyRate: ratio(group.replies, group.sent),
    positiveReplyRate: ratio(group.positiveReplies, group.sent),
    opportunityRate: ratio(group.opportunities, group.sent)
  })).sort((a, b) => `${a.stepId}:${a.variantId}`.localeCompare(`${b.stepId}:${b.variantId}`));
  const metric = campaign.sequence?.settings?.autoOptimizeMetric || 'replyRate';
  const minimumSamples = Number(campaign.sequence?.settings?.minimumOptimizationSamples || 25);
  const eligible = steps.filter(item => item.sent >= minimumSamples);
  const winner = eligible.slice().sort((a, b) => Number(b[metric] || 0) - Number(a[metric] || 0) || b.sent - a.sent)[0] || null;
  return {
    campaignId,
    campaignName: campaign.name || '',
    metric,
    minimumSamples,
    totals: {
      sent: campaignMessages.length,
      opened: steps.reduce((sum, item) => sum + item.opened, 0),
      clicked: steps.reduce((sum, item) => sum + item.clicked, 0),
      replies: new Set([...repliesByProspect.keys()]).size,
      opportunities: new Set(campaignProspects.filter(item => ['opportunity', 'meeting', 'offer', 'invoice', 'paid', 'delivery', 'accepted', 'recurring'].includes(lower(item.opportunityStage))).map(item => item.id)).size,
      clearedRevenueUsd: Math.round(steps.reduce((sum, item) => sum + item.clearedRevenueUsd, 0) * 100) / 100
    },
    steps,
    recommendation: winner ? { stepId: winner.stepId, variantId: winner.variantId, metric, value: winner[metric], eligible: true, action: 'owner_review_before_disabling_variants' } : { eligible: false, action: 'collect_more_observations' }
  };
}

export function buildCampaignSendingStatus({ campaign = {}, prospects = [], accounts = [], senderHealth = [], globalPaused = false, now = new Date() } = {}) {
  const reasons = [];
  const issueTracking = [];
  const assigned = asArray(prospects).filter(item => item.campaignId === campaign.id);
  const connectedSlots = new Set(asArray(accounts).filter(item => item.connected).map(item => item.slot));
  const pausedSlots = new Set(asArray(senderHealth).filter(item => item.paused).map(item => item.inbox));
  const addIssue = (code, severity, message, action, reason = code.toLowerCase()) => {
    reasons.push(reason);
    issueTracking.push({ code, severity, message, action });
  };
  if (campaign.paused) addIssue('CAMPAIGN_PAUSED', 'blocking', 'This sequence is paused.', 'Resume the campaign after the owner reviews its exact contract.', 'campaign-paused');
  if (globalPaused) addIssue('GLOBAL_OUTBOUND_PAUSED', 'blocking', 'The owner has paused all outbound effects.', 'Resolve the owner stop condition before resuming any sender.', 'global-outbound-paused');
  if (campaign.approved !== true || campaign.autoSend !== true) addIssue('OWNER_PLAN_ONLY', 'review', 'The sequence is a plan until the owner approves it and enables its send switch.', 'Review the route, payload and provider gate; then approve explicitly.', 'owner-plan-only');
  if (!assigned.length) addIssue('NO_LEADS_ASSIGNED', 'blocking', 'No prospects are assigned to this sequence.', 'Add only evidence-backed prospects with a selected contact.', 'no-leads-assigned');
  if (!connectedSlots.size) addIssue('NO_CONNECTED_SENDER', 'blocking', 'No connected sender slot is available.', 'Connect a sender only when an owner-approved canary is ready.', 'no-connected-sender');
  if (connectedSlots.size && [...connectedSlots].every(slot => pausedSlots.has(slot))) addIssue('ALL_SENDERS_PAUSED', 'blocking', 'Every connected sender assigned to this workspace is paused.', 'Review sender health and resume one safe slot.', 'all-senders-paused');
  const due = assigned.filter(item => ['ready_for_review', 'approved'].includes(item.sequenceState?.status) || (item.sequenceState?.status === 'active' && Date.parse(item.sequenceState?.nextStepAt || '') <= now.getTime())).length;
  const uncertain = assigned.filter(item => item.status === 'send-uncertain' || item.sendSafety?.reason === 'provider-result-uncertain').length;
  if (uncertain) addIssue('UNCERTAIN_EFFECTS', 'critical', `${uncertain} external effect(s) cannot be safely retried yet.`, 'Reconcile the provider result before changing the prospect or sending again.', 'uncertain-effects-require-reconciliation');
  const sequenceSteps = Array.isArray(campaign.sequence?.steps) ? campaign.sequence.steps.length : 0;
  if (!sequenceSteps) addIssue('SEQUENCE_NOT_CONFIGURED', 'blocking', 'The campaign has no executable sequence steps.', 'Add and preview at least one message step.', 'sequence-not-configured');
  const approvalPending = assigned.filter(item => ['ready_for_review', 'active'].includes(item.sequenceState?.status) && item.sequenceState?.status === 'ready_for_review').length;
  if (approvalPending) addIssue('STEP_APPROVAL_PENDING', 'review', `${approvalPending} lead plan(s) are waiting for exact owner approval.`, 'Open the dossier and approve only the exact rendered step.', 'step-approval-pending');
  const completedLeads = assigned.filter(item => {
    const state = item.sequenceState || {};
    return ['completed', 'stopped'].includes(state.status) || (sequenceSteps > 0 && Number(state.currentStepIndex || 0) >= sequenceSteps);
  }).length;
  const nextDueAt = assigned.map(item => item.sequenceState?.nextStepAt).filter(value => Number.isFinite(Date.parse(value))).sort()[0] || null;
  const lastUpdated = assigned.map(item => item.updatedAt || item.sequenceState?.updatedAt || item.createdAt).filter(value => Number.isFinite(Date.parse(value))).sort().at(-1) || null;
  const totalLeads = assigned.length;
  return {
    campaignId: campaign.id || '', status: reasons.length ? (reasons.includes('owner-plan-only') ? 'plan_only' : 'blocked') : 'ready',
    reasons, issueTracking, assignedLeads: totalLeads, due, uncertain, connectedSenders: connectedSlots.size,
    progress: { completedLeads, totalLeads, percent: totalLeads ? Math.round(completedLeads / totalLeads * 100) : 0 },
    nextDueAt, lastUpdated,
    nextCheckAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
    policy: 'no provider call is implied by this diagnostic'
  };
}

export function buildOwnerReplyDraft({ prospect = {}, reply = {}, sender = {}, offer = '' } = {}) {
  const label = lower(reply.classification?.label || reply.label || prospect.replyLabel);
  const name = text(prospect.contact?.firstName || prospect.contact?.name || 'there', 120);
  const signature = `\n\nBest,\n${text(sender.name || 'Mohamed Wessam', 120)}\n${text(sender.company || 'UberBond', 120)}`;
  if (['optout', 'unsubscribe', 'negative'].includes(label)) return { label, safeToSend: false, reason: 'suppression-or-negative-reply', subject: `Re: ${text(reply.subject || 'your message', 180)}`, body: `Hi ${name},\n\nUnderstood — I will not send further messages.${signature}` };
  if (['automatic', 'out_of_office'].includes(label)) return { label, safeToSend: false, reason: 'out-of-office-needs-return-date', subject: `Re: ${text(reply.subject || 'your message', 180)}`, body: `Hi ${name},\n\nThanks for letting me know. I will wait until you are back before considering any follow-up.${signature}` };
  if (['positive', 'interested'].includes(label)) return { label, safeToSend: false, reason: 'owner-must-confirm-commercial-terms', subject: `Re: ${text(reply.subject || 'your message', 180)}`, body: `Hi ${name},\n\nThanks — happy to make this concrete. The smallest starting point is ${text(offer || 'the scoped diagnostic', 300)}. If you send the relevant URLs and priority journeys, I will confirm the exact scope, timing and price before any work begins.${signature}` };
  return { label: label || 'unknown', safeToSend: false, reason: 'ambiguous-reply-requires-owner-review', subject: `Re: ${text(reply.subject || 'your message', 180)}`, body: `Hi ${name},\n\nThanks for getting back to me. I want to make sure I answer the right question — could you tell me whether you are asking about scope, timing, price, or a different need?${signature}` };
}

export function buildInboxThreads({ prospects = [], messages = [], replies = [] } = {}) {
  const prospectById = new Map(asArray(prospects).map(item => [item.id, item]));
  const threads = new Map();
  const getThread = (key, prospectId = '') => {
    const threadKey = key || `prospect:${prospectId}`;
    if (!threads.has(threadKey)) threads.set(threadKey, { id: threadKey, prospectId, messages: [], replies: [], lastActivityAt: '', lastActivityType: '', unread: false });
    const thread = threads.get(threadKey);
    if (!thread.prospectId && prospectId) thread.prospectId = prospectId;
    return thread;
  };
  asArray(messages).forEach(message => {
    const thread = getThread(message.threadId, message.prospectId);
    thread.messages.push(message);
    const time = message.sentAt || message.createdAt || '';
    if (time > thread.lastActivityAt) { thread.lastActivityAt = time; thread.lastActivityType = 'sent'; }
  });
  asArray(replies).forEach(reply => {
    const thread = getThread(reply.threadId, reply.prospectId);
    thread.replies.push(reply);
    const time = reply.receivedAt || reply.createdAt || '';
    if (time > thread.lastActivityAt) { thread.lastActivityAt = time; thread.lastActivityType = 'reply'; }
    if (!reply.readAt) thread.unread = true;
  });
  return [...threads.values()].map(thread => ({
    ...thread,
    prospect: prospectById.get(thread.prospectId) || null,
    latestReply: [...thread.replies].sort((a, b) => String(b.receivedAt || b.createdAt || '').localeCompare(String(a.receivedAt || a.createdAt || '')))[0] || null,
    latestMessage: [...thread.messages].sort((a, b) => String(b.sentAt || b.createdAt || '').localeCompare(String(a.sentAt || a.createdAt || '')))[0] || null
  })).map(thread => {
    const prospect = thread.prospect || {};
    const label = lower(thread.latestReply?.classification?.label || thread.latestReply?.label || prospect.replyLabel);
    const archivedAt = text(prospect.inboxArchivedAt, 80);
    const snoozedUntil = text(prospect.inboxSnoozedUntil, 80);
    const snoozed = Boolean(snoozedUntil && Number.isFinite(Date.parse(snoozedUntil)) && Date.parse(snoozedUntil) > Date.now());
    return {
      ...thread,
      archived: Boolean(archivedAt),
      archivedAt,
      snoozed,
      snoozedUntil,
      needsAction: !archivedAt && !snoozed && (thread.unread || ['unknown', 'automatic', 'out_of_office'].includes(label)),
      replyLabel: label || ''
    };
  }).sort((a, b) => String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)));
}

export const INBOX_ACTIONS = Object.freeze([
  'archive', 'unarchive', 'snooze', 'clear_snooze',
  'mark_positive', 'mark_negative', 'mark_neutral', 'create_opportunity'
]);

export function normalizeInboxAction(action, { snoozedUntil = '', now = new Date() } = {}) {
  const normalized = lower(action).replace(/\s+/g, '_');
  if (!INBOX_ACTIONS.includes(normalized)) throw new Error(`Unsupported inbox action: ${normalized || 'missing'}`);
  if (normalized !== 'snooze') return { action: normalized, snoozedUntil: '' };
  const date = new Date(snoozedUntil);
  const nowDate = new Date(iso(now));
  if (!Number.isFinite(date.getTime()) || date.getTime() <= nowDate.getTime()) throw new Error('Snooze requires a future timestamp');
  if (date.getTime() > nowDate.getTime() + 90 * 24 * 60 * 60 * 1000) throw new Error('Snooze may not exceed 90 days');
  return { action: normalized, snoozedUntil: date.toISOString() };
}

export function buildInboxActionPatch({ action, prospect = {}, snoozedUntil = '', now = new Date() } = {}) {
  const normalized = normalizeInboxAction(action, { snoozedUntil, now });
  const timestamp = iso(now);
  const patch = { inboxLastAction: normalized.action, inboxLastActionAt: timestamp };
  let outcome = normalized.action;
  if (normalized.action === 'archive') patch.inboxArchivedAt = timestamp;
  if (normalized.action === 'unarchive') patch.inboxArchivedAt = null;
  if (normalized.action === 'snooze') {
    patch.inboxSnoozedUntil = normalized.snoozedUntil;
    patch.inboxSnoozedAt = timestamp;
  }
  if (normalized.action === 'clear_snooze') patch.inboxSnoozedUntil = null;
  if (['mark_positive', 'mark_negative', 'mark_neutral'].includes(normalized.action)) {
    const label = normalized.action.replace('mark_', '');
    patch.replyLabel = label;
    patch.replyLabelSource = 'owner';
    patch.replyLabelAt = timestamp;
    patch.status = ['suppressed', 'bounce', 'complaint'].includes(lower(prospect.status)) ? prospect.status : 'replied';
    patch.nextFollowupAt = null;
    patch.sequenceState = prospect.sequenceState
      ? { ...prospect.sequenceState, status: 'stopped', stoppedReason: `owner-marked-${label}`, nextStepAt: null, nextStep: null }
      : prospect.sequenceState;
    outcome = `marked_${label}`;
  }
  if (normalized.action === 'create_opportunity') {
    patch.opportunityStage = 'opportunity';
    patch.opportunityMarkedAt = timestamp;
    patch.nextFollowupAt = null;
    patch.sequenceState = prospect.sequenceState
      ? { ...prospect.sequenceState, status: 'stopped', stoppedReason: 'owner-created-opportunity', nextStepAt: null, nextStep: null }
      : prospect.sequenceState;
    outcome = 'opportunity_created';
  }
  return { action: normalized.action, outcome, patch, externalEffects: 0, providerCalls: 0 };
}

export function buildDeliverabilitySnapshot({ accounts = [], senderHealth = [], outboundEvents = [], outboundReservations = [], prospects = [] } = {}) {
  const healthBySlot = new Map(asArray(senderHealth).map(item => [item.inbox, item]));
  const eventsBySlot = new Map();
  asArray(outboundEvents).forEach(event => {
    if (!eventsBySlot.has(event.inbox)) eventsBySlot.set(event.inbox, []);
    eventsBySlot.get(event.inbox).push(event);
  });
  const slots = unique([...asArray(accounts).map(item => item.slot), ...asArray(senderHealth).map(item => item.inbox)]).filter(Boolean).sort();
  const mailboxes = slots.map(slot => {
    const account = asArray(accounts).find(item => item.slot === slot) || {};
    const health = healthBySlot.get(slot) || {};
    const events = eventsBySlot.get(slot) || [];
    const sent = events.filter(item => item.eventType === 'sent').length;
    const bounces = Number(health.hardBouncesToday || 0) || events.filter(item => item.eventType === 'hard_bounce').length;
    const complaints = Number(health.complaintsToday || 0) || events.filter(item => item.eventType === 'complaint').length;
    const uncertain = events.filter(item => item.eventType === 'send_uncertain').length;
    const score = Math.max(0, Math.min(100, 100 - bounces * 25 - complaints * 100 - uncertain * 10));
    return { slot, email: account.email || '', connected: Boolean(account.connected), paused: Boolean(health.paused), sent, bounces, complaints, uncertain, score, pauseReason: health.pauseReason || '' };
  });
  const domains = unique(asArray(accounts).map(item => emailDomain(item.email))).filter(Boolean).sort().map(domain => {
    const related = mailboxes.filter(item => emailDomain(item.email) === domain);
    const score = related.length ? Math.round(related.reduce((sum, item) => sum + item.score, 0) / related.length) : 100;
    return { domain, score, mailboxes: related.map(item => item.slot), state: score < 60 ? 'review' : score < 85 ? 'watch' : 'healthy' };
  });
  return {
    mailboxes,
    domains,
    uncertain: asArray(outboundReservations).filter(item => item.status === 'uncertain'),
    policy: {
      noGuaranteedPlacement: true,
      defaultOwnerOnly: true,
      globalPauseAvailable: true,
      automaticPauseSignals: ['complaint', 'hard_bounce', 'send_uncertain']
    }
  };
}

export function sanitizeTags(tags = []) {
  return unique(asArray(tags).map(tag => text(tag, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '')).filter(Boolean)).slice(0, 30);
}

export function normalizeOpportunityStage(value) {
  const stage = lower(value);
  return OUTREACH_STAGES.includes(stage) ? stage : 'new';
}
