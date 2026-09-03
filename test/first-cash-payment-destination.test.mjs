import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileFirstCashPaymentDestination,
  FIRST_CASH_PAYPAL_ME_URL,
  paymentDestinationCanUnlockFulfillment
} from '../src/first-cash-payment-destination.mjs';

test('owner-supplied PayPal.me is compiled only as a customer-facing destination', () => {
  const result = compileFirstCashPaymentDestination();
  assert.equal(result.ok, true);
  assert.equal(result.destination.url, FIRST_CASH_PAYPAL_ME_URL);
  assert.equal(result.destination.amountCents, 45000);
  assert.equal(result.destination.currency, 'USD');
  assert.equal(result.destination.offerSku, 'lead-path-revenue-leak-evidence-sprint-usd-450');
  assert.equal(result.destination.truthBoundary, 'PAYMENT_DESTINATION_ONLY_NOT_PAYMENT_EVIDENCE');
  assert.equal(result.clearedPaymentTruth, false);
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('payment-link presence can never unlock fulfilment', () => {
  assert.equal(paymentDestinationCanUnlockFulfillment(), false);
});

test('destination explicitly denies commercial proof classes', () => {
  const result = compileFirstCashPaymentDestination();
  for (const denied of [
    'payment occurrence',
    'payment cleared status',
    'payment retained status',
    'absence of refund/reversal/dispute',
    'merchant-or-KYC-readiness',
    'customer acceptance',
    'customer retention'
  ]) assert.ok(result.destination.doesNotProve.includes(denied));
});
