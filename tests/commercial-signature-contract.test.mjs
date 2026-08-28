import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIGNATURE_PROVIDER_CAPABILITIES,
  compileSignatureCommand,
  createUnconfiguredSignatureProviderAdapter,
  foldSignatureEvents,
  normalizeSignatureProviderEvent,
  validateSignatureProviderAdapter
} from '../src/commercial-signature-contract.mjs';

const observedAt = '2026-08-28T15:00:00.000Z';
const receivedAt = '2026-08-28T15:00:01.000Z';
function command(overrides = {}) {
  return {
    operation: 'SEND_REQUEST', occurrenceKey: 'signature:deal:1:v1', documentRef: 'document:proposal:1',
    documentKind: 'PROPOSAL', signerRefs: ['signer:buyer:1'], authorityReceiptRef: 'authority:1',
    idempotencyKey: 'signature:deal:1:v1', communicationPolicyRef: 'comm-policy:1', suppressionCheckRef: 'suppression:1',
    ...overrides
  };
}
function event(overrides = {}) {
  return {
    provider: 'signature-provider', providerEventId: 'evt-1', commandId: 'sig_cmd_1', requestRef: 'request:1',
    eventType: 'REQUEST_SENT', providerReceiptRef: 'provider-receipt:1', observedAt, receivedAt, ...overrides
  };
}

test('signature request command is reference-only and cannot sign for a user', () => {
  const result = compileSignatureCommand(command());
  assert.equal(result.ok, true);
  assert.equal(result.command.signerExecutionAuthority, 'NONE');
  assert.equal(result.command.legalAuthorityInference, 'PROHIBITED');
  assert.equal(result.externalEffectLedger.messages, 0);
});

test('send/reminder effects require authority, idempotency, communication policy and suppression evidence', () => {
  for (const field of ['authorityReceiptRef', 'idempotencyKey', 'communicationPolicyRef', 'suppressionCheckRef']) {
    const result = compileSignatureCommand(command({ [field]: null }));
    assert.equal(result.ok, false, field);
  }
});

test('local preparation does not require send authority', () => {
  const result = compileSignatureCommand(command({ operation: 'PREPARE_REQUEST', authorityReceiptRef: null, idempotencyKey: null, communicationPolicyRef: null, suppressionCheckRef: null }));
  assert.equal(result.ok, true);
  assert.equal(result.status, 'SIGNATURE_REQUEST_PREPARED_LOCALLY');
});

test('raw signer PII, document bytes, signature material and secrets are prohibited', () => {
  const result = compileSignatureCommand(command({ email: 'buyer@example.com', documentBody: 'contract text', signatureData: 'scribble', apiToken: 'opaque-secret-field' }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('raw-signature-document-pii-or-secret-prohibited'));
});

test('signed truth requires provider receipt, signer evidence and signed artifact refs', () => {
  for (const field of ['providerReceiptRef', 'signerRef', 'signatureEvidenceRef', 'signedArtifactRef']) {
    const base = event({ eventType: 'SIGNED', signerRef: 'signer:1', signatureEvidenceRef: 'signature-evidence:1', signedArtifactRef: 'artifact:signed:1' });
    const result = normalizeSignatureProviderEvent({ ...base, [field]: null });
    assert.equal(result.ok, false, field);
  }
  const result = normalizeSignatureProviderEvent(event({ eventType: 'SIGNED', signerRef: 'signer:1', signatureEvidenceRef: 'signature-evidence:1', signedArtifactRef: 'artifact:signed:1' }));
  assert.equal(result.ok, true);
});

test('signed event does not manufacture payment, delivery acceptance, signer authority, or legal conclusion', () => {
  const result = normalizeSignatureProviderEvent(event({ eventType: 'SIGNED', signerRef: 'signer:1', signatureEvidenceRef: 'signature-evidence:1', signedArtifactRef: 'artifact:signed:1' }));
  assert.equal(result.event.paymentTruthAuthority, 'NONE');
  assert.equal(result.event.deliveryAcceptanceTruthAuthority, 'NONE');
  assert.equal(result.event.signerAuthorityTruthAuthority, 'NONE');
  assert.equal(result.event.legalEffect, 'UNDETERMINED_REQUIRES_SEPARATE_POLICY_AND_JURISDICTION');
});

test('provider event replay is idempotent and conflicting provider identity fails uncertain', () => {
  const exact = event();
  const replay = foldSignatureEvents([exact, exact]);
  assert.equal(replay.ok, true);
  assert.equal(replay.duplicateCount, 1);
  const conflict = foldSignatureEvents([exact, { ...exact, eventType: 'PROVIDER_REJECTED' }]);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.status, 'UNCERTAIN_EXTERNAL_STATE');
});

test('signed and declined truth for the same request fails uncertain', () => {
  const signed = event({ providerEventId: 'signed', eventType: 'SIGNED', signerRef: 'signer:1', signatureEvidenceRef: 'sig:1', signedArtifactRef: 'artifact:1' });
  const declined = event({ providerEventId: 'declined', eventType: 'DECLINED' });
  const result = foldSignatureEvents([signed, declined]);
  assert.equal(result.ok, false);
  assert.equal(result.status, 'UNCERTAIN_EXTERNAL_STATE');
});

test('signed lifecycle remains terminal without becoming commercial truth', () => {
  const signed = event({ eventType: 'SIGNED', signerRef: 'signer:1', signatureEvidenceRef: 'sig:1', signedArtifactRef: 'artifact:1' });
  const result = foldSignatureEvents([signed]);
  assert.equal(result.ok, true);
  assert.equal(result.state, 'SIGNED_PROVIDER_EVIDENCE');
  assert.equal(result.mayCountAsPayment, false);
  assert.equal(result.mayCountAsDeliveryAcceptance, false);
  assert.equal(result.mayProveSignerAuthority, false);
  assert.equal(result.retryDisposition, 'ALREADY_TERMINAL');
});

test('future-dated signature event fails closed', () => {
  const result = normalizeSignatureProviderEvent(event({ observedAt: '2026-08-29T00:00:00.000Z' }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('future-dated-signature-event'));
});

test('mixed request histories fail closed', () => {
  const result = foldSignatureEvents([event(), event({ providerEventId: 'evt-2', requestRef: 'request:2' })]);
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('mixed-signature-request-events'));
});

test('unconfigured signature adapter is structurally complete and performs no I/O', async () => {
  const adapter = createUnconfiguredSignatureProviderAdapter('documenso');
  assert.equal(validateSignatureProviderAdapter(adapter).ok, true);
  assert.equal(SIGNATURE_PROVIDER_CAPABILITIES.every(capability => typeof adapter[capability] === 'function'), true);
  const result = await adapter.sendRequest({ requestRef: 'request:1' });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'SIGNATURE_PROVIDER_NOT_CONFIGURED');
  assert.equal(result.externalEffectLedger.providerCalls, 0);
});
