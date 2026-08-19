import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProviderAcceptedReceipt,
  buildProviderUncertainReceipt,
  buildReceiptFromDurableReservation,
  verifyExecutionReceiptShadow,
  recordExecutionReceiptShadow,
  projectOutboundExecutionReceipts
} from '../src/omnia-v9/execution-receipt-shadow.mjs';

const shadowContext = {
  schemaVersion: 'omnia.v9.outbound-final-shadow.p4',
  observedAt: '2026-08-08T03:00:00.000Z',
  boundary: 'AFTER_DURABLE_DISPATCH_RESERVATION_BEFORE_GMAIL',
  authoritative: false,
  reservation: {
    id: 'res_1', idempotencyKey: 'send:p1:0', inbox: 'slot1',
    recipientEmail: 'buyer@example.com', kind: 'initial', followup: 0
  },
  action: {
    operation: 'OUTBOUND_EMAIL_SEND', effectClass: 'EXTERNAL_CONSEQUENTIAL',
    prospectId: 'p1', campaignId: 'c1', senderEmail: 'seller@example.com',
    recipientEmail: 'buyer@example.com', subjectSha256: 's'.repeat(64), bodySha256: 'b'.repeat(64)
  },
  legacySignals: {}
};

const shadowObservation = {
  schemaVersion: 'omnia.v9.outbound-final-shadow-observation.p4',
  authoritative: false,
  enforced: false,
  boundary: shadowContext.boundary,
  reservationId: 'res_1',
  contextDigest: 'c'.repeat(64),
  observedAt: shadowContext.observedAt,
  status: 'OBSERVED',
  decision: 'REVIEW',
  reasons: ['shadow-only']
};

const sentReservation = {
  id: 'res_1', prospectId: 'p1', campaignId: 'c1', inbox: 'slot1',
  recipientEmail: 'buyer@example.com', kind: 'initial', followup: 0,
  idempotencyKey: 'send:p1:0', status: 'sent', sentAt: '2026-08-08T03:00:05.000Z',
  gmailId: 'gmail_1', threadId: 'thread_1', rfcMessageId: '<m1@example.com>'
};

const uncertainReservation = {
  ...sentReservation,
  id: 'res_2',
  idempotencyKey: 'send:p2:0',
  prospectId: 'p2',
  status: 'uncertain',
  gmailId: '',
  threadId: '',
  rfcMessageId: '',
  error: 'socket closed before provider response',
  updatedAt: '2026-08-08T03:00:06.000Z'
};

function fakeStore({ reservations = [], logs = [], failLog = false } = {}) {
  const audit = structuredClone(logs);
  return {
    audit,
    async list(key) {
      if (key === 'outboundReservations') return structuredClone(reservations);
      if (key === 'auditLog') return structuredClone(audit);
      return [];
    },
    async log(type, detail) {
      if (failLog) throw new Error('audit unavailable');
      audit.push({ id: `log_${audit.length + 1}`, type, detail: structuredClone(detail), createdAt: '2026-08-08T03:00:10.000Z' });
    }
  };
}

test('provider accepted receipt binds provider acceptance without claiming delivery', () => {
  const receipt = buildProviderAcceptedReceipt({
    shadowContext,
    shadowObservation,
    providerResult: { data: { id: 'gmail_1', threadId: 'thread_1' } },
    rfcMessageId: '<m1@example.com>',
    occurredAt: '2026-08-08T03:00:05.000Z'
  });
  assert.equal(receipt.outcome, 'PROVIDER_ACCEPTED');
  assert.equal(receipt.provider.apiAccepted, true);
  assert.equal(receipt.deliveryClaim, 'NOT_ESTABLISHED');
  assert.equal(verifyExecutionReceiptShadow(receipt).ok, true);
});

test('uncertain provider result remains uncertain', () => {
  const receipt = buildProviderUncertainReceipt({
    shadowContext,
    shadowObservation,
    error: new Error('socket closed'),
    occurredAt: '2026-08-08T03:00:05.000Z'
  });
  assert.equal(receipt.outcome, 'PROVIDER_RESULT_UNCERTAIN');
  assert.equal(receipt.provider.apiAccepted, null);
  assert.equal(receipt.deliveryClaim, 'UNKNOWN');
  assert.equal(verifyExecutionReceiptShadow(receipt).ok, true);
});

test('tampering invalidates receipt digest', () => {
  const receipt = buildReceiptFromDurableReservation({
    reservation: sentReservation,
    shadowObservation,
    occurredAt: sentReservation.sentAt
  });
  receipt.provider.gmailId = 'forged';
  assert.equal(verifyExecutionReceiptShadow(receipt).ok, false);
  assert.equal(verifyExecutionReceiptShadow(receipt).reason, 'receipt-digest-mismatch');
});

test('accepted receipt cannot overclaim delivery', () => {
  const receipt = buildReceiptFromDurableReservation({
    reservation: sentReservation,
    shadowObservation,
    occurredAt: sentReservation.sentAt
  });
  const { receiptDigest, ...unsigned } = receipt;
  const overclaim = { ...unsigned, deliveryClaim: 'DELIVERED', receiptDigest };
  assert.equal(verifyExecutionReceiptShadow(overclaim).ok, false);
});

test('durable sent reservation requires matching pre-effect observation', () => {
  assert.throws(
    () => buildReceiptFromDurableReservation({ reservation: sentReservation, shadowObservation: null, occurredAt: sentReservation.sentAt }),
    /matching pre-effect shadow observation required/
  );
});

test('durable sent reservation requires provider gmail id', () => {
  assert.throws(
    () => buildReceiptFromDurableReservation({
      reservation: { ...sentReservation, gmailId: '' },
      shadowObservation,
      occurredAt: sentReservation.sentAt
    }),
    /sent reservation missing gmail id/
  );
});

test('recording invalid receipt fails closed', async () => {
  const store = fakeStore();
  const result = await recordExecutionReceiptShadow({ store, receipt: { outcome: 'PROVIDER_ACCEPTED' } });
  assert.equal(result.recorded, false);
});

test('audit logging failure does not convert receipt into recorded state', async () => {
  const store = fakeStore({ failLog: true });
  const receipt = buildReceiptFromDurableReservation({ reservation: sentReservation, shadowObservation, occurredAt: sentReservation.sentAt });
  const result = await recordExecutionReceiptShadow({ store, receipt });
  assert.equal(result.recorded, false);
  assert.equal(result.reason, 'audit-log-failed');
});

test('projector emits accepted receipt from sent durable state', async () => {
  const store = fakeStore({
    reservations: [sentReservation],
    logs: [{ id: 'l1', type: 'omnia_v9_outbound_final_shadow', detail: shadowObservation, createdAt: '2026-08-08T03:00:00.000Z' }]
  });
  const summary = await projectOutboundExecutionReceipts({ store, now: () => '2026-08-08T03:00:10.000Z' });
  assert.equal(summary.projected, 1);
  const receiptLog = store.audit.find(item => item.type === 'omnia_v9_outbound_execution_receipt_shadow');
  assert.equal(receiptLog.detail.outcome, 'PROVIDER_ACCEPTED');
  assert.equal(receiptLog.detail.deliveryClaim, 'NOT_ESTABLISHED');
});

test('projector emits uncertain receipt without laundering success', async () => {
  const obs = { ...shadowObservation, reservationId: 'res_2', contextDigest: 'd'.repeat(64) };
  const store = fakeStore({
    reservations: [uncertainReservation],
    logs: [{ id: 'l1', type: 'omnia_v9_outbound_final_shadow', detail: obs, createdAt: '2026-08-08T03:00:00.000Z' }]
  });
  const summary = await projectOutboundExecutionReceipts({ store });
  assert.equal(summary.projected, 1);
  const receiptLog = store.audit.find(item => item.type === 'omnia_v9_outbound_execution_receipt_shadow');
  assert.equal(receiptLog.detail.outcome, 'PROVIDER_RESULT_UNCERTAIN');
  assert.equal(receiptLog.detail.provider.apiAccepted, null);
});

test('projector marks missing pre-effect observation incomplete', async () => {
  const store = fakeStore({ reservations: [sentReservation], logs: [] });
  const summary = await projectOutboundExecutionReceipts({ store });
  assert.equal(summary.projected, 0);
  assert.deepEqual(summary.incomplete, [{ reservationId: 'res_1', reason: 'missing-pre-effect-shadow-observation' }]);
});

test('projector skips an already receipted reservation', async () => {
  const existingReceipt = buildReceiptFromDurableReservation({ reservation: sentReservation, shadowObservation, occurredAt: sentReservation.sentAt });
  const store = fakeStore({
    reservations: [sentReservation],
    logs: [
      { id: 'l1', type: 'omnia_v9_outbound_final_shadow', detail: shadowObservation, createdAt: '2026-08-08T03:00:00.000Z' },
      { id: 'l2', type: 'omnia_v9_outbound_execution_receipt_shadow', detail: existingReceipt, createdAt: '2026-08-08T03:00:06.000Z' }
    ]
  });
  const summary = await projectOutboundExecutionReceipts({ store });
  assert.equal(summary.projected, 0);
  assert.equal(summary.skippedExisting, 1);
});
