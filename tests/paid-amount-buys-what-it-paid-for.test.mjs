import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { RevenueEngine } from '../src/revenue.mjs';
import { classifyPaymentEvent, checkoutUrl } from '../src/payments.mjs';

// Which product a payment is for arrives as `checkout[custom][product]` -- a
// query parameter on the checkout link, which the buyer holds:
//
//   https://store.lemonsqueezy.com/checkout/buy/full-variant
//     ?checkout[custom][lead_id]=...&checkout[custom][product]=full
//
// Nothing compared that claim to the money. Measured against the real engine,
// with list prices full $49, strategy $299, monitoring $99:
//
//   paid $49.00 claiming strategy    -> CLEARED_ONE_TIME_PAYMENT  plan=strategy
//   paid  $0.01 claiming monitoring  -> CLEARED_ONE_TIME_PAYMENT  plan=monitoring
//   paid  $0.00 claiming strategy    -> CLEARED_ONE_TIME_PAYMENT  plan=strategy
//
// So editing one URL parameter bought the $299 review for $49, and a fully
// discounted order bought it for nothing.
//
// The $0.00 row exposed a second defect underneath the first. `unlockLead`
// computed `Number(detail.amountCents || listPrice * 100)`, and zero is falsy,
// so a free order booked the product's full list price as cleared revenue --
// cleared jumped by $299 on an order whose total was 0.
//
// Underpayment is REVIEW_REQUIRED rather than a refusal, because a discount code
// is a real reason to pay less and silently discarding a genuine payment is
// worse than the hole being closed. REVIEW_REQUIRED is also the only
// classification an operator is actually shown.

const SECRET = 'paid-amount-truth-secret';
const PRICES = { full: 49, strategy: 299, monitoring: 99 };

async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-paid-amount-'));
  const store = new Store(dir);
  await store.init();
  const cfg = {
    baseUrl: 'https://a.test', dataDir: dir, encryptionKey: 'a'.repeat(64),
    revenue: {
      publicIntake: true, publicRateLimitPerHour: 100, freeFindings: 1,
      fullAuditPrice: PRICES.full, strategyAuditPrice: PRICES.strategy, monitoringPrice: PRICES.monitoring,
      implementationFrom: 1000, bookingUrl: '', reportDeliveryInbox: 'B', autoEmailReports: false,
      paymentProvider: 'links', lemonWebhookSecret: SECRET, allowTestUnlock: false,
      monitoringIntervalDays: 30, monitoringBatchSize: 10
    },
    google: {}, sender: { name: 'O' }
  };
  const engine = new RevenueEngine(store, cfg, { running: true, paused: false, runBatch: async () => {} });
  const created = await engine.createLead(
    { company: 'PriceCo', website: 'https://priceco.example', email: 'o@priceco.example', industry: 'S', consent: true },
    '1.2.3.4');
  return { store, engine, lead: await store.get('leads', created.leadId) };
}

async function pay(engine, lead, { product, totalCents, objectId }) {
  const body = JSON.stringify({
    meta: { event_name: 'order_created', test_mode: false, custom_data: { lead_id: lead.id, prospect_id: lead.prospectId, product } },
    data: { id: objectId, type: 'orders', attributes: { total: totalCents, currency: 'USD', status: 'paid', created_at: '2026-08-30T10:00:00Z', test_mode: false, user_email: 'b@example.com' } }
  });
  return engine.handleLemonWebhook(body, crypto.createHmac('sha256', SECRET).update(body).digest('hex'));
}

// The reason the claim is not trustworthy, stated as a test rather than a
// comment: it is in a URL the buyer is handed.
test('the product claim travels in a link the buyer holds', () => {
  const url = checkoutUrl('https://store.lemonsqueezy.com/checkout/buy/full-variant',
    { lead_id: 'LEAD', prospect_id: 'PROS', product: 'full' });
  assert.ok(url.includes('checkout%5Bcustom%5D%5Bproduct%5D=full'),
    'the product is a query parameter, so it is the buyer\'s to edit and cannot be believed on its own');
});

test('paying the cheap price does not buy the expensive product', async () => {
  const { store, engine, lead } = await harness();

  const result = await pay(engine, lead, { product: 'strategy', totalCents: PRICES.full * 100, objectId: 'o-underpaid' });

  assert.equal(result.classification, 'REVIEW_REQUIRED');
  const after = await store.get('leads', lead.id);
  assert.notEqual(after.plan, 'strategy', '$49 must not unlock the $299 product');
  assert.equal(after.paymentStatus, 'unpaid');
  assert.equal((await engine.summary()).clearedRevenue, 0);
});

test('a token payment and a free order buy nothing at all', async () => {
  const { store, engine, lead } = await harness();

  for (const [product, totalCents, objectId] of [
    ['monitoring', 1, 'o-one-cent'],
    ['strategy', 0, 'o-free'],
    ['full', 4899, 'o-one-cent-short']
  ]) {
    const result = await pay(engine, lead, { product, totalCents, objectId });
    assert.equal(result.classification, 'REVIEW_REQUIRED', `${product} at ${totalCents} cents`);
  }

  const after = await store.get('leads', lead.id);
  assert.equal(after.plan, 'free');
  assert.equal((await engine.summary()).clearedRevenue, 0);
  assert.equal((await engine.summary()).grossRevenue, 0);
});

// The second defect, which the $0 case exposed. Reached directly, because the
// classifier now stops a $0 order before it can get here -- and this is money
// arithmetic that should be right on its own.
test('a zero amount is an amount, not an absent one', async () => {
  const { store, engine, lead } = await harness();

  await engine.unlockLead(lead.id, 'strategy', { provider: 'test', eventId: 'zero-1', amountCents: 0 });

  const events = await store.list('revenueEvents');
  assert.equal(events.length, 1);
  assert.equal(events[0].amountCents, 0,
    'a zero-amount unlock booked the full list price, because `||` read 0 as absent');
});

test('an unlock with no amount at all still falls back to the list price', async () => {
  const { store, engine, lead } = await harness();

  await engine.unlockLead(lead.id, 'strategy', { provider: 'manual', eventId: 'absent-1' });

  const events = await store.list('revenueEvents');
  assert.equal(events[0].amountCents, PRICES.strategy * 100,
    'an absent amount is genuinely unknown, and the list price is the right answer for it');
});

// The controls. Without them everything above is satisfied by a system that
// refuses all money, which is a far more expensive bug than the one being fixed.
test('a correct payment still clears, and so does one carrying tax', async () => {
  for (const [product, totalCents, label] of [
    ['full', PRICES.full * 100, 'exact list price'],
    ['strategy', PRICES.strategy * 100, 'exact list price'],
    ['full', Math.round(PRICES.full * 100 * 1.1), 'list price plus tax']
  ]) {
    const { store, engine, lead } = await harness();
    const result = await pay(engine, lead, { product, totalCents, objectId: `o-${product}-${totalCents}` });
    assert.equal(result.classification, 'CLEARED_ONE_TIME_PAYMENT', `${product}, ${label}`);
    assert.equal((await store.get('leads', lead.id)).plan, product);
    assert.equal((await engine.summary()).clearedRevenue, totalCents / 100);
  }
});

// Overpayment is deliberately not flagged: Lemon Squeezy's `total` includes tax,
// so a correct payment routinely exceeds the list price. Flagging it would put
// every taxed order in front of a person.
test('a deployment that has not configured a price does not refuse everything', () => {
  const decision = classifyPaymentEvent({
    event: {
      eventName: 'order_created', eventId: 'e1', status: 'paid', amountCents: 4900, currency: 'USD',
      custom: { lead_id: 'l1', prospect_id: 'p1', product: 'full' }, testMode: false
    },
    lead: { id: 'l1', prospectId: 'p1' },
    cfg: { revenue: {} }
  });
  assert.equal(decision.classification, 'CLEARED_ONE_TIME_PAYMENT',
    'an unconfigured price is not evidence of underpayment, and must not block real money');
});

// The configured prices carry no currency and the environment names them
// FULL_AUDIT_PRICE_USD, so they are USD. Comparing EUR 30.00 to USD 49.00 would
// require an exchange rate this system does not have, and inventing one to
// refuse a payment would be worse than not checking.
//
// So a payment in another currency is treated exactly like a product whose price
// is not configured. That is a real remaining gap -- a non-USD payment is not
// amount-checked -- and it is pinned here rather than left for someone to
// discover, because the fix is per-currency prices in configuration, not code.
test('a payment in another currency is not judged against a USD price', () => {
  const euro = classifyPaymentEvent({
    event: {
      eventName: 'order_created', eventId: 'e-eur', status: 'paid', amountCents: 3000, currency: 'EUR',
      custom: { lead_id: 'l1', prospect_id: 'p1', product: 'full' }, testMode: false
    },
    lead: { id: 'l1', prospectId: 'p1' },
    cfg: { revenue: { fullAuditPrice: PRICES.full } }
  });
  assert.equal(euro.classification, 'CLEARED_ONE_TIME_PAYMENT',
    'EUR 30.00 is not "less than" USD 49.00 in any sense worth acting on');

  // And the check still applies in the currency the prices are actually in,
  // including when the provider spells it in lower case.
  const dollars = classifyPaymentEvent({
    event: {
      eventName: 'order_created', eventId: 'e-usd', status: 'paid', amountCents: 3000, currency: 'USD',
      custom: { lead_id: 'l1', prospect_id: 'p1', product: 'full' }, testMode: false
    },
    lead: { id: 'l1', prospectId: 'p1' },
    cfg: { revenue: { fullAuditPrice: PRICES.full } }
  });
  assert.equal(dollars.classification, 'REVIEW_REQUIRED');
});
