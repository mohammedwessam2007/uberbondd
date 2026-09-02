import crypto from 'node:crypto';

export const POSTAL_WEBHOOK_EVIDENCE_VERSION = 'uberbond.postal-webhook-evidence-1.0.0';
export const POSTAL_QUARANTINE_REASONS = Object.freeze([null, 'UNAUTHENTICATED', 'UNKNOWN_EVENT_TYPE', 'MALFORMED']);
const EXECUTION_TAG_RE = /^v9_[a-f0-9]{48}$/;
const EVENT_MAP = Object.freeze({
  MessageSent: 'SENT',
  MessageDelayed: 'DELAYED',
  MessageDeliveryFailed: 'DELIVERY_FAILED',
  MessageHeld: 'HELD',
  MessageBounced: 'BOUNCED',
  MessageLinkClicked: 'CLICKED',
  MessageLoaded: 'OPENED',
  DomainDNSError: 'DNS_ERROR'
});
const RANK = Object.freeze({
  UNKNOWN: 0,
  DELAYED: 10,
  HELD: 20,
  DNS_ERROR: 25,
  SENT: 30,
  OPENED: 35,
  CLICKED: 40,
  DELIVERY_FAILED: 50,
  BOUNCED: 60,
  DELIVERED: 70
});

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function safeText(value, max = 1000) {
  const out = String(value ?? '').trim();
  return out ? out.slice(0, max) : null;
}
function parseOccurredAt(value, receivedAt) {
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && numeric > 0
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(value || receivedAt);
  if (!Number.isFinite(date.getTime())) return null;
  const received = new Date(receivedAt);
  if (!Number.isFinite(received.getTime())) return null;
  if (date.getTime() > received.getTime() + 5 * 60_000) return null;
  return date.toISOString();
}
function rawBytes(rawBody) {
  if (Buffer.isBuffer(rawBody)) return rawBody;
  if (typeof rawBody === 'string') return Buffer.from(rawBody, 'utf8');
  return null;
}

export function verifyPostalWebhookSignature({ rawBody, signatureBase64, publicKeyPem } = {}) {
  const body = rawBytes(rawBody);
  if (!body || !signatureBase64 || !publicKeyPem) return false;
  let signature;
  try { signature = Buffer.from(String(signatureBase64), 'base64'); }
  catch { return false; }
  if (!signature.length) return false;
  try {
    return crypto.verify('sha256', body, publicKeyPem, signature);
  } catch {
    return false;
  }
}

export function normalizePostalWebhookEvent({
  rawBody,
  signatureBase64 = '',
  publicKeyPem = '',
  receivedAt = new Date().toISOString()
} = {}) {
  const body = rawBytes(rawBody);
  const bodySha = body ? sha256(body) : sha256(Buffer.from('', 'utf8'));
  const authenticated = verifyPostalWebhookSignature({ rawBody: body, signatureBase64, publicKeyPem });
  let parsed = null;
  try { parsed = body ? JSON.parse(body.toString('utf8')) : null; }
  catch { parsed = null; }

  const eventName = safeText(parsed?.event, 120);
  const payload = parsed?.payload && typeof parsed.payload === 'object' ? parsed.payload : {};
  const message = payload.message && typeof payload.message === 'object'
    ? payload.message
    : (payload.original_message && typeof payload.original_message === 'object' ? payload.original_message : {});
  const lifecycle = eventName && EVENT_MAP[eventName] ? EVENT_MAP[eventName] : 'UNKNOWN';
  const occurredAt = parseOccurredAt(parsed?.timestamp ?? message?.timestamp, receivedAt);
  const uuid = safeText(parsed?.uuid, 200);
  const occurrenceKey = uuid ? `postal:${uuid}` : `postal:${bodySha}`;
  const tag = safeText(message?.tag, 120);
  const executionTagValid = Boolean(tag && EXECUTION_TAG_RE.test(tag));

  let quarantineReason = null;
  if (!parsed || !occurredAt || !safeText(message?.id, 200) || !tag) quarantineReason = 'MALFORMED';
  else if (!authenticated) quarantineReason = 'UNAUTHENTICATED';
  else if (lifecycle === 'UNKNOWN') quarantineReason = 'UNKNOWN_EVENT_TYPE';
  else if (!executionTagValid) quarantineReason = 'MALFORMED';

  return {
    schemaVersion: POSTAL_WEBHOOK_EVIDENCE_VERSION,
    provider: 'postal',
    occurrenceKey,
    rawBodySha256: bodySha,
    eventName,
    lifecycle,
    occurredAt,
    receivedAt: new Date(receivedAt).toISOString(),
    authenticated,
    quarantineReason,
    executionTagValid,
    executionTag: tag,
    postalMessageId: safeText(message?.id, 200),
    messageId: safeText(message?.message_id, 998),
    to: safeText(message?.to, 320)?.toLowerCase() || null,
    from: safeText(message?.from, 320)?.toLowerCase() || null,
    subjectSha256: message?.subject == null ? null : sha256(Buffer.from(String(message.subject), 'utf8')),
    status: safeText(payload?.status, 120),
    detailsDigest: sha256(Buffer.from(JSON.stringify({
      details: safeText(payload?.details, 1000),
      output: safeText(payload?.output, 1000)
    }), 'utf8')),
    provenance: authenticated ? 'AUTHENTICATED_POSTAL_WEBHOOK' : 'UNAUTHENTICATED_POSTAL_WEBHOOK',
    eligibleForReconciliation: authenticated && quarantineReason == null
  };
}

export function deriveCurrentPostalState(rows = []) {
  const usable = (Array.isArray(rows) ? rows : [])
    .filter(row => row?.authenticated === true && row?.quarantineReason == null && row?.eligibleForReconciliation === true)
    .filter(row => row?.executionTag && row?.postalMessageId && row?.occurredAt);
  if (!usable.length) return { state: 'UNKNOWN', contradictory: false, postalMessageIds: [], row: null };

  const ids = [...new Set(usable.map(row => String(row.postalMessageId)))].sort();
  const contradictory = ids.length > 1;
  const sorted = usable.slice().sort((a, b) => {
    const time = new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
    if (time !== 0) return time;
    const rank = (RANK[b.lifecycle] ?? 0) - (RANK[a.lifecycle] ?? 0);
    if (rank !== 0) return rank;
    return String(a.occurrenceKey).localeCompare(String(b.occurrenceKey));
  });
  return {
    state: contradictory ? 'AMBIGUOUS' : sorted[0].lifecycle,
    contradictory,
    postalMessageIds: ids,
    row: sorted[0]
  };
}
