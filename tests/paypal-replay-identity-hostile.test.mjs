import test from 'node:test';
import assert from 'node:assert/strict';

import {
  capturePayPalFirstCashOrder,
  preparePayPalFirstCashOrder,
  processPayPalWebhook
} from '../src/paypal-payment-truth.mjs';
import { createFetchHandler } from '../api/webhooks/paypal.mjs';

class MemoryStore {
  constructor() { this.db = { leads: [], orders: [], auditLog: [], revenueEvents: [] }; }
  async get(key, id) { return structuredClone((this.db[key] || []).find(row => row.id === id) || null); }
  async list(key) { return structuredClone(this.db[key] || []); }
  async add(key, item) {
    if ((this.db[key] || []).some(row => row.id === item.id)) {
      const error = new Error('duplicate'); error.code = 'CONFLICT'; throw error;
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
  'paypal-transmission-id': 'transmission-replay-hostile',
  'paypal-transmission-time': '2026-09-04T18:00:00Z',
  'paypal-transmission-sig': 'signature',
  'paypal-cert-url': 'https://api.paypal.com/cert.pem',
  'paypal-auth-algo': 'SHA256withRSA'
});

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  });
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
      if (parsed.pathname === '/v1/notifications/verify-webhook-signature') {
        return response({ verification_status: 'SUCCESS' });
      }
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

async function prepareAndCapture(store, paypal, attemptKey, date) {
  const prepared = await preparePayPalFirstCashOrder({
    store,
    leadId: 'lead-1',
    env: ENV,
    fetchImpl: paypal.fetch,
    attemptKey,
    date
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
  return prepared;
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

async function postWebhook(store, paypal, event) {
  const handler = createFetchHandler({
    env: ENV,
    getStore: async () => store,
    processPayPalWebhook: args => processPayPalWebhook({ ...args, fetchImpl: paypal.fetch })
  });
  const res = await handler(new Request('https://app.uberbond.test/api/webhooks/paypal', {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(event)
  }));
  return res.json();
}

async function onePayment(eventId = 'WH-STABLE') {
  const store = new MemoryStore();
  await store.add('leads', { id: 'lead-1', prospectId: 'prospect-1' });
  const paypal = provider({ orderId: 'ORDER-A', captureId: 'CAPTURE-A' });
  await prepareAndCapture(store, paypal, 'stable-attempt', new Date('2026-09-04T18:00:00.000Z'));
  const event = completionEvent(paypal, eventId);
  const first = await postWebhook(store, paypal, event);
  assert.equal(first.ok, true);
  return { store, paypal, event, first };
}

test('same PayPal webhook event id cannot certify a different capture/order even when economics and lead match', async () => {
  const store = new MemoryStore();
  await store.add('leads', { id: 'lead-1', prospectId: 'prospect-1' });

  const firstProvider = provider({ orderId: 'ORDER-A', captureId: 'CAPTURE-A' });
  const secondProvider = provider({ orderId: 'ORDER-B', captureId: 'CAPTURE-B' });
  await prepareAndCapture(store, firstProvider, 'replay-attempt-a', new Date('2026-09-04T18:00:00.000Z'));
  await prepareAndCapture(store, secondProvider, 'replay-attempt-b', new Date('2026-09-04T18:01:00.000Z'));

  const eventId = 'WH-REUSED-PROVIDER-EVENT-ID';
  const first = await postWebhook(store, firstProvider, completionEvent(firstProvider, eventId));
  assert.equal(first.ok, true);
  assert.equal(first.status, 'PAYPAL_PROVIDER_CLEARED_WITNESSES_PERSISTED');

  const second = await postWebhook(store, secondProvider, completionEvent(secondProvider, eventId));
  assert.equal(second.ok, false,
    'one provider occurrence id was allowed to authenticate a different provider object');
  assert.equal(second.status, 'REVIEW_REQUIRED');
  assert.ok((second.reasonCodes || []).some(code => /duplicate|contradiction|identity|triad|provider/i.test(code)));
  assert.equal((await store.list('revenueEvents')).length, 1);
  assert.equal((await store.list('orders')).filter(row => row.eventName === 'order_created').length, 1);
});

test('identical PayPal webhook replay is idempotent only when the complete witness triad still agrees', async () => {
  const { store, paypal, event } = await onePayment('WH-IDEMPOTENT');
  const replay = await postWebhook(store, paypal, event);
  assert.equal(replay.ok, true);
  assert.equal(replay.status, 'PAYPAL_PAYMENT_ALREADY_RECONCILED');
  assert.equal((await store.list('revenueEvents')).length, 1);
  assert.equal((await store.list('auditLog')).filter(row => row.type === 'payment_classification').length, 1);
  assert.equal((await store.list('orders')).filter(row => row.eventName === 'order_created').length, 1);
});

test('partial durable PayPal witness triad fails closed on replay instead of acknowledging cleared payment', async () => {
  const { store, paypal, event } = await onePayment('WH-PARTIAL-TRIAD');
  store.db.auditLog = store.db.auditLog.filter(row => row.type !== 'payment_classification');
  store.db.revenueEvents = [];

  const replay = await postWebhook(store, paypal, event);
  assert.equal(replay.ok, false);
  assert.equal(replay.status, 'REVIEW_REQUIRED');
  assert.ok(replay.reasonCodes.includes('paypal-canonical-witness-triad-incomplete-or-duplicated'));
  assert.equal((await store.list('orders')).filter(row => row.eventName === 'order_created').length, 1);
  assert.equal((await store.list('revenueEvents')).length, 0);
});