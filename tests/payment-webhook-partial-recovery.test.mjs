import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Store } from '../src/store.mjs';
import { RevenueEngine } from '../src/revenue.mjs';

const SECRET = 'whsec_partial_recovery_test';

function cfg(dir) {
  return {
    baseUrl: 'https://audit.test',
    dataDir: dir,
    encryptionKey: 'a'.repeat(64),
    revenue: {
      publicIntake: true,
      publicRateLimitPerHour: 4,
      freeFindings: 1,
      fullAuditPrice: 49,
      strategyAuditPrice: 299,
      monitoringPrice: 99,
      implementationFrom: 1000,
      bookingUrl: '',
      reportDeliveryInbox: 'B',
      autoEmailReports: false,
      paymentProvider: 'links',
      fullAuditCheckoutUrl: 'https://shop.test/buy/full',
      strategyAuditCheckoutUrl: 'https://shop.test/buy/strategy',
      monitoringCheckoutUrl: 'https://shop.test/buy/watch',
      lemonWebhookSecret: SECRET,
      allowTestUnlock: true,
      monitoringIntervalDays: 30,
      monitoringBatchSize: 10
    },
    google: {},
    sender: { name: 'Mohamed' }
  };
}

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-payment-partial-recovery-'));
  const store = new Store(dir);
  await store.init();
  return { store, dir };
}

async function seed(store, config) {
  const pipeline = { running: true, paused: false, runBatch: async () => {} };
  const engine = new RevenueEngine(store, config, pipeline);
  const created = await engine.createLead({
    company: 'Recovery Acme',
    website: 'https://example.com',
    email: 'owner@example.com',
    industry: 'SaaS',
    consent: true
  }, '1.2.3.4');
  const lead = await store.get('leads', created.leadId);
  const prospect = await store.get('prospects', lead.prospectId);
  return { engine, pipeline, lead, prospect };
}

function payload({ eventId, leadId, prospectId }) {
  return {
    meta: {
      event_name: 'order_created',
      custom_data: { lead_id: leadId, prospect_id: prospectId, product: 'full' },
      test_mode: false
    },
    data: {
      id: eventId,
      type: 'orders',
      attributes: {
        total: 4900,
        currency: 'USD',
        status: 'paid',
        user_email: 'owner@example.com',
        created_at: new Date().toISOString(),
        test_mode: false
      }
    }
  };
}

function signedBody(value) {
  const raw = JSON.stringify(value);
  const signature = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
  return { raw, signature };
}

test('provider redelivery resumes a cleared payment when the first attempt persisted only the order witness', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, pipeline, lead, prospect } = await seed(store, config);
  const event = payload({ eventId: 'evt_partial_crash', leadId: lead.id, prospectId: prospect.id });
  const { raw, signature } = signedBody(event);

  const originalLog = store.log.bind(store);
  let injected = true;
  store.log = async (type, detail) => {
    if (injected && type === 'payment_classification') {
      injected = false;
      throw new Error('injected crash after order persistence');
    }
    return originalLog(type, detail);
  };

  await assert.rejects(
    () => engine.handleLemonWebhook(raw, signature),
    /injected crash after order persistence/
  );

  assert.equal((await store.list('orders')).length, 1, 'the provider order witness crossed the crash boundary');
  assert.equal((await store.list('revenueEvents')).length, 0, 'the economic effect did not complete before the crash');
  assert.equal((await store.get('leads', lead.id)).paymentStatus, 'unpaid', 'the lead is still unpaid after the partial attempt');

  store.log = originalLog;
  const restarted = new RevenueEngine(store, config, pipeline);
  await restarted.handleLemonWebhook(raw, signature);

  const recoveredLead = await store.get('leads', lead.id);
  const revenue = await store.list('revenueEvents');
  const orders = await store.list('orders');

  assert.equal(orders.length, 1, 'provider identity remains exactly-once');
  assert.equal(recoveredLead.paymentStatus, 'paid', 'redelivery must resume the incomplete logical payment');
  assert.equal(revenue.length, 1, 'recovery must create exactly one economic effect');
  assert.equal(revenue[0].amountCents, 4900);
  assert.equal(revenue[0].currency, 'USD');
});

test('a fully completed payment remains idempotent on provider redelivery', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seed(store, config);
  const event = payload({ eventId: 'evt_completed_duplicate', leadId: lead.id, prospectId: prospect.id });
  const { raw, signature } = signedBody(event);

  await engine.handleLemonWebhook(raw, signature);
  await engine.handleLemonWebhook(raw, signature);

  assert.equal((await store.list('orders')).length, 1);
  assert.equal((await store.list('revenueEvents')).length, 1, 'terminal duplicate must not double-count revenue');
  assert.equal((await store.get('leads', lead.id)).paymentStatus, 'paid');
});
