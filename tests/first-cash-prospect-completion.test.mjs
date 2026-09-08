import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalPaymentTruthDigest,
  createLeadPathSprint,
  advanceLeadPathSprint
} from '../src/lead-path-sprint-fulfillment.mjs';
import { routeProspectCompletion } from '../src/first-cash-prospect-completion.mjs';

const LEAD_ID = 'lead-paid-1';
const PROSPECT_ID = 'pros-paid-1';
const SKU = 'lead-path-revenue-leak-evidence-sprint-usd-450';

function inputReadySprint() {
  const baseTruth = {
    ok: true,
    policyVersion: 'payment-renewal-truth-1.6.0',
    leadId: LEAD_ID,
    status: 'PROVIDER_CLEARED_PAYMENT_PROVEN',
    stages: {
      CLEARED_PAYMENT: { status: 'PROVEN', evidenceRef: 'payment:order_created:evt-live-450' },
      PAYMENT_RETAINED: { status: 'PROVEN' }
    },
    verifiedProviderEventRefs: ['order_created:evt-live-450'],
    verifiedFirstPaymentProduct: SKU,
    contradictions: [],
    economics: {
      netProviderClearedRevenueCents: 45000,
      currency: 'USD',
      verifiedPaymentCount: 1,
      verifiedRenewalCount: 0,
      verifiedReversalCount: 0,
      unverifiedReversalCents: 0,
      reversedRevenueCents: 0
    },
    claimBoundary: {
      clearedPayment: 'SIGNED_PROVIDER_CALLBACK_PLUS_CLEARED_CLASSIFICATION_PLUS_LEDGER_MATCH',
      paymentProduct: 'THREE_WITNESS_PRODUCT_MATCH',
      retainedRevenue: 'PROVIDER_CLEARED_AND_NOT_REVERSED'
    }
  };
  const truth = { ...baseTruth, truthDigest: canonicalPaymentTruthDigest(baseTruth) };
  const created = createLeadPathSprint({
    customerRef: `lead:${LEAD_ID}`,
    paymentLeadId: LEAD_ID,
    canonicalPaymentTruth: truth,
    at: '2026-09-07T16:00:00.000Z'
  });
  assert.equal(created.ok, true, JSON.stringify(created.reasonCodes));
  const ready = advanceLeadPathSprint({ state: created, to: 'INPUT_READY', at: '2026-09-07T16:00:00.001Z' });
  assert.equal(ready.ok, true, JSON.stringify(ready.reasonCodes));
  return ready.state;
}

function traceableFinding() {
  return {
    code: 'missing-cta',
    title: 'No obvious primary action was detected',
    severity: 5,
    confidence: 0.94,
    evidenceUrl: 'https://acme.example/',
    evidenceExcerpt: 'No visible booking, contact, demo, quote, purchase, or start action was detected.'
  };
}

function fakeStore({ withEvidence = true } = {}) {
  const sprint = inputReadySprint();
  const lead = {
    id: LEAD_ID,
    company: 'Acme',
    prospectId: PROSPECT_ID,
    deliveryMode: 'paid-sprint',
    paidSprintId: sprint.sprintId,
    paidSprintSku: SKU,
    status: 'paid'
  };
  const prospect = {
    id: PROSPECT_ID,
    leadId: LEAD_ID,
    status: 'research-complete',
    completedAt: '2026-09-07T16:10:00.000Z',
    firstCashFulfillment: sprint,
    dossier: { company: 'Acme', pages: 1, riskFlags: [] },
    audit: withEvidence ? [traceableFinding()] : []
  };
  const rows = {
    leads: new Map([[lead.id, lead]]),
    prospects: new Map([[prospect.id, prospect]]),
    notifications: [],
    auditLog: []
  };
  return {
    rows,
    async get(collection, id) { return rows[collection]?.get(id) || null; },
    async patch(collection, id, patch) {
      const current = rows[collection]?.get(id);
      if (!current) return null;
      const next = { ...current, ...patch };
      rows[collection].set(id, next);
      return next;
    },
    async log(type, detail) {
      const row = { id: `audit-${rows.auditLog.length + 1}`, type, detail };
      rows.auditLog.push(row);
      return row;
    },
    async findOne(collection, filters) {
      const list = collection === 'notifications' ? rows.notifications : [];
      return list.find(row => Object.entries(filters || {}).every(([key, value]) => row[key] === value)) || null;
    },
    async add(collection, row) {
      if (collection !== 'notifications') throw new Error(`unexpected collection ${collection}`);
      rows.notifications.push(row);
      return row;
    },
    prospect() { return rows.prospects.get(PROSPECT_ID); },
    lead() { return rows.leads.get(LEAD_ID); }
  };
}

test('paid sprint with traceable evidence reaches DELIVERY_READY but never customer acceptance', async () => {
  const store = fakeStore({ withEvidence: true });
  let genericCalls = 0;
  const revenue = { async onProspectComplete() { genericCalls += 1; } };
  const result = await routeProspectCompletion({
    store,
    revenue,
    prospect: store.prospect(),
    date: new Date('2026-09-07T16:11:00.000Z')
  });
  assert.equal(result.ok, true, JSON.stringify(result.reasonCodes));
  assert.equal(result.status, 'FIRST_CASH_DELIVERY_READY');
  assert.equal(result.sprintStatus, 'DELIVERY_READY');
  assert.equal(result.commercialDeliveryCount, 0, 'delivery-ready must not become accepted paid delivery');
  assert.equal(genericCalls, 0, 'paid sprint must not enter generic report delivery');
  assert.equal(store.prospect().firstCashFulfillment.status, 'DELIVERY_READY');
  assert.equal(store.prospect().firstCashFulfillment.fulfillmentState.economicTruth.acceptedDelivery, false);
  assert.equal(store.lead().status, 'delivery-ready');
  assert.equal(store.rows.auditLog.filter(row => row.type === 'first_cash_delivery_ready').length, 1);
  assert.equal(store.rows.notifications.filter(row => row.type === 'paid_sprint_delivery_ready').length, 1);
});

test('paid sprint without traceable findings stops at QA_REQUIRED and cannot fall through to generic delivery', async () => {
  const store = fakeStore({ withEvidence: false });
  let genericCalls = 0;
  const result = await routeProspectCompletion({
    store,
    revenue: { async onProspectComplete() { genericCalls += 1; } },
    prospect: store.prospect(),
    date: new Date('2026-09-07T16:11:00.000Z')
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'FIRST_CASH_QA_REQUIRED');
  assert.ok(result.reasonCodes.includes('at-least-one-traceable-finding-required'));
  assert.equal(store.prospect().firstCashFulfillment.status, 'QA_REQUIRED');
  assert.equal(store.prospect().firstCashFulfillment.fulfillmentState.economicTruth.acceptedDelivery, false);
  assert.equal(store.lead().status, 'qa-required');
  assert.equal(genericCalls, 0);
  assert.equal(store.rows.notifications.filter(row => row.type === 'paid_sprint_qa_required').length, 1);
});

test('QA_REQUIRED replay remains fail closed when evidence is still missing', async () => {
  const store = fakeStore({ withEvidence: false });
  let genericCalls = 0;
  const revenue = { async onProspectComplete() { genericCalls += 1; } };
  const first = await routeProspectCompletion({
    store,
    revenue,
    prospect: store.prospect(),
    date: new Date('2026-09-07T16:11:00.000Z')
  });
  assert.equal(first.status, 'FIRST_CASH_QA_REQUIRED');

  const second = await routeProspectCompletion({
    store,
    revenue,
    prospect: store.prospect(),
    date: new Date('2026-09-07T16:12:00.000Z')
  });
  assert.equal(second.ok, false);
  assert.equal(second.status, 'FIRST_CASH_QA_REQUIRED');
  assert.equal(second.sprintStatus, 'QA_REQUIRED');
  assert.equal(store.prospect().firstCashFulfillment.status, 'QA_REQUIRED');
  assert.equal(store.prospect().firstCashFulfillment.fulfillmentState.economicTruth.acceptedDelivery, false);
  assert.equal(genericCalls, 0, 'QA replay must never fall into generic delivery');
  assert.equal(store.rows.notifications.filter(row => row.type === 'paid_sprint_qa_required').length, 1, 'recheck must not duplicate the founder notification');
});

test('QA_REQUIRED replay can recover to DELIVERY_READY after durable evidence improves', async () => {
  const store = fakeStore({ withEvidence: false });
  let genericCalls = 0;
  const revenue = { async onProspectComplete() { genericCalls += 1; } };
  const first = await routeProspectCompletion({
    store,
    revenue,
    prospect: store.prospect(),
    date: new Date('2026-09-07T16:11:00.000Z')
  });
  assert.equal(first.status, 'FIRST_CASH_QA_REQUIRED');
  assert.equal(store.prospect().firstCashFulfillment.status, 'QA_REQUIRED');

  await store.patch('prospects', PROSPECT_ID, { audit: [traceableFinding()] });
  const second = await routeProspectCompletion({
    store,
    revenue,
    prospect: store.prospect(),
    date: new Date('2026-09-07T16:12:00.000Z')
  });
  assert.equal(second.ok, true, JSON.stringify(second.reasonCodes));
  assert.equal(second.status, 'FIRST_CASH_DELIVERY_READY');
  assert.equal(second.sprintStatus, 'DELIVERY_READY');
  assert.equal(second.commercialDeliveryCount, 0);
  assert.equal(store.prospect().firstCashFulfillment.status, 'DELIVERY_READY');
  assert.equal(store.prospect().firstCashFulfillment.fulfillmentState.economicTruth.acceptedDelivery, false);
  assert.deepEqual(store.prospect().paidSprintQaReasonCodes, []);
  assert.equal(store.lead().status, 'delivery-ready');
  assert.equal(genericCalls, 0, 'recovered paid sprint must stay outside generic delivery');
  assert.equal(store.rows.notifications.filter(row => row.type === 'paid_sprint_delivery_ready').length, 1);
});

test('delivery-ready replay is idempotent and emits no duplicate receipt', async () => {
  const store = fakeStore({ withEvidence: true });
  const first = await routeProspectCompletion({ store, revenue: {}, prospect: store.prospect() });
  assert.equal(first.ok, true);
  const auditCount = store.rows.auditLog.length;
  const notificationCount = store.rows.notifications.length;
  const second = await routeProspectCompletion({ store, revenue: {}, prospect: store.prospect() });
  assert.equal(second.ok, true);
  assert.equal(second.status, 'FIRST_CASH_DELIVERY_ALREADY_READY');
  assert.equal(store.rows.auditLog.length, auditCount);
  assert.equal(store.rows.notifications.length, notificationCount);
});

test('generic prospect preserves the existing RevenueEngine completion path', async () => {
  let calls = 0;
  const result = await routeProspectCompletion({
    store: {},
    revenue: { async onProspectComplete(prospect) { calls += 1; assert.equal(prospect.id, 'generic-1'); } },
    prospect: { id: 'generic-1', status: 'ready' }
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'GENERIC_PROSPECT_COMPLETION_DELEGATED');
  assert.equal(calls, 1);
});
