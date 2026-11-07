// PHOENIX cross-organ regression: actual module imports, no network/providers.
// Synthetic provider-shaped fixtures prove only logic, never real cleared cash.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPaymentEvent } from '../src/payments.mjs';
import { assessPaymentEvidence, compressPayment } from '../src/payment-compression.mjs';
import { advanceDelivery } from '../src/delivery-loop.mjs';

const lead = { id: 'phoenix_lead', prospectId: 'phoenix_prospect' };
const cfg = { revenue: { fullAuditPrice: 49, allowTestUnlock: false } };
const event = (amountCents, currency = 'USD', overrides = {}) => ({
  eventName: 'order_created', eventId: 'phoenix_fixture',
  custom: { lead_id: lead.id, prospect_id: lead.prospectId, product: 'full' },
  amountCents, currency, status: 'paid', testMode: false, ...overrides
});
const classify = (amountCents, currency, overrides) =>
  classifyPaymentEvent({ event: event(amountCents, currency, overrides), lead, cfg });
const payment = {
  provider: 'contra', providerTransactionId: 'SYNTHETIC_TEST_FIXTURE', grossCents: 150000,
  feeCents: 5000, currency: 'USD', status: 'cleared',
  clearedAt: '2026-10-09T00:00:00Z', source: 'provider'
};
const rails = [{ provider: 'contra', state: 'COLLECTION_READY' }];

for (const [description, amountCents, currency, classification] of [
  ['valid exact USD price', 4900, 'USD', 'CLEARED_ONE_TIME_PAYMENT'],
  ['valid USD overpayment', 6000, 'USD', 'CLEARED_ONE_TIME_PAYMENT'],
  ['underpaid USD', 3000, 'USD', 'REVIEW_REQUIRED'],
  ['zero USD', 0, 'USD', 'REVIEW_REQUIRED'],
  ['zero EUR', 0, 'EUR', 'REVIEW_REQUIRED'],
  ['unpriced EUR', 3000, 'EUR', 'REVIEW_REQUIRED'],
  ['fractional cents', 4900.1, 'USD', 'REVIEW_REQUIRED'],
  ['unsafe integer cents', Number.MAX_SAFE_INTEGER + 1, 'USD', 'REVIEW_REQUIRED'],
  ['infinite cents', Infinity, 'USD', 'REVIEW_REQUIRED'],
  ['negative cents', -1, 'USD', 'REVIEW_REQUIRED'],
  ['NaN cents', NaN, 'USD', 'REVIEW_REQUIRED']
]) {
  test('payment classifier: ' + description, () => {
    const result = classify(amountCents, currency);
    assert.equal(result.classification, classification);
    assert.equal(result.shouldUnlock, classification === 'CLEARED_ONE_TIME_PAYMENT');
    assert.equal(result.shouldRecordRevenue, classification === 'CLEARED_ONE_TIME_PAYMENT');
  });
}

for (const [description, overrides, classification] of [
  ['pending is not paid', { status: 'pending' }, 'PENDING_OR_UNCLEAR'],
  ['test mode cannot unlock', { testMode: true }, 'INVALID_OR_UNSUPPORTED'],
  ['missing provider event ID', { eventId: '' }, 'INVALID_OR_UNSUPPORTED']
]) {
  test('payment classifier: ' + description, () => {
    const result = classify(4900, 'USD', overrides);
    assert.equal(result.classification, classification);
    assert.equal(result.shouldUnlock, false);
    assert.equal(result.shouldRecordRevenue, false);
  });
}

for (const [description, override, valid] of [
  ['valid payment', {}, true],
  ['infinite gross', { grossCents: Infinity }, false],
  ['refund exists', { refundedCents: 1 }, false],
  ['negative fee', { feeCents: -1 }, false],
  ['self-report', { source: 'owner' }, false],
  ['pending', { status: 'pending' }, false],
  ['fee exceeds gross', { feeCents: 160000 }, false],
  ['fractional gross', { grossCents: 150000.5 }, false]
]) {
  test('payment-to-delivery: ' + description, () => {
    const fixture = { ...payment, ...override };
    const result = assessPaymentEvidence(fixture);
    const delivery = advanceDelivery({ payment: fixture, deliveryCostCents: 10000 });
    assert.equal(result.cleared, valid);
    if (valid) {
      assert.equal(result.netCents, 145000);
      assert.equal(delivery.contributionCents, 135000);
      assert.equal(delivery.state, 'PAID_CLEARED');
    } else {
      assert.equal(result.netCents, 0);
      assert.equal(delivery.contributionCents, null);
      assert.equal(delivery.state, 'SOLD');
    }
    assert.equal(delivery.outboundAuthority, 'NONE');
  });
}

for (const [description, amountCents, allowed] of [
  ['normal quote', 250000, true],
  ['infinite quote', Infinity, false],
  ['numeric string quote', '250000', false],
  ['negative quote', -1, false],
  ['zero quote', 0, false],
  ['unsafe quote', Number.MAX_SAFE_INTEGER + 1, false],
  ['fractional quote', 1.5, false]
]) {
  test('collection path: ' + description, () => {
    const result = compressPayment({ rails, amountCents, currency: 'USD' });
    assert.equal(result.ok, allowed);
    if (allowed) assert.equal(result.provider, 'contra');
    else assert.equal(result.state, 'NO_AMOUNT');
    assert.equal(result.outboundAuthority, 'NONE');
  });
}
