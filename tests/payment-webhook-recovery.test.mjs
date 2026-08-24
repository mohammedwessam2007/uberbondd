import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Store } from '../src/store.mjs';
import { RevenueEngine } from '../src/revenue.mjs';

const SECRET = 'whsec_recovery_test_secret';
let sequence = 0;

function uniqueTag(prefix = 'case') {
  sequence += 1;
  return `${prefix}_${process.pid}_${Date.now()}_${sequence}`;
}

function cfg(dir) {
  return {
    baseUrl: 'https://audit.test', dataDir: dir, encryptionKey: 'a'.repeat(64),
    revenue: {
      publicIntake: true, publicRateLimitPerHour: 100, freeFindings: 1,
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

async function seedLead(store, config, tag = uniqueTag('lead')) {
  const pipeline = { running: true, paused: false, runBatch: async () => {} };
  const engine = new RevenueEngine(store, config, pipeline);
  const created = await engine.createLead({
    company: `Acme ${tag}`, website: `https://${tag.replace(/_/g, '-')}.example.com`,
    email: 'owner@example.com', industry: 'SaaS', consent: true
  }, `recovery-${tag}`);
  const lead = await store.get('leads', created.leadId);
  const prospect = await store.get('prospects', lead.prospectId);
  return { engine, lead, prospect };
}

function payload({ eventName, objectId, leadId, prospectId, amountCents = 4900, product = 'full', status = 'paid', refundedAmount }) {
  const attributes = {
    total: amountCents, currency: 'USD', status,
    user_email: 'owner@example.com', created_at: new Date().toISOString(), test_mode: false
  };
  if (refundedAmount !== undefined) attributes.refunded_amount = refundedAmount;
  return {
    meta: { event_name: eventName, custom_data: { lead_id: leadId, prospect_id: prospectId, product }, test_mode: false },
    data: { id: objectId, type: 'orders', attributes }
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
  const originalTransaction = store.transaction.bind(store);
  let armed = true;
  store.transaction = async fn => originalTransaction(async tx => {
    const originalLog = tx.log.bind(tx);
    tx.log = async (type, detail) => {
      if (armed && type === 'payment_classification') {
        armed = false;
        throw new Error('injected-crash-after-witness-before-economic-completion');
      }
      return originalLog(type, detail);
    };
    return fn(tx);
  });
  return () => { store.transaction = originalTransaction; };
}

test('redelivery resumes a payment witness left received after classification crash', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config);
  const event = payload({ eventName: 'order_created', objectId: 'order_recovery_sale', leadId: lead.id, prospectId: prospect.id });

  const restore = crashNextPaymentClassification(store);
  try {
    await assert.rejects(() => deliver(engine, event), /injected-crash-after-witness-before-economic-completion/);
  } finally {
    restore();
  }

  const [orderAfterCrash] = await store.list('orders');
  assert.equal(orderAfterCrash.processingStatus, 'received');
  assert.equal((await store.list('revenueEvents')).length, 0);
  assert.equal((await store.get('leads', lead.id)).paymentStatus, 'unpaid');

  const replay = await deliver(engine, event);
  assert.equal(replay.resumed, true);
  assert.equal(replay.classification, 'CLEARED_ONE_TIME_PAYMENT');
  assert.equal((await store.list('revenueEvents')).length, 1);
  assert.equal((await store.get('leads', lead.id)).paymentStatus, 'paid');
  assert.equal((await store.list('orders'))[0].processingStatus, 'completed');

  const terminalReplay = await deliver(engine, event);
  assert.equal(terminalReplay.duplicate, true);
  assert.equal((await store.list('revenueEvents')).length, 1);
});

test('redelivery resumes an incomplete refund and reverses exactly once', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config, uniqueTag('refund'));
  const objectId = 'order_recovery_refund';
  await deliver(engine, payload({ eventName: 'order_created', objectId, leadId: lead.id, prospectId: prospect.id }));

  const refund = payload({
    eventName: 'order_refunded', objectId, leadId: lead.id, prospectId: prospect.id,
    status: 'refunded', refundedAmount: 4900
  });
  const restore = crashNextPaymentClassification(store);
  try {
    await assert.rejects(() => deliver(engine, refund), /injected-crash-after-witness-before-economic-completion/);
  } finally {
    restore();
  }

  assert.equal((await store.list('orders')).length, 2);
  assert.equal((await store.list('orders')).filter(row => row.eventName === 'order_refunded')[0].processingStatus, 'received');
  assert.equal((await store.list('revenueEvents')).length, 1);

  const replay = await deliver(engine, refund);
  assert.equal(replay.resumed, true);
  assert.equal(replay.classification, 'REFUND_OR_DISPUTE');
  const revenue = await store.list('revenueEvents');
  assert.equal(revenue.length, 2);
  assert.equal(revenue.filter(row => row.amountCents < 0).length, 1);
  assert.equal(revenue.find(row => row.amountCents < 0).amountCents, -4900);

  const terminalReplay = await deliver(engine, refund);
  assert.equal(terminalReplay.duplicate, true);
  assert.equal((await store.list('revenueEvents')).length, 2);
});

test('concurrent duplicate deliveries have one completion winner and fifteen idempotent replays', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const { engine, lead, prospect } = await seedLead(store, config, uniqueTag('race'));
  const event = payload({ eventName: 'order_created', objectId: 'order_recovery_race', leadId: lead.id, prospectId: prospect.id });
  const results = await Promise.all(Array.from({ length: 16 }, () => deliver(engine, event)));

  assert.equal(results.filter(result => result.classification === 'CLEARED_ONE_TIME_PAYMENT').length, 1);
  assert.equal(results.filter(result => result.duplicate === true).length, 15);
  assert.equal((await store.list('revenueEvents')).filter(row => row.leadId === lead.id).length, 1);
});
