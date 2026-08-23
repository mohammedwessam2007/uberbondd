import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Store } from '../src/store.mjs';
import { RevenueEngine } from '../src/revenue.mjs';

const SECRET = 'whsec_test_secret';

function cfg(dir) {
  return {
    baseUrl: 'https://audit.test', dataDir: dir, encryptionKey: 'a'.repeat(64),
    revenue: {
      publicIntake: true, publicRateLimitPerHour: 4, freeFindings: 1,
      fullAuditPrice: 49, strategyAuditPrice: 299, monitoringPrice: 99,
      implementationFrom: 1000, bookingUrl: '', reportDeliveryInbox: 'B', autoEmailReports: false,
      paymentProvider: 'links', fullAuditCheckoutUrl: 'https://shop.test/buy/full',
      strategyAuditCheckoutUrl: 'https://shop.test/buy/strategy', monitoringCheckoutUrl: 'https://shop.test/buy/watch',
      lemonWebhookSecret: SECRET, allowTestUnlock: true, monitoringIntervalDays: 30, monitoringBatchSize: 10
    },
    google: {}, sender: { name: 'Mohamed' }
  };
}

function sign(rawBody) {
  return crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
}

test('signed provider webhook persists bounded normalized witness and never the raw customer payload', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-provider-min-'));
  const store = new Store(dir);
  await store.init();
  const pipeline = { running: true, paused: false, runBatch: async () => {} };
  const engine = new RevenueEngine(store, cfg(dir), pipeline);
  const created = await engine.createLead({ company: 'Acme', website: 'https://example.com', email: 'owner@example.com', industry: 'SaaS', consent: true }, '1.2.3.4');
  const lead = await store.get('leads', created.leadId);

  const payload = {
    meta: {
      event_name: 'order_created',
      custom_data: { lead_id: lead.id, prospect_id: lead.prospectId, product: 'full' },
      test_mode: false
    },
    data: {
      id: 'evt_privacy_current_main', type: 'orders',
      attributes: {
        total: 4900, currency: 'USD', status: 'paid',
        user_email: 'customer-private@example.com',
        customer_name: 'Private Customer',
        billing_address: { line1: 'PRIVATE STREET', city: 'PRIVATE CITY' },
        session_token: ['provider', 'session', 'secret', 'must', 'not', 'persist'].join('-'),
        created_at: '2026-08-23T17:00:00Z', test_mode: false
      }
    }
  };
  const raw = JSON.stringify(payload);
  const result = await engine.handleLemonWebhook(raw, sign(raw));
  assert.equal(result.classification, 'CLEARED_ONE_TIME_PAYMENT');

  const orders = await store.list('orders');
  assert.equal(orders.length, 1);
  const persisted = orders[0];
  assert.equal(Object.hasOwn(persisted, 'raw'), false,
    'provider/customer raw payload must not be retained after normalized fields are extracted');

  const serialized = JSON.stringify(persisted);
  for (const forbidden of [
    'customer-private@example.com', 'Private Customer', 'PRIVATE STREET', 'PRIVATE CITY',
    ['provider', 'session', 'secret', 'must', 'not', 'persist'].join('-')
  ]) {
    assert.equal(serialized.includes(forbidden), false,
      `durable order record leaked provider-only field: ${forbidden}`);
  }

  assert.equal(persisted.provider, 'lemonsqueezy');
  assert.equal(persisted.providerEventId, 'evt_privacy_current_main');
  assert.equal(persisted.eventName, 'order_created');
  assert.equal(persisted.leadId, lead.id);
  assert.equal(persisted.prospectId, lead.prospectId);
  assert.equal(persisted.product, 'full');
  assert.equal(persisted.amountCents, 4900);
  assert.equal(persisted.currency, 'USD');
  assert.equal(persisted.status, 'paid');
});