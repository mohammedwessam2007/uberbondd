import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { reconcilePaymentRenewalTruthFromStore } from '../src/payment-renewal-truth.mjs';

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-payment-truth-envelope-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

async function seedProviderClearedPayment(store, { eventId = 'evt_store_1', amountCents = 4900 } = {}) {
  const lead = { id: 'lead_store_1', prospectId: 'pros_store_1', paymentStatus: 'paid', createdAt: '2026-08-23T00:00:00.000Z' };
  await store.add('leads', lead);
  await store.add('orders', {
    id: 'order_store_1', provider: 'lemonsqueezy', providerEventId: eventId,
    eventName: 'order_created', leadId: lead.id, prospectId: lead.prospectId,
    amountCents, currency: 'USD', status: 'paid', createdAt: '2026-08-23T00:01:00.000Z'
  });
  await store.add('revenueEvents', {
    id: 'rev_store_1', providerEventId: `order_created:${eventId}`,
    leadId: lead.id, prospectId: lead.prospectId, product: 'full', kind: 'sale',
    amountCents, currency: 'USD', createdAt: '2026-08-23T00:02:00.000Z'
  });
  await store.log('payment_classification', {
    classification: 'CLEARED_ONE_TIME_PAYMENT', reasonCodes: ['provider-cleared'],
    eventName: 'order_created', eventId, leadId: lead.id, prospectId: lead.prospectId,
    product: 'full', testMode: false, shouldUnlock: true, shouldRecordRevenue: true,
    revenueKind: 'sale', policyVersion: 'payment-truth-1.0.0', timestamp: '2026-08-23T00:01:30.000Z'
  });
  return lead;
}

test('store.log canonical {type, detail} payment receipt proves the matching provider-cleared payment', async () => {
  const store = await tempStore();
  const lead = await seedProviderClearedPayment(store);

  const rawAudit = await store.list('auditLog');
  assert.equal(rawAudit.length, 1);
  assert.equal(rawAudit[0].type, 'payment_classification');
  assert.equal(rawAudit[0].classification, undefined);
  assert.equal(rawAudit[0].detail.classification, 'CLEARED_ONE_TIME_PAYMENT');

  const result = await reconcilePaymentRenewalTruthFromStore(store, { leadId: lead.id });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'PROVIDER_CLEARED_PAYMENT_PROVEN');
  assert.equal(result.stages.CLEARED_PAYMENT.status, 'PROVEN');
  assert.equal(result.economics.providerClearedRevenueCents, 4900);
  assert.deepEqual(result.verifiedProviderEventRefs, ['order_created:evt_store_1']);
});

test('nested detail cannot spoof the audit envelope type', async () => {
  const store = await tempStore();
  const lead = await seedProviderClearedPayment(store, { eventId: 'evt_spoof' });
  const rows = await store.list('auditLog');
  await store.patch('auditLog', rows[0].id, {
    type: 'unrelated_event',
    detail: { ...rows[0].detail, type: 'payment_classification' }
  });

  const result = await reconcilePaymentRenewalTruthFromStore(store, { leadId: lead.id });
  assert.equal(result.stages.CLEARED_PAYMENT.status, 'NOT_PROVEN');
  assert.equal(result.economics.providerClearedRevenueCents, 0);
  assert.ok(result.contradictions.includes('positive-revenue-row-without-provider-cleared-proof'));
});
