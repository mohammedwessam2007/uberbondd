import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Store } from '../src/store.mjs';
import { RevenueEngine } from '../src/revenue.mjs';
import { reconcilePaymentRenewalTruthFromStore } from '../src/payment-renewal-truth.mjs';

const SECRET = 'whsec_recovery_probe';

function config(dir) {
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

async function setup() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-webhook-resume-'));
  const store = new Store(dir);
  await store.init();
  const pipeline = { running: true, paused: false, runBatch: async () => {} };
  const engine = new RevenueEngine(store, config(dir), pipeline);
  const created = await engine.createLead({
    company: 'Recovery Probe', website: 'https://example.com', email: 'owner@example.com',
    industry: 'SaaS', consent: true
  }, '127.0.0.1');
  const lead = await store.get('leads', created.leadId);
  return { store, engine, lead, dir };
}

function webhook(lead) {
  return {
    meta: {
      event_name: 'order_created',
      custom_data: { lead_id: lead.id, prospect_id: lead.prospectId, product: 'full' },
      test_mode: false
    },
    data: {
      id: 'evt_partial_commit_resume', type: 'orders',
      attributes: {
        total: 4900, currency: 'USD', status: 'paid', user_email: 'owner@example.com',
        created_at: '2026-08-24T00:00:00.000Z', test_mode: false
      }
    }
  };
}

function signed(payload) {
  const raw = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
  return { raw, signature };
}

test('provider webhook retry resumes after crash between order receipt and economic completion', async () => {
  const { store, engine, lead, dir } = await setup();
  const { raw, signature } = signed(webhook(lead));

  const originalLog = store.log.bind(store);
  let failOnce = true;
  store.log = async (type, detail) => {
    if (type === 'payment_classification' && failOnce) {
      failOnce = false;
      throw new Error('injected-crash-after-order-before-classification');
    }
    return originalLog(type, detail);
  };

  await assert.rejects(
    () => engine.handleLemonWebhook(raw, signature),
    /injected-crash-after-order-before-classification/,
    'first delivery must crash after the durable provider-event/order receipt'
  );

  assert.equal((await store.list('orders')).length, 1, 'provider event is already durably marked seen');
  assert.equal((await store.list('revenueEvents')).length, 0, 'economic effect did not complete before the crash');

  // Simulate process restart: no in-memory failure hook survives. The provider
  // retries the same signed event because the prior request failed.
  const restartedStore = new Store(dir);
  await restartedStore.init();
  const restarted = new RevenueEngine(
    restartedStore,
    config(dir),
    { running: true, paused: false, runBatch: async () => {} }
  );
  const retry = await restarted.handleLemonWebhook(raw, signature);

  assert.notEqual(retry.duplicate, true,
    'a provider event is not safely duplicate until its classification/economic transition is durably complete');

  const paidLead = await restartedStore.get('leads', lead.id);
  assert.equal(paidLead.paymentStatus, 'paid', 'retry must finish the interrupted cleared-payment transition');
  assert.equal((await restartedStore.list('revenueEvents')).length, 1,
    'retry must materialize exactly one economic ledger effect');

  const truth = await reconcilePaymentRenewalTruthFromStore(restartedStore, { leadId: lead.id });
  assert.equal(truth.stages.CLEARED_PAYMENT.status, 'PROVEN');
  assert.equal(truth.economics.netProviderClearedRevenueCents, 4900);
});
