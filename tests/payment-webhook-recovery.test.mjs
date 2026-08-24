import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Store, PostgresStore } from '../src/store.mjs';
import { RevenueEngine } from '../src/revenue.mjs';

const SECRET = 'whsec_recovery_test_secret';
const DATABASE_URL = process.env.OMNIA_V9_TEST_DATABASE_URL || '';
const pgSkip = !DATABASE_URL && 'set OMNIA_V9_TEST_DATABASE_URL';
let sequence = 0;

function uniqueTag(prefix = 'case') {
  sequence += 1;
  return `${prefix}_${process.pid}_${Date.now()}_${sequence}`;
}

function cfg(dir = '') {
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

async function postgresStore() {
  const store = new PostgresStore({ databaseUrl: DATABASE_URL, ssl: false });
  await store.init();
  return store;
}

async function seedLead(store, config, tag = uniqueTag('lead')) {
  const pipeline = { running: true, paused: false, runBatch: async () => {} };
  const engine = new RevenueEngine(store, config, pipeline);
  const created = await engine.createLead({
    company: `Acme ${tag}`, website: `https://${tag.replace(/_/g, '-')}.example.com`, email: 'owner@example.com',
    industry: 'SaaS', consent: true
  }, `recovery-${tag}`);
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

// The production repair logs classification through the transaction-scoped
// store so the receipt and economic writes share one commit. Inject the crash
// there, not at root store.log, otherwise the test would stop exercising the
// real crash boundary as soon as the source becomes transactional.
function crashNextPaymentClassification(store) {
  const originalTransaction = store.transaction.bind(store);
  let armed = true;
  store.transaction = async fn => originalTransaction(async tx => {
    const originalLog = tx.log.bind(tx);
    tx.log = async (type, detail) => {
      if (armed && type === 'payment_classification') {
        armed = false;
        throw new Error('injected-crash-after-order-before-classification');
      }
      return originalLog(type, detail);
    };
    return fn(tx);
  });
  return () => { store.transaction = originalTransaction; };
}

async function assertSaleCrashResume(store, config, tag = uniqueTag('sale')) {
  const { engine, pipeline, lead, prospect } = await seedLead(store, config, tag);
  const event = payload({ eventName: 'order_created', eventId: `evt_${tag}`, leadId: lead.id, prospectId: prospect.id });

  const restore = crashNextPaymentClassification(store);
  try {
    await assert.rejects(() => deliver(engine, event), /injected-crash-after-order-before-classification/);
  } finally {
    restore();
  }

  assert.equal((await store.list('orders')).filter(row => row.providerEventId === `evt_${tag}`).length, 1,
    'provider witness must survive the crash');
  assert.equal((await store.get('leads', lead.id)).paymentStatus, 'unpaid',
    'the rolled-back economic transaction must not leave a paid lead');
  assert.equal((await store.list('revenueEvents')).filter(row => row.providerEventId === `order_created:evt_${tag}`).length, 0,
    'the rolled-back economic transaction must not leave revenue');

  const restarted = new RevenueEngine(store, config, pipeline);
  const replay = await deliver(restarted, event);
  assert.equal(replay.duplicate, undefined, 'incomplete duplicate must RESUME rather than terminally dedupe');
  assert.equal(replay.resumed, true);
  assert.equal(replay.classification, 'CLEARED_ONE_TIME_PAYMENT');
  assert.equal((await store.get('leads', lead.id)).paymentStatus, 'paid');
  const revenue = (await store.list('revenueEvents')).filter(row => row.providerEventId === `order_created:evt_${tag}`);
  assert.equal(revenue.length, 1, 'resume must create exactly one economic effect');
  assert.equal(revenue[0].amountCents, 4900);

  const terminalReplay = await deliver(restarted, event);
  assert.equal(terminalReplay.duplicate, true, 'fully completed provider event must be IDEMPOTENT_REPLAY');
  assert.equal((await store.list('revenueEvents')).filter(row => row.providerEventId === `order_created:evt_${tag}`).length, 1);
}

test('cleared payment redelivery resumes after order persisted but classification crashed', async () => {
  const { store, dir } = await tempStore();
  await assertSaleCrashResume(store, cfg(dir));
});

test('refund redelivery resumes after order persisted but classification crashed and reverses exactly once', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const tag = uniqueTag('refund');
  const { engine, pipeline, lead, prospect } = await seedLead(store, config, tag);

  await deliver(engine, payload({ eventName: 'order_created', eventId: `evt_sale_${tag}`, leadId: lead.id, prospectId: prospect.id }));
  assert.equal((await store.list('revenueEvents')).filter(row => row.leadId === lead.id).length, 1);

  const refund = payload({ eventName: 'order_refunded', eventId: `evt_refund_${tag}`, leadId: lead.id, prospectId: prospect.id });
  const restore = crashNextPaymentClassification(store);
  try {
    await assert.rejects(() => deliver(engine, refund), /injected-crash-after-order-before-classification/);
  } finally {
    restore();
  }

  assert.equal((await store.list('orders')).filter(row => row.leadId === lead.id).length, 2, 'refund provider witness must survive the crash');
  assert.equal((await store.list('revenueEvents')).filter(row => row.leadId === lead.id).length, 1, 'refund effect must roll back with classification');

  const restarted = new RevenueEngine(store, config, pipeline);
  const replay = await deliver(restarted, refund);
  assert.equal(replay.duplicate, undefined, 'incomplete refund duplicate must RESUME rather than disappear');
  assert.equal(replay.resumed, true);
  assert.equal(replay.classification, 'REFUND_OR_DISPUTE');
  const revenue = (await store.list('revenueEvents')).filter(row => row.leadId === lead.id);
  assert.equal(revenue.length, 2, 'refund resume must append exactly one negative event');
  assert.equal(revenue.filter(row => row.amountCents < 0).length, 1);
  assert.ok((await store.get('leads', lead.id)).refundedAt);

  const terminalReplay = await deliver(restarted, refund);
  assert.equal(terminalReplay.duplicate, true);
  assert.equal((await store.list('revenueEvents')).filter(row => row.leadId === lead.id).length, 2,
    'terminal refund replay must not reverse twice');
});

test('same provider identity with changed money fails closed instead of resuming', async () => {
  const { store, dir } = await tempStore();
  const config = cfg(dir);
  const tag = uniqueTag('contradiction');
  const { engine, lead, prospect } = await seedLead(store, config, tag);
  const original = payload({ eventName: 'order_created', eventId: `evt_${tag}`, leadId: lead.id, prospectId: prospect.id, amountCents: 4900 });
  await deliver(engine, original);

  const contradictory = payload({ eventName: 'order_created', eventId: `evt_${tag}`, leadId: lead.id, prospectId: prospect.id, amountCents: 490000 });
  const result = await deliver(engine, contradictory);
  assert.equal(result.review, true);
  assert.equal(result.classification, 'REVIEW_REQUIRED');
  assert.ok(result.reasonCodes.includes('duplicate-provider-event-contradiction'));
  const revenue = (await store.list('revenueEvents')).filter(row => row.leadId === lead.id);
  assert.equal(revenue.length, 1, 'contradictory replay must not mint a second ledger row');
  assert.equal(revenue[0].amountCents, 4900, 'the first signed witness remains authoritative');
});

test('concurrent duplicate deliveries serialize to one economic effect under repeated stress', async () => {
  for (let round = 0; round < 12; round += 1) {
    const { store, dir } = await tempStore();
    const config = cfg(dir);
    const tag = uniqueTag(`race${round}`);
    const { engine, lead, prospect } = await seedLead(store, config, tag);
    const event = payload({ eventName: 'order_created', eventId: `evt_${tag}`, leadId: lead.id, prospectId: prospect.id });
    const results = await Promise.all(Array.from({ length: 16 }, () => deliver(engine, event)));
    assert.equal(results.filter(result => result?.classification === 'CLEARED_ONE_TIME_PAYMENT').length, 1,
      `round ${round}: exactly one caller may materialize the payment`);
    assert.equal(results.filter(result => result?.duplicate === true).length, 15,
      `round ${round}: every concurrent loser must become IDEMPOTENT_REPLAY`);
    assert.equal((await store.list('revenueEvents')).filter(row => row.leadId === lead.id).length, 1,
      `round ${round}: one provider event is one economic effect`);
  }
});

test('real PostgreSQL resumes order-only crash across a fresh store connection', { skip: pgSkip }, async () => {
  const tag = uniqueTag('pgresume');
  const config = cfg();
  let store = await postgresStore();
  let lead;
  let prospect;
  let event;
  try {
    const seeded = await seedLead(store, config, tag);
    lead = seeded.lead;
    prospect = seeded.prospect;
    event = payload({ eventName: 'order_created', eventId: `evt_${tag}`, leadId: lead.id, prospectId: prospect.id });
    const restore = crashNextPaymentClassification(store);
    try {
      await assert.rejects(() => deliver(seeded.engine, event), /injected-crash-after-order-before-classification/);
    } finally {
      restore();
    }
    assert.equal((await store.get('leads', lead.id)).paymentStatus, 'unpaid');
    assert.equal((await store.list('revenueEvents')).filter(row => row.leadId === lead.id).length, 0);
  } finally {
    await store.close();
  }

  store = await postgresStore();
  try {
    const pipeline = { running: true, paused: false, runBatch: async () => {} };
    const restarted = new RevenueEngine(store, config, pipeline);
    const replay = await deliver(restarted, event);
    assert.equal(replay.resumed, true, 'restart must RESUME the matching incomplete durable witness');
    assert.equal((await store.get('leads', lead.id)).paymentStatus, 'paid');
    assert.equal((await store.list('revenueEvents')).filter(row => row.leadId === lead.id).length, 1);
    const terminal = await deliver(restarted, event);
    assert.equal(terminal.duplicate, true);
    assert.equal((await store.list('revenueEvents')).filter(row => row.leadId === lead.id).length, 1);
  } finally {
    await store.close();
  }
});

test('real PostgreSQL concurrent replay has one winner and one ledger effect', { skip: pgSkip }, async () => {
  const tag = uniqueTag('pgrace');
  const config = cfg();
  const store = await postgresStore();
  try {
    const { engine, lead, prospect } = await seedLead(store, config, tag);
    const event = payload({ eventName: 'order_created', eventId: `evt_${tag}`, leadId: lead.id, prospectId: prospect.id });
    for (let round = 0; round < 8; round += 1) {
      const results = await Promise.all(Array.from({ length: 8 }, () => deliver(engine, event)));
      if (round === 0) {
        assert.equal(results.filter(result => result?.classification === 'CLEARED_ONE_TIME_PAYMENT').length, 1);
        assert.equal(results.filter(result => result?.duplicate === true).length, 7);
      } else {
        assert.equal(results.filter(result => result?.duplicate === true).length, 8,
          `postgres round ${round}: terminal replay must stay terminal`);
      }
      assert.equal((await store.list('revenueEvents')).filter(row => row.leadId === lead.id).length, 1,
        `postgres round ${round}: row locks must preserve exactly one economic effect`);
    }
  } finally {
    await store.close();
  }
});
