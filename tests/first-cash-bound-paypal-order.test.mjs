import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CANONICAL_FIRST_CASH_PAYMENT_METHOD,
  CANONICAL_PAYMENT_TRUTH_BOUNDARY,
  LEGACY_FIRST_CASH_PAYMENT_LINK,
  LEGACY_FIRST_CASH_PAYMENT_LINK_CLASSIFICATION,
  compileFirstCashCanaryPacket
} from '../src/first-cash-canary-packet.mjs';

const AT = new Date('2026-09-02T00:00:00.000Z');

const liveReadyRail = {
  ok: true,
  provider: 'paypal',
  state: 'LIVE_READY',
  implementedRails: ['lemon_squeezy', 'paypal'],
  reasonCodes: ['paypal-live-provider-origin-evidence-complete'],
  businessEffectAuthority: 'NONE',
  commercialTruth: { realCustomers: 0, clearedRevenueCents: 0, acceptedPaidDeliveries: 0, retainedCustomers: 0 }
};

test('canonical first-cash packet uses one bound PayPal order, not a reusable static payment link', () => {
  const packet = compileFirstCashCanaryPacket({ paymentRail: liveReadyRail, date: AT });
  assert.equal(packet.paymentMethod, CANONICAL_FIRST_CASH_PAYMENT_METHOD);
  assert.equal(packet.paymentMethod, 'PAYPAL_BOUND_PROVIDER_ORDER');
  assert.equal(packet.paymentLink, null);
  assert.equal(packet.paymentPreparation.reusableStaticLink, false);
  assert.equal(packet.paymentPreparation.approvalUrlPrecomputed, false);
  assert.equal(packet.paymentPreparation.requiresAuthenticatedLeadBinding, true);
  assert.equal(packet.paymentPreparation.orderEndpoint, 'POST /api/payments/paypal-order');
  assert.equal(packet.paymentPreparation.captureEndpoint, 'GET /api/payments/paypal-capture');
  assert.equal(packet.paymentPreparation.webhookEndpoint, 'POST /api/webhooks/paypal');
  assert.equal(packet.paymentPreparation.fulfillmentBridge, 'src/first-cash-fulfillment-runtime.mjs');
});

test('the historical PayPal.me destination is preserved as noncanonical and cannot satisfy payment or fulfilment', () => {
  const packet = compileFirstCashCanaryPacket({ paymentRail: liveReadyRail, paymentLink: LEGACY_FIRST_CASH_PAYMENT_LINK, date: AT });
  assert.equal(packet.legacyPaymentDestination.link, LEGACY_FIRST_CASH_PAYMENT_LINK);
  assert.equal(packet.legacyPaymentDestination.classification, LEGACY_FIRST_CASH_PAYMENT_LINK_CLASSIFICATION);
  assert.equal(packet.legacyPaymentDestination.canonical, false);
  assert.equal(packet.legacyPaymentDestination.maySatisfyPaymentRailGate, false);
  assert.equal(packet.legacyPaymentDestination.mayUnlockFulfillment, false);
  assert.equal(packet.paymentLink, null);
});

test('WHAT_PAYMENT_LINK points to runtime order creation rather than a precomputed link', () => {
  const packet = compileFirstCashCanaryPacket({ paymentRail: liveReadyRail, date: AT });
  const question = packet.questions.find(row => row.question === 'WHAT_PAYMENT_LINK');
  assert.equal(question.status, 'PREPARED');
  assert.equal(question.evidenceClass, 'INTERNAL_CODE');
  assert.equal(question.module, 'api/payments/paypal-order.mjs');
  assert.match(question.answer, /unique PayPal approval URL/i);
  assert.match(question.answer, /one authenticated lead\/prospect\/SKU binding/i);
});

test('HOW_RECONCILED names the provider-origin witness path and never promotes capture alone', () => {
  const packet = compileFirstCashCanaryPacket({ paymentRail: liveReadyRail, date: AT });
  const question = packet.questions.find(row => row.question === 'HOW_RECONCILED');
  assert.equal(question.status, 'EXTERNAL_PROOF_REQUIRED');
  assert.equal(question.module, 'src/paypal-payment-truth.mjs');
  assert.match(question.answer, /signed PayPal webhook/i);
  assert.match(question.answer, /independent PayPal order\/capture reads/i);
  assert.match(question.answer, /exact canonical witness triad/i);
  assert.equal(packet.paymentTruthBoundary, CANONICAL_PAYMENT_TRUTH_BOUNDARY);
});

test('an unready live rail blocks runtime approval-url preparation without resurrecting the static link', () => {
  const packet = compileFirstCashCanaryPacket({
    paymentRail: {
      ok: true,
      provider: 'paypal',
      state: 'LIVE_CREDENTIAL_MISSING',
      implementedRails: ['lemon_squeezy', 'paypal'],
      reasonCodes: ['payment-rail-credential-missing:liveClientId'],
      businessEffectAuthority: 'NONE'
    },
    date: AT
  });
  const question = packet.questions.find(row => row.question === 'WHAT_PAYMENT_LINK');
  assert.equal(question.status, 'BLOCKED');
  assert.ok(question.reasonCodes.includes('paypal-bound-order-live-rail-not-ready'));
  assert.equal(packet.paymentLink, null);
});

test('canonical packet cannot manufacture commercial truth', () => {
  const packet = compileFirstCashCanaryPacket({ paymentRail: liveReadyRail, date: AT });
  assert.deepEqual(packet.commercialTruth, {
    realCustomers: 0,
    clearedRevenueCents: 0,
    acceptedPaidDeliveries: 0,
    retainedCustomers: 0
  });
  assert.equal(packet.businessEffectAuthority, 'NONE');
});
