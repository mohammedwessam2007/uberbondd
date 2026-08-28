import crypto from 'node:crypto';

export const OMNICHANNEL_COMMUNICATION_POLICY_VERSION = 'omnichannel-communication-contract-1.1.0';
export const COMMUNICATION_CHANNELS = Object.freeze([
  'EMAIL_TRANSACTIONAL', 'SMS', 'WHATSAPP', 'SUPPORT_INBOX', 'SOCIAL_PUBLIC', 'PUSH'
]);
export const COMMUNICATION_PURPOSES = Object.freeze([
  'CUSTOMER_SERVICE', 'TRANSACTIONAL', 'APPOINTMENT', 'RECEIVABLE_REMINDER', 'REVIEW_REQUEST', 'PUBLIC_DISTRIBUTION'
]);
export const COMMUNICATION_EVENT_TYPES = Object.freeze([
  'SENT', 'DELIVERED', 'PUBLISHED', 'REJECTED', 'RECEIVED',
  'OPT_OUT_RECEIVED', 'OPT_OUT_APPLIED', 'COMPLAINT_RECEIVED'
]);
export const COMMUNICATION_PROVIDER_CAPABILITIES = Object.freeze([
  'identity', 'authenticationMethod', 'termsAndAllowedPurposes', 'dryRunSupported', 'liveSupported',
  'send', 'reply', 'publish', 'deliveryStatus', 'inboundEvents', 'reconcileSend', 'receipts', 'cancel'
]);

const PERSON_TARGETED = new Set(['EMAIL_TRANSACTIONAL', 'SMS', 'WHATSAPP', 'SUPPORT_INBOX', 'PUSH']);
const CONSENT_REQUIRED = new Set(['SMS', 'WHATSAPP', 'PUSH']);
const EXTERNAL_SUCCESS = new Set(['SENT', 'DELIVERED', 'PUBLISHED']);
const SENSITIVE_KEYS = /(?:email|phone|handle|username|recipient|destination|message|content|body|text|address|fullname|name|password|secret|token|authorization|cookie|credential|api[_-]?key|raw(?:payload|body|value))/i;
const SAFE_REFERENCE_KEYS = new Set(['contentRef', 'recipientRef', 'authorityReceiptRef']);
const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0, messages: 0, purchases: 0, deployments: 0,
  credentialChanges: 0, dnsChanges: 0, productionMutations: 0, spendCents: 0
});

function clone(value) { return structuredClone(value); }
function text(value, max = 240) {
  const string = String(value ?? '').trim();
  return string && string.length <= max ? string : null;
}
function slug(value, max = 120) {
  const string = text(value, max);
  if (!string) return null;
  return string.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || null;
}
function iso(value) {
  const string = text(value, 80);
  if (!string) return null;
  const date = new Date(string);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function invalid(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: OMNICHANNEL_COMMUNICATION_POLICY_VERSION,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS),
    ...extra
  };
}
function sensitiveKeys(value, depth = 0, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || depth > 6) return [];
  if (seen.has(value)) return [];
  seen.add(value);
  const found = [];
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_KEYS.test(String(key)) && !SAFE_REFERENCE_KEYS.has(String(key))) found.push(String(key));
    if (child && typeof child === 'object') found.push(...sensitiveKeys(child, depth + 1, seen));
  }
  return [...new Set(found)].slice(0, 20);
}

export function compileCommunicationCommand(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid(['communication-command-object-required']);
  const channel = String(input.channel ?? '').trim().toUpperCase();
  const purpose = String(input.purpose ?? '').trim().toUpperCase();
  const occurrenceKey = text(input.occurrenceKey, 300);
  const conversationRef = input.conversationRef == null ? null : text(input.conversationRef, 200);
  const recipientRef = input.recipientRef == null ? null : text(input.recipientRef, 200);
  const audienceRef = input.audienceRef == null ? null : text(input.audienceRef, 200);
  const contentRef = text(input.contentRef, 240);
  const authorityReceiptRef = text(input.authorityReceiptRef, 240);
  const idempotencyKey = text(input.idempotencyKey, 300);
  const communicationPolicyRef = text(input.communicationPolicyRef, 240);
  const suppressionCheckRef = input.suppressionCheckRef == null ? null : text(input.suppressionCheckRef, 240);
  const consentEvidenceRef = input.consentEvidenceRef == null ? null : text(input.consentEvidenceRef, 240);
  const platformPolicyRef = input.platformPolicyRef == null ? null : text(input.platformPolicyRef, 240);
  const reasonCodes = [];

  if (!COMMUNICATION_CHANNELS.includes(channel)) reasonCodes.push('invalid-communication-channel');
  if (!COMMUNICATION_PURPOSES.includes(purpose)) reasonCodes.push('invalid-communication-purpose');
  if (!occurrenceKey) reasonCodes.push('occurrence-key-required-or-too-long');
  if (!contentRef) reasonCodes.push('content-ref-required');
  if (!authorityReceiptRef) reasonCodes.push('authority-receipt-ref-required-for-communication-effect');
  if (!idempotencyKey) reasonCodes.push('idempotency-key-required-for-communication-effect');
  if (!communicationPolicyRef) reasonCodes.push('communication-policy-ref-required');
  if (PERSON_TARGETED.has(channel) && !recipientRef) reasonCodes.push('recipient-ref-required-for-person-targeted-channel');
  if (PERSON_TARGETED.has(channel) && !suppressionCheckRef) reasonCodes.push('suppression-check-ref-required-for-person-targeted-channel');
  if (CONSENT_REQUIRED.has(channel) && !consentEvidenceRef) reasonCodes.push('consent-evidence-ref-required-for-channel');
  if (channel === 'SOCIAL_PUBLIC' && !audienceRef) reasonCodes.push('audience-ref-required-for-public-social');
  if (channel === 'SOCIAL_PUBLIC' && !platformPolicyRef) reasonCodes.push('platform-policy-ref-required-for-public-social');
  if (purpose === 'PUBLIC_DISTRIBUTION' && channel !== 'SOCIAL_PUBLIC') reasonCodes.push('public-distribution-requires-social-public-channel');
  if (String(input.outreachClass ?? '').trim().toUpperCase() === 'COLD_OUTREACH') reasonCodes.push('cold-outreach-must-use-canonical-outreach-engine');

  const prohibited = sensitiveKeys(input);
  if (prohibited.length) reasonCodes.push('raw-communication-pii-content-or-secret-prohibited');
  const command = {
    schemaVersion: 'omnichannel-command-1.1.0', channel, purpose, occurrenceKey,
    conversationRef, recipientRef, audienceRef, contentRef, authorityReceiptRef,
    idempotencyKey, communicationPolicyRef, suppressionCheckRef, consentEvidenceRef, platformPolicyRef,
    executionAuthority: 'NONE', durablePayloadClass: 'REFERENCE_ONLY_NO_RAW_DESTINATION_OR_CONTENT'
  };
  command.commandId = COMMUNICATION_CHANNELS.includes(channel) && COMMUNICATION_PURPOSES.includes(purpose)
    && occurrenceKey && contentRef && idempotencyKey
    ? `comm_cmd_${digest(command).slice(0, 32)}` : null;
  if (reasonCodes.length) return invalid(reasonCodes, { command, prohibitedKeys: prohibited });
  return {
    ok: true, policyVersion: OMNICHANNEL_COMMUNICATION_POLICY_VERSION,
    status: 'COMMUNICATION_COMMAND_PREPARED', command,
    businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function normalizeCommunicationEvent(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid(['communication-event-object-required']);
  const provider = slug(input.provider, 80);
  const providerEventId = text(input.providerEventId, 200);
  const commandId = input.commandId == null ? null : text(input.commandId, 200);
  const conversationRef = text(input.conversationRef, 200);
  const channel = String(input.channel ?? '').trim().toUpperCase();
  const eventType = String(input.eventType ?? '').trim().toUpperCase();
  const providerReceiptRef = text(input.providerReceiptRef, 240);
  const canonicalSuppressionReceiptRef = input.canonicalSuppressionReceiptRef == null ? null : text(input.canonicalSuppressionReceiptRef, 240);
  const inboundEvidenceRef = input.inboundEvidenceRef == null ? null : text(input.inboundEvidenceRef, 240);
  const observedAt = iso(input.observedAt);
  const receivedAt = iso(input.receivedAt);
  const reasonCodes = [];

  if (!provider) reasonCodes.push('provider-required');
  if (!providerEventId) reasonCodes.push('provider-event-id-required-or-too-long');
  if (!COMMUNICATION_CHANNELS.includes(channel)) reasonCodes.push('invalid-communication-channel');
  if (!COMMUNICATION_EVENT_TYPES.includes(eventType)) reasonCodes.push('invalid-communication-event-type');
  if (!conversationRef) reasonCodes.push('conversation-ref-required');
  if (!providerReceiptRef) reasonCodes.push('provider-receipt-ref-required-for-communication-truth');
  if (EXTERNAL_SUCCESS.has(eventType) && !commandId) reasonCodes.push('command-id-required-for-outbound-truth');
  if (eventType === 'RECEIVED' && !inboundEvidenceRef) reasonCodes.push('inbound-evidence-ref-required-for-received-content');
  if (eventType === 'OPT_OUT_APPLIED' && !canonicalSuppressionReceiptRef) reasonCodes.push('canonical-suppression-receipt-ref-required-for-opt-out-applied-truth');
  if (eventType === 'OPT_OUT_RECEIVED' && canonicalSuppressionReceiptRef) reasonCodes.push('opt-out-received-cannot-claim-canonical-suppression-applied');
  if (!observedAt) reasonCodes.push('observed-at-required');
  if (!receivedAt) reasonCodes.push('received-at-required');
  if (observedAt && receivedAt && new Date(observedAt).getTime() > new Date(receivedAt).getTime() + 300_000) {
    reasonCodes.push('future-dated-communication-event');
  }
  const prohibited = sensitiveKeys(input);
  if (prohibited.length) reasonCodes.push('raw-communication-pii-content-or-secret-prohibited');
  const event = {
    schemaVersion: 'omnichannel-provider-event-1.1.0', provider, providerEventId,
    eventId: provider && providerEventId ? `comm_evt_${digest([provider, providerEventId]).slice(0, 32)}` : null,
    commandId, conversationRef, channel, eventType, providerReceiptRef,
    canonicalSuppressionReceiptRef, inboundEvidenceRef, observedAt, receivedAt,
    durablePayloadClass: 'REFERENCE_ONLY_NO_RAW_DESTINATION_OR_CONTENT'
  };
  if (reasonCodes.length) return invalid(reasonCodes, { event, prohibitedKeys: prohibited });
  const suppressionTruthAuthority = eventType === 'OPT_OUT_APPLIED'
    ? 'CANONICAL_SUPPRESSION_RECEIPT_REFERENCE_ONLY'
    : eventType === 'OPT_OUT_RECEIVED'
      ? 'PROVIDER_SIGNAL_ONLY_NOT_APPLIED'
      : 'NONE';
  return {
    ok: true, policyVersion: OMNICHANNEL_COMMUNICATION_POLICY_VERSION,
    event, suppressionTruthAuthority,
    businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

function normalizeAndDedupeCommunicationEvents(events = []) {
  if (!Array.isArray(events)) return invalid(['communication-events-array-required']);
  const kept = [];
  const byId = new Map();
  const errors = [];
  const conflicts = [];
  const duplicates = [];
  events.forEach((input, index) => {
    const normalized = normalizeCommunicationEvent(input);
    if (!normalized.ok) {
      errors.push({ index, reasonCodes: normalized.reasonCodes });
      return;
    }
    const prior = byId.get(normalized.event.eventId);
    if (!prior) {
      byId.set(normalized.event.eventId, normalized.event);
      kept.push(normalized.event);
    } else if (JSON.stringify(prior) === JSON.stringify(normalized.event)) {
      duplicates.push({ eventId: normalized.event.eventId, index });
    } else {
      conflicts.push({ eventId: normalized.event.eventId, index });
    }
  });
  if (errors.length || conflicts.length) {
    return invalid([
      ...(errors.length ? ['invalid-communication-event'] : []),
      ...(conflicts.length ? ['conflicting-provider-event-identity'] : [])
    ], { status: 'UNCERTAIN_EXTERNAL_STATE', errors, conflicts, duplicates, events: [] });
  }
  return { ok: true, events: kept, duplicates, conflicts, errors };
}

export function dedupeCommunicationEvents(events = []) {
  const result = normalizeAndDedupeCommunicationEvents(events);
  if (!result.ok) return result;
  return {
    ok: true, policyVersion: OMNICHANNEL_COMMUNICATION_POLICY_VERSION,
    status: 'COMMUNICATION_EVENTS_READY', events: result.events,
    duplicates: result.duplicates, conflicts: result.conflicts,
    businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function foldCommunicationCommandEvents(events = []) {
  const normalized = normalizeAndDedupeCommunicationEvents(events);
  if (!normalized.ok) return normalized;
  const kept = normalized.events;
  if (!kept.length) return invalid(['communication-event-required']);
  const commandIds = [...new Set(kept.map(event => event.commandId).filter(Boolean))];
  const hasCommandEvents = kept.some(event => event.commandId);
  const hasConversationOnlyEvents = kept.some(event => !event.commandId);
  if (commandIds.length > 1) return invalid(['mixed-communication-command-events']);
  if (hasCommandEvents && hasConversationOnlyEvents) return invalid(['mixed-command-and-conversation-events']);
  const types = new Set(kept.map(event => event.eventType));
  const hasSuccess = [...EXTERNAL_SUCCESS].some(type => types.has(type));
  if (hasSuccess && types.has('REJECTED')) {
    return invalid(['contradictory-communication-terminal-truth'], {
      status: 'UNCERTAIN_EXTERNAL_STATE', commandId: commandIds[0] || null
    });
  }
  let state = 'OBSERVED';
  if (types.has('DELIVERED')) state = 'DELIVERED';
  else if (types.has('PUBLISHED')) state = 'PUBLISHED';
  else if (types.has('SENT')) state = 'SENT';
  else if (types.has('REJECTED')) state = 'REJECTED';
  else if (types.has('OPT_OUT_APPLIED')) state = 'OPT_OUT_APPLIED';
  else if (types.has('OPT_OUT_RECEIVED')) state = 'OPT_OUT_PENDING_CANONICAL_SUPPRESSION';
  else if (types.has('COMPLAINT_RECEIVED')) state = 'COMPLAINT_RECEIVED';
  else if (types.has('RECEIVED')) state = 'RECEIVED';
  const ordered = [...kept].sort((a, b) =>
    new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime() || a.eventId.localeCompare(b.eventId)
  );
  return {
    ok: true, policyVersion: OMNICHANNEL_COMMUNICATION_POLICY_VERSION,
    status: 'COMMUNICATION_LIFECYCLE_FOLDED', commandId: commandIds[0] || null,
    state, eventIds: ordered.map(event => event.eventId), duplicateCount: normalized.duplicates.length,
    retryDisposition: ['DELIVERED', 'PUBLISHED', 'SENT'].includes(state)
      ? 'ALREADY_COMPLETED'
      : state === 'REJECTED'
        ? 'SAFE_TO_REEVALUATE'
        : 'BLOCK_RETRY_UNTIL_RECONCILED',
    businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function deriveCommunicationSafetyState(events = []) {
  const normalized = normalizeAndDedupeCommunicationEvents(events);
  if (!normalized.ok) return normalized;
  if (!normalized.events.length) return invalid(['communication-event-required']);
  const conversationRefs = [...new Set(normalized.events.map(event => event.conversationRef))];
  if (conversationRefs.length !== 1) return invalid(['mixed-conversation-events']);
  const types = new Set(normalized.events.map(event => event.eventType));
  let outboundDisposition = 'FRESH_SUPPRESSION_POLICY_CHECK_REQUIRED';
  let reasonCode = 'no-blocking-safety-signal';
  if (types.has('OPT_OUT_RECEIVED')) {
    outboundDisposition = 'BLOCK_FUTURE_PERSON_TARGETED_OUTBOUND';
    reasonCode = 'opt-out-observed-pending-canonical-suppression';
  } else if (types.has('OPT_OUT_APPLIED')) {
    outboundDisposition = 'BLOCK_FUTURE_PERSON_TARGETED_OUTBOUND';
    reasonCode = 'opt-out-canonical-suppression-applied';
  } else if (types.has('COMPLAINT_RECEIVED')) {
    outboundDisposition = 'BLOCK_FUTURE_PERSON_TARGETED_OUTBOUND';
    reasonCode = 'complaint-received';
  }
  return {
    ok: true, policyVersion: OMNICHANNEL_COMMUNICATION_POLICY_VERSION,
    status: 'COMMUNICATION_SAFETY_STATE_DERIVED', conversationRef: conversationRefs[0],
    optOutObserved: types.has('OPT_OUT_RECEIVED') || types.has('OPT_OUT_APPLIED'),
    canonicalSuppressionApplied: types.has('OPT_OUT_APPLIED'),
    complaintObserved: types.has('COMPLAINT_RECEIVED'),
    outboundDisposition, reasonCode,
    businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function planCommunicationRetry({ command, lifecycle, safetyState = null } = {}) {
  if (!command?.commandId) return invalid(['valid-communication-command-required']);
  if (!lifecycle || lifecycle.ok !== true || lifecycle.commandId !== command.commandId) {
    return invalid(['matching-communication-lifecycle-required']);
  }
  if (safetyState && safetyState.ok === true && safetyState.outboundDisposition === 'BLOCK_FUTURE_PERSON_TARGETED_OUTBOUND') {
    return {
      ok: true, policyVersion: OMNICHANNEL_COMMUNICATION_POLICY_VERSION,
      status: 'RETRY_BLOCKED_SAFETY_SIGNAL', executable: false,
      reasonCodes: [safetyState.reasonCode],
      businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS)
    };
  }
  if (lifecycle.retryDisposition === 'ALREADY_COMPLETED') {
    return {
      ok: true, policyVersion: OMNICHANNEL_COMMUNICATION_POLICY_VERSION,
      status: 'ALREADY_COMPLETED', executable: false,
      businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS)
    };
  }
  if (lifecycle.retryDisposition === 'BLOCK_RETRY_UNTIL_RECONCILED') {
    return {
      ok: true, policyVersion: OMNICHANNEL_COMMUNICATION_POLICY_VERSION,
      status: 'RETRY_BLOCKED_UNCERTAIN_EXTERNAL_STATE', executable: false,
      businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS)
    };
  }
  return {
    ok: true, policyVersion: OMNICHANNEL_COMMUNICATION_POLICY_VERSION,
    status: 'RETRY_REEVALUATION_ALLOWED', executable: false,
    reasonCodes: ['fresh-consent-suppression-authority-evaluation-required'],
    businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

function unconfigured(provider, capability) {
  return {
    ok: false, policyVersion: OMNICHANNEL_COMMUNICATION_POLICY_VERSION,
    status: 'COMMUNICATION_ADAPTER_NOT_CONFIGURED', provider, capability,
    businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS)
  };
}
export function createUnconfiguredCommunicationProviderAdapter(providerName = 'unknown') {
  const provider = slug(providerName, 80) || 'unknown';
  const adapter = { providerName: provider, configured: false };
  for (const capability of COMMUNICATION_PROVIDER_CAPABILITIES) adapter[capability] = async () => unconfigured(provider, capability);
  adapter.dryRunSupported = async () => ({
    ok: true, policyVersion: OMNICHANNEL_COMMUNICATION_POLICY_VERSION,
    status: 'DRY_RUN_ONLY', provider,
    businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS)
  });
  return adapter;
}
export function validateCommunicationProviderAdapter(adapter) {
  const missing = COMMUNICATION_PROVIDER_CAPABILITIES.filter(capability => typeof adapter?.[capability] !== 'function');
  return { ok: missing.length === 0, policyVersion: OMNICHANNEL_COMMUNICATION_POLICY_VERSION, missing };
}
