import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePaymentRenewalTruth } from '../src/payment-renewal-truth.mjs';

// Two defects found by attacking the module after the witness-content check
// landed, both in the same guard family.
//
// 1. Cents from different currencies were added into one scalar. A cleared
//    $50.00 and a cleared JPY 5000 -- five thousand yen, a currency with no
//    minor unit -- summed to 10000 and reported `$100.00` with status
//    PROVIDER_CLEARED_PAYMENT_PROVEN. The sum is not a quantity of anything.
//
// 2. The clearing receipt was carried into the identity comparison but not into
//    either money comparison, because the index dropped `amountCents` and
//    `currency` on the way in. The receipt witnessed which payment cleared and
//    said nothing about how much.

const lead = { id: 'l', prospectId: 'p' };

const order = (eventId, over = {}) => ({
  id: 'o-' + eventId, provider: 'lemonsqueezy', providerEventId: eventId,
  eventName: 'order_created', leadId: 'l', prospectId: 'p', product: 'full',
  amountCents: 5000, currency: 'USD', status: 'paid',
  createdAt: '2026-08-23T12:00:00Z', ...over
});

const receipt = (eventId, over = {}) => ({
  type: 'payment_classification', createdAt: '2026-08-23T12:00:00Z',
  detail: {
    classification: 'CLEARED_ONE_TIME_PAYMENT', eventName: 'order_created',
    eventId, leadId: 'l', prospectId: 'p', product: 'full',
    amountCents: 5000, currency: 'USD', timestamp: '2026-08-23T12:00:00Z', ...over
  }
});

const ledger = (eventId, over = {}) => ({
  id: 'r-' + eventId, providerEventId: 'order_created:' + eventId,
  leadId: 'l', prospectId: 'p', product: 'full', kind: 'sale',
  amountCents: 5000, currency: 'USD', createdAt: '2026-08-23T12:00:00Z', ...over
});

const run = (orders, auditLog, revenueEvents) =>
  reconcilePaymentRenewalTruth({ lead, orders, auditLog, revenueEvents });

const one = (o = {}, r = {}, l = {}) =>
  run([order('a', o)], [receipt('a', r)], [ledger('a', l)]);

test('an honest single-currency payment still clears and names its currency', () => {
  const result = one();
  assert.equal(result.status, 'PROVIDER_CLEARED_PAYMENT_PROVEN');
  assert.equal(result.economics.netProviderClearedRevenueCents, 5000);
  assert.equal(result.economics.currency, 'USD');
  assert.deepEqual(result.economics.currenciesPresent, ['USD']);
});

test('two payments in one currency sum and stay proven', () => {
  const result = run(
    [order('a'), order('b')],
    [receipt('a'), receipt('b')],
    [ledger('a'), ledger('b')]
  );
  assert.equal(result.status, 'PROVIDER_CLEARED_PAYMENT_PROVEN');
  assert.equal(result.economics.netProviderClearedRevenueCents, 10000);
  assert.equal(result.economics.currency, 'USD');
});

test('cents from two currencies are not a total', () => {
  const eur = { currency: 'EUR' };
  const result = run(
    [order('a'), order('b', eur)],
    [receipt('a'), receipt('b', eur)],
    [ledger('a'), ledger('b', eur)]
  );
  assert.ok(result.contradictions.includes('multi-currency-revenue-cannot-be-summed'));
  assert.equal(result.status, 'REVIEW_REQUIRED');
  assert.equal(result.ok, false);
});

test('a zero-decimal currency is not silently read as cents', () => {
  // JPY 5000 is five thousand yen, not fifty. Added to $50.00 the old code
  // reported $100.00 and called it proven.
  const jpy = { currency: 'JPY' };
  const result = run(
    [order('a'), order('b', jpy)],
    [receipt('a'), receipt('b', jpy)],
    [ledger('a'), ledger('b', jpy)]
  );
  assert.ok(result.contradictions.includes('multi-currency-revenue-cannot-be-summed'));
  assert.equal(result.economics.currency, null);
  assert.deepEqual(result.economics.currenciesPresent, ['JPY', 'USD']);
});

test('currency is null exactly when no single unit describes the figures', () => {
  assert.equal(one().economics.currency, 'USD');
  assert.equal(run([], [], []).economics.currency, null);
  assert.deepEqual(run([], [], []).economics.currenciesPresent, []);
});

test('a refund in another currency cannot reduce revenue either', () => {
  const result = run(
    [order('a'), order('ra', { eventName: 'refund', providerEventId: 'ra', amountCents: -5000, currency: 'EUR', status: 'refunded' })],
    [receipt('a'), receipt('ra', { eventName: 'refund', eventId: 'ra', classification: 'REFUND_OR_DISPUTE', amountCents: -5000, currency: 'EUR' })],
    [ledger('ra', { providerEventId: 'refund:ra', kind: 'refund', amountCents: -5000, currency: 'EUR' }), ledger('a')]
  );
  assert.ok(result.contradictions.includes('multi-currency-revenue-cannot-be-summed'));
});

test('the receipt is a witness to the currency, not only to the identity', () => {
  const result = one({}, { currency: 'EUR' }, {});
  assert.ok(result.contradictions.includes('provider-payment-witness-currency-mismatch'));
  assert.equal(result.economics.netProviderClearedRevenueCents, 0);
});

test('the receipt is a witness to the amount, not only to the identity', () => {
  const result = one({}, { amountCents: 500000 }, {});
  assert.ok(result.contradictions.includes('provider-payment-witness-amount-mismatch'));
  assert.equal(result.economics.netProviderClearedRevenueCents, 0);
});

test('a receipt carrying no money fields still reconciles', () => {
  // Receipts written before the index carried money at all must keep working.
  // Silence is not disagreement.
  const bare = { amountCents: undefined, currency: undefined };
  const result = one({}, bare, {});
  assert.equal(result.status, 'PROVIDER_CLEARED_PAYMENT_PROVEN');
  assert.equal(result.economics.netProviderClearedRevenueCents, 5000);
});

test('a refund receipt may carry the negative sign the order does not', () => {
  const result = run(
    [order('a'), order('ra', { eventName: 'refund', providerEventId: 'ra', amountCents: 5000, status: 'refunded' })],
    [receipt('a'), receipt('ra', { eventName: 'refund', eventId: 'ra', classification: 'REFUND_OR_DISPUTE', amountCents: -5000 })],
    [ledger('a'), ledger('ra', { providerEventId: 'refund:ra', kind: 'refund', amountCents: -5000 })]
  );
  assert.ok(!result.contradictions.includes('provider-payment-witness-amount-mismatch'));
  assert.equal(result.economics.netProviderClearedRevenueCents, 0);
});

// Refusing to total across currencies is correct and, on its own, unhelpful: an
// operator asking "how much did we make" gets a contradiction and no number.
// The honest answer exists -- one figure per currency -- so it is reported
// rather than withheld. Still no conversion: separate figures returned
// together, not an aggregate.
test('a mixed-currency book reports one figure per currency', () => {
  const jpy = { currency: 'JPY' };
  const eur = { currency: 'EUR' };
  const result = run(
    [order('a'), order('b', eur), order('c', jpy)],
    [receipt('a'), receipt('b', eur), receipt('c', jpy)],
    [ledger('a'), ledger('b', eur), ledger('c', jpy)]
  );
  assert.deepEqual(Object.keys(result.economics.byCurrency).sort(), ['EUR', 'JPY', 'USD']);
  assert.equal(result.economics.byCurrency.USD.netCents, 5000);
  assert.equal(result.economics.byCurrency.EUR.netCents, 5000);
  assert.equal(result.economics.byCurrency.JPY.netCents, 5000);
  assert.equal(result.economics.byCurrency.USD.paymentCount, 1);
  // The refusal to total is still in force.
  assert.equal(result.economics.currency, null);
  assert.ok(result.contradictions.includes('multi-currency-revenue-cannot-be-summed'));
});

test('the per-currency breakdown exists in the single-currency case too', () => {
  // Otherwise a caller has to know which case it is in before reading it.
  const result = one();
  assert.deepEqual(Object.keys(result.economics.byCurrency), ['USD']);
  assert.equal(result.economics.byCurrency.USD.netCents, 5000);
  assert.equal(result.economics.byCurrency.USD.clearedCents, 5000);
  assert.equal(result.economics.byCurrency.USD.reversedCents, 0);
});

test('an empty book has an empty breakdown, not a zero in some default currency', () => {
  const result = run([], [], []);
  assert.deepEqual(result.economics.byCurrency, {});
  assert.equal(result.economics.currency, null);
});

test('a refund reduces its own currency and no other', () => {
  const eur = { currency: 'EUR' };
  const result = run(
    [order('a'), order('b', eur),
      order('ra', { eventName: 'refund', providerEventId: 'ra', amountCents: -5000, status: 'refunded' })],
    [receipt('a'), receipt('b', eur),
      receipt('ra', { eventName: 'refund', eventId: 'ra', classification: 'REFUND_OR_DISPUTE', amountCents: -5000 })],
    [ledger('a'), ledger('b', eur),
      ledger('ra', { providerEventId: 'refund:ra', kind: 'refund', amountCents: -5000 })]
  );
  assert.equal(result.economics.byCurrency.USD.netCents, 0);
  assert.equal(result.economics.byCurrency.USD.reversedCents, 5000);
  assert.equal(result.economics.byCurrency.EUR.netCents, 5000);
  assert.equal(result.economics.byCurrency.EUR.reversedCents, 0);
});

test('no conversion rate is ever invented', () => {
  const eur = { currency: 'EUR' };
  const result = run([order('a'), order('b', eur)], [receipt('a'), receipt('b', eur)], [ledger('a'), ledger('b', eur)]);
  // Every per-currency net must equal that currency's own rows exactly.
  assert.equal(result.economics.byCurrency.USD.netCents, 5000);
  assert.equal(result.economics.byCurrency.EUR.netCents, 5000);
  // And nothing anywhere reports a converted total.
  assert.equal(result.economics.currency, null);
  assert.equal(Object.values(result.economics.byCurrency).some(b => b.netCents === 10000), false);
});
