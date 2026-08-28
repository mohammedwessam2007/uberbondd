import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMUNICATION_PROVIDER_CAPABILITIES,
  compileCommunicationCommand,
  createUnconfiguredCommunicationProviderAdapter,
  dedupeCommunicationEvents,
  deriveCommunicationSafetyState,
  foldCommunicationCommandEvents,
  normalizeCommunicationEvent,
  planCommunicationRetry,
  validateCommunicationProviderAdapter
} from '../src/omnichannel-communication-contract.mjs';

const observedAt = '2026-08-28T15:00:00.000Z';
const receivedAt = '2026-08-28T15:00:01.000Z';

function smsCommand(overrides = {}) {
  return {
    channel: 'SMS', purpose: 'APPOINTMENT', occurrenceKey: 'appointment:001:reminder:1',
    conversationRef: 'conversation:001', recipientRef: 'recipient:001', contentRef: 'content:appointment-reminder:v1',
    authorityReceiptRef: 'authority:001', idempotencyKey: 'comm:appointment:001:1',
    communicationPolicyRef: 'comm-policy:service:1', suppressionCheckRef: 'suppression-check:001',
    consentEvidenceRef: 'consent:sms:001', ...overrides
  };
}
function event(overrides = {}) {
  return {
    provider: 'transport-example', providerEventId: 'evt-001', commandId: 'comm_cmd_001',
    conversationRef: 'conversation:001', channel: 'SMS', eventType: 'SENT',
    providerReceiptRef: 'provider-receipt:001', observedAt, receivedAt, ...overrides
  };
}

test('person-targeted command is reference-only and grants no send authority', () => {
  const result = compileCommunicationCommand(smsCommand());
  assert.equal(result.ok, true);
  assert.equal(result.command.executionAuthority, 'NONE');
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffectLedger.messages, 0);
  assert.match(result.command.commandId, /^comm_cmd_/);
});

test('SMS requires suppression, consent, authority and idempotency evidence', () => {
  for (const field of ['suppressionCheckRef', 'consentEvidenceRef', 'authorityReceiptRef', 'idempotencyKey']) {
    const result = compileCommunicationCommand(smsCommand({ [field]: null }));
    assert.equal(result.ok, false, field);
  }
});

test('transactional email still requires suppression but not SMS-style consent evidence', () => {
  const allowed = compileCommunicationCommand(smsCommand({
    channel: 'EMAIL_TRANSACTIONAL', purpose: 'TRANSACTIONAL', consentEvidenceRef: null
  }));
  assert.equal(allowed.ok, true);
  const blocked = compileCommunicationCommand(smsCommand({
    channel: 'EMAIL_TRANSACTIONAL', purpose: 'TRANSACTIONAL', consentEvidenceRef: null, suppressionCheckRef: null
  }));
  assert.equal(blocked.ok, false);
  assert.ok(blocked.reasonCodes.includes('suppression-check-ref-required-for-person-targeted-channel'));
});

test('cold outreach cannot bypass the canonical outreach engine', () => {
  const result = compileCommunicationCommand(smsCommand({ outreachClass: 'COLD_OUTREACH' }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('cold-outreach-must-use-canonical-outreach-engine'));
});

test('public social distribution requires audience and platform policy but no person target', () => {
  const base = {
    channel: 'SOCIAL_PUBLIC', purpose: 'PUBLIC_DISTRIBUTION', occurrenceKey: 'social:001',
    contentRef: 'content:social:001', authorityReceiptRef: 'authority:social:001', idempotencyKey: 'social:001',
    communicationPolicyRef: 'policy:social:001', audienceRef: 'audience:brand-followers', platformPolicyRef: 'platform-policy:001'
  };
  assert.equal(compileCommunicationCommand(base).ok, true);
  assert.equal(compileCommunicationCommand({ ...base, audienceRef: null }).ok, false);
  assert.equal(compileCommunicationCommand({ ...base, platformPolicyRef: null }).ok, false);
});

test('raw destinations, raw content and secrets are prohibited while opaque refs remain legal', () => {
  const allowed = compileCommunicationCommand(smsCommand());
  assert.equal(allowed.ok, true);
  const blocked = compileCommunicationCommand(smsCommand({
    phone: '+15551234567', messageBody: 'raw body', authToken: 'raw-token-shaped-field'
  }));
  assert.equal(blocked.ok, false);
  assert.ok(blocked.reasonCodes.includes('raw-communication-pii-content-or-secret-prohibited'));
  assert.ok(blocked.prohibitedKeys.includes('phone'));
  assert.ok(blocked.prohibitedKeys.includes('messageBody'));
  assert.ok(blocked.prohibitedKeys.includes('authToken'));
});

test('opt-out provider signal is representable before canonical suppression is applied', () => {
  const observed = normalizeCommunicationEvent(event({
    commandId: null, providerEventId: 'optout-observed', eventType: 'OPT_OUT_RECEIVED'
  }));
  assert.equal(observed.ok, true);
  assert.equal(observed.suppressionTruthAuthority, 'PROVIDER_SIGNAL_ONLY_NOT_APPLIED');
  assert.equal(observed.event.canonicalSuppressionReceiptRef, null);
});

test('canonical opt-out-applied truth requires the canonical suppression receipt', () => {
  const blocked = normalizeCommunicationEvent(event({
    commandId: null, providerEventId: 'optout-applied-1', eventType: 'OPT_OUT_APPLIED'
  }));
  assert.equal(blocked.ok, false);
  assert.ok(blocked.reasonCodes.includes('canonical-suppression-receipt-ref-required-for-opt-out-applied-truth'));
  const allowed = normalizeCommunicationEvent(event({
    commandId: null, providerEventId: 'optout-applied-2', eventType: 'OPT_OUT_APPLIED', canonicalSuppressionReceiptRef: 'suppression-receipt:001'
  }));
  assert.equal(allowed.ok, true);
  assert.equal(allowed.suppressionTruthAuthority, 'CANONICAL_SUPPRESSION_RECEIPT_REFERENCE_ONLY');
});

test('received content requires provider truth plus a bounded inbound evidence reference', () => {
  const blocked = normalizeCommunicationEvent(event({
    commandId: null, providerEventId: 'inbound-1', eventType: 'RECEIVED'
  }));
  assert.equal(blocked.ok, false);
  assert.ok(blocked.reasonCodes.includes('inbound-evidence-ref-required-for-received-content'));
  const allowed = normalizeCommunicationEvent(event({
    commandId: null, providerEventId: 'inbound-2', eventType: 'RECEIVED', inboundEvidenceRef: 'inbound-evidence:002'
  }));
  assert.equal(allowed.ok, true);
});

test('provider receipt is mandatory for communication truth', () => {
  const result = normalizeCommunicationEvent(event({ providerReceiptRef: null }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('provider-receipt-ref-required-for-communication-truth'));
});

test('provider event identity is replay-idempotent and conflicting duplicate identity fails uncertain', () => {
  const exact = event();
  const replay = dedupeCommunicationEvents([exact, exact]);
  assert.equal(replay.ok, true);
  assert.equal(replay.events.length, 1);
  assert.equal(replay.duplicates.length, 1);
  const conflict = dedupeCommunicationEvents([exact, { ...exact, eventType: 'REJECTED' }]);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.status, 'UNCERTAIN_EXTERNAL_STATE');
});

test('any success claim plus provider rejection for one command fails uncertain', () => {
  for (const success of ['SENT', 'DELIVERED', 'PUBLISHED']) {
    const channel = success === 'PUBLISHED' ? 'SOCIAL_PUBLIC' : 'SMS';
    const result = foldCommunicationCommandEvents([
      event({ providerEventId: `${success}-1`, eventType: success, channel }),
      event({ providerEventId: `${success}-2`, eventType: 'REJECTED', channel })
    ]);
    assert.equal(result.ok, false, success);
    assert.equal(result.status, 'UNCERTAIN_EXTERNAL_STATE', success);
  }
});

test('command lifecycle cannot silently absorb unrelated inbound conversation events', () => {
  const result = foldCommunicationCommandEvents([
    event({ providerEventId: 'sent-1', eventType: 'SENT' }),
    event({ commandId: null, providerEventId: 'received-1', eventType: 'RECEIVED', inboundEvidenceRef: 'inbound:1' })
  ]);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('mixed-command-and-conversation-events'));
});

test('opt-out and complaint signals block future person-targeted outbound before canonical follow-up', () => {
  for (const eventType of ['OPT_OUT_RECEIVED', 'COMPLAINT_RECEIVED']) {
    const safety = deriveCommunicationSafetyState([
      event({ commandId: null, providerEventId: `safety-${eventType}`, eventType })
    ]);
    assert.equal(safety.ok, true);
    assert.equal(safety.outboundDisposition, 'BLOCK_FUTURE_PERSON_TARGETED_OUTBOUND');
  }
});

test('safety signal dominates a provider rejection that would otherwise permit reevaluation', () => {
  const lifecycle = foldCommunicationCommandEvents([event({ eventType: 'REJECTED' })]);
  assert.equal(lifecycle.retryDisposition, 'SAFE_TO_REEVALUATE');
  const safety = deriveCommunicationSafetyState([
    event({ commandId: null, providerEventId: 'optout-x', eventType: 'OPT_OUT_RECEIVED' })
  ]);
  const retry = planCommunicationRetry({ command: { commandId: lifecycle.commandId }, lifecycle, safetyState: safety });
  assert.equal(retry.status, 'RETRY_BLOCKED_SAFETY_SIGNAL');
  assert.equal(retry.executable, false);
});

test('successful provider send is idempotently terminal and does not blindly retry', () => {
  const lifecycle = foldCommunicationCommandEvents([event({ eventType: 'SENT' })]);
  assert.equal(lifecycle.ok, true);
  assert.equal(lifecycle.retryDisposition, 'ALREADY_COMPLETED');
  const retry = planCommunicationRetry({ command: { commandId: lifecycle.commandId }, lifecycle });
  assert.equal(retry.status, 'ALREADY_COMPLETED');
  assert.equal(retry.executable, false);
});

test('future-dated provider events fail closed', () => {
  const result = normalizeCommunicationEvent(event({ observedAt: '2026-08-29T00:00:00.000Z', receivedAt }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('future-dated-communication-event'));
});

test('unconfigured provider adapter is structurally complete and performs no I/O', async () => {
  const adapter = createUnconfiguredCommunicationProviderAdapter('chatwoot');
  assert.equal(validateCommunicationProviderAdapter(adapter).ok, true);
  assert.equal(COMMUNICATION_PROVIDER_CAPABILITIES.every(capability => typeof adapter[capability] === 'function'), true);
  const result = await adapter.send({ contentRef: 'content:1' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'COMMUNICATION_ADAPTER_NOT_CONFIGURED');
  assert.equal(result.externalEffectLedger.messages, 0);
});
