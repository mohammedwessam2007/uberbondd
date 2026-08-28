import crypto from 'node:crypto';

export const BOOKING_CALENDAR_POLICY_VERSION = 'booking-calendar-contract-1.0.0';

export const BOOKING_OPERATIONS = Object.freeze(['BOOK', 'RESCHEDULE', 'CANCEL']);
export const BOOKING_EVENT_TYPES = Object.freeze([
  'BOOKING_CONFIRMED',
  'BOOKING_REJECTED',
  'RESCHEDULE_CONFIRMED',
  'RESCHEDULE_REJECTED',
  'BOOKING_CANCELLED',
  'CANCEL_REJECTED'
]);
export const BOOKING_PROVIDER_CAPABILITIES = Object.freeze([
  'identity',
  'authenticationMethod',
  'termsAndAllowedPurposes',
  'dryRunSupported',
  'liveSupported',
  'listAvailability',
  'getBooking',
  'createBooking',
  'rescheduleBooking',
  'cancelBooking',
  'receipts',
  'cancel'
]);

const SUCCESS_EVENTS = new Set(['BOOKING_CONFIRMED', 'RESCHEDULE_CONFIRMED', 'BOOKING_CANCELLED']);
const REJECTION_EVENTS = new Set(['BOOKING_REJECTED', 'RESCHEDULE_REJECTED', 'CANCEL_REJECTED']);
const SENSITIVE_KEYS = /(?:email|phone|attendee|participant|customername|fullname|address|notes?|description|message|raw(?:payload|body|value)|password|secret|token|authorization|cookie|credential|api[_-]?key)/i;
import { ZERO_EXTERNAL_EFFECTS as ZERO_EFFECTS } from './effect-ledgers.mjs';

function clone(value) { return structuredClone(value); }
function text(value, max = 240) {
  const result = String(value ?? '').trim();
  return result && result.length <= max ? result : null;
}
function slug(value, max = 120) {
  const source = text(value, max);
  if (!source) return null;
  const result = source.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return result || null;
}
function iso(value) {
  const source = text(value, 80);
  if (!source) return null;
  const date = new Date(source);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function invalid(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: BOOKING_CALENDAR_POLICY_VERSION,
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
    const normalized = String(key).toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (SENSITIVE_KEYS.test(normalized)) found.push(String(key));
    if (child && typeof child === 'object') found.push(...sensitiveKeys(child, depth + 1, seen));
  }
  return [...new Set(found)].slice(0, 20);
}

export function normalizeAvailabilityObservation(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid(['availability-observation-object-required']);
  const provider = slug(input.provider, 80);
  const providerObservationId = text(input.providerObservationId, 200);
  const resourceRef = text(input.resourceRef, 200);
  const slotRef = text(input.slotRef, 200);
  const startAt = iso(input.startAt);
  const endAt = iso(input.endAt);
  const observedAt = iso(input.observedAt);
  const receivedAt = iso(input.receivedAt);
  const providerReceiptRef = text(input.providerReceiptRef, 240);
  const reasonCodes = [];
  if (!provider) reasonCodes.push('provider-required');
  if (!providerObservationId) reasonCodes.push('provider-observation-id-required-or-too-long');
  if (!resourceRef) reasonCodes.push('resource-ref-required-or-too-long');
  if (!slotRef) reasonCodes.push('slot-ref-required-or-too-long');
  if (!startAt) reasonCodes.push('slot-start-required');
  if (!endAt) reasonCodes.push('slot-end-required');
  if (startAt && endAt && new Date(endAt) <= new Date(startAt)) reasonCodes.push('slot-end-must-follow-start');
  if (!observedAt) reasonCodes.push('observed-at-required');
  if (!receivedAt) reasonCodes.push('received-at-required');
  if (observedAt && receivedAt && new Date(observedAt).getTime() > new Date(receivedAt).getTime() + 300_000) reasonCodes.push('future-dated-availability-observation');
  if (!providerReceiptRef) reasonCodes.push('provider-receipt-ref-required-for-availability-truth');
  const prohibitedKeys = sensitiveKeys(input);
  if (prohibitedKeys.length) reasonCodes.push('raw-booking-pii-or-secret-prohibited');
  const observation = {
    schemaVersion: 'booking-availability-observation-1.0.0',
    provider,
    providerObservationId,
    observationId: provider && providerObservationId ? `availability_${digest([provider, providerObservationId]).slice(0, 32)}` : null,
    resourceRef,
    slotRef,
    startAt,
    endAt,
    observedAt,
    receivedAt,
    providerReceiptRef,
    durablePayloadClass: 'REFERENCE_ONLY_NO_ATTENDEE_PII'
  };
  if (reasonCodes.length) return invalid(reasonCodes, { observation, prohibitedKeys });
  return { ok: true, policyVersion: BOOKING_CALENDAR_POLICY_VERSION, observation, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
}

export function compileBookingCommand(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid(['booking-command-object-required']);
  const {
    operation,
    occurrenceKey,
    customerRef,
    resourceRef,
    slotRef = null,
    priorBookingRef = null,
    requestEvidenceRef,
    authorityReceiptRef,
    idempotencyKey
  } = input;
  const op = String(operation ?? '').trim().toUpperCase();
  const occurrence = text(occurrenceKey, 300);
  const customer = text(customerRef, 200);
  const resource = text(resourceRef, 200);
  const slot = slotRef == null ? null : text(slotRef, 200);
  const prior = priorBookingRef == null ? null : text(priorBookingRef, 200);
  const requestRef = text(requestEvidenceRef, 240);
  const authorityRef = text(authorityReceiptRef, 240);
  const idempotency = text(idempotencyKey, 300);
  const reasonCodes = [];
  if (!BOOKING_OPERATIONS.includes(op)) reasonCodes.push('invalid-booking-operation');
  if (!occurrence) reasonCodes.push('occurrence-key-required-or-too-long');
  if (!customer) reasonCodes.push('customer-ref-required-or-too-long');
  if (!resource) reasonCodes.push('resource-ref-required-or-too-long');
  if (['BOOK', 'RESCHEDULE'].includes(op) && !slot) reasonCodes.push('slot-ref-required-for-book-or-reschedule');
  if (['RESCHEDULE', 'CANCEL'].includes(op) && !prior) reasonCodes.push('prior-booking-ref-required');
  if (!requestRef) reasonCodes.push('request-evidence-ref-required');
  if (!authorityRef) reasonCodes.push('authority-receipt-ref-required-for-booking-effect');
  if (!idempotency) reasonCodes.push('idempotency-key-required-for-booking-effect');
  const prohibitedKeys = sensitiveKeys(input);
  // Receipt references and opaque object refs are allowed; raw attendee fields are not.
  const userProhibited = prohibitedKeys.filter(key => key !== 'authorityReceiptRef');
  if (userProhibited.length) reasonCodes.push('raw-booking-pii-or-secret-prohibited');
  const command = {
    schemaVersion: 'booking-command-1.0.0',
    operation: op,
    occurrenceKey: occurrence,
    customerRef: customer,
    resourceRef: resource,
    slotRef: slot,
    priorBookingRef: prior,
    requestEvidenceRef: requestRef,
    authorityReceiptRef: authorityRef,
    idempotencyKey: idempotency,
    durablePayloadClass: 'REFERENCE_ONLY_NO_ATTENDEE_PII'
  };
  command.commandId = BOOKING_OPERATIONS.includes(op) && occurrence && customer && resource && idempotency
    ? `booking_cmd_${digest(command).slice(0, 32)}`
    : null;
  if (reasonCodes.length) return invalid(reasonCodes, { command, prohibitedKeys: userProhibited });
  return {
    ok: true,
    policyVersion: BOOKING_CALENDAR_POLICY_VERSION,
    status: 'BOOKING_COMMAND_PREPARED',
    command,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function normalizeBookingEvent(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid(['booking-event-object-required']);
  const provider = slug(input.provider, 80);
  const providerEventId = text(input.providerEventId, 200);
  const commandId = text(input.commandId, 200);
  const eventType = String(input.eventType ?? '').trim().toUpperCase();
  const bookingRef = input.bookingRef == null ? null : text(input.bookingRef, 200);
  const observedAt = iso(input.observedAt);
  const receivedAt = iso(input.receivedAt);
  const providerReceiptRef = text(input.providerReceiptRef, 240);
  const reasonCodes = [];
  if (!provider) reasonCodes.push('provider-required');
  if (!providerEventId) reasonCodes.push('provider-event-id-required-or-too-long');
  if (!commandId) reasonCodes.push('command-id-required-or-too-long');
  if (!BOOKING_EVENT_TYPES.includes(eventType)) reasonCodes.push('invalid-booking-event-type');
  if (!observedAt) reasonCodes.push('observed-at-required');
  if (!receivedAt) reasonCodes.push('received-at-required');
  if (observedAt && receivedAt && new Date(observedAt).getTime() > new Date(receivedAt).getTime() + 300_000) reasonCodes.push('future-dated-booking-event');
  if (!providerReceiptRef) reasonCodes.push('provider-receipt-ref-required-for-booking-truth');
  if (SUCCESS_EVENTS.has(eventType) && !bookingRef) reasonCodes.push('booking-ref-required-for-success-truth');
  const prohibitedKeys = sensitiveKeys(input);
  if (prohibitedKeys.length) reasonCodes.push('raw-booking-pii-or-secret-prohibited');
  const event = {
    schemaVersion: 'booking-provider-event-1.0.0',
    provider,
    providerEventId,
    eventId: provider && providerEventId ? `booking_evt_${digest([provider, providerEventId]).slice(0, 32)}` : null,
    commandId,
    eventType,
    bookingRef,
    observedAt,
    receivedAt,
    providerReceiptRef,
    durablePayloadClass: 'REFERENCE_ONLY_NO_ATTENDEE_PII'
  };
  if (reasonCodes.length) return invalid(reasonCodes, { event, prohibitedKeys });
  return { ok: true, policyVersion: BOOKING_CALENDAR_POLICY_VERSION, event, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
}

export function foldBookingCommandEvents(events = []) {
  if (!Array.isArray(events)) return invalid(['booking-events-array-required']);
  const normalized = [];
  const byEventId = new Map();
  const duplicates = [];
  const conflicts = [];
  const errors = [];
  events.forEach((input, index) => {
    const result = normalizeBookingEvent(input);
    if (!result.ok) { errors.push({ index, reasonCodes: result.reasonCodes }); return; }
    const prior = byEventId.get(result.event.eventId);
    if (!prior) {
      byEventId.set(result.event.eventId, result.event);
      normalized.push(result.event);
    } else if (JSON.stringify(prior) === JSON.stringify(result.event)) {
      duplicates.push({ eventId: result.event.eventId, index });
    } else {
      conflicts.push({ eventId: result.event.eventId, index });
    }
  });
  if (errors.length || conflicts.length) return invalid([
    ...(errors.length ? ['invalid-booking-event'] : []),
    ...(conflicts.length ? ['conflicting-provider-event-identity'] : [])
  ], { status: 'UNCERTAIN_EXTERNAL_STATE', errors, conflicts, duplicates });
  if (!normalized.length) return invalid(['booking-event-required']);
  const commandIds = [...new Set(normalized.map(event => event.commandId))];
  if (commandIds.length !== 1) return invalid(['mixed-booking-command-events']);
  const hasSuccess = normalized.some(event => SUCCESS_EVENTS.has(event.eventType));
  const hasRejection = normalized.some(event => REJECTION_EVENTS.has(event.eventType));
  if (hasSuccess && hasRejection) return invalid(['contradictory-booking-terminal-truth'], { status: 'UNCERTAIN_EXTERNAL_STATE', commandId: commandIds[0] });
  const ordered = [...normalized].sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt) || a.eventId.localeCompare(b.eventId));
  const latest = ordered.at(-1);
  const status = hasSuccess ? 'BOOKING_EFFECT_CONFIRMED' : hasRejection ? 'BOOKING_EFFECT_REJECTED' : 'BOOKING_EFFECT_PENDING';
  return {
    ok: true,
    policyVersion: BOOKING_CALENDAR_POLICY_VERSION,
    status,
    commandId: commandIds[0],
    latestEventType: latest.eventType,
    bookingRef: latest.bookingRef,
    provider: latest.provider,
    eventIds: ordered.map(event => event.eventId),
    duplicateCount: duplicates.length,
    retryDisposition: hasSuccess ? 'ALREADY_COMPLETED' : hasRejection ? 'SAFE_TO_REEVALUATE' : 'BLOCK_RETRY_UNTIL_RECONCILED',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EFFECTS)
  };
}

export function planBookingRetry({ command, lifecycle } = {}) {
  if (!command || !command.commandId) return invalid(['valid-booking-command-required']);
  if (!lifecycle || lifecycle.ok !== true || lifecycle.commandId !== command.commandId) return invalid(['matching-booking-lifecycle-required']);
  if (lifecycle.retryDisposition === 'ALREADY_COMPLETED') {
    return { ok: true, policyVersion: BOOKING_CALENDAR_POLICY_VERSION, status: 'ALREADY_COMPLETED', executable: false, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
  }
  if (lifecycle.retryDisposition === 'BLOCK_RETRY_UNTIL_RECONCILED') {
    return { ok: true, policyVersion: BOOKING_CALENDAR_POLICY_VERSION, status: 'RETRY_BLOCKED_UNCERTAIN_EXTERNAL_STATE', executable: false, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
  }
  return { ok: true, policyVersion: BOOKING_CALENDAR_POLICY_VERSION, status: 'RETRY_REEVALUATION_ALLOWED', executable: false, reasonCodes: ['fresh-authority-and-availability-evaluation-required'], businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
}

function unconfiguredResult(providerName, capability) {
  return { ok: false, policyVersion: BOOKING_CALENDAR_POLICY_VERSION, status: 'BOOKING_ADAPTER_NOT_CONFIGURED', provider: providerName, capability, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) };
}
export function createUnconfiguredBookingProviderAdapter(providerName = 'unknown') {
  const name = slug(providerName, 80) || 'unknown';
  const adapter = { providerName: name, configured: false };
  for (const capability of BOOKING_PROVIDER_CAPABILITIES) adapter[capability] = async () => unconfiguredResult(name, capability);
  adapter.dryRunSupported = async () => ({ ok: true, policyVersion: BOOKING_CALENDAR_POLICY_VERSION, status: 'DRY_RUN_ONLY', provider: name, businessEffectAuthority: 'NONE', externalEffectLedger: clone(ZERO_EFFECTS) });
  return adapter;
}
export function validateBookingProviderAdapter(adapter) {
  const missing = BOOKING_PROVIDER_CAPABILITIES.filter(capability => typeof adapter?.[capability] !== 'function');
  return { ok: missing.length === 0, policyVersion: BOOKING_CALENDAR_POLICY_VERSION, missing };
}
