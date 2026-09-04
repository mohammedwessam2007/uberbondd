import test from 'node:test';
import assert from 'node:assert/strict';

import { processPayPalWebhook } from '../src/paypal-payment-truth.mjs';

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
  async transaction(fn) {
    const snapshot = structuredClone(this.db);
    try { return await fn(this); } catch (error) { this.db = snapshot; throw error; }
  }
}

const ENV = Object.freeze({
  PAYPAL_ENVIRONMENT: 'sandbox',
  PAYPAL_SANDBOX_CLIENT_ID: 'sandbox-client',
  PAYPAL_SANDBOX_CLIENT_SECRET: 'sandbox-secret-never-print',
  PAYPAL_SANDBOX_WEBHOOK_ID: 'WH-CONFIGURED',
  APP_BASE_URL: 'http://127.0.0.1:3000'
});

const HEADERS = Object.freeze({
  'paypal-transmission-id': 'tx-auth-hostile',
  'paypal-transmission-time': '2026-09-04T21:00:00Z',
  'paypal-transmission-sig': 'signed-value',
  'paypal-cert-url': 'https://api.paypal.com/cert.pem',
  'paypal-auth-algo': 'SHA256withRSA'
});

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

function event() {
  return { id: 'WH-AUTH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'CAPTURE-X', status: 'COMPLETED' } };
}

function provider({ forceFailure = false } = {}) {
  const seen = [];
  return {
    seen,
    fetch: async (url, init = {}) => {
      const path = new URL(url).pathname;
      if (path === '/v1/oauth2/token') return response({ access_token: 'ACCESS' });
      if (path === '/v1/notifications/verify-webhook-signature') {
        const body = JSON.parse(init.body);
        seen.push(body);
        const configuredIdentityMatches = body.webhook_id === ENV.PAYPAL_SANDBOX_WEBHOOK_ID;
        return response({ verification_status: !forceFailure && configuredIdentityMatches ? 'SUCCESS' : 'FAILURE' });
      }
      throw new Error(`unexpected-provider-call:${path}`);
    }
  };
}

test('verification_status other than SUCCESS is unauthorized and cannot reach sandbox acknowledgement', async () => {
  const store = new MemoryStore();
  const paypal = provider({ forceFailure: true });
  const result = await processPayPalWebhook({
    store,
    env: ENV,
    rawBody: JSON.stringify(event()),
    headers: HEADERS,
    fetchImpl: paypal.fetch
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'UNAUTHORIZED');
  assert.ok(result.reasonCodes.includes('paypal-webhook-signature-verification-failed'));
  assert.equal((await store.list('auditLog')).length, 0);
});

test('signature verification is bound to the configured PayPal webhook id', async () => {
  const store = new MemoryStore();
  const paypal = provider();
  const result = await processPayPalWebhook({
    store,
    env: ENV,
    rawBody: JSON.stringify(event()),
    headers: HEADERS,
    fetchImpl: paypal.fetch
  });
  assert.equal(paypal.seen.length, 1);
  assert.equal(paypal.seen[0].webhook_id, ENV.PAYPAL_SANDBOX_WEBHOOK_ID);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'SANDBOX_WEBHOOK_VERIFIED_NO_COMMERCIAL_TRUTH');
  assert.equal((await store.list('revenueEvents')).length, 0);
});