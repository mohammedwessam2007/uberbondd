import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { RevenueEngine } from '../src/revenue.mjs';
import { normalizeLemonEvent } from '../src/payments.mjs';

const SECRET = 'whsec_object_state_test';

function config(dir) {
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

async function setup() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-payment-object-state-'));
  const store = new Store(dir);
  await store.init();
  const cfg = config(dir);
  const pipeline = { running: true, paused: false, runBatch: async () => {} };
  const engine = new RevenueEngine(store, cfg, pipeline);
  const created = await engine.createLead({
    company: 'Object State Acme', website: 'https://example.com', email: 'owner@example.com',
    industry: 'SaaS', consent: true
  }, 'object-state-test');
  const lead = await store.get('leads', created.leadId);
  const prospect = await store.get('prospects', lead.prospectId);
  return { store, engine, lead, prospect };
}

function payload({
  eventName, orderId = 'order_1', leadId, prospectId, total = 4900,
  refundedAmount, status = 'paid', createdAt = '2026-08-25T00:00:00.000Z', updatedAt
}) {
  const attributes = {
    total, currency: 'USD', status, user_email: 'owner@example.com', created_at: createdAt,
    ...(updatedAt ? { updated_at: updatedAt } : {})
  };
  if (refundedAmount !== undefined) attributes.refunded_amount = refundedAmount;
  return {
    meta: {
      event_name: eventName,
      custom_data: { lead_id: leadId, prospect_id: prospectId, product: 'full' },
      test_mode: false
    },
    data: { id: orderId, type: 'orders', attributes }
  };
}

async function deliver(engine, object) {
  const raw = JSON.stringify(object);
  const signature = crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
  return engine.handleLemonWebhook(raw, signature);
}

test('one Lemon Order object can produce distinct order and refund occurrences', async () => {
  const { store, engine, lead, prospect } = await setup();
  const created = payload({ eventName: 'order_created', leadId: lead.id, prospectId: prospect.id });
  const partial = payload({
    eventName: 'order_refunded', leadId: lead.id, prospectId: prospect.id,
    refundedAmount: 2000, status: 'partial_refund', updatedAt: '2026-08-25T01:00:00.000Z'
  });

  const normalizedCreated = normalizeLemonEvent(created);
  const normalizedRefund = normalizeLemonEvent(partial);
  assert.equal(normalizedCreated.providerObjectId, normalizedRefund.providerObjectId);
  assert.notEqual(normalizedCreated.eventId, normalizedRefund.eventId);

  await deliver(engine, created);
  const result = await deliver(engine, partial);
  assert.equal(result.classification, 'REFUND_OR_DISPUTE');

  const orders = await store.list('orders');
  assert.equal(orders.length, 2);
  assert.equal(new Set(orders.map(row => row.providerObjectId)).size, 1);
  assert.equal(orders.find(row => row.eventName === 'order_refunded').amountCents, 2000);
  assert.equal(orders.find(row => row.eventName === 'order_refunded').providerCumulativeRefundedAmountCents, 2000);

  const revenue = await store.list('revenueEvents');
  assert.deepEqual(revenue.map(row => row.amountCents).sort((a, b) => a - b), [-2000, 4900]);
  assert.equal((await engine.summary()).grossRevenue, 29);
  assert.equal((await engine.summary()).refundedRevenue, 20);
});

test('repeated delivery of the same refund state is idempotent even when timestamps change', async () => {
  const { store, engine, lead, prospect } = await setup();
  await deliver(engine, payload({ eventName: 'order_created', leadId: lead.id, prospectId: prospect.id }));
  const first = payload({
    eventName: 'order_refunded', leadId: lead.id, prospectId: prospect.id,
    refundedAmount: 2000, status: 'partial_refund', updatedAt: '2026-08-25T01:00:00.000Z'
  });
  const replay = payload({
    eventName: 'order_refunded', leadId: lead.id, prospectId: prospect.id,
    refundedAmount: 2000, status: 'partial_refund', createdAt: '2026-08-25T09:00:00.000Z',
    updatedAt: '2026-08-25T02:00:00.000Z'
  });
  await deliver(engine, first);
  const result = await deliver(engine, replay);
  assert.equal(result.duplicate, true);
  assert.equal((await store.list('orders')).length, 2);
  assert.equal((await store.list('revenueEvents')).filter(row => row.amountCents < 0).length, 1);
});

test('an explicit webhook occurrence id is preferred and contradictions are reviewed', async () => {
  const { store, engine, lead, prospect } = await setup();
  const first = payload({ eventName: 'order_created', leadId: lead.id, prospectId: prospect.id });
  first.meta.webhook_id = 'webhook_occurrence_1';
  const changed = payload({ eventName: 'order_created', leadId: lead.id, prospectId: prospect.id, total: 5000 });
  changed.meta.webhook_id = 'webhook_occurrence_1';

  assert.equal(normalizeLemonEvent(first).eventId, 'webhook_occurrence_1');
  await deliver(engine, first);
  const result = await deliver(engine, changed);
  assert.equal(result.review, true);
  assert.ok(result.reasonCodes.includes('duplicate-provider-event-contradiction'));
  assert.equal((await store.list('orders')).length, 1);
});

test('successive cumulative refunds ledger only the newly refunded delta', async () => {
  const { store, engine, lead, prospect } = await setup();
  await deliver(engine, payload({ eventName: 'order_created', leadId: lead.id, prospectId: prospect.id }));
  await deliver(engine, payload({
    eventName: 'order_refunded', leadId: lead.id, prospectId: prospect.id,
    refundedAmount: 2000, status: 'partial_refund', updatedAt: '2026-08-25T01:00:00.000Z'
  }));
  const full = await deliver(engine, payload({
    eventName: 'order_refunded', leadId: lead.id, prospectId: prospect.id,
    refundedAmount: 4900, status: 'refunded', updatedAt: '2026-08-25T02:00:00.000Z'
  }));
  assert.equal(full.classification, 'REFUND_OR_DISPUTE');
  const refunds = (await store.list('revenueEvents')).filter(row => row.amountCents < 0);
  assert.deepEqual(refunds.map(row => row.amountCents).sort((a, b) => a - b), [-2900, -2000]);
  assert.equal(refunds.reduce((sum, row) => sum + Math.abs(row.amountCents), 0), 4900);
  const finalOrder = (await store.list('orders')).find(row => row.status === 'refunded');
  assert.equal(finalOrder.amountCents, 2900);
  assert.equal(finalOrder.providerCumulativeRefundedAmountCents, 4900);
});

test('an older refund snapshot cannot roll economic truth backward', async () => {
  const { store, engine, lead, prospect } = await setup();
  await deliver(engine, payload({ eventName: 'order_created', leadId: lead.id, prospectId: prospect.id }));
  await deliver(engine, payload({
    eventName: 'order_refunded', leadId: lead.id, prospectId: prospect.id,
    refundedAmount: 3000, status: 'partial_refund', updatedAt: '2026-08-25T03:00:00.000Z'
  }));
  const older = await deliver(engine, payload({
    eventName: 'order_refunded', leadId: lead.id, prospectId: prospect.id,
    refundedAmount: 2000, status: 'partial_refund', updatedAt: '2026-08-25T01:00:00.000Z'
  }));
  assert.equal(older.review, true);
  assert.ok(older.reasonCodes.includes('refund-cumulative-regression'));
  const refunds = (await store.list('revenueEvents')).filter(row => row.amountCents < 0);
  assert.deepEqual(refunds.map(row => row.amountCents), [-3000]);
  assert.equal((await store.list('auditLog')).filter(row => row.type === 'payment_classification' && row.detail.classification === 'REVIEW_REQUIRED').length, 1);
});

test('a refund exceeding the cleared order is quarantined without erasing revenue', async () => {
  const { store, engine, lead, prospect } = await setup();
  await deliver(engine, payload({ eventName: 'order_created', leadId: lead.id, prospectId: prospect.id }));
  const result = await deliver(engine, payload({
    eventName: 'order_refunded', leadId: lead.id, prospectId: prospect.id,
    refundedAmount: 5000, status: 'refunded', updatedAt: '2026-08-25T01:00:00.000Z'
  }));
  assert.equal(result.review, true);
  assert.ok(result.reasonCodes.includes('refund-exceeds-cleared-order'));
  assert.deepEqual((await store.list('revenueEvents')).map(row => row.amountCents), [4900]);
});
