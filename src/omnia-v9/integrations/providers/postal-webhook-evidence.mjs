import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from '../../../effect-ledgers.mjs';

/**
 * What a Postal webhook delivery is allowed to become, before anything reads
 * it as evidence about a send.
 *
 * A webhook body is an unauthenticated string from the open internet until an
 * RSA-SHA256 signature over the exact bytes verifies against the sending
 * server's own DKIM public key. Everything in this module treats it that way:
 * nothing throws on bad input, because a route that throws on a hostile body
 * loses the record that the hostile body arrived; a delivery that cannot be
 * authenticated or understood is normalized into a *quarantined* record and
 * kept. Knowing that thirty unsigned bodies arrived claiming a message was
 * delivered is worth more than a 500 and an empty table.
 *
 * The one thing quarantine must never do is leak into reconciliation.
 * `deriveCurrentPostalState` reads authenticated, non-quarantined rows and
 * nothing else, and the ledger's reconciliation lookup filters on the same
 * two facts, so an injected row has to defeat both a database CHECK and this
 * function to reach the adapter -- and the adapter still demands provenance.
 *
 * Pure module. No I/O, no clock of its own beyond the `receivedAt` the caller
 * supplies, so every classification here is reproducible from the stored row.
 */

export const POSTAL_WEBHOOK_EVIDENCE_VERSION = 'uberbond.postal-webhook-evidence.v1';

/** An execution tag this system generated: `v9_` plus 48 hex of the execution digest. */
export const POSTAL_EXECUTION_TAG_RE = /^v9_[a-f0-9]{48}$/;

export const POSTAL_QUARANTINE_REASONS = Object.freeze({
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  UNKNOWN_EVENT_TYPE: 'UNKNOWN_EVENT_TYPE',
  MALFORMED: 'MALFORMED'
});

export const POSTAL_PROVENANCE = Object.freeze({
  AUTHENTICATED: 'AUTHENTICATED_POSTAL_WEBHOOK',
  QUARANTINED: 'QUARANTINED_POSTAL_WEBHOOK'
});

/**
 * Postal's documented webhook event names, mapped to the lifecycle vocabulary
 * the adapter reconciles against. An event outside this table is quarantined
 * as UNKNOWN_EVENT_TYPE rather than guessed into a lifecycle -- guessing is
 * how a new provider event silently becomes "accepted".
 */
export const POSTAL_EVENT_LIFECYCLES = Object.freeze({
  MessageSent: 'SENT',
  MessageDelivered: 'DELIVERED',
  MessageDelayed: 'DELAYED',
  MessageDeliveryFailed: 'DELIVERY_FAILED',
  MessageHeld: 'HELD',
  MessageBounced: 'BOUNCED',
  MessageLinkClicked: 'LINK_CLICKED',
  MessageLoaded: 'LOADED',
  DomainDNSError: 'DOMAIN_DNS_ERROR'
});

/**
 * Deterministic ordering for two events carrying the same `occurredAt`.
 *
 * Ties are real: Postal can emit MessageSent and MessageBounced for one
 * message inside the same second, and a webhook can be redelivered. Without a
 * total order, "latest wins" depends on row insertion order, which depends on
 * network timing -- so the same evidence would reconcile differently on two
 * runs. Higher rank is the more advanced/terminal fact about the send.
 */
const LIFECYCLE_RANK = Object.freeze({
  UNKNOWN: 0,
  DOMAIN_DNS_ERROR: 1,
  HELD: 2,
  DELAYED: 3,
  LOADED: 4,
  LINK_CLICKED: 5,
  SENT: 6,
  DELIVERED: 7,
  DELIVERY_FAILED: 8,
  BOUNCED: 9
});

/**
 * Engagement, not delivery state.
 *
 * A recipient opening or clicking says something about the human; it says
 * nothing about the send's delivery lifecycle, and it arrives *after* the
 * delivery events. Folding it into "latest event wins" would let a click
 * overwrite DELIVERED with LINK_CLICKED, which the adapter maps to UNCERTAIN
 * -- so a message that was delivered and read would reconcile as unresolved,
 * forever, precisely because it went perfectly. These rows are still stored,
 * still counted, and simply do not participate in the delivery-state fold.
 */
export const POSTAL_ENGAGEMENT_LIFECYCLES = Object.freeze(new Set(['LOADED', 'LINK_CLICKED']));

const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

function sha256Hex(value) {
  return crypto.createHash('sha256').update(Buffer.isBuffer(value) ? value : Buffer.from(String(value ?? ''), 'utf8')).digest('hex');
}

function text(value, max = 320) {
  return String(value ?? '').trim().slice(0, max);
}

function toBuffer(rawBody) {
  return Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody ?? ''), 'utf8');
}

/**
 * Accept either an armoured PEM or the bare base64 DER Postal exposes as the
 * server's `dkim_public_key`. Anything else is refused rather than coerced --
 * a key we cannot parse must fail verification closed, never verify nothing.
 */
function normalizePublicKey(publicKey) {
  const raw = String(publicKey ?? '').trim();
  if (!raw) return null;
  if (raw.includes('BEGIN')) return raw;
  const compact = raw.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/=]{64,}$/.test(compact)) return null;
  const wrapped = compact.match(/.{1,64}/g).join('\n');
  return `-----BEGIN PUBLIC KEY-----\n${wrapped}\n-----END PUBLIC KEY-----\n`;
}

/**
 * `X-Postal-Signature` is base64 RSA-SHA256 over the exact raw request body.
 * Verification therefore has to run on the bytes as received: any re-encode,
 * pretty-print or JSON round-trip before this point invalidates a genuine
 * signature and, worse, would make an unsigned body indistinguishable from a
 * mangled signed one.
 */
export function verifyPostalWebhookSignature({ rawBody, signature, publicKey } = {}) {
  const body = toBuffer(rawBody);
  if (!body.length) return { authenticated: false, reason: 'raw-body-required' };
  const signatureText = String(signature ?? '').trim();
  if (!signatureText) return { authenticated: false, reason: 'signature-required' };
  const key = normalizePublicKey(publicKey);
  if (!key) return { authenticated: false, reason: 'postal-webhook-public-key-not-configured' };
  if (!/^[A-Za-z0-9+/=\s]+$/.test(signatureText)) return { authenticated: false, reason: 'signature-not-base64' };
  let ok = false;
  try {
    ok = crypto.verify('sha256', body, key, Buffer.from(signatureText, 'base64'));
  } catch {
    return { authenticated: false, reason: 'signature-verification-failed' };
  }
  return ok ? { authenticated: true, reason: '' } : { authenticated: false, reason: 'invalid-webhook-signature' };
}

function occurrenceKeyFor(payload, body) {
  const uuid = text(payload?.uuid, 120);
  if (uuid && /^[A-Za-z0-9_-]{8,120}$/.test(uuid)) return `postal:${uuid}`;
  return `postal:${sha256Hex(body)}`;
}

/**
 * One Postal delivery -> one durable, secret-free row.
 *
 * Deliberately absent from the output: the raw body, the raw subject, and the
 * per-recipient `token`. The token is a live credential that can be used
 * against Postal's API for that message; the subject is customer-visible
 * content with no reconciliation value beyond its digest. Both are reduced to
 * a SHA-256 so a mismatch is still detectable and a leak is not possible.
 */
export function normalizePostalWebhookEvent({ rawBody, signature, publicKey, receivedAt = new Date() } = {}) {
  const body = toBuffer(rawBody);
  const receivedAtDate = receivedAt instanceof Date ? receivedAt : new Date(receivedAt);
  const receivedMs = Number.isFinite(receivedAtDate.getTime()) ? receivedAtDate.getTime() : Date.now();
  const receivedIso = new Date(receivedMs).toISOString();
  const rawBodySha256 = sha256Hex(body);

  const verification = verifyPostalWebhookSignature({ rawBody: body, signature, publicKey });

  let payload = null;
  let malformed = false;
  try {
    payload = JSON.parse(body.toString('utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) { payload = null; malformed = true; }
  } catch {
    malformed = true;
  }

  const event = text(payload?.event, 120);
  const lifecycle = Object.hasOwn(POSTAL_EVENT_LIFECYCLES, event) ? POSTAL_EVENT_LIFECYCLES[event] : 'UNKNOWN';
  const message = payload?.payload?.message && typeof payload.payload.message === 'object' ? payload.payload.message : {};

  const rawTimestamp = payload?.timestamp;
  let occurredMs = null;
  if (typeof rawTimestamp === 'number' && Number.isFinite(rawTimestamp)) occurredMs = Math.round(rawTimestamp * 1000);
  else if (typeof rawTimestamp === 'string' && rawTimestamp.trim()) {
    const parsed = Date.parse(rawTimestamp);
    if (Number.isFinite(parsed)) occurredMs = parsed;
  }
  if (occurredMs === null) {
    malformed = malformed || payload !== null;
    occurredMs = receivedMs;
  } else if (occurredMs > receivedMs + MAX_FUTURE_SKEW_MS) {
    // A future-dated event would sort ahead of every real one and pin the
    // derived state to whatever a forger chose. Refuse the claimed time,
    // keep the row, and mark it malformed so it never reaches reconciliation.
    malformed = true;
    occurredMs = receivedMs;
  }

  const tag = text(message.tag, 120);
  const executionTagValid = POSTAL_EXECUTION_TAG_RE.test(tag);

  let quarantineReason = null;
  if (!verification.authenticated) quarantineReason = POSTAL_QUARANTINE_REASONS.UNAUTHENTICATED;
  else if (malformed) quarantineReason = POSTAL_QUARANTINE_REASONS.MALFORMED;
  else if (!Object.hasOwn(POSTAL_EVENT_LIFECYCLES, event)) quarantineReason = POSTAL_QUARANTINE_REASONS.UNKNOWN_EVENT_TYPE;

  return {
    schemaVersion: POSTAL_WEBHOOK_EVIDENCE_VERSION,
    policyVersion: POSTAL_WEBHOOK_EVIDENCE_VERSION,
    occurrenceKey: occurrenceKeyFor(payload, body),
    event,
    lifecycle,
    postalMessageId: message.id == null ? '' : text(message.id, 120),
    messageHeaderId: text(message.message_id, 998),
    tag,
    executionTagValid,
    to: text(message.to, 320).toLowerCase(),
    from: text(message.from, 320).toLowerCase(),
    subjectSha256: sha256Hex(String(message.subject ?? '')),
    rawBodySha256,
    statusDetail: text(payload?.payload?.status, 120),
    occurredAt: new Date(occurredMs).toISOString(),
    receivedAt: receivedIso,
    authenticated: verification.authenticated === true,
    signatureFailureReason: verification.authenticated ? '' : verification.reason,
    quarantineReason,
    provenance: quarantineReason === null ? POSTAL_PROVENANCE.AUTHENTICATED : POSTAL_PROVENANCE.QUARANTINED,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: ZERO_EXTERNAL_EFFECTS
  };
}

/**
 * The one ordering rule, in one place: `occurredAt` first, lifecycle rank to
 * break a tie. Both `deriveCurrentPostalState` and the ledger's synthesized
 * reconciliation row read the latest row through this function, so the state
 * the adapter is told about and the row it is handed can never disagree about
 * which event was last.
 */
export function latestPostalRow(rows = []) {
  const ranked = [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    const leftMs = Date.parse(left?.occurredAt) || 0;
    const rightMs = Date.parse(right?.occurredAt) || 0;
    if (leftMs !== rightMs) return leftMs - rightMs;
    return (LIFECYCLE_RANK[left?.lifecycle] ?? 0) - (LIFECYCLE_RANK[right?.lifecycle] ?? 0);
  });
  return ranked.length ? ranked[ranked.length - 1] : null;
}

/** Only a row that authenticated AND parsed AND named a known event may inform reconciliation. */
export function isReconcilableRow(row) {
  return Boolean(row)
    && row.authenticated === true
    && (row.quarantineReason === null || row.quarantineReason === undefined)
    && row.provenance === POSTAL_PROVENANCE.AUTHENTICATED;
}

/**
 * Fold every admissible webhook row for one message into the single current
 * lifecycle fact.
 *
 * Ordering is by `occurredAt` and then by lifecycle rank, never by arrival.
 * That is the whole point: Postal retries webhooks, so a MessageSent emitted
 * before a MessageBounced can be delivered after it. Sorting on arrival would
 * let a late-arriving older event roll the state backward from BOUNCED to
 * SENT, and the adapter would then reconcile a bounced send as cleanly
 * accepted with no negative-delivery evidence at all.
 *
 * Two different `postalMessageId` values under one execution tag is
 * `contradictory: true` and never resolved by preferring one. Two provider
 * message ids for one execution means either a duplicate send or a tag
 * collision, and both are owner-review facts rather than something to average.
 */
export function deriveCurrentPostalState(rows = []) {
  const admissible = (Array.isArray(rows) ? rows : []).filter(isReconcilableRow);
  const postalMessageIds = [...new Set(admissible.map(row => text(row.postalMessageId, 120)).filter(Boolean))].sort();
  const deliveryRows = admissible.filter(row => !POSTAL_ENGAGEMENT_LIFECYCLES.has(row.lifecycle));
  const latest = latestPostalRow(deliveryRows);

  return {
    lifecycle: latest ? latest.lifecycle : null,
    contradictory: postalMessageIds.length > 1,
    eventCount: admissible.length,
    engagementEventCount: admissible.length - deliveryRows.length,
    postalMessageIds,
    latestOccurredAt: latest ? latest.occurredAt : null,
    negativeDeliveryEvidence: admissible.some(row => row.lifecycle === 'BOUNCED')
  };
}

export { LIFECYCLE_RANK as POSTAL_LIFECYCLE_RANK };
