import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createUnconfiguredVoiceProviderAdapter,
  dedupeVoiceEvents,
  foldVoiceCallLifecycle,
  normalizeVoiceEvent,
  planMissedCallRecovery,
  validateVoiceProviderAdapter
} from '../src/voice-telephony-contract.mjs';

function event(overrides = {}) {
  return {
    provider: 'example-voice',
    providerEventId: 'evt_001',
    callOccurrenceKey: 'call_001',
    contactRef: 'contact_001',
    conversationRef: 'conversation_001',
    eventType: 'CALL_STARTED',
    direction: 'INBOUND',
    origin: 'EXTERNAL',
    observedAt: '2026-08-28T15:00:00.000Z',
    receivedAt: '2026-08-28T15:00:01.000Z',
    ...overrides
  };
}

test('voice event envelope stores references rather than raw phone/audio/transcript data', () => {
  const result = normalizeVoiceEvent(event());
  assert.equal(result.ok, true);
  assert.equal(result.event.durablePayloadClass, 'REFERENCE_ONLY_NO_RAW_PHONE_AUDIO_TRANSCRIPT');
  assert.equal(Object.hasOwn(result.event, 'phoneNumber'), false);
  assert.equal(Object.hasOwn(result.event, 'transcript'), false);
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('raw sensitive payloads are rejected even when nested', () => {
  const result = normalizeVoiceEvent(event({ payload: { transcript: 'hello', phoneNumber: '+10000000000' } }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('raw-sensitive-payload-prohibited'));
  assert.deepEqual(new Set(result.prohibitedKeys), new Set(['transcript', 'phoneNumber']));
});

test('overlong occurrence identity fails closed rather than truncating into a collision', () => {
  const prefix = 'x'.repeat(240);
  const first = normalizeVoiceEvent(event({ callOccurrenceKey: `${prefix}A` }));
  const second = normalizeVoiceEvent(event({ callOccurrenceKey: `${prefix}B` }));
  assert.equal(first.ok, false);
  assert.equal(second.ok, false);
  assert.ok(first.reasonCodes.includes('call-occurrence-key-required-or-too-long'));
});

test('external terminal truth requires a provider receipt reference', () => {
  const missing = normalizeVoiceEvent(event({ eventType: 'CALL_MISSED' }));
  assert.equal(missing.ok, false);
  assert.ok(missing.reasonCodes.includes('provider-receipt-ref-required-for-external-truth'));

  const proven = normalizeVoiceEvent(event({ eventType: 'CALL_MISSED', providerReceiptRef: 'receipt_call_missed_1' }));
  assert.equal(proven.ok, true);
});

test('UberBond-originated effect truth also requires consequence authorization evidence', () => {
  const blocked = normalizeVoiceEvent(event({
    eventType: 'SMS_SENT',
    origin: 'UBERBOND',
    providerReceiptRef: 'receipt_sms_1'
  }));
  assert.equal(blocked.ok, false);
  assert.ok(blocked.reasonCodes.includes('authority-receipt-ref-required-for-uberbond-effect'));

  const proven = normalizeVoiceEvent(event({
    eventType: 'SMS_SENT',
    origin: 'UBERBOND',
    providerReceiptRef: 'receipt_sms_1',
    authorityReceiptRef: 'authority_sms_1'
  }));
  assert.equal(proven.ok, true);
  assert.equal(Object.hasOwn(proven.event, 'authorizationReceiptRef'), false);
  assert.equal(Object.hasOwn(proven.event, 'authorityReceiptRef'), true);
});

test('future-dated provider events are rejected', () => {
  const result = normalizeVoiceEvent(event({
    observedAt: '2026-08-28T16:00:00.000Z',
    receivedAt: '2026-08-28T15:00:00.000Z'
  }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('future-dated-provider-event'));
});

test('duplicate provider event identity is idempotent but contradictory reuse fails closed', () => {
  const exact = event();
  const duplicate = dedupeVoiceEvents([exact, structuredClone(exact)]);
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.events.length, 1);
  assert.equal(duplicate.duplicates.length, 1);

  const conflict = dedupeVoiceEvents([
    exact,
    event({ eventType: 'CALL_RINGING' })
  ]);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.status, 'UNCERTAIN_EXTERNAL_STATE');
  assert.ok(conflict.reasonCodes.includes('conflicting-provider-event-identity'));
});

test('contradictory connected and missed terminal truth fails closed', () => {
  const result = foldVoiceCallLifecycle([
    event({ providerEventId: 'evt_connected', eventType: 'CALL_CONNECTED', providerReceiptRef: 'receipt_connected' }),
    event({ providerEventId: 'evt_missed', eventType: 'CALL_MISSED', providerReceiptRef: 'receipt_missed' })
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'UNCERTAIN_EXTERNAL_STATE');
  assert.ok(result.reasonCodes.includes('contradictory-call-terminal-truth'));
});

test('missed-call recovery can prepare SMS only with proven consent and never grants send authority', () => {
  const lifecycle = foldVoiceCallLifecycle([
    event({ providerEventId: 'evt_missed', eventType: 'CALL_MISSED', providerReceiptRef: 'receipt_missed' })
  ]);
  assert.equal(lifecycle.ok, true);
  assert.equal(lifecycle.callState, 'MISSED');

  const blocked = planMissedCallRecovery({ lifecycle, consentState: 'UNKNOWN' });
  assert.equal(blocked.status, 'BLOCKED_CONSENT');
  assert.equal(blocked.externalEffectLedger.messages, 0);

  const prepared = planMissedCallRecovery({ lifecycle, consentState: 'SMS_ALLOWED' });
  assert.equal(prepared.status, 'RECOVERY_PREPARATION_ALLOWED');
  assert.equal(prepared.plannedAction.type, 'PREPARE_SMS_RECOVERY');
  assert.equal(prepared.plannedAction.executionAuthority, 'NONE');
  assert.equal(prepared.plannedAction.requiresConsequenceAuthorization, true);
  assert.equal(prepared.externalEffectLedger.messages, 0);
});

test('mixed call occurrences cannot be folded into one false lifecycle', () => {
  const result = foldVoiceCallLifecycle([
    event({ providerEventId: 'evt_1', callOccurrenceKey: 'call_1' }),
    event({ providerEventId: 'evt_2', callOccurrenceKey: 'call_2' })
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('mixed-call-occurrences'));
});

test('unconfigured voice adapter is structurally complete but cannot perform live effects', async () => {
  const adapter = createUnconfiguredVoiceProviderAdapter('livekit');
  assert.equal(validateVoiceProviderAdapter(adapter).ok, true);
  const send = await adapter.sendSms({ contactRef: 'contact_1' });
  assert.equal(send.ok, false);
  assert.equal(send.status, 'PROVIDER_AUTH_REQUIRED');
  assert.equal(send.externalEffectLedger.messages, 0);
  const live = await adapter.liveSupported();
  assert.equal(live.ok, false);
});

test('voice adapter validation fails when any consequence method is absent', () => {
  const adapter = createUnconfiguredVoiceProviderAdapter('example');
  delete adapter.transferCall;
  const result = validateVoiceProviderAdapter(adapter);
  assert.equal(result.ok, false);
  assert.ok(result.missing.includes('transferCall'));
});
