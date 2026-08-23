import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import {
  reconcilePaymentRenewalTruth,
  reconcilePaymentRenewalTruthFromStore
} from '../src/payment-renewal-truth.mjs';

// The scope a caller asks about and the record a lookup returns were the same
// field. A lookup that found nothing collapsed the scope to null, which this
// module reads as "reconcile everything", so asking for the payment truth of a
// mistyped or deleted lead returned the whole book:
//
//   ask for "lead-alice" -> $50.00     verified 1  PROVIDER_CLEARED_PAYMENT_PROVEN
//   ask for "lead-typo"  -> $9,050.00  verified 2  PROVIDER_CLEARED_PAYMENT_PROVEN
//
// Both leads below are honest and internally consistent, so no witness-content
// check catches this. Only the scope does.

async function storeWithTwoLeads() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lead-scope-'));
  const store = new Store(dir);
  await store.init();
  for (const [lead, amountCents] of [['lead-alice', 5000], ['lead-bob', 900000]]) {
    const at = '2026-08-23T12:00:00Z';
    await store.add('leads', { id: lead, prospectId: 'p-' + lead, createdAt: at });
    await store.add('orders', {
      id: 'o-' + lead, provider: 'lemonsqueezy', providerEventId: 'ev-' + lead,
      eventName: 'order_created', leadId: lead, prospectId: 'p-' + lead,
      product: 'full', amountCents, currency: 'USD', status: 'paid', createdAt: at
    });
    await store.add('auditLog', {
      id: 'a-' + lead, type: 'payment_classification', createdAt: at,
      detail: {
        classification: 'CLEARED_ONE_TIME_PAYMENT', eventName: 'order_created',
        eventId: 'ev-' + lead, leadId: lead, prospectId: 'p-' + lead,
        product: 'full', amountCents, currency: 'USD', timestamp: at
      }
    });
    await store.add('revenueEvents', {
      id: 'r-' + lead, providerEventId: 'order_created:ev-' + lead, leadId: lead,
      prospectId: 'p-' + lead, product: 'full', kind: 'sale',
      amountCents, currency: 'USD', createdAt: at
    });
  }
  return store;
}

test('a known lead reconciles to its own payments', async () => {
  const store = await storeWithTwoLeads();
  const alice = await reconcilePaymentRenewalTruthFromStore(store, { leadId: 'lead-alice' });
  assert.equal(alice.economics.netProviderClearedRevenueCents, 5000);
  assert.equal(alice.economics.verifiedPaymentCount, 1);
  assert.equal(alice.status, 'PROVIDER_CLEARED_PAYMENT_PROVEN');

  const bob = await reconcilePaymentRenewalTruthFromStore(store, { leadId: 'lead-bob' });
  assert.equal(bob.economics.netProviderClearedRevenueCents, 900000);
  assert.equal(bob.economics.verifiedPaymentCount, 1);
});

test('a lead that does not exist does not inherit everyone else\'s revenue', async () => {
  const store = await storeWithTwoLeads();
  const result = await reconcilePaymentRenewalTruthFromStore(store, { leadId: 'lead-typo' });
  assert.equal(result.leadId, 'lead-typo');
  assert.equal(result.economics.netProviderClearedRevenueCents, 0);
  assert.equal(result.economics.verifiedPaymentCount, 0);
  assert.notEqual(result.status, 'PROVIDER_CLEARED_PAYMENT_PROVEN');
});

test('an unknown lead is reported unknown, not reported as zero', async () => {
  // $0.00 for a lead nobody can find is not a fact about that lead's payments.
  const store = await storeWithTwoLeads();
  const result = await reconcilePaymentRenewalTruthFromStore(store, { leadId: 'lead-deleted' });
  assert.ok(result.contradictions.includes('payment-truth-requested-for-unknown-lead'));
  assert.equal(result.ok, false);
  assert.equal(result.status, 'REVIEW_REQUIRED');
});

test('a known lead never raises the unknown-lead contradiction', async () => {
  const store = await storeWithTwoLeads();
  const result = await reconcilePaymentRenewalTruthFromStore(store, { leadId: 'lead-alice' });
  assert.ok(!result.contradictions.includes('payment-truth-requested-for-unknown-lead'));
});

test('naming no lead still reconciles the whole book, deliberately', async () => {
  const store = await storeWithTwoLeads();
  const result = await reconcilePaymentRenewalTruthFromStore(store, {});
  assert.equal(result.leadId, null);
  assert.equal(result.economics.verifiedPaymentCount, 2);
  assert.equal(result.economics.netProviderClearedRevenueCents, 905000);
  assert.ok(!result.contradictions.includes('payment-truth-requested-for-unknown-lead'));
});

test('the scope comes from what was asked, not from what was found', () => {
  // Same rows, no lead record at all: the caller's scope still applies.
  const at = '2026-08-23T12:00:00Z';
  const rows = lead => ({
    order: { id: 'o-' + lead, provider: 'lemonsqueezy', providerEventId: 'ev-' + lead, eventName: 'order_created', leadId: lead, prospectId: 'p', product: 'full', amountCents: 5000, currency: 'USD', status: 'paid', createdAt: at },
    audit: { type: 'payment_classification', createdAt: at, detail: { classification: 'CLEARED_ONE_TIME_PAYMENT', eventName: 'order_created', eventId: 'ev-' + lead, leadId: lead, prospectId: 'p', product: 'full', amountCents: 5000, currency: 'USD', timestamp: at } },
    revenue: { id: 'r-' + lead, providerEventId: 'order_created:ev-' + lead, leadId: lead, prospectId: 'p', product: 'full', kind: 'sale', amountCents: 5000, currency: 'USD', createdAt: at }
  });
  const a = rows('lead-a');
  const b = rows('lead-b');
  const scoped = reconcilePaymentRenewalTruth({
    leadId: 'lead-a',
    orders: [a.order, b.order], auditLog: [a.audit, b.audit], revenueEvents: [a.revenue, b.revenue]
  });
  assert.equal(scoped.economics.verifiedPaymentCount, 1);
  assert.equal(scoped.economics.netProviderClearedRevenueCents, 5000);
});

test('an explicit leadId wins over a lead record that disagrees', () => {
  const result = reconcilePaymentRenewalTruth({ lead: { id: 'from-record' }, leadId: 'from-caller' });
  assert.equal(result.leadId, 'from-caller');
});
