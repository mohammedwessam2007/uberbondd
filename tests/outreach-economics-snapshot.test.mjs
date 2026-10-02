import test from 'node:test';
import assert from 'node:assert/strict';
import { compileOutreachEconomicsSnapshot, buildOutreachEconomicsSnapshot } from '../src/outreach-economics-snapshot.mjs';

const NOW = new Date('2026-10-02T12:00:00Z');
const paid = (amountCents = 150000, currency = 'USD') => ({
  economics: { currency, currenciesPresent: [currency], byCurrency: { [currency]: { netCents: amountCents } }, netProviderClearedRevenueCents: amountCents, verifiedPaymentCount: 1, verifiedReversalCount: 0, unverifiedPositiveRevenueCents: 0 }
});
const none = { economics: { currency: null, currenciesPresent: [], byCurrency: {}, netProviderClearedRevenueCents: 0, verifiedPaymentCount: 0, verifiedReversalCount: 0, unverifiedPositiveRevenueCents: 0 } };
const funnel = { prospects: [{ id: 'p1', draft: 'x', contact: { verified: 'valid' }, replyLabel: 'positive', opportunityStage: 'opportunity', recipientEligibility: { decision: 'ALLOW_WITH_REQUIREMENTS' } }], messages: [{ prospectId: 'p1' }], replies: [{ prospectId: 'p1', classification: { label: 'positive' } }], outboundEvents: [{ eventType: 'sent' }, { eventType: 'hard_bounce' }] };
const snap = patch => compileOutreachEconomicsSnapshot({ ...funnel, paymentTruth: none, now: NOW, ...patch });

test('UNKNOWN stays UNKNOWN: with no cost receipts every cost-denominated metric is null, never zero', () => {
  const s = snap();
  assert.equal(s.costs.coverage, 'NO_COST_RECEIPTS');
  assert.equal(s.costs.totalCostCents, null);
  for (const [name, metric] of Object.entries(s.unitEconomics)) {
    assert.equal(metric.value, null, name);
    assert.equal(metric.status, 'UNKNOWN', name);
  }
  assert.equal(s.contributionCents, null);
  assert.equal(s.contributionStatus, 'UNKNOWN');
});

test('funnel counts come from real rows: provider-confirmed sends are outbound events of type sent, not messages', () => {
  const s = snap();
  assert.equal(s.counts.providerConfirmedSends, 1);
  assert.equal(s.counts.positiveReplies, 1);
  assert.equal(s.counts.opportunities, 1);
  assert.equal(s.counts.eligibleProspects, 1);
  assert.equal(s.counts.clearedPayments, 0);
});

test('with complete USD cost receipts and provider-cleared revenue, the metrics become known and contribution is net of cost', () => {
  const s = snap({ paymentTruth: paid(150000), costReceipts: [{ stage: 'send', currency: 'USD', costCents: 900 }, { stage: 'discovery', currency: 'USD', costCents: 100 }], ownerMinutes: 50 });
  assert.equal(s.costs.coverage, 'COST_RECEIPTS_COMPLETE_FOR_SUPPLIED_EVENTS');
  assert.equal(s.contributionCents, 149000);
  assert.equal(s.unitEconomics.costPerProviderConfirmedSendCents.value, 1000);
  assert.equal(s.unitEconomics.costPerQualifiedPositiveReplyCents.status, 'KNOWN_FOR_SUPPLIED_COST_RECEIPTS');
  assert.equal(s.unitEconomics.clearedContributionPer1000SendsCents.value, 149000000);
  assert.equal(s.unitEconomics.clearedContributionPerFounderMinuteCents.value, 2980);
});

test('partial cost coverage is a labelled lower bound, and an unknown receipt blocks contribution', () => {
  const s = snap({ paymentTruth: paid(), costReceipts: [{ stage: 'send', currency: 'USD', costCents: 100 }, { stage: 'enrichment', currency: 'USD', costCents: null }] });
  assert.equal(s.costs.coverage, 'PARTIAL_COST_COVERAGE');
  assert.equal(s.unitEconomics.costPerProviderConfirmedSendCents.status, 'LOWER_BOUND_PARTIAL_COST');
  assert.equal(s.contributionCents, null);
  assert.equal(s.unitEconomics.clearedContributionPerFounderMinuteCents.status, 'UNKNOWN');
});

test('a cost receipt in another or unstated currency is an unknown cost, not a guess', () => {
  const s = snap({ costReceipts: [{ stage: 'send', currency: 'EUR', costCents: 500 }, { stage: 'send', costCents: 500 }] });
  assert.equal(s.costs.unknownCostCount, 2);
  assert.equal(s.costs.totalCostCents, 0);
  assert.equal(s.costs.coverage, 'PARTIAL_COST_COVERAGE');
  assert.equal(s.contributionCents, null);
});

test('a "completed" order or a bare order row is NOT revenue: revenue comes only from provider-reconciled payment truth', () => {
  const s = compileOutreachEconomicsSnapshot({ ...funnel, orders: [{ status: 'completed', amountCents: 99900 }, { status: 'paid', amountCents: 99900 }], paymentTruth: none, costReceipts: [{ stage: 'send', currency: 'USD', costCents: 1 }], now: NOW });
  assert.equal(s.revenue.netProviderClearedRevenueCents, 0);
  assert.equal(s.revenue.status, 'NONE_CLEARED');
  assert.equal(s.counts.clearedPayments, 0);
  const unread = compileOutreachEconomicsSnapshot({ ...funnel, now: NOW });
  assert.equal(unread.revenue.status, 'UNKNOWN');
  assert.equal(unread.counts.clearedPayments, null);
});

test('mixed-currency revenue never becomes a contribution number', () => {
  const t = { economics: { currency: null, currenciesPresent: ['EUR', 'USD'], byCurrency: {}, netProviderClearedRevenueCents: 1000, verifiedPaymentCount: 2, verifiedReversalCount: 0, unverifiedPositiveRevenueCents: 0 } };
  const s = snap({ paymentTruth: t, costReceipts: [{ stage: 'send', currency: 'USD', costCents: 10 }] });
  assert.equal(s.contributionCents, null);
});

test('refunds are carried through from the canonical reconciler (net, not gross)', () => {
  const t = paid(10000); t.economics.netProviderClearedRevenueCents = 4000; t.economics.verifiedReversalCount = 1;
  const s = snap({ paymentTruth: t, costReceipts: [{ stage: 'send', currency: 'USD', costCents: 1000 }] });
  assert.equal(s.revenue.netProviderClearedRevenueCents, 4000);
  assert.equal(s.counts.refundsOrDisputes, 1);
  assert.equal(s.contributionCents, 3000);
});

test('the store-backed builder is read-only and uses the canonical payment reconciler', async () => {
  const calls = [];
  const store = { async list(name) { calls.push(name); return []; }, async get() { return null; }, add() { throw new Error('write'); }, patch() { throw new Error('write'); } };
  const s = await buildOutreachEconomicsSnapshot({ store, now: NOW });
  assert.equal(s.readOnly, true);
  assert.equal(s.sendAuthority, false);
  assert.ok(calls.includes('revenueEvents') && calls.includes('orders') && calls.includes('outboundEvents'));
  assert.equal(s.revenue.status, 'NONE_CLEARED');
  await assert.rejects(() => buildOutreachEconomicsSnapshot({ store: null }), /store-required/);
});
