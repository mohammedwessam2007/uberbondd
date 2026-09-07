import test from 'node:test';
import assert from 'node:assert/strict';

import {
  capturePayPalFirstCashOrder,
  preparePayPalFirstCashOrder,
  processPayPalWebhook
} from '../src/paypal-payment-truth.mjs';

class MemoryStore {
  constructor() { this.db = { leads: [], orders: [], auditLog: [], revenueEvents: [] }; }
  async get(key, id) { return structuredClone((this.db[key] || []).find(row => row.id === id) || null); }
  async list(key) { return structuredClone(this.db[key] || []); }
  async add(key, item) {
    if ((this.db[key] || []).some(row => row.id === item.id)) {
      const error = new Error('duplicate');
      error.code = 'CONFLICT';
      throw error;
    }
    this.db[key].push(structuredClone(item));
    return structuredClone(item);
  }
  async patch(key, id, patch) {
    const index = this.db[key].findIndex(row => row.id === id);
    if (index < 0) throw new Error('missing');
    this.db[key][index] = { ...this.db[key][index], ...structuredClone(patch) };
    return structuredClone(this.db[key][index]);
  }
  async transaction(fn) {
    const snapshot = structuredClone(this.db);
    try { return await fn(this); }
    catch (error) { this.db = snapshot; throw error; }
  }
}

const ENV = Object.freeze({
  PAYPAL_ENVIRONMENT: 'live',
  PAYPAL_LIVE_CLIENT_ID: 'client-id-value',
  PAYPAL_LIVE_CLIENT_SECRET: 'secret-that-must-never-print',
  PAYPAL_LIVE_WEBHOOK_ID: 'WH-CONFIG',
  APP_BASE_URL: 'https://app.uberbond.test'
});

const HEADERS = Object.freeze({
  'paypal-transmission-id': 'transmission-module-replay-hostile',
  'paypal-transmission-time': '2026-09-04T18:00:00Z',
  'paypal-transmission-sig': 'signature',
  'paypal-cert-url': 'https://api.paypal.com/cert.pem',
  'paypal-auth-algo': 'SHA256withRSA'
});

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

function provider({ orderId, captureId }) {
  let createBody = null;
  let captured = false;
  const purchaseUnit = () => {
    const unit = structuredClone(createBody.purchase_units[0]);
    if (captured) {
      unit.payments = { captures: [{
        id: captureId,
        status: 'COMPLETED',
        final_capture: true,
        amount: { value: '450.00', currency_code: 'USD' },
        custom_id: unit.custom_id,
        invoice_id: unit.invoice_id
      }] };
    }
    return unit;
  };
  return {
    orderId,
    captureId,
    get createBody() { return createBody; },
    fetch: async (url, init = {}) => {
      const parsed = new URL(url);
      const method = init.method || 'GET';
      if (parsed.pathname === '/v1/oauth2/token') return response({ access_token: 'ACCESS' });
      if (parsed.pathname === '/v2/checkout/orders' && method === 'POST') {
        createBody = JSON.parse(init.body);
        return response({
          id: orderId,
          status: 'CREATED',
          links: [{ rel: 'payer-action', href: `https://www.paypal.test/approve?token=${orderId}` }]
        }, 201);
      }
      if (parsed.pathname === `/v2/checkout/orders/${orderId}` && method === 'GET') {
        return response({
          id: orderId,
          intent: 'CAPTURE',
          status: captured ? 'COMPLETED' : 'CREATED',
          purchase_units: [purchaseUnit()]
        });
      }
      if (parsed.pathname === `/v2/checkout/orders/${orderId}/capture` && method === 'POST') {
        captured = true;
        return response({ id: orderId, status: 'COMPLETED', purchase_units: [purchaseUnit()] }, 201);
      }
      if (parsed.pathname === '/v1/notifications/verify-webhook-signature') return response({ verification_status: 'SUCCESS' });
      if (parsed.pathname === `/v2/payments/captures/${captureId}` && method === 'GET') {
        const unit = createBody.purchase_units[0];
        return response({
          id: captureId,
          status: 'COMPLETED',
          amount: { value: '450.00', currency_code: 'USD' },
          custom_id: unit.custom_id,
          invoice_id: unit.invoice_id,
          supplementary_data: { related_ids: { order_id: orderId } }
        });
      }
      throw new Error(`unexpected-provider-call:${method}:${parsed.pathname}`);
    }
  };
}

async function prepareAndCapture(store, paypal, attemptKey) {
  const prepared = await preparePayPalFirstCashOrder({
    store,
    leadId: 'lead-1',
    env: ENV,
    fetchImpl: paypal.fetch,
    attemptKey,
    date: new Date('2026-09-04T18:00:00.000Z')
  });
  assert.equal(prepared.ok, true);
  const captured = await capturePayPalFirstCashOrder({
    store,
    intentId: prepared.intentId,
    providerOrderId: paypal.orderId,
    env: ENV,
    fetchImpl: paypal.fetch
  });
  assert.equal(captured.ok, true);
}

function completionEvent(paypal, eventId) {
  const unit = paypal.createBody.purchase_units[0];
  return {
    id: eventId,
    event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: paypal.captureId,
      status: 'COMPLETED',
      amount: { value: '450.00', currency_code: 'USD' },
      custom_id: unit.custom_id,
      invoice_id: unit.invoice_id,
      supplementary_data: { related_ids: { order_id: paypal.orderId } }
    }
  };
}

test('canonical PayPal module rejects same provider event id reused for a different capture/order', async () => {
  const store = new MemoryStore();
  await store.add('leads', { id: 'lead-1', prospectId: 'prospect-1' });
  const firstProvider = provider({ orderId: 'ORDER-A', captureId: 'CAPTURE-A' });
  const secondProvider = provider({ orderId: 'ORDER-B', captureId: 'CAPTURE-B' });
  await prepareAndCapture(store, firstProvider, 'module-replay-a');
  await prepareAndCapture(store, secondProvider, 'module-replay-b');

  const eventId = 'WH-MODULE-REPLAY-ID';
  const first = await processPayPalWebhook({
    store,
    env: ENV,
    rawBody: JSON.stringify(completionEvent(firstProvider, eventId)),
    headers: HEADERS,
    fetchImpl: firstProvider.fetch
  });
  assert.equal(first.ok, true);

  const second = await processPayPalWebhook({
    store,
    env: ENV,
    rawBody: JSON.stringify(completionEvent(secondProvider, eventId)),
    headers: HEADERS,
    fetchImpl: secondProvider.fetch
  });
  assert.equal(second.ok, false, 'canonical module accepted contradictory provider-object replay');
  assert.ok((second.reasonCodes || []).some(code => /replay|contradiction|identity|provider/i.test(code)));
  assert.equal((await store.list('revenueEvents')).length, 1);
  assert.equal((await store.list('orders')).filter(row => row.eventName === 'order_created').length, 1);
});

test('canonical PayPal module refuses replay when the deterministic witness triad is incomplete', async () => {
  const store = new MemoryStore();
  await store.add('leads', { id: 'lead-1', prospectId: 'prospect-1' });
  const paypal = provider({ orderId: 'ORDER-A', captureId: 'CAPTURE-A' });
  await prepareAndCapture(store, paypal, 'module-partial-triad');
  const event = completionEvent(paypal, 'WH-MODULE-PARTIAL');
  const first = await processPayPalWebhook({ store, env: ENV, rawBody: JSON.stringify(event), headers: HEADERS, fetchImpl: paypal.fetch });
  assert.equal(first.ok, true);

  store.db.auditLog = store.db.auditLog.filter(row => row.type !== 'payment_classification');
  store.db.revenueEvents = [];

  const replay = await processPayPalWebhook({ store, env: ENV, rawBody: JSON.stringify(event), headers: HEADERS, fetchImpl: paypal.fetch });
  assert.equal(replay.ok, false, 'canonical module treated partial triad as reconciled payment');
  assert.ok((replay.reasonCodes || []).some(code => /triad|witness|replay|contradiction/i.test(code)));
  assert.equal((await store.list('revenueEvents')).length, 0);
});
