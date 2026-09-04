import test from 'node:test';
import assert from 'node:assert/strict';

import { createFetchHandler as createOrderHandler } from '../api/payments/paypal-order.mjs';
import { createFetchHandler as createCaptureHandler } from '../api/payments/paypal-capture.mjs';
import { createFetchHandler as createWebhookHandler } from '../api/webhooks/paypal.mjs';

function request(url, { method = 'GET', headers = {}, body } = {}) {
  return new Request(url, {
    method,
    headers,
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) })
  });
}

test('PayPal order route fails closed before storage or provider work when method/token/input are invalid', async () => {
  let storeCalls = 0;
  let prepareCalls = 0;
  const env = { ADMIN_TOKEN: 'route-test-token' };
  const handler = createOrderHandler({
    env,
    getStore: async () => { storeCalls += 1; return {}; },
    preparePayPalFirstCashOrder: async () => { prepareCalls += 1; return { ok: true }; }
  });

  const wrongMethod = await handler(request('https://app.test/api/payments/paypal-order', { method: 'GET' }));
  assert.equal(wrongMethod.status, 405);

  const unauthorized = await handler(request('https://app.test/api/payments/paypal-order', {
    method: 'POST',
    body: { leadId: 'lead-1' }
  }));
  assert.equal(unauthorized.status, 401);

  const missingLead = await handler(request('https://app.test/api/payments/paypal-order', {
    method: 'POST',
    headers: { authorization: 'Bearer route-test-token', 'content-type': 'application/json' },
    body: {}
  }));
  assert.equal(missingLead.status, 400);
  assert.equal(storeCalls, 0);
  assert.equal(prepareCalls, 0);
});

test('PayPal order route forwards only bounded prepared identity after authorization', async () => {
  const calls = [];
  const env = { ADMIN_TOKEN: 'route-test-token' };
  const fakeStore = { id: 'store' };
  const handler = createOrderHandler({
    env,
    getStore: async () => fakeStore,
    preparePayPalFirstCashOrder: async input => {
      calls.push(input);
      return {
        ok: true,
        status: 'APPROVAL_PENDING',
        intentId: 'paypal_intent_test',
        providerOrderId: 'ORDER-1',
        approvalUrl: 'https://paypal.test/approve',
        commercialTruthEligible: false
      };
    }
  });

  const response = await handler(request('https://app.test/api/payments/paypal-order', {
    method: 'POST',
    headers: { authorization: 'Bearer route-test-token', 'content-type': 'application/json' },
    body: { leadId: 'lead-1', attemptKey: 'attempt-2' }
  }));
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].store, fakeStore);
  assert.equal(calls[0].leadId, 'lead-1');
  assert.equal(calls[0].attemptKey, 'attempt-2');
  assert.equal((await response.json()).commercialTruthEligible, false);
});

test('PayPal capture route never equates a capture response with cleared payment', async () => {
  let captureCalls = 0;
  const handler = createCaptureHandler({
    env: {},
    getStore: async () => ({ id: 'store' }),
    capturePayPalFirstCashOrder: async input => {
      captureCalls += 1;
      assert.equal(input.intentId, 'paypal_intent_1');
      assert.equal(input.providerOrderId, 'ORDER-1');
      return {
        ok: true,
        status: 'WAITING_FOR_SIGNED_PROVIDER_WEBHOOK',
        commercialTruthEligible: false
      };
    }
  });

  const response = await handler(request('https://app.test/api/payments/paypal-capture?intent=paypal_intent_1&token=ORDER-1'));
  assert.equal(response.status, 202);
  const body = await response.text();
  assert.match(body, /waiting for signed provider confirmation/i);
  assert.doesNotMatch(body, /payment is cleared/i);
  assert.equal(captureCalls, 1);
});

test('PayPal capture route makes uncertain provider effects visible and tells the buyer not to retry', async () => {
  const handler = createCaptureHandler({
    env: {},
    getStore: async () => ({}),
    capturePayPalFirstCashOrder: async () => ({ ok: false, status: 'PROVIDER_EFFECT_UNCERTAIN' })
  });
  const response = await handler(request('https://app.test/api/payments/paypal-capture?intent=paypal_intent_1&token=ORDER-1'));
  assert.equal(response.status, 202);
  assert.match(await response.text(), /do not pay again/i);
});

test('PayPal webhook route requires POST and an exact raw body before reconciliation', async () => {
  let storeCalls = 0;
  let processCalls = 0;
  const handler = createWebhookHandler({
    env: {},
    getStore: async () => { storeCalls += 1; return {}; },
    processPayPalWebhook: async () => { processCalls += 1; return { ok: true }; }
  });

  const wrongMethod = await handler(request('https://app.test/api/webhooks/paypal', { method: 'GET' }));
  assert.equal(wrongMethod.status, 405);

  const empty = await handler(request('https://app.test/api/webhooks/paypal', { method: 'POST', body: '' }));
  assert.equal(empty.status, 400);
  assert.equal(storeCalls, 0);
  assert.equal(processCalls, 0);
});

test('PayPal webhook route forwards raw bytes and headers, and acknowledges review-required retention risk', async () => {
  const raw = JSON.stringify({ id: 'WH-1', event_type: 'CUSTOMER.DISPUTE.CREATED' });
  let observed = null;
  const handler = createWebhookHandler({
    env: { marker: true },
    getStore: async () => ({ id: 'store' }),
    processPayPalWebhook: async input => {
      observed = input;
      return { ok: false, status: 'REVIEW_REQUIRED', reasonCodes: ['payment-retention-risk-open'] };
    }
  });

  const response = await handler(request('https://app.test/api/webhooks/paypal', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'paypal-transmission-id': 'tx-1' },
    body: raw
  }));
  assert.equal(response.status, 200);
  assert.ok(Buffer.isBuffer(observed.rawBody));
  assert.equal(observed.rawBody.toString('utf8'), raw);
  assert.equal(observed.headers.get('paypal-transmission-id'), 'tx-1');
  const payload = await response.json();
  assert.equal(payload.status, 'REVIEW_REQUIRED');
});
