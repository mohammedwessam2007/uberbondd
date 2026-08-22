import crypto from 'node:crypto';
import { boundHeaders, parseInboundMime, classifyInboundEvent } from './inbound-classify.mjs';
import { verifyProviderObservation } from './gmail-inbound.mjs';
import { ZERO_EXTERNAL_EFFECTS as ZERO_EFFECTS } from './effect-ledger.mjs';

export const INBOUND_FEEDBACK_POLICY_VERSION = 'inbound-feedback-kernel-1.0.0';
export const INBOUND_EVIDENCE_CLASSES = Object.freeze(['UNVERIFIED_INPUT', 'TEST_FIXTURE', 'PROVIDER_OBSERVED']);


function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}
function sha(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function hmac(value, key) {
  const secret = text(key, 500);
  const payload = text(value, 5000);
  if (!secret || secret.length < 16 || !payload) return null;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
function extractAddress(value) {
  const source = text(value, 1000).toLowerCase();
  const bracket = source.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (bracket) return bracket[1];
  const bare = source.match(/\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i);
  return bare?.[0] || '';
}
/**
 * The evidence class an event is actually entitled to.
 *
 * PROVIDER_OBSERVED is the only class that earns a DIRECT edge in the causal
 * graph, so it is the only one worth forging -- and it is therefore the one
 * class a caller may not simply assert. It requires an attestation that only a
 * reader which really fetched this message from this provider can mint. A
 * request for it without that proof fails closed to UNVERIFIED_INPUT: the
 * observation is still recorded, it just does not get to claim it was watched.
 */
function evidenceClass(value, { providerObservation, provider, providerMessageId } = {}) {
  const normalized = text(value, 80).toUpperCase() || 'UNVERIFIED_INPUT';
  const requested = INBOUND_EVIDENCE_CLASSES.includes(normalized) ? normalized : 'UNVERIFIED_INPUT';
  if (requested !== 'PROVIDER_OBSERVED') return requested;
  return verifyProviderObservation(providerObservation, { provider, providerMessageId })
    ? 'PROVIDER_OBSERVED'
    : 'UNVERIFIED_INPUT';
}
function refs(input = {}) {
  return {
    accountRef: text(input.accountRef, 160) || null,
    contactRef: text(input.contactRef, 160) || null,
    prospectRef: text(input.prospectRef, 160) || null,
    campaignRef: text(input.campaignRef, 160) || null,
    sendRef: text(input.sendRef, 160) || null
  };
}

export function compileInboundFeedbackEvent({
  provider = 'gmail',
  message,
  routingRefs = {},
  privacyHmacKey = '',
  evidence = 'UNVERIFIED_INPUT',
  limits = {},
  date = new Date()
} = {}) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return { ok: false, policyVersion: INBOUND_FEEDBACK_POLICY_VERSION, status: 'REJECTED', reasonCodes: ['message-object-required'] };
  }
  const providerMessageId = text(message.id, 300);
  if (!providerMessageId) {
    return { ok: false, policyVersion: INBOUND_FEEDBACK_POLICY_VERSION, status: 'REJECTED', reasonCodes: ['provider-message-id-required'] };
  }

  const headerResult = boundHeaders(message.payload?.headers, limits);
  const mime = parseInboundMime(message.payload, limits);
  const classified = classifyInboundEvent({ headers: headerResult.headers, body: mime.body });
  const route = refs(routingRefs);
  const normalizedProvider = text(provider, 80).toLowerCase() || 'unknown';
  const threadId = text(message.threadId, 300) || null;
  const identity = { provider: normalizedProvider, providerMessageId, accountRef: route.accountRef };
  const eventId = `inbound_${sha(identity).slice(0, 28)}`;
  const fromAddress = extractAddress(headerResult.headers.from);
  const replyTo = headerResult.headers['in-reply-to'] || '';
  const observedAt = (() => {
    const d = date instanceof Date ? date : new Date(date || Date.now());
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  })();

  const eventCore = {
    policyVersion: INBOUND_FEEDBACK_POLICY_VERSION,
    eventId,
    provider: normalizedProvider,
    providerMessageId,
    threadId,
    category: classified.category,
    confidence: classified.confidence,
    evidenceClass: evidenceClass(evidence, {
      providerObservation: message.providerObservation,
      provider: normalizedProvider,
      providerMessageId
    }),
    routingRefs: route,
    privacy: {
      senderAddressHmac: hmac(fromAddress, privacyHmacKey),
      inReplyToHmac: hmac(replyTo, privacyHmacKey),
      rawHeadersPersisted: false,
      rawBodyPersisted: false,
      mimeTruncated: mime.truncated,
      headersTruncated: headerResult.truncated
    }
  };
  const eventDigest = sha(eventCore);

  return {
    ok: true,
    ...eventCore,
    eventDigest,
    status: 'CLASSIFIED_LOCAL_ONLY',
    observedAt,
    authority: 'NONE',
    executionStatus: 'NOT_RUN',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

const RECOMMENDATIONS = Object.freeze({
  reply: [
    ['STOP_FOLLOWUP', 'followup'],
    ['MARK_REPLIED', 'outreach-stage']
  ],
  unsubscribe: [
    ['STOP_FOLLOWUP', 'followup'],
    ['SUPPRESS_CONTACT', 'suppression']
  ],
  complaint: [
    ['STOP_FOLLOWUP', 'followup'],
    ['SUPPRESS_CONTACT', 'suppression'],
    ['FLAG_SENDER_HEALTH', 'sender-health']
  ],
  bounce: [
    ['STOP_FOLLOWUP', 'followup'],
    ['MARK_ROUTE_INVALID', 'contact-route']
  ],
  'out-of-office': [
    ['PAUSE_FOLLOWUP', 'followup']
  ],
  unknown: []
});

export function compileInboundLocalIntents(event) {
  if (!event?.ok || event.policyVersion !== INBOUND_FEEDBACK_POLICY_VERSION || !event.eventId) {
    return { ok: false, policyVersion: INBOUND_FEEDBACK_POLICY_VERSION, status: 'REJECTED', reasonCodes: ['valid-inbound-event-required'] };
  }
  const specs = RECOMMENDATIONS[event.category] || [];
  const intents = specs.map(([action, service]) => ({
    intentId: `inbound_intent_${sha({ eventId: event.eventId, action, service }).slice(0, 24)}`,
    eventId: event.eventId,
    action,
    canonicalService: service,
    routingRefs: { ...event.routingRefs },
    consequenceClass: 'LOCAL_PREPARATION',
    authority: 'NONE',
    executionStatus: 'NOT_RUN',
    externalEffectLedger: { ...ZERO_EFFECTS }
  }));
  return {
    ok: true,
    policyVersion: INBOUND_FEEDBACK_POLICY_VERSION,
    status: intents.length ? 'LOCAL_INTENTS_PREPARED' : 'NO_ACTION_RECOMMENDED',
    eventId: event.eventId,
    intents,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}
