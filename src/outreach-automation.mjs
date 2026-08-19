/*
 * Deterministic, provider-neutral automation plans for the owner workbench.
 * Plans can observe provider events and apply local workflow mutations.  An
 * HTTP action is represented for parity with provider automation products but
 * remains blocked here because this module never creates an external effect.
 */

export const OUTREACH_AUTOMATION_VERSION = 'uberbond.outreach-automation.v1';

export const AUTOMATION_TRIGGERS = Object.freeze([
  'any_event', 'lead_added', 'lead_replied', 'lead_positive', 'lead_negative',
  'lead_neutral', 'lead_unsubscribed', 'email_sent', 'email_delivered',
  'email_opened', 'email_clicked', 'email_bounced', 'email_complaint',
  'auto_reply', 'out_of_office', 'lead_meeting_booked', 'lead_meeting_completed',
  'lead_closed', 'campaign_completed', 'account_error', 'enrichment_completed',
  'payment_cleared', 'manual'
]);

export const AUTOMATION_ACTIONS = Object.freeze([
  'stop_sequence', 'create_owner_reply_draft', 'route_to_unibox',
  'global_suppress_email', 'pause_sender_for_review', 'global_pause_review',
  'create_opportunity', 'mark_revenue_continuity', 'create_owner_review',
  'recalculate_evidence_readiness', 'delay', 'http_request'
]);

const OPERATORS = new Set(['equals', 'not_equals', 'contains', 'not_contains', 'in', 'exists', 'not_exists', 'gte', 'lte']);
const text = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const lower = value => text(value, 240).toLowerCase();
const asArray = value => Array.isArray(value) ? value : [];
const iso = value => {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
};

const TRIGGER_ALIASES = new Map([
  ['lead_added', 'lead_added'], ['lead_replied', 'lead_replied'], ['reply', 'lead_replied'], ['replied', 'lead_replied'],
  ['positive', 'lead_positive'], ['lead_positive', 'lead_positive'], ['negative', 'lead_negative'], ['lead_negative', 'lead_negative'],
  ['neutral', 'lead_neutral'], ['lead_neutral', 'lead_neutral'], ['unsubscribe', 'lead_unsubscribed'], ['unsubscribed', 'lead_unsubscribed'],
  ['sent', 'email_sent'], ['email_sent', 'email_sent'], ['delivered', 'email_delivered'], ['email_delivered', 'email_delivered'],
  ['open', 'email_opened'], ['opened', 'email_opened'], ['email_opened', 'email_opened'],
  ['click', 'email_clicked'], ['clicked', 'email_clicked'], ['email_clicked', 'email_clicked'],
  ['bounce', 'email_bounced'], ['bounced', 'email_bounced'], ['hard_bounce', 'email_bounced'], ['email_bounced', 'email_bounced'],
  ['complaint', 'email_complaint'], ['email_complaint', 'email_complaint'], ['automatic', 'auto_reply'], ['auto_reply', 'auto_reply'],
  ['out_of_office', 'out_of_office'], ['meeting_booked', 'lead_meeting_booked'], ['lead_meeting_booked', 'lead_meeting_booked'],
  ['meeting_completed', 'lead_meeting_completed'], ['lead_meeting_completed', 'lead_meeting_completed'],
  ['closed', 'lead_closed'], ['lead_closed', 'lead_closed'], ['campaign_completed', 'campaign_completed'],
  ['account_error', 'account_error'], ['enrichment_completed', 'enrichment_completed'],
  ['payment_cleared', 'payment_cleared'], ['any_event', 'any_event'], ['manual', 'manual']
]);

const PROVIDER_EVENT_TRIGGERS = new Map([
  ['sent', 'email_sent'], ['delivered', 'email_delivered'], ['opened', 'email_opened'], ['clicked', 'email_clicked'],
  ['reply', 'lead_replied'], ['automatic', 'auto_reply'], ['hard_bounce', 'email_bounced'], ['complaint', 'email_complaint'],
  ['unsubscribed', 'lead_unsubscribed'], ['positive', 'lead_positive'], ['negative', 'lead_negative'], ['neutral', 'lead_neutral'],
  ['meeting_booked', 'lead_meeting_booked'], ['meeting_completed', 'lead_meeting_completed'], ['closed', 'lead_closed'],
  ['out_of_office', 'out_of_office'], ['campaign_completed', 'campaign_completed'], ['account_error', 'account_error'],
  ['enrichment_completed', 'enrichment_completed']
]);

function normalizeTrigger(value) {
  const trigger = TRIGGER_ALIASES.get(lower(value).replace(/[\s-]+/g, '_'));
  if (!trigger || !AUTOMATION_TRIGGERS.includes(trigger)) throw new Error(`Unsupported automation trigger: ${value || 'missing'}`);
  return trigger;
}

function normalizeCondition(input = {}) {
  const field = text(input.field, 120);
  const operator = lower(input.operator || 'equals').replace(/[\s-]+/g, '_');
  if (!field || !/^[A-Za-z][A-Za-z0-9_.]*$/.test(field)) throw new Error('Automation condition needs a safe field name');
  if (!OPERATORS.has(operator)) throw new Error(`Unsupported automation condition operator: ${operator}`);
  return { field, operator, value: input.value === undefined ? '' : text(input.value, 2000) };
}

function normalizeAction(input = {}) {
  const type = lower(input.type || input.action).replace(/[\s-]+/g, '_');
  if (!AUTOMATION_ACTIONS.includes(type)) throw new Error(`Unsupported automation action: ${type || 'missing'}`);
  const params = input.params && typeof input.params === 'object' && !Array.isArray(input.params) ? input.params : {};
  const normalized = { type, params: {} };
  for (const [key, value] of Object.entries(params).slice(0, 20)) normalized.params[text(key, 80)] = text(value, 2000);
  if (type === 'delay') {
    const seconds = Number(normalized.params.seconds || normalized.params.delaySeconds || 0);
    if (!Number.isInteger(seconds) || seconds < 60 || seconds > 30 * 24 * 60 * 60) throw new Error('Automation delay must be between 60 seconds and 30 days');
    normalized.params.seconds = String(seconds);
  }
  if (type === 'http_request') {
    const method = lower(normalized.params.method || 'POST').toUpperCase();
    normalized.params.method = ['POST', 'PUT', 'PATCH'].includes(method) ? method : 'POST';
    normalized.blockedReason = 'external-http-action-disabled';
  }
  return normalized;
}

export function normalizeAutomationPlan(input = {}, { id = '', now = new Date() } = {}) {
  const name = text(input.name || 'Untitled automation', 180);
  const trigger = normalizeTrigger(input.trigger || input.event || input.eventType);
  const conditions = asArray(input.conditions).slice(0, 10).map(normalizeCondition);
  const conditionMode = lower(input.conditionMode || input.conditionLogic || 'all') === 'any' ? 'any' : 'all';
  const actions = asArray(input.actions).slice(0, 12).map(normalizeAction);
  if (!actions.length) throw new Error('An automation needs at least one action');
  return {
    schemaVersion: OUTREACH_AUTOMATION_VERSION,
    id: text(id || input.id, 120),
    name: name || 'Untitled automation',
    trigger,
    enabled: input.enabled === true,
    conditions,
    conditionMode,
    actions,
    createdAt: text(input.createdAt, 80) || iso(now),
    updatedAt: iso(now),
    mode: 'owner-local'
  };
}

export function automationTriggerForProviderEvent(event = {}) {
  return PROVIDER_EVENT_TRIGGERS.get(lower(event.eventType)) || PROVIDER_EVENT_TRIGGERS.get(lower(event.rawType)) || '';
}

function valueAt(field, { event = {}, prospect = {}, campaign = {} } = {}) {
  const parts = text(field, 120).split('.').filter(Boolean);
  const root = parts.shift();
  const source = root === 'event' ? event : root === 'prospect' ? prospect : root === 'campaign' ? campaign : { ...event, ...prospect };
  return parts.reduce((value, key) => value && typeof value === 'object' ? value[key] : undefined, source);
}

function compareCondition(condition, context) {
  const actual = valueAt(condition.field, context);
  const expected = condition.value;
  const actualText = Array.isArray(actual) ? actual.map(item => String(item)).join(',') : String(actual ?? '');
  if (condition.operator === 'exists') return actual !== undefined && actual !== null && actualText !== '';
  if (condition.operator === 'not_exists') return actual === undefined || actual === null || actualText === '';
  if (condition.operator === 'contains') return actualText.toLowerCase().includes(expected.toLowerCase());
  if (condition.operator === 'not_contains') return !actualText.toLowerCase().includes(expected.toLowerCase());
  if (condition.operator === 'in') return expected.split(',').map(item => item.trim().toLowerCase()).includes(actualText.toLowerCase());
  if (condition.operator === 'gte') return Number(actual) >= Number(expected);
  if (condition.operator === 'lte') return Number(actual) <= Number(expected);
  if (condition.operator === 'not_equals') return actualText.toLowerCase() !== expected.toLowerCase();
  return actualText.toLowerCase() === expected.toLowerCase();
}

export function evaluateAutomationPlan({ plan, event = {}, prospect = {}, campaign = {}, now = new Date() } = {}) {
  const normalized = plan?.schemaVersion === OUTREACH_AUTOMATION_VERSION ? plan : normalizeAutomationPlan(plan || {}, { now });
  const eventTrigger = automationTriggerForProviderEvent(event) || normalizeTrigger(event.eventType || event.type || 'manual');
  const triggerMatched = normalized.trigger === 'any_event' || normalized.trigger === eventTrigger || normalized.trigger === 'manual' && eventTrigger === 'manual';
  const conditions = normalized.conditions.map(condition => ({ ...condition, matched: compareCondition(condition, { event, prospect, campaign }) }));
  const conditionsMatched = normalized.conditionMode === 'any'
    ? conditions.length > 0 && conditions.some(condition => condition.matched)
    : conditions.every(condition => condition.matched);
  const blockedActions = normalized.actions.filter(action => action.blockedReason).map(action => ({ type: action.type, reason: action.blockedReason }));
  const plannedActions = normalized.actions.filter(action => !action.blockedReason);
  const matched = normalized.enabled && triggerMatched && conditionsMatched;
  return {
    planId: normalized.id || '', planName: normalized.name, trigger: normalized.trigger, eventTrigger,
    matched, enabled: normalized.enabled, triggerMatched, conditionMode: normalized.conditionMode, conditionsMatched, conditions,
    actions: matched ? plannedActions : [], blockedActions: matched ? blockedActions : [],
    status: !normalized.enabled ? 'disabled' : !triggerMatched ? 'not_triggered' : !conditionsMatched ? 'condition_failed' : blockedActions.length ? 'needs_owner_review' : 'ready',
    evaluatedAt: iso(now), externalEffects: 0, providerCalls: 0
  };
}
