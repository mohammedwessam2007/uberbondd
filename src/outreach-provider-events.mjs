import crypto from 'node:crypto';

import { sha256 } from './omnia-v9/canonical.mjs';

export const OUTREACH_PROVIDER_EVENT_VERSION = 'uberbond.outreach-provider-event.v1';
export const WEBHOOK_SIGNATURE_HEADER = 'x-uberbond-webhook-signature';
export const WEBHOOK_TIMESTAMP_HEADER = 'x-uberbond-webhook-timestamp';
export const WEBHOOK_CLOCK_SKEW_SECONDS = 300;

const EVENT_TYPES = new Map([
  ['email_sent', 'sent'],
  ['sent', 'sent'],
  ['email_delivered', 'delivered'],
  ['delivered', 'delivered'],
  ['email_opened', 'opened'],
  ['open', 'opened'],
  ['opened', 'opened'],
  ['email_link_clicked', 'clicked'],
  ['link_clicked', 'clicked'],
  ['click', 'clicked'],
  ['clicked', 'clicked'],
  ['reply_received', 'reply'],
  ['reply', 'reply'],
  ['replied', 'reply'],
  ['auto_reply_received', 'automatic'],
  ['automatic_reply', 'automatic'],
  ['email_bounced', 'hard_bounce'],
  ['bounce', 'hard_bounce'],
  ['bounced', 'hard_bounce'],
  ['hard_bounce', 'hard_bounce'],
  ['lead_unsubscribed', 'unsubscribed'],
  ['unsubscribe', 'unsubscribed'],
  ['unsubscribed', 'unsubscribed'],
  ['complaint', 'complaint'],
  ['account_error', 'account_error'],
  ['campaign_completed', 'campaign_completed'],
  ['lead_neutral', 'neutral'],
  ['lead_interested', 'positive'],
  ['lead_positive', 'positive'],
  ['lead_not_interested', 'negative'],
  ['lead_negative', 'negative'],
  ['lead_meeting_booked', 'meeting_booked'],
  ['lead_meeting_completed', 'meeting_completed'],
  ['lead_closed', 'closed'],
  ['lead_out_of_office', 'out_of_office'],
  ['lead_wrong_person', 'wrong_person'],
  ['lead_no_show', 'no_show'],
  ['supersearch_enrichment_completed', 'enrichment_completed']
]);

function stringValue(value, max = 20000) {
  return String(value ?? '').trim().slice(0, max);
}

function headerValue(headers = {}, names = []) {
  for (const name of names) {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (value !== undefined && value !== null) return stringValue(value, 500);
  }
  return '';
}

function safeHexEqual(left, right) {
  const a = String(left || '').replace(/^sha256=/i, '').trim().toLowerCase();
  const b = String(right || '').replace(/^sha256=/i, '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(a) || !/^[a-f0-9]{64}$/.test(b)) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export function webhookSignature(rawBody, timestamp, secret) {
  const body = String(rawBody ?? '');
  const stamp = String(timestamp ?? '').trim();
  if (!stamp || !secret) return '';
  return crypto.createHmac('sha256', String(secret)).update(`${stamp}.${body}`, 'utf8').digest('hex');
}

export function verifyWebhookSignature({ rawBody = '', signature = '', timestamp = '', secret = '', now = new Date(), maxAgeSeconds = WEBHOOK_CLOCK_SKEW_SECONDS } = {}) {
  if (!String(secret || '')) return { ok: false, reason: 'webhook-secret-not-configured' };
  const stamp = String(timestamp || '').trim();
  const seconds = Number(stamp);
  if (!/^\d{10,13}$/.test(stamp) || !Number.isFinite(seconds)) return { ok: false, reason: 'webhook-timestamp-invalid' };
  const timestampMs = stamp.length >= 13 ? seconds : seconds * 1000;
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(nowMs)) return { ok: false, reason: 'webhook-clock-invalid' };
  if (Math.abs(nowMs - timestampMs) > Math.max(1, Number(maxAgeSeconds || WEBHOOK_CLOCK_SKEW_SECONDS)) * 1000) {
    return { ok: false, reason: 'webhook-timestamp-expired' };
  }
  const expected = webhookSignature(rawBody, stamp, secret);
  if (!safeHexEqual(signature, expected)) return { ok: false, reason: 'webhook-signature-invalid' };
  return { ok: true, timestamp: new Date(timestampMs).toISOString(), signatureDigest: sha256(expected) };
}

function normalizedType(value) {
  return stringValue(value, 120).toLowerCase().replace(/[\s-]+/g, '_');
}

function firstValue(input, keys, max = 20000) {
  for (const key of keys) {
    const value = input?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return stringValue(value, max);
  }
  return '';
}

function eventKey({ provider, eventType, providerEventId, rawBody, input }) {
  const explicit = stringValue(providerEventId, 500);
  if (explicit) return `${provider}:${eventType}:${explicit}`;
  return `${provider}:${eventType}:${sha256(rawBody || input)}`;
}

export function normalizeProviderEvent(input = {}, { provider = 'unknown', rawBody = '', receivedAt = new Date() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Provider event must be an object');
  const normalizedProvider = stringValue(provider, 80).toLowerCase() || 'unknown';
  const rawType = normalizedType(firstValue(input, ['event_type', 'eventType', 'type', 'event']));
  const eventType = EVENT_TYPES.get(rawType);
  if (!eventType) throw new Error(`Unsupported provider event type: ${rawType || 'missing'}`);
  const providerEventId = firstValue(input, ['event_id', 'eventId', 'id', 'webhook_event_id'], 500);
  const occurredCandidate = firstValue(input, ['timestamp', 'occurred_at', 'occurredAt', 'created_at', 'createdAt'], 120);
  const occurredAt = occurredCandidate ? new Date(occurredCandidate) : new Date(receivedAt);
  if (!Number.isFinite(occurredAt.getTime())) throw new Error('Provider event timestamp is invalid');
  if (occurredAt.getTime() > new Date(receivedAt).getTime() + 5 * 60_000) throw new Error('Provider event timestamp is in the future');

  const leadEmail = firstValue(input, ['lead_email', 'leadEmail', 'recipientEmail', 'email', 'to'], 320).toLowerCase();
  const campaignId = firstValue(input, ['campaign_id', 'campaignId'], 240);
  const prospectId = firstValue(input, ['prospect_id', 'prospectId'], 240);
  const workspaceId = firstValue(input, ['workspace', 'workspace_id', 'workspaceId'], 240);
  const accountEmail = firstValue(input, ['email_account', 'emailAccount', 'from'], 320).toLowerCase();
  const emailId = firstValue(input, ['email_id', 'emailId', 'message_id', 'messageId'], 500);
  const threadId = firstValue(input, ['thread_id', 'threadId'], 500);
  const replyBody = firstValue(input, ['reply_text', 'replyText', 'body', 'text', 'reply_text_snippet'], 20000);
  const replySubject = firstValue(input, ['reply_subject', 'replySubject', 'subject', 'email_subject'], 500);
  const event = {
    schemaVersion: OUTREACH_PROVIDER_EVENT_VERSION,
    provider: normalizedProvider,
    rawType,
    eventType,
    providerEventId,
    providerEventKey: eventKey({ provider: normalizedProvider, eventType, providerEventId, rawBody, input }),
    occurredAt: occurredAt.toISOString(),
    receivedAt: new Date(receivedAt).toISOString(),
    workspaceId,
    campaignId,
    prospectId,
    leadEmail,
    accountEmail,
    emailId,
    threadId,
    step: Number.isInteger(Number(input.step)) ? Number(input.step) : null,
    variant: Number.isInteger(Number(input.variant)) ? Number(input.variant) : null,
    subject: firstValue(input, ['email_subject', 'subject'], 500),
    replySubject,
    replyBody,
    replyHtml: firstValue(input, ['reply_html', 'replyHtml', 'email_html'], 30000),
    uniboxUrl: firstValue(input, ['unibox_url', 'uniboxUrl'], 1000),
    isFirst: input.is_first === true || input.isFirst === true,
    raw: input
  };
  return event;
}

export function internalReplyFromProviderEvent(event, { prospectId, threadId = '' } = {}) {
  if (!event || !['reply', 'automatic'].includes(event.eventType)) return null;
  const body = stringValue(event.replyBody || event.raw?.reply_text_snippet || '', 20000);
  return {
    id: `reply_${event.providerEventKey.replace(/[^a-z0-9_-]/gi, '').slice(0, 100)}`,
    prospectId: String(prospectId || ''),
    gmailId: `${event.provider}:${event.providerEventKey}`,
    provider: event.provider,
    providerEventId: event.providerEventId,
    providerEventKey: event.providerEventKey,
    threadId: String(threadId || event.threadId || ''),
    from: event.leadEmail,
    subject: event.replySubject || event.subject || '',
    body,
    html: event.replyHtml || '',
    receivedAt: event.occurredAt,
    createdAt: event.receivedAt,
    classification: { label: event.eventType === 'automatic' ? 'automatic' : 'unknown', source: 'provider-webhook', confidence: 0 },
    readAt: null,
    uniboxUrl: event.uniboxUrl || ''
  };
}

export function providerWebhookHeaders(headers = {}) {
  return {
    signature: headerValue(headers, [WEBHOOK_SIGNATURE_HEADER, 'x-ub-webhook-signature', 'x-outreach-signature']),
    timestamp: headerValue(headers, [WEBHOOK_TIMESTAMP_HEADER, 'x-ub-webhook-timestamp', 'x-outreach-timestamp'])
  };
}
