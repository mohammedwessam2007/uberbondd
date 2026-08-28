import crypto from 'node:crypto';

export const VOICE_TELEPHONY_POLICY_VERSION = 'voice-telephony-contract-1.0.0';

export const VOICE_EVENT_TYPES = Object.freeze([
  'CALL_STARTED',
  'CALL_RINGING',
  'CALL_CONNECTED',
  'CALL_MISSED',
  'CALL_ENDED',
  'TRANSFER_REQUESTED',
  'TRANSFER_COMPLETED',
  'SMS_RECOVERY_ELIGIBLE',
  'SMS_SENT',
  'SMS_DELIVERED',
  'BOOKING_REQUESTED',
  'BOOKING_CONFIRMED'
]);

export const VOICE_DIRECTIONS = Object.freeze(['INBOUND', 'OUTBOUND']);
export const VOICE_EVENT_ORIGINS = Object.freeze(['UBERBOND', 'EXTERNAL']);

export const VOICE_PROVIDER_CAPABILITIES = Object.freeze([
  'identity',
  'authenticationMethod',
  'termsAndAllowedPurposes',
  'dryRunSupported',
  'liveSupported',
  'inboundEvents',
  'callStatus',
  'answerCall',
  'endCall',
  'transferCall',
  'sendSms',
  'smsDeliveryStatus',
  'bookingBridge',
  'receipts',
  'cancel'
]);

const EXTERNAL_TRUTH_EVENTS = new Set([
  'CALL_CONNECTED',
  'CALL_MISSED',
  'CALL_ENDED',
  'TRANSFER_COMPLETED',
  'SMS_SENT',
  'SMS_DELIVERED',
  'BOOKING_CONFIRMED'
]);

const UBERBOND_EFFECT_EVENTS = new Set([
  'TRANSFER_COMPLETED',
  'SMS_SENT',
  'BOOKING_CONFIRMED'
]);

const SENSITIVE_KEYS = new Set([
  'phone',
  'phonenumber',
  'fromphone',
  'tophone',
  'audio',
  'audiourl',
  'recording',
  'recordingurl',
  'transcript',
  'transcripttext',
  'messagebody',
  'messagetext',
  'rawpayload',
  'rawbody',
  'authorization',
  'apikey',
  'token',
  'secret'
]);

const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

function clone(value) {
  return structuredClone(value);
}

function cleanText(value, max) {
  const string = String(value ?? '').trim();
  if (!string || string.length > max) return null;
  return string;
}

function cleanSlug(value, max = 120) {
  const string = cleanText(value, max);
  if (!string) return null;
  const slug = string.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || null;
}

function iso(value) {
  const string = cleanText(value, 80);
  if (!string) return null;
  const date = new Date(string);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
}

function stableId(prefix, parts) {
  const digest = crypto.createHash('sha256').update(parts.join('\0')).digest('hex');
  return `${prefix}_${digest.slice(0, 40)}`;
}

function sensitiveKeys(value, depth = 0, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || depth > 6) return [];
  if (seen.has(value)) return [];
  seen.add(value);
  const found = [];
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (SENSITIVE_KEYS.has(normalizedKey)) found.push(String(key));
    if (child && typeof child === 'object') found.push(...sensitiveKeys(child, depth + 1, seen));
  }
  return [...new Set(found)].slice(0, 20);
}

function invalid(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: VOICE_TELEPHONY_POLICY_VERSION,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    ...extra
  };
}

export function normalizeVoiceEvent(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return invalid(['voice-event-object-required']);
  }

  const provider = cleanSlug(input.provider, 80);
  const providerEventId = cleanText(input.providerEventId, 200);
  const callOccurrenceKey = cleanText(input.callOccurrenceKey, 240);
  const contactRef = cleanText(input.contactRef, 200);
  const conversationRef = input.conversationRef == null ? null : cleanText(input.conversationRef, 200);
  const eventType = cleanText(input.eventType, 60)?.toUpperCase() || null;
  const direction = cleanText(input.direction, 20)?.toUpperCase() || null;
  const origin = cleanText(input.origin, 20)?.toUpperCase() || null;
  const observedAt = iso(input.observedAt);
  const receivedAt = iso(input.receivedAt);
  const providerReceiptRef = input.providerReceiptRef == null ? null : cleanText(input.providerReceiptRef, 240);
  const authorityReceiptRef = input.authorityReceiptRef == null ? null : cleanText(input.authorityReceiptRef, 240);
  const reasonCode = input.reasonCode == null ? null : cleanSlug(input.reasonCode, 120);
  const sensitive = sensitiveKeys(input);

  const reasonCodes = [];
  if (!provider) reasonCodes.push('provider-required');
  if (!providerEventId) reasonCodes.push('provider-event-id-required-or-too-long');
  if (!callOccurrenceKey) reasonCodes.push('call-occurrence-key-required-or-too-long');
  if (!contactRef) reasonCodes.push('contact-ref-required-or-too-long');
  if (input.conversationRef != null && !conversationRef) reasonCodes.push('conversation-ref-too-long');
  if (!VOICE_EVENT_TYPES.includes(eventType)) reasonCodes.push('invalid-voice-event-type');
  if (!VOICE_DIRECTIONS.includes(direction)) reasonCodes.push('invalid-voice-direction');
  if (!VOICE_EVENT_ORIGINS.includes(origin)) reasonCodes.push('invalid-voice-event-origin');
  if (!observedAt) reasonCodes.push('observed-at-required');
  if (!receivedAt) reasonCodes.push('received-at-required');
  if (sensitive.length) reasonCodes.push('raw-sensitive-payload-prohibited');

  if (observedAt && receivedAt) {
    if (new Date(observedAt).getTime() > new Date(receivedAt).getTime() + 300_000) {
      reasonCodes.push('future-dated-provider-event');
    }
  }

  if (eventType && EXTERNAL_TRUTH_EVENTS.has(eventType) && !providerReceiptRef) {
    reasonCodes.push('provider-receipt-ref-required-for-external-truth');
  }
  if (eventType && origin === 'UBERBOND' && UBERBOND_EFFECT_EVENTS.has(eventType) && !authorityReceiptRef) {
    reasonCodes.push('authority-receipt-ref-required-for-uberbond-effect');
  }

  const event = {
    schemaVersion: 'voice-telephony-event-1.0.0',
    provider,
    providerEventId,
    eventId: provider && providerEventId ? stableId('ve', [provider, providerEventId]) : null,
    callOccurrenceKey,
    callOccurrenceId: provider && callOccurrenceKey ? stableId('vc', [provider, callOccurrenceKey]) : null,
    contactRef,
    conversationRef,
    eventType,
    direction,
    origin,
    observedAt,
    receivedAt,
    providerReceiptRef,
    authorityReceiptRef,
    reasonCode,
    durablePayloadClass: 'REFERENCE_ONLY_NO_RAW_PHONE_AUDIO_TRANSCRIPT'
  };

  if (reasonCodes.length) {
    return invalid(reasonCodes, {
      event,
      prohibitedKeys: sensitive
    });
  }

  return {
    ok: true,
    policyVersion: VOICE_TELEPHONY_POLICY_VERSION,
    event,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

function comparable(event) {
  return JSON.stringify(event);
}

export function dedupeVoiceEvents(events = []) {
  if (!Array.isArray(events)) return invalid(['voice-event-array-required']);
  const kept = [];
  const errors = [];
  const duplicates = [];
  const conflicts = [];
  const byEventId = new Map();

  events.forEach((input, index) => {
    const normalized = normalizeVoiceEvent(input);
    if (!normalized.ok) {
      errors.push({ index, reasonCodes: normalized.reasonCodes });
      return;
    }
    const event = normalized.event;
    const prior = byEventId.get(event.eventId);
    if (!prior) {
      byEventId.set(event.eventId, event);
      kept.push(event);
      return;
    }
    if (comparable(prior) === comparable(event)) duplicates.push({ eventId: event.eventId, index });
    else conflicts.push({ eventId: event.eventId, index });
  });

  if (errors.length || conflicts.length) {
    return invalid([
      ...(errors.length ? ['invalid-voice-event'] : []),
      ...(conflicts.length ? ['conflicting-provider-event-identity'] : [])
    ], {
      status: 'UNCERTAIN_EXTERNAL_STATE',
      events: [],
      errors,
      duplicates,
      conflicts,
      businessEffectAuthority: 'NONE',
      externalEffectLedger: clone(ZERO_EFFECTS)
    });
  }

  return {
    ok: true,
    policyVersion: VOICE_TELEPHONY_POLICY_VERSION,
    status: 'VOICE_EVENTS_READY',
    events: kept,
    duplicates,
    conflicts,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function foldVoiceCallLifecycle(events = []) {
  const deduped = dedupeVoiceEvents(events);
  if (!deduped.ok) return deduped;
  if (deduped.events.length === 0) return invalid(['voice-event-required']);

  const occurrenceIds = [...new Set(deduped.events.map(event => event.callOccurrenceId))];
  if (occurrenceIds.length !== 1) {
    return invalid(['mixed-call-occurrences'], {
      status: 'REVIEW_REQUIRED',
      businessEffectAuthority: 'NONE',
      externalEffectLedger: clone(ZERO_EFFECTS)
    });
  }

  const ordered = [...deduped.events].sort((a, b) =>
    new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime()
    || a.eventId.localeCompare(b.eventId)
  );
  const eventTypes = new Set(ordered.map(event => event.eventType));
  if (eventTypes.has('CALL_CONNECTED') && eventTypes.has('CALL_MISSED')) {
    return invalid(['contradictory-call-terminal-truth'], {
      status: 'UNCERTAIN_EXTERNAL_STATE',
      callOccurrenceId: occurrenceIds[0],
      businessEffectAuthority: 'NONE',
      externalEffectLedger: clone(ZERO_EFFECTS)
    });
  }

  const latest = ordered.at(-1);
  let callState = 'OBSERVED';
  if (eventTypes.has('CALL_MISSED')) callState = 'MISSED';
  else if (eventTypes.has('CALL_ENDED')) callState = 'ENDED';
  else if (eventTypes.has('CALL_CONNECTED')) callState = 'CONNECTED';
  else if (eventTypes.has('CALL_RINGING')) callState = 'RINGING';
  else if (eventTypes.has('CALL_STARTED')) callState = 'STARTED';

  return {
    ok: true,
    policyVersion: VOICE_TELEPHONY_POLICY_VERSION,
    status: 'CALL_LIFECYCLE_FOLDED',
    callOccurrenceId: occurrenceIds[0],
    provider: latest.provider,
    contactRef: latest.contactRef,
    direction: latest.direction,
    callState,
    latestObservedAt: latest.observedAt,
    eventCount: ordered.length,
    eventIds: ordered.map(event => event.eventId),
    smsRecoveryEligibleObserved: eventTypes.has('SMS_RECOVERY_ELIGIBLE'),
    smsSentObserved: eventTypes.has('SMS_SENT'),
    smsDeliveredObserved: eventTypes.has('SMS_DELIVERED'),
    transferCompletedObserved: eventTypes.has('TRANSFER_COMPLETED'),
    bookingConfirmedObserved: eventTypes.has('BOOKING_CONFIRMED'),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function planMissedCallRecovery({ lifecycle, consentState = 'UNKNOWN' } = {}) {
  if (!lifecycle || lifecycle.ok !== true || lifecycle.status !== 'CALL_LIFECYCLE_FOLDED') {
    return invalid(['valid-folded-call-lifecycle-required']);
  }
  if (lifecycle.callState !== 'MISSED') {
    return {
      ok: true,
      policyVersion: VOICE_TELEPHONY_POLICY_VERSION,
      status: 'NO_MISSED_CALL_RECOVERY_NEEDED',
      plannedAction: null,
      businessEffectAuthority: 'NONE',
      externalEffectLedger: clone(ZERO_EFFECTS)
    };
  }

  const consent = String(consentState || 'UNKNOWN').trim().toUpperCase();
  if (consent !== 'SMS_ALLOWED') {
    return {
      ok: true,
      policyVersion: VOICE_TELEPHONY_POLICY_VERSION,
      status: 'BLOCKED_CONSENT',
      plannedAction: null,
      reasonCodes: ['sms-consent-not-proven'],
      businessEffectAuthority: 'NONE',
      externalEffectLedger: clone(ZERO_EFFECTS)
    };
  }

  return {
    ok: true,
    policyVersion: VOICE_TELEPHONY_POLICY_VERSION,
    status: 'RECOVERY_PREPARATION_ALLOWED',
    plannedAction: {
      type: 'PREPARE_SMS_RECOVERY',
      callOccurrenceId: lifecycle.callOccurrenceId,
      contactRef: lifecycle.contactRef,
      executionAuthority: 'NONE',
      requiresConsequenceAuthorization: true,
      requiresConfiguredProviderAdapter: true,
      providerDeliveryReceiptRequiredForSentTruth: true
    },
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

function unconfiguredResult(providerName, capability) {
  return {
    ok: false,
    policyVersion: VOICE_TELEPHONY_POLICY_VERSION,
    status: 'PROVIDER_AUTH_REQUIRED',
    provider: providerName,
    capability,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function createUnconfiguredVoiceProviderAdapter(providerName = 'unknown') {
  const name = cleanSlug(providerName, 80) || 'unknown';
  const adapter = { providerName: name, configured: false };
  for (const capability of VOICE_PROVIDER_CAPABILITIES) {
    adapter[capability] = async () => unconfiguredResult(name, capability);
  }
  adapter.dryRunSupported = async () => ({
    ok: true,
    policyVersion: VOICE_TELEPHONY_POLICY_VERSION,
    status: 'DRY_RUN_ONLY',
    provider: name,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  });
  adapter.liveSupported = async () => unconfiguredResult(name, 'liveSupported');
  return adapter;
}

export function validateVoiceProviderAdapter(adapter) {
  const missing = VOICE_PROVIDER_CAPABILITIES.filter(capability => typeof adapter?.[capability] !== 'function');
  return {
    ok: missing.length === 0,
    policyVersion: VOICE_TELEPHONY_POLICY_VERSION,
    missing
  };
}
