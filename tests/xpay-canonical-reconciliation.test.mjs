import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { JsonStore } from '../src/store.mjs';
import { createXPayCanonicalVerifier } from '../src/xpay-canonical-reconciliation.mjs';

async function setup(environment = 'live') {
  const store = new JsonStore(await mkdtemp(path.join(os.tmpdir(), 'xpay-canon-'))); await store.init();
  await store.add('orders', { id: 'intent_1', provider: 'xpay', eventName: 'XPAY_SESSION_INTENT',
    providerSessionId: 'cs_1', providerMerchantId: 'acct_1', environment, amountCents: 5000,
    currency: 'EGP', leadId: 'lead_1', product: 'sku_1' });
  const account = { id: 'acct_1', livemode: environment === 'live', livePaymentsEnabled: true,
    apiKey: { type: 'RESTRICTED', mode: environment } };
  const session = { id: 'cs_1', merchantId: 'acct_1', object: 'checkout.session', mode: 'payment',
    livemode: environment === 'live', status: 'complete', paymentStatus: 'paid', currency: 'EGP',
    amountTotal: 5000, paymentIntentId: 'pi_1', paymentIntent: { id: 'pi_1', object: 'payment_intent',
      checkoutSessionId: 'cs_1', amount: 5000, amountReceived: 5000, amountCapturable: 0,
      currency: 'EGP', status: 'SUCCEEDED', latestCharge: { id: 'ch_1', object: 'charge',
        paymentIntentId: 'pi_1', amount: 5000, amountCaptured: 5000, amountRefunded: 0,
        currency: 'EGP', status: 'SUCCEEDED', paid: true, captured: true,
        refunded: false, disputed: false, activeHoldId: null, refunds: [] } } };
  const event = { provider: 'xpay', objectType: 'checkout.session', objectId: 'cs_1',
    eventName: 'checkout.session.completed', providerEventKey: 'event_1' };
  const fetchImpl = async url => ({ ok: true, json: async () => structuredClone(url.endsWith('/account') ? account : session) });
  const verify = createXPayCanonicalVerifier({ store, secretKey: 'fixture', environment, fetchImpl,
    canonicalWritesAuthorized: true });
  return { store, account, session, event, fetchImpl, verify };
}
test('live fixture creates one atomic triad; two lifecycle events share charge identity', async () => {
  const f = await setup(); assert.equal((await f.verify(f.event)).cleared, true);
  assert.equal((await f.verify({ ...f.event, eventName: 'checkout.session.async_payment_succeeded',
    providerEventKey: 'event_2' })).cleared, true);
  assert.equal((await f.store.list('orders')).length, 2);
  assert.equal((await f.store.list('auditLog')).length, 1);
  assert.equal((await f.store.list('revenueEvents')).length, 1);
  assert.equal((await f.store.list('auditLog'))[0].detail.shouldUnlock, false);
});
test('parallel retries remain a single triad using real serialized JsonStore', async () => {
  const f = await setup(); const results = await Promise.all(Array.from({ length: 8 }, () => f.verify(f.event)));
  assert.ok(results.every(r => r.cleared)); assert.equal((await f.store.list('revenueEvents')).length, 1);
});
test('test captures never produce canonical revenue', async () => {
  const f = await setup('test'); assert.equal((await f.verify(f.event)).cleared, false);
  assert.equal((await f.store.list('revenueEvents')).length, 0);
});
test('missing write authority produces no writes', async () => {
  const f = await setup(); const verify = createXPayCanonicalVerifier({ store: f.store,
    secretKey: 'fixture', environment: 'live', fetchImpl: f.fetchImpl });
  assert.equal((await verify(f.event)).errorCode, 'xpay-canonical-writes-not-authorized');
  assert.equal((await f.store.list('revenueEvents')).length, 0);
});
test('partial refund invalidates paid truth; replay cannot resurrect it', async () => {
  const f = await setup(); await f.verify(f.event);
  f.session.paymentIntent.latestCharge.amountRefunded = 100;
  assert.equal((await f.verify(f.event)).cleared, false);
  const row = (await f.store.list('orders')).find(r => r.eventName === 'order_created');
  assert.equal(row.status, 'uncertain'); assert.equal(row.paymentTruthUsable, false);
  f.session.paymentIntent.latestCharge.amountRefunded = 0;
  assert.equal((await f.verify(f.event)).cleared, false);
  assert.equal((await f.store.list('revenueEvents')).length, 1);
});
test('tampered canonical revenue refuses a replay', async () => {
  const f = await setup(); await f.verify(f.event);
  const revenue = (await f.store.list('revenueEvents'))[0];
  await f.store.patch('revenueEvents', revenue.id, { amountCents: 1 });
  assert.equal((await f.verify(f.event)).cleared, false);
});
test('transaction failure rolls back the entire triad', async () => {
  const f = await setup(); const original = f.store.transaction.bind(f.store);
  f.store.transaction = fn => original(tx => {
    const add = tx.add.bind(tx); tx.add = async (collection, row) => {
      if (collection === 'revenueEvents') throw new Error('fixture failure'); return add(collection, row);
    }; return fn(tx);
  });
  assert.equal((await f.verify(f.event)).cleared, false);
  assert.equal((await f.store.list('orders')).length, 1);
  assert.equal((await f.store.list('auditLog')).length, 0);
});
