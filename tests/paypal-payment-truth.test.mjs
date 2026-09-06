import test from 'node:test';
import assert from 'node:assert/strict';

import {
  capturePayPalFirstCashOrder,
  describePayPalPaymentTruthConfig,
  preparePayPalFirstCashOrder,
  processPayPalWebhook
} from '../src/paypal-payment-truth.mjs';

class MemoryStore {
  constructor() { this.db = { leads: [], orders: [], auditLog: [], revenueEvents: [] }; }
  async get(key, id) { return structuredClone((this.db[key] || []).find(row => row.id === id) || null); }
  async list(key) { return structuredClone(this.db[key] || []); }
  async add(key, item) {
    if ((this.db[key] || []).some(row => row.id === item.id)) {
      const error = new Error('duplicate'); error.code = 'CONFLICT'; throw error;
    }
    this.db[key].push(structuredClone(item)); return structuredClone(item);
  }
  async patch(key, id, patch) {
    const index = this.db[key].findIndex(row => row.id === id);
    if (index < 0) throw new Error('missing');
    this.db[key][index] = { ...this.db[key][index], ...structuredClone(patch) };
    return structuredClone(this.db[key][index]);
  }
  async transaction(fn) {
    const snapshot = structuredClone(this.db);
    try { return await fn(this); } catch (error) { this.db = snapshot; throw error; }
  }
}

const LIVE_ENV = Object.freeze({
  PAYPAL_ENVIRONMENT: 'live', PAYPAL_LIVE_CLIENT_ID: 'client-id-value',
  PAYPAL_LIVE_CLIENT_SECRET: 'secret-that-must-never-print', PAYPAL_LIVE_WEBHOOK_ID: 'WH-CONFIG',
  APP_BASE_URL: 'https://app.uberbond.test'
});
const SANDBOX_ENV = Object.freeze({
  PAYPAL_ENVIRONMENT: 'sandbox', PAYPAL_SANDBOX_CLIENT_ID: 'sandbox-id',
  PAYPAL_SANDBOX_CLIENT_SECRET: 'sandbox-secret', PAYPAL_SANDBOX_WEBHOOK_ID: 'WH-SANDBOX',
  APP_BASE_URL: 'http://127.0.0.1:3000'
});
const WEBHOOK_HEADERS = Object.freeze({
  'paypal-transmission-id': 'transmission-1',
  'paypal-transmission-time': '2026-09-04T16:00:00Z',
  'paypal-transmission-sig': 'signature',
  'paypal-cert-url': 'https://api.paypal.com/cert.pem',
  'paypal-auth-algo': 'SHA256withRSA'
});

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

function provider({ failFirstCreate = false } = {}) {
  let createBody = null;
  let captured = false;
  let createAttempts = 0;
  const calls = [];
  const orderId = 'ORDER123';
  const captureId = 'CAPTURE123';
  const purchaseUnit = () => {
    const unit = structuredClone(createBody.purchase_units[0]);
    if (captured) unit.payments = { captures: [{
      id: captureId, status: 'COMPLETED', final_capture: true,
      amount: { value: '450.00', currency_code: 'USD' },
      custom_id: unit.custom_id, invoice_id: unit.invoice_id
    }] };
    return unit;
  };
  return {
    calls, orderId, captureId,
    get createBody() { return createBody; },
    fetch: async (url, init = {}) => {
      const parsed = new URL(url);
      const method = init.method || 'GET';
      calls.push({ path: parsed.pathname, method, requestId: init.headers?.['paypal-request-id'] || null });
      if (parsed.pathname === '/v1/oauth2/token') return response({ access_token: 'ACCESS' });
      if (parsed.pathname === '/v2/checkout/orders' && method === 'POST') {
        createAttempts += 1;
        if (failFirstCreate && createAttempts === 1) return response({ name: 'INTERNAL_SERVER_ERROR' }, 500);
        createBody = JSON.parse(init.body);
        return response({ id: orderId, status: 'CREATED', links: [{ rel: 'payer-action', href: `https://www.paypal.test/approve?token=${orderId}` }] }, 201);
      }
      if (parsed.pathname === `/v2/checkout/orders/${orderId}` && method === 'GET') {
        return response({ id: orderId, intent: 'CAPTURE', status: captured ? 'COMPLETED' : 'CREATED', purchase_units: [purchaseUnit()] });
      }
      if (parsed.pathname === `/v2/checkout/orders/${orderId}/capture` && method === 'POST') {
        captured = true;
        return response({ id: orderId, status: 'COMPLETED', purchase_units: [purchaseUnit()] }, 201);
      }
      if (parsed.pathname === '/v1/notifications/verify-webhook-signature') return response({ verification_status: 'SUCCESS' });
      if (parsed.pathname === `/v2/payments/captures/${captureId}`) {
        const unit = createBody.purchase_units[0];
        return response({
          id: captureId, status: 'COMPLETED', amount: { value: '450.00', currency_code: 'USD' },
          custom_id: unit.custom_id, invoice_id: unit.invoice_id,
          supplementary_data: { related_ids: { order_id: orderId } }
        });
      }
      throw new Error(`unexpected-provider-call:${method}:${parsed.pathname}`);
    }
  };
}

async function preparedLive() {
  const store = new MemoryStore();
  await store.add('leads', { id: 'lead-1', prospectId: 'prospect-1' });
  const paypal = provider();
  const prepared = await preparePayPalFirstCashOrder({
    store, leadId: 'lead-1', env: LIVE_ENV, fetchImpl: paypal.fetch,
    date: new Date('2026-09-04T16:00:00.000Z')
  });
  assert.equal(prepared.ok, true);
  return { store, paypal, prepared };
}

test('doctor reports only PayPal credential presence and never secret values', () => {
  const report = describePayPalPaymentTruthConfig({ env: LIVE_ENV });
  assert.equal(report.ready, true);
  assert.equal(report.environment, 'LIVE');
  assert.equal(JSON.stringify(report).includes(LIVE_ENV.PAYPAL_LIVE_CLIENT_SECRET), false);
});

test('order preparation fixes the sprint to USD 450 and retries a 5xx with the same PayPal-Request-Id', async () => {
  const store = new MemoryStore();
  await store.add('leads', { id: 'lead-1', prospectId: 'prospect-1' });
  const paypal = provider({ failFirstCreate: true });
  const result = await preparePayPalFirstCashOrder({ store, leadId: 'lead-1', env: LIVE_ENV, fetchImpl: paypal.fetch });
  assert.equal(result.ok, true);
  const createCalls = paypal.calls.filter(call => call.path === '/v2/checkout/orders');
  assert.equal(createCalls.length, 2);
  assert.equal(createCalls[0].requestId, createCalls[1].requestId);
  const unit = paypal.createBody.purchase_units[0];
  assert.equal(unit.amount.value, '450.00');
  assert.equal(unit.amount.currency_code, 'USD');
  assert.equal(unit.items[0].sku, 'lead-path-revenue-leak-evidence-sprint-usd-450');
});

test('buyer-approved capture response alone creates zero revenue truth', async () => {
  const { store, paypal, prepared } = await preparedLive();
  const result = await capturePayPalFirstCashOrder({
    store, intentId: prepared.intentId, providerOrderId: paypal.orderId,
    env: LIVE_ENV, fetchImpl: paypal.fetch
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'WAITING_FOR_SIGNED_PROVIDER_WEBHOOK');
  assert.equal(result.commercialTruthEligible, false);
  assert.equal((await store.list('revenueEvents')).length, 0);
  assert.equal((await store.list('auditLog')).filter(row => row.type === 'payment_classification').length, 0);
});

test('signed live completion plus independent provider reads creates one canonical witness set and replay is idempotent', async () => {
  const { store, paypal, prepared } = await preparedLive();
  await capturePayPalFirstCashOrder({ store, intentId: prepared.intentId, providerOrderId: paypal.orderId, env: LIVE_ENV, fetchImpl: paypal.fetch });
  const unit = paypal.createBody.purchase_units[0];
  const event = {
    id: 'WH-LIVE-1', event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: paypal.captureId, status: 'COMPLETED', amount: { value: '450.00', currency_code: 'USD' },
      custom_id: unit.custom_id, invoice_id: unit.invoice_id,
      supplementary_data: { related_ids: { order_id: paypal.orderId } }
    }
  };
  const first = await processPayPalWebhook({ store, env: LIVE_ENV, rawBody: JSON.stringify(event), headers: WEBHOOK_HEADERS, fetchImpl: paypal.fetch });
  assert.equal(first.ok, true);
  assert.equal(first.status, 'PAYPAL_PROVIDER_CLEARED_WITNESSES_PERSISTED');
  assert.equal((await store.list('revenueEvents')).length, 1);
  const audit = (await store.list('auditLog')).find(row => row.type === 'payment_classification');
  assert.equal(audit.detail.provider, 'paypal');
  assert.equal(audit.detail.classification, 'CLEARED_ONE_TIME_PAYMENT');
  const witness = (await store.list('orders')).find(row => row.eventName === 'order_created');
  assert.equal(witness.provider, 'paypal');
  assert.equal(witness.amountCents, 45_000);

  const replay = await processPayPalWebhook({ store, env: LIVE_ENV, rawBody: JSON.stringify(event), headers: WEBHOOK_HEADERS, fetchImpl: paypal.fetch });
  assert.equal(replay.ok, true);
  assert.equal((await store.list('revenueEvents')).length, 1);
  assert.equal((await store.list('orders')).filter(row => row.eventName === 'order_created').length, 1);
});

test('Sandbox signature verification can never create commercial payment witnesses', async () => {
  const store = new MemoryStore();
  const paypal = provider();
  const event = { id: 'WH-SANDBOX-1', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'capture', status: 'COMPLETED' } };
  const result = await processPayPalWebhook({ store, env: SANDBOX_ENV, rawBody: JSON.stringify(event), headers: WEBHOOK_HEADERS, fetchImpl: paypal.fetch });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'SANDBOX_WEBHOOK_VERIFIED_NO_COMMERCIAL_TRUTH');
  assert.equal((await store.list('revenueEvents')).length, 0);
  assert.equal((await store.list('orders')).length, 0);
});

test('missing transmission headers fail before any provider call', async () => {
  const store = new MemoryStore();
  const paypal = provider();
  const result = await processPayPalWebhook({
    store, env: LIVE_ENV, rawBody: JSON.stringify({ id: 'WH-X', event_type: 'PAYMENT.CAPTURE.COMPLETED' }),
    headers: {}, fetchImpl: paypal.fetch
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('paypal-webhook-transmission-headers-required'));
  assert.equal(paypal.calls.length, 0);
});

test('a provider lookup that disagrees with the signed webhook cannot create revenue', async () => {
  const { store, paypal, prepared } = await preparedLive();
  await capturePayPalFirstCashOrder({ store, intentId: prepared.intentId, providerOrderId: paypal.orderId, env: LIVE_ENV, fetchImpl: paypal.fetch });
  const unit = paypal.createBody.purchase_units[0];
  const event = {
    id: 'WH-BAD-AMOUNT', event_type: 'PAYMENT.CAPTURE.COMPLETED',
    resource: {
      id: paypal.captureId, status: 'COMPLETED', amount: { value: '449.99', currency_code: 'USD' },
      custom_id: unit.custom_id, invoice_id: unit.invoice_id,
      supplementary_data: { related_ids: { order_id: paypal.orderId } }
    }
  };
  const result = await processPayPalWebhook({ store, env: LIVE_ENV, rawBody: JSON.stringify(event), headers: WEBHOOK_HEADERS, fetchImpl: paypal.fetch });
  assert.equal(result.ok, false);
  assert.equal((await store.list('revenueEvents')).length, 0);
});
