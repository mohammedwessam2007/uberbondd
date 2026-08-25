// Normalization and replay-safe folding for provider infrastructure webhooks
// (mailbox/domain provisioning, export jobs, renewal notices). This is
// intentionally separate from outreach delivery events: creating a mailbox is
// not sending a campaign, and a provider's object id is not automatically a
// unique webhook occurrence id.
import crypto from 'node:crypto';

export const PROVIDER_INFRASTRUCTURE_EVENT_POLICY_VERSION = 'provider-infrastructure-event-1.0.0';

const EVENT_TYPES = new Map([
  ['order.mailbox.active', 'MAILBOX_ACTIVE'],
  ['order.mailbox.failed', 'MAILBOX_FAILED'],
  ['order.domain.active', 'DOMAIN_ACTIVE'],
  ['order.domain.failed', 'DOMAIN_FAILED'],
  ['order.export.completed', 'EXPORT_COMPLETED'],
  ['order.mailbox.deleted', 'MAILBOX_DELETED'],
  ['domain.renewal.reminder', 'DOMAIN_RENEWAL_REMINDER'],
  ['ping', 'PING']
]);

const SECRET_KEY = /password|passwd|secret|token|apikey|api_key|access|refresh|authorization|cookie|private/i;

function text(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function dateValue(value, fallback) {
  const candidate = new Date(value || fallback || Date.now());
  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

function stable(value, seen = new WeakSet()) {
  if (Array.isArray(value)) {
    if (seen.has(value)) return '"[Circular]"';
    seen.add(value);
    const result = `[${value.map(item => stable(item, seen)).join(',')}]`;
    seen.delete(value);
    return result;
  }
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '"[Circular]"';
    seen.add(value);
    const result = `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key], seen)}`).join(',')}}`;
    seen.delete(value);
    return result;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return crypto.createHash('sha256').update(stable(value)).digest('hex');
}

function cleanRecord(record = {}, depth = 0) {
  if (!record || typeof record !== 'object' || Array.isArray(record) || depth > 4) return null;
  const output = {};
  for (const [key, value] of Object.entries(record)) {
    if (SECRET_KEY.test(key)) continue;
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) output[key] = typeof value === 'string' ? text(value, 500) : value;
    else if (Array.isArray(value)) output[key] = value.slice(0, 100).map(item => typeof item === 'object' ? cleanRecord(item, depth + 1) : item).filter(item => item !== undefined);
    else if (typeof value === 'object') output[key] = cleanRecord(value, depth + 1);
  }
  return output;
}

function firstArray(data, names) {
  for (const name of names) if (Array.isArray(data?.[name])) return data[name];
  return [];
}

function normalizeItems(data, names, kind) {
  return firstArray(data, names).map(item => {
    const clean = cleanRecord(item) || {};
    return {
      ...clean,
      kind,
      resourceId: text(item?.mailbox_id || item?.mailboxId || item?.domain_id || item?.domainId || item?.export_id || item?.exportId, 160) || null,
      address: text(item?.username || item?.email || item?.address, 254).toLowerCase() || null,
      domain: text(item?.domain || item?.name, 254).toLowerCase() || null,
    };
  });
}

/**
 * Provider signatures differ and must not be guessed. The caller must pass a
 * verified result from a provider-specific signature implementation. When it
 * is absent, the event is still normalized for quarantine/audit but cannot be
 * applied to economic or operational truth.
 */
export function normalizeInfrastructureEvent(payload, { provider = 'unknown', rawBody = '', receivedAt = new Date(), signatureVerified = false } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Infrastructure provider event must be an object');
  const normalizedProvider = text(provider, 80).toLowerCase() || 'unknown';
  const rawType = text(payload.event || payload.event_type || payload.type, 160).toLowerCase();
  const eventType = EVENT_TYPES.get(rawType) || 'UNKNOWN';
  const received = dateValue(receivedAt, new Date());
  const occurred = dateValue(payload.timestamp || payload.occurred_at || payload.occurredAt, received);
  if (!occurred || !received) throw new Error('Infrastructure provider event timestamp is invalid');
  if (occurred.getTime() > received.getTime() + 5 * 60_000) throw new Error('Infrastructure provider event timestamp is in the future');
  const data = cleanRecord(payload.data || payload.payload || {}) || {};
  const explicitId = text(payload.event_id || payload.eventId || payload.webhook_event_id, 200);
  const providerEventKey = `${normalizedProvider}:${rawType}:${explicitId || digest(rawBody || payload)}`;
  const items = eventType === 'MAILBOX_ACTIVE' || eventType === 'MAILBOX_DELETED'
    ? normalizeItems(data, ['mailboxes', 'completed_mailboxes'], 'MAILBOX')
    : eventType === 'MAILBOX_FAILED'
      ? normalizeItems(data, ['failed_mailboxes', 'mailboxes'], 'MAILBOX')
      : eventType === 'DOMAIN_ACTIVE'
        ? normalizeItems(data, ['domains'], 'DOMAIN')
        : eventType === 'DOMAIN_FAILED'
          ? normalizeItems(data, ['failed_domains', 'domains'], 'DOMAIN')
          : eventType === 'EXPORT_COMPLETED'
            ? [...normalizeItems(data, ['completed_mailboxes'], 'EXPORT_MAILBOX_COMPLETED'), ...normalizeItems(data, ['failed_mailboxes'], 'EXPORT_MAILBOX_FAILED'), ...normalizeItems(data, ['pending_mailboxes'], 'EXPORT_MAILBOX_PENDING')]
            : [];
  return {
    policyVersion: PROVIDER_INFRASTRUCTURE_EVENT_POLICY_VERSION,
    provider: normalizedProvider,
    rawType,
    eventType,
    providerEventId: explicitId || null,
    providerEventKey,
    occurredAt: occurred.toISOString(),
    receivedAt: received.toISOString(),
    workspaceId: text(payload.workspace_id || payload.workspaceId, 160) || null,
    authenticated: Boolean(signatureVerified),
    disposition: signatureVerified ? (eventType === 'UNKNOWN' ? 'QUARANTINED_UNKNOWN_EVENT' : 'ACCEPTED_FOR_FOLDING') : 'QUARANTINED_UNAUTHENTICATED',
    items,
    summary: {
      mailboxCount: Number.isFinite(Number(data.mailbox_count)) ? Number(data.mailbox_count) : items.filter(item => item.kind.includes('MAILBOX')).length,
      domainCount: Number.isFinite(Number(data.domain_count)) ? Number(data.domain_count) : items.filter(item => item.kind === 'DOMAIN').length,
      failedCount: Number.isFinite(Number(data.failed_count)) ? Number(data.failed_count) : items.filter(item => item.kind.endsWith('FAILED')).length
    }
  };
}

export function classifyInfrastructureReplay(event, seenKeys = []) {
  const key = text(event?.providerEventKey, 300);
  if (!key) return { status: 'INVALID_EVENT_KEY', duplicate: false };
  const seen = new Set(Array.isArray(seenKeys) ? seenKeys.map(item => text(item, 300)) : []);
  return seen.has(key)
    ? { status: 'IDEMPOTENT_REPLAY', duplicate: true, providerEventKey: key }
    : { status: 'NEW_OCCURRENCE', duplicate: false, providerEventKey: key };
}

function eventTime(event) {
  const time = Date.parse(event?.occurredAt || event?.receivedAt || '');
  return Number.isFinite(time) ? time : 0;
}

/**
 * Fold only authenticated, known events. Older out-of-order observations do
 * not roll a newer provider state backwards. Unknown or unauthenticated events
 * remain visible in quarantine counts and cannot change readiness.
 */
export function foldInfrastructureEvents(events = []) {
  const ordered = (Array.isArray(events) ? events : [])
    .filter(event => event?.authenticated && event?.disposition === 'ACCEPTED_FOR_FOLDING' && event.eventType !== 'UNKNOWN')
    .slice()
    .sort((left, right) => eventTime(left) - eventTime(right) || String(left.providerEventKey).localeCompare(String(right.providerEventKey)));
  const resources = new Map();
  for (const event of ordered) {
    for (const item of (Array.isArray(event.items) ? event.items : [])) {
      if (!item.resourceId) continue;
      const key = `${event.provider}:${item.kind}:${item.resourceId}`;
      const prior = resources.get(key);
      const currentTime = eventTime(event);
      if (prior && currentTime < prior.occurredAtMs) continue;
      let state = prior?.state || 'UNKNOWN';
      if (event.eventType === 'MAILBOX_ACTIVE' && item.kind === 'MAILBOX') state = 'ACTIVE';
      if (event.eventType === 'MAILBOX_FAILED' && item.kind === 'MAILBOX') state = 'FAILED';
      if (event.eventType === 'MAILBOX_DELETED' && item.kind === 'MAILBOX') state = 'DELETED';
      if (event.eventType === 'DOMAIN_ACTIVE' && item.kind === 'DOMAIN') state = 'ACTIVE';
      if (event.eventType === 'DOMAIN_FAILED' && item.kind === 'DOMAIN') state = 'FAILED';
      if (item.kind === 'EXPORT_MAILBOX_COMPLETED') state = 'EXPORT_COMPLETED';
      if (item.kind === 'EXPORT_MAILBOX_FAILED') state = 'EXPORT_FAILED';
      if (item.kind === 'EXPORT_MAILBOX_PENDING') state = 'EXPORT_PENDING';
      resources.set(key, { provider: event.provider, resourceId: item.resourceId, resourceKind: item.kind, state, occurredAt: event.occurredAt, occurredAtMs: currentTime, lastProviderEventKey: event.providerEventKey });
    }
  }
  return {
    policyVersion: PROVIDER_INFRASTRUCTURE_EVENT_POLICY_VERSION,
    resources: [...resources.values()].map(({ occurredAtMs, ...resource }) => resource),
    acceptedEventCount: ordered.length,
    quarantinedEventCount: (Array.isArray(events) ? events : []).filter(event => !event?.authenticated || event?.disposition !== 'ACCEPTED_FOR_FOLDING').length
  };
}
