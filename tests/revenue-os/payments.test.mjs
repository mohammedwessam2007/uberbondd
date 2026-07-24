import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../revenue-os/src/store.mjs';
import {
  PAYMENT_STATES, assertValidPaymentTransition, PaymentError, requestPayment, markRequestedExternally,
  recordCustomerReported, validatePaymentEvidence, verifyPayment, applyOwnerException, settlePayment,
  refundPayment, disputePayment, createFakeReplayPaymentProvider, createManualBankEvidenceProvider,
  assertProviderContract
} from '../../revenue-os/src/payments.mjs';

async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ros-payments-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

async function seedInvoice(store, overrides = {}) {
  return store.add('invoiceHandoffs', { amountCents: 25000, status: 'draft', data: { organizationDomain: 'a.example.com' }, ...overrides });
}

/** Walks a freshly requested payment through the mandatory pre-verification states
 * (REQUEST_READY -> REQUESTED_EXTERNALLY -> CUSTOMER_REPORTED) so tests can focus on the
 * behavior under test rather than re-deriving this sequence every time. */
async function seedReportedPayment(store, invoiceOverrides = {}) {
  const invoice = await seedInvoice(store, invoiceOverrides);
  const payment = await requestPayment(store, invoice);
  await markRequestedExternally(store, payment.id);
  await recordCustomerReported(store, payment.id, {});
  return store.get('payments', payment.id);
}

test('PAYMENT_STATES has exactly the mission\'s 13 named states', () => {
  assert.equal(PAYMENT_STATES.length, 13);
  for (const s of ['NOT_REQUESTED', 'REQUEST_READY', 'REQUESTED_EXTERNALLY', 'CUSTOMER_REPORTED', 'PENDING_VERIFICATION', 'VERIFIED', 'SETTLED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED', 'FAILED', 'MISMATCH', 'BLOCKED']) {
    assert.ok(PAYMENT_STATES.includes(s), s);
  }
});

test('assertValidPaymentTransition rejects an illegal jump (e.g. NOT_REQUESTED straight to VERIFIED)', () => {
  assert.throws(() => assertValidPaymentTransition('NOT_REQUESTED', 'VERIFIED'), PaymentError);
  assert.throws(() => assertValidPaymentTransition('REFUNDED', 'VERIFIED'), PaymentError, 'REFUNDED is terminal');
  assertValidPaymentTransition('NOT_REQUESTED', 'REQUEST_READY');
});

test('assertProviderContract rejects a provider missing submitEvidence', () => {
  assert.throws(() => assertProviderContract({ name: 'x' }));
  assert.doesNotThrow(() => assertProviderContract(createFakeReplayPaymentProvider()));
});

// --- lifecycle ---

test('requestPayment -> markRequestedExternally -> recordCustomerReported walks the early states in order', async () => {
  const store = await harness();
  const invoice = await seedInvoice(store);
  const payment = await requestPayment(store, invoice);
  assert.equal(payment.status, 'REQUEST_READY');
  const requested = await markRequestedExternally(store, payment.id);
  assert.equal(requested.status, 'REQUESTED_EXTERNALLY');
  const reported = await recordCustomerReported(store, payment.id, { note: 'paid via paypal' });
  assert.equal(reported.status, 'CUSTOMER_REPORTED');
});

// --- evidence validation ---

test('validatePaymentEvidence catches payer/currency/amount/reference/timestamp problems independently', () => {
  const expected = { currency: 'USD', amountCents: 25000 };
  assert.deepEqual(validatePaymentEvidence({ payer: 'x', currency: 'USD', amountCents: 25000, reference: 'r1', timestamp: new Date().toISOString() }, expected).problems, []);
  assert.ok(validatePaymentEvidence({ currency: 'USD', amountCents: 25000, reference: 'r1', timestamp: new Date().toISOString() }, expected).problems.includes('payer-missing'));
  assert.ok(validatePaymentEvidence({ payer: 'x', currency: 'EUR', amountCents: 25000, reference: 'r1', timestamp: new Date().toISOString() }, expected).problems.includes('currency-mismatch'));
  assert.ok(validatePaymentEvidence({ payer: 'x', currency: 'USD', amountCents: 100, reference: 'r1', timestamp: new Date().toISOString() }, expected).problems.includes('amount-mismatch'));
  assert.ok(validatePaymentEvidence({ payer: 'x', currency: 'USD', amountCents: 25000, timestamp: new Date().toISOString() }, expected).problems.includes('reference-missing'));
  assert.ok(validatePaymentEvidence({ payer: 'x', currency: 'USD', amountCents: 25000, reference: 'r1', timestamp: 'not-a-date' }, expected).problems.includes('timestamp-missing-or-invalid'));
});

// --- verification: mismatch, verified, race/duplicate ---

test('verifyPayment routes a mismatched amount to MISMATCH, never VERIFIED', async () => {
  const store = await harness();
  const payment = await seedReportedPayment(store);
  const provider = createFakeReplayPaymentProvider();
  const result = await verifyPayment(store, payment.id, provider, { reference: 'txn-1', amountCents: 100, currency: 'USD', payer: 'x', timestamp: new Date().toISOString() });
  assert.equal(result.status, 'MISMATCH');
});

test('verifyPayment accepts matching evidence and moves the payment to VERIFIED with the evidence attached', async () => {
  const store = await harness();
  const payment = await seedReportedPayment(store);
  const provider = createFakeReplayPaymentProvider();
  const result = await verifyPayment(store, payment.id, provider, { reference: 'txn-1', amountCents: 25000, currency: 'USD', payer: 'x', timestamp: new Date().toISOString() });
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.data.evidence.reference, 'txn-1');
  assert.ok(result.verifiedAt);
});

test('verifyPayment refuses reused evidence: a second payment presenting the same reference/amount/timestamp is BLOCKED, not double-verified', async () => {
  const store = await harness();
  const provider = createFakeReplayPaymentProvider();
  const timestamp = new Date().toISOString();
  const evidence = { reference: 'txn-shared', amountCents: 25000, currency: 'USD', payer: 'x', timestamp };

  const payment1 = await seedReportedPayment(store, { data: { organizationDomain: 'a.example.com' } });
  const result1 = await verifyPayment(store, payment1.id, provider, evidence);
  assert.equal(result1.status, 'VERIFIED');

  const payment2 = await seedReportedPayment(store, { data: { organizationDomain: 'b.example.com' } });
  const result2 = await verifyPayment(store, payment2.id, provider, evidence);
  assert.equal(result2.status, 'BLOCKED');
});

test('payment race: two concurrent verifyPayment calls presenting the same evidence never both end up VERIFIED', async () => {
  const store = await harness();
  const provider = createFakeReplayPaymentProvider();
  const timestamp = new Date().toISOString();
  const evidence = { reference: 'txn-race', amountCents: 25000, currency: 'USD', payer: 'x', timestamp };

  const paymentA = await seedReportedPayment(store, { data: { organizationDomain: 'race-a.example.com' } });
  const paymentB = await seedReportedPayment(store, { data: { organizationDomain: 'race-b.example.com' } });

  const [resultA, resultB] = await Promise.all([
    verifyPayment(store, paymentA.id, provider, evidence),
    verifyPayment(store, paymentB.id, provider, evidence)
  ]);

  const statuses = [resultA.status, resultB.status].sort();
  assert.deepEqual(statuses, ['BLOCKED', 'VERIFIED'], 'exactly one of the two concurrent claims on the same evidence must win');
  const verifiedCount = (await store.list('payments')).filter(p => p.status === 'VERIFIED').length;
  assert.equal(verifiedCount, 1, 'the store must never end up with two payments VERIFIED on the same evidence');
});

// --- owner exception ---

test('applyOwnerException requires approvedBy and reason, and always stamps a visible warning', async () => {
  const store = await harness();
  const invoice = await seedInvoice(store);
  const payment = await requestPayment(store, invoice);
  await assert.rejects(() => applyOwnerException(store, payment.id, { reason: 'x' }), PaymentError);
  await assert.rejects(() => applyOwnerException(store, payment.id, { approvedBy: 'owner' }), PaymentError);
  const excepted = await applyOwnerException(store, payment.id, { approvedBy: 'owner', reason: 'phone-confirmed wire' });
  assert.equal(excepted.status, 'VERIFIED');
  assert.match(excepted.data.warning, /OWNER EXCEPTION/);
  assert.equal(excepted.data.ownerException.approvedBy, 'owner');
});

// --- settle / refund / dispute ---

test('settlePayment/refundPayment/disputePayment enforce the transition table and record their own evidence', async () => {
  const store = await harness();
  const payment = await seedReportedPayment(store);
  const provider = createFakeReplayPaymentProvider();
  const verified = await verifyPayment(store, payment.id, provider, { reference: 'txn-2', amountCents: 25000, currency: 'USD', payer: 'x', timestamp: new Date().toISOString() });
  const settled = await settlePayment(store, verified.id);
  assert.equal(settled.status, 'SETTLED');
  const disputed = await disputePayment(store, settled.id, { reason: 'client claims non-delivery' });
  assert.equal(disputed.status, 'DISPUTED');
  assert.equal(disputed.data.dispute.reason, 'client claims non-delivery');
  const refunded = await refundPayment(store, disputed.id, { amountCents: 25000, reason: 'goodwill' });
  assert.equal(refunded.status, 'REFUNDED');
});

test('refundPayment produces PARTIALLY_REFUNDED for a partial amount', async () => {
  const store = await harness();
  const payment = await seedReportedPayment(store);
  const provider = createFakeReplayPaymentProvider();
  const verified = await verifyPayment(store, payment.id, provider, { reference: 'txn-3', amountCents: 25000, currency: 'USD', payer: 'x', timestamp: new Date().toISOString() });
  const partial = await refundPayment(store, verified.id, { amountCents: 10000, reason: 'partial rollback' });
  assert.equal(partial.status, 'PARTIALLY_REFUNDED');
});

// --- manual evidence providers never touch a credential ---

test('manual evidence providers accept only reference/amount/currency/payer/timestamp fields, never a password or token', async () => {
  const provider = createManualBankEvidenceProvider();
  const result = await provider.submitEvidence({ reference: 'wire-123', amountCents: 25000, currency: 'USD', payer: 'Acme LLC', timestamp: new Date().toISOString() });
  assert.equal(result.ok, true);
  assert.equal(Object.keys(result).some(k => /password|secret|token|api[_-]?key/i.test(k)), false);
  await assert.rejects(() => provider.submitEvidence({ amountCents: 100 }), PaymentError);
});
