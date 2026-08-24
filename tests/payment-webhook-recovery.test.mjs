import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Store } from '../src/store.mjs';
import { RevenueEngine } from '../src/revenue.mjs';

const SECRET = 'whsec_recovery_test_secret';

function cfg(dir) {
  return {
    baseUrl: 'https://audit.test', dataDir: dir, encryptionKey: 'a'.repeat(64),
    revenue: {
      publicIntake: true, publicRateLimitPerHour: 4, freeFindings: 1,
      fullAuditPrice: 49, strategyAuditPrice: 299, monitoringPrice: 99,
      implementationFrom: 1000, bookingUrl: '', reportDeliveryInbox: 'B',
      autoEmailReports: false, paymentProvider: 'links',
      fullAuditCheckoutUrl: 'https://shop.test/buy/full',
      strategyAuditCheckoutUrl: 'https://shop.test/buy/strategy',
      monitoringCheckoutUrl: 'https://shop.test/buy/watch',
      lemonWebhookSecret: SECRET, allowTestUnlock: true,
      monitoringIntervalDays: 30, monitoringBatchSize: 10
    },
    google: {}, sender: { name: 'Mohamed' }
  };
}

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-payment-recovery-'));
  const store = new Store(dir);
  await store.init();
  return { store, dir };
}

async function seedLead(store, config) {
  const pipeline = { running: true, paused: false, runBatch: async () => {} };
  const engine = new RevenueEngine(store, config, pipeline);
  const created = await engine.createLead({
    company: 'Acme', website: 'https://example.com', email: 'owner@example.com',
    industry: 'SaaS', consent: true
  }, '1.2.3.4');
  const lead = await store.get('leads', created.leadId);
  const prospect = await store.get('prospects', lead.prospectId);
  return { engine, pipeline, lead, prospect };
}

function payload({ eventName, eventId, leadId, prospectId, amountCents = 4900, product = 'full', status = 'paid' }) {
  return {
    meta: {
      event_name: eventName,
      custom_data: { lead_id: leadId, prospect_id: prospectId, product },
      test_mode: false
    },
    data: {
      id: eventId,
      type: 'orders',
      attributes: {
        total: amountCents, currency: 'USD', status,
        user_email: 'owner@example.com', created_at: new Date().toISOString(), test_mode: false
      }
    }
  };
}

function signed(body) {
  return crypto.createHmac('sha256', SECRET).update(body).digest('hex');
}

async function deliver(engine, object) {
  const body = JSON.stringify(object);
  return engine.handleLemonWebhook(body, signed(body));
}

function crashNextPaymentClassification(store) {
  const original = store.log.bind(store);
  let armed = true;
  store.log = async (type, detail) => {
    if (armed && type === 'payment_classification') {
      armed = false;
      throw new Error('injected-crash-after-order-before-classification');
    }
    return original(type, detail);
  };
  return () => { store.log = original; };
}

test('cleared payment redelivery resumes after order persisted but classification crashed', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, pipeline, lead, prospect } = await seedLead(store, config);
  const event = payload({ eventName: 'order_created', eventId: 'evt_resume_sale', leadId: lead.id, prospectId: prospect.id });

  const restore = crashNextPaymentClassification(store);
  await assert.rejects(() => deliver(engine, event), /injected-crash-after-order-before-classification/);
  restore();

  assert.equal((await store.list('orders')).length, 1, 'provider witness must survive the crash');
  assert.equal((await store.get('leads', lead.id)).paymentStatus, 'unpaid', 'economic effect did not complete before the crash');
  assert.equal((await store.list('revenueEvents')).length, 0);

  const restarted = new RevenueEngine(store, config, pipeline);
  const replay = await deliver(restarted, event);

  assert.equal(replay.duplicate, undefined, 'incomplete duplicate must resume rather than terminally dedupe');
  assert.equal(replay.classification, 'CLEARED_ONE_TIME_PAYMENT');
  assert.equal((await store.get('leads', lead.id)).paymentStatus, 'paid');
  const revenue = await store.list('revenueEvents');
  assert.equal(revenue.length, 1, 'resume must create exactly one economic effect');
  assert.equal(revenue[0].amountCents, 4900);

  const terminalReplay = await deliver(restarted, event);
  assert.equal(terminalReplay.duplicate, true, 'fully completed provider event must remain terminally idempotent');
  assert.equal((await store.list('revenueEvents')).length, 1);
});

test('refund redelivery resumes after order persisted but classification crashed and reverses exactly once', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, pipeline, lead, prospect } = await seedLead(store, config);

  await deliver(engine, payload({ eventName: 'order_created', eventId: 'evt_original_sale', leadId: lead.id, prospectId: prospect.id }));
  assert.equal((await store.list('revenueEvents')).length, 1);

  const refund = payload({ eventName: 'order_refunded', eventId: 'evt_resume_refund', leadId: lead.id, prospectId: prospect.id });
  const restore = crashNextPaymentClassification(store);
  await assert.rejects(() => deliver(engine, refund), /injected-crash-after-order-before-classification/);
  restore();

  assert.equal((await store.list('orders')).length, 2, 'refund provider witness must survive the crash');
  assert.equal((await store.list('revenueEvents')).length, 1, 'refund economic effect did not complete before the crash');

  const restarted = new RevenueEngine(store, config, pipeline);
  const replay = await deliver(restarted, refund);

  assert.equal(replay.duplicate, undefined, 'incomplete refund duplicate must resume rather than disappear');
  assert.equal(replay.classification, 'REFUND_OR_DISPUTE');
  const revenue = await store.list('revenueEvents');
  assert.equal(revenue.length, 2, 'refund resume must append exactly one negative event');
  assert.equal(revenue.filter(row => row.amountCents < 0).length, 1);
  assert.equal((await restarted.summary()).grossRevenue, 0);
  assert.ok((await store.get('leads', lead.id)).refundedAt);

  const terminalReplay = await deliver(restarted, refund);
  assert.equal(terminalReplay.duplicate, true);
  assert.equal((await store.list('revenueEvents')).length, 2, 'terminal refund replay must not reverse twice');
});
