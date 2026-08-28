import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOKING_PROVIDER_CAPABILITIES,
  compileBookingCommand,
  createUnconfiguredBookingProviderAdapter,
  foldBookingCommandEvents,
  normalizeAvailabilityObservation,
  normalizeBookingEvent,
  planBookingRetry,
  validateBookingProviderAdapter
} from '../src/booking-calendar-contract.mjs';

const COMMAND = {
  operation: 'BOOK',
  occurrenceKey: 'call_occurrence_123',
  customerRef: 'customer_ref_123',
  resourceRef: 'calendar_resource_1',
  slotRef: 'slot_ref_20260829_0900',
  requestEvidenceRef: 'customer_request_receipt_1',
  authorityReceiptRef: 'authority_receipt_1',
  idempotencyKey: 'book_call_occurrence_123_slot_0900'
};

function event(commandId, overrides = {}) {
  return {
    provider: 'cal-diy',
    providerEventId: 'evt_1',
    commandId,
    eventType: 'BOOKING_CONFIRMED',
    bookingRef: 'booking_ref_1',
    observedAt: '2026-08-28T15:40:00.000Z',
    receivedAt: '2026-08-28T15:40:02.000Z',
    providerReceiptRef: 'provider_receipt_1',
    ...overrides
  };
}

test('booking commands require customer/request authority and idempotency references but grant no authority themselves', () => {
  const missing = compileBookingCommand({
    operation: 'BOOK', occurrenceKey: 'occ_1', customerRef: 'customer_1', resourceRef: 'calendar_1', slotRef: 'slot_1'
  });
  assert.equal(missing.ok, false);
  assert.ok(missing.reasonCodes.includes('request-evidence-ref-required'));
  assert.ok(missing.reasonCodes.includes('authority-receipt-ref-required-for-booking-effect'));
  assert.ok(missing.reasonCodes.includes('idempotency-key-required-for-booking-effect'));

  const valid = compileBookingCommand(COMMAND);
  assert.equal(valid.ok, true);
  assert.equal(valid.status, 'BOOKING_COMMAND_PREPARED');
  assert.equal(valid.businessEffectAuthority, 'NONE');
  assert.equal(valid.externalEffectLedger.providerCalls, 0);
  assert.equal(valid.externalEffectLedger.messages, 0);
});

test('reschedule and cancellation require the exact prior booking reference', () => {
  for (const operation of ['RESCHEDULE', 'CANCEL']) {
    const result = compileBookingCommand({ ...COMMAND, operation, priorBookingRef: null, slotRef: operation === 'CANCEL' ? null : COMMAND.slotRef });
    assert.equal(result.ok, false, operation);
    assert.ok(result.reasonCodes.includes('prior-booking-ref-required'), operation);
  }
});

test('stable booking command identity does not truncate long keys into collisions', () => {
  const first = compileBookingCommand(COMMAND);
  const second = compileBookingCommand(structuredClone(COMMAND));
  assert.equal(first.ok, true);
  assert.equal(first.command.commandId, second.command.commandId);

  const tooLong = compileBookingCommand({ ...COMMAND, occurrenceKey: 'x'.repeat(301) });
  assert.equal(tooLong.ok, false);
  assert.ok(tooLong.reasonCodes.includes('occurrence-key-required-or-too-long'));
  const idemTooLong = compileBookingCommand({ ...COMMAND, idempotencyKey: 'y'.repeat(301) });
  assert.equal(idemTooLong.ok, false);
  assert.ok(idemTooLong.reasonCodes.includes('idempotency-key-required-for-booking-effect'));
});

test('raw attendee PII and secrets are prohibited from durable booking envelopes', () => {
  const raw = compileBookingCommand({ ...COMMAND, email: 'person@example.com' });
  assert.equal(raw.ok, false);
  assert.ok(raw.reasonCodes.includes('raw-booking-pii-or-secret-prohibited'));

  const eventWithPii = normalizeBookingEvent({ ...event('booking_cmd_x'), attendeeEmail: 'person@example.com' });
  assert.equal(eventWithPii.ok, false);
  assert.ok(eventWithPii.reasonCodes.includes('raw-booking-pii-or-secret-prohibited'));

  const availabilityWithPhone = normalizeAvailabilityObservation({
    provider: 'cal-diy', providerObservationId: 'obs_1', resourceRef: 'resource_1', slotRef: 'slot_1',
    startAt: '2026-08-29T09:00:00.000Z', endAt: '2026-08-29T09:30:00.000Z',
    observedAt: '2026-08-28T15:00:00.000Z', receivedAt: '2026-08-28T15:00:01.000Z', providerReceiptRef: 'receipt_1', phone: '+10000000000'
  });
  assert.equal(availabilityWithPhone.ok, false);
});

test('availability is provider truth only with a receipt and sane time bounds', () => {
  const valid = normalizeAvailabilityObservation({
    provider: 'cal-diy', providerObservationId: 'obs_1', resourceRef: 'resource_1', slotRef: 'slot_1',
    startAt: '2026-08-29T09:00:00.000Z', endAt: '2026-08-29T09:30:00.000Z',
    observedAt: '2026-08-28T15:00:00.000Z', receivedAt: '2026-08-28T15:00:01.000Z', providerReceiptRef: 'receipt_1'
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.observation.slotRef, 'slot_1');

  const noReceipt = normalizeAvailabilityObservation({
    provider: 'cal-diy', providerObservationId: 'obs_2', resourceRef: 'resource_1', slotRef: 'slot_2',
    startAt: '2026-08-29T10:00:00.000Z', endAt: '2026-08-29T09:30:00.000Z',
    observedAt: '2026-08-28T15:00:00.000Z', receivedAt: '2026-08-28T15:00:01.000Z'
  });
  assert.equal(noReceipt.ok, false);
  assert.ok(noReceipt.reasonCodes.includes('provider-receipt-ref-required-for-availability-truth'));
  assert.ok(noReceipt.reasonCodes.includes('slot-end-must-follow-start'));
});

test('future-dated availability and booking provider events fail closed', () => {
  const availability = normalizeAvailabilityObservation({
    provider: 'cal-diy', providerObservationId: 'obs_future', resourceRef: 'resource_1', slotRef: 'slot_1',
    startAt: '2026-08-29T09:00:00.000Z', endAt: '2026-08-29T09:30:00.000Z',
    observedAt: '2026-08-28T16:00:00.000Z', receivedAt: '2026-08-28T15:00:00.000Z', providerReceiptRef: 'receipt_1'
  });
  assert.equal(availability.ok, false);
  assert.ok(availability.reasonCodes.includes('future-dated-availability-observation'));

  const booking = normalizeBookingEvent(event('cmd_1', { observedAt: '2026-08-28T16:00:00.000Z', receivedAt: '2026-08-28T15:00:00.000Z' }));
  assert.equal(booking.ok, false);
  assert.ok(booking.reasonCodes.includes('future-dated-booking-event'));
});

test('provider booking success cannot be manufactured without receipt and booking identity', () => {
  const noReceipt = normalizeBookingEvent(event('cmd_1', { providerReceiptRef: null }));
  assert.equal(noReceipt.ok, false);
  assert.ok(noReceipt.reasonCodes.includes('provider-receipt-ref-required-for-booking-truth'));
  const noBookingRef = normalizeBookingEvent(event('cmd_1', { bookingRef: null }));
  assert.equal(noBookingRef.ok, false);
  assert.ok(noBookingRef.reasonCodes.includes('booking-ref-required-for-success-truth'));
});

test('exact provider event retries dedupe but conflicting same-event identity fails uncertain', () => {
  const compiled = compileBookingCommand(COMMAND);
  const one = event(compiled.command.commandId);
  const exact = foldBookingCommandEvents([one, structuredClone(one)]);
  assert.equal(exact.ok, true);
  assert.equal(exact.duplicateCount, 1);

  const conflict = foldBookingCommandEvents([one, { ...one, bookingRef: 'different_booking' }]);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.status, 'UNCERTAIN_EXTERNAL_STATE');
  assert.ok(conflict.reasonCodes.includes('conflicting-provider-event-identity'));
});

test('contradictory success and rejection for one command fails closed', () => {
  const compiled = compileBookingCommand(COMMAND);
  const confirmed = event(compiled.command.commandId);
  const rejected = event(compiled.command.commandId, {
    providerEventId: 'evt_2', eventType: 'BOOKING_REJECTED', bookingRef: null, providerReceiptRef: 'provider_receipt_2'
  });
  const result = foldBookingCommandEvents([confirmed, rejected]);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'UNCERTAIN_EXTERNAL_STATE');
  assert.ok(result.reasonCodes.includes('contradictory-booking-terminal-truth'));
});

test('confirmed booking is terminal and cannot duplicate on retry', () => {
  const compiled = compileBookingCommand(COMMAND);
  const lifecycle = foldBookingCommandEvents([event(compiled.command.commandId)]);
  assert.equal(lifecycle.ok, true);
  assert.equal(lifecycle.retryDisposition, 'ALREADY_COMPLETED');
  const retry = planBookingRetry({ command: compiled.command, lifecycle });
  assert.equal(retry.status, 'ALREADY_COMPLETED');
  assert.equal(retry.executable, false);
});

test('pending/uncertain provider state blocks replay until reconciliation', () => {
  const compiled = compileBookingCommand(COMMAND);
  const lifecycle = {
    ok: true, commandId: compiled.command.commandId, retryDisposition: 'BLOCK_RETRY_UNTIL_RECONCILED'
  };
  const retry = planBookingRetry({ command: compiled.command, lifecycle });
  assert.equal(retry.ok, true);
  assert.equal(retry.status, 'RETRY_BLOCKED_UNCERTAIN_EXTERNAL_STATE');
  assert.equal(retry.executable, false);
});

test('unconfigured booking adapter is complete but cannot touch a real calendar', async () => {
  const adapter = createUnconfiguredBookingProviderAdapter('cal-diy');
  const validation = validateBookingProviderAdapter(adapter);
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.missing, []);
  for (const capability of BOOKING_PROVIDER_CAPABILITIES) assert.equal(typeof adapter[capability], 'function');
  const live = await adapter.liveSupported();
  assert.equal(live.ok, false);
  assert.equal(live.status, 'BOOKING_ADAPTER_NOT_CONFIGURED');
  assert.equal(live.externalEffectLedger.providerCalls, 0);
  const dry = await adapter.dryRunSupported();
  assert.equal(dry.ok, true);
  assert.equal(dry.status, 'DRY_RUN_ONLY');
});
