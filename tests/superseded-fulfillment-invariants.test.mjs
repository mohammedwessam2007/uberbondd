// Two ServiceSKU compilers and two acceptance state machines arrived within a
// day of each other, both exporting compileServiceSku, both defining a
// SERVICE_SKU_POLICY_VERSION. Neither was reachable from any entry point, so
// the duplication cost nothing in production and everything in comprehension:
// a reader had no way to tell which one the system meant.
//
// src/service-sku.mjs and src/service-fulfillment.mjs survive. They are a
// connected chain -- compileFulfillmentFromSku feeds one into the other -- and
// they carry support windows, renewal and churn, which the other pair did not
// model at all.
//
// Deleting a module is easy. Deleting the properties its tests asserted is
// not acceptable, so every invariant the superseded suites pinned is re-pinned
// here against the survivor. If one of these fails, the supersede was wrong.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileServiceSku, compileFulfillmentFromSku, PRICING_EVIDENCE_CLASSES } from '../src/service-sku.mjs';
import { applyFulfillmentEvent } from '../src/service-fulfillment.mjs';

function sku(overrides = {}) {
  return compileServiceSku({
    skuId: 'sku_receptionist',
    buyer: 'local clinic',
    pain: 'missed inbound calls',
    promise: 'answer and route every call',
    inputs: ['phone number'],
    requiredCapabilities: ['telephony'],
    deliveryRequirements: ['connect the number'],
    acceptanceCriteria: ['calls answered within policy'],
    recurringTrigger: 'every inbound call',
    pricing: { amountUsd: 2500, interval: 'MONTHLY', evidenceClass: 'CREATOR_CLAIM' },
    supportWindowDays: 30,
    renewalIntervalDays: 30,
    ...overrides
  });
}

// The plan is pinned to a fixed date and every event carries a matching clock.
// Without that, the plan is stamped at real now while these events claim
// 01:00-05:00Z, so the suite passed before 01:00 UTC and failed after it --
// a clock-of-day dependency, not a property.
const PLAN_AT = '2026-08-23T00:00:00Z';

function deliveredPlan() {
  const compiled = compileFulfillmentFromSku({ sku: sku(), customerRef: 'customer_1', date: PLAN_AT });
  assert.equal(compiled.ok, true);
  let state = compiled.fulfillmentPlan;
  const events = [
    { type: 'WORK_STARTED', at: '2026-08-23T01:00:00Z', eventId: 'e1' },
    { type: 'WORK_COMPLETE', at: '2026-08-23T02:00:00Z', eventId: 'e2' },
    { type: 'QA_RESULT', qaPassed: true, evidenceRef: 'qa:pass-1', at: '2026-08-23T03:00:00Z', eventId: 'e3' },
    { type: 'DELIVERY_RECORDED', artifactRefs: ['artifact:1'], at: '2026-08-23T04:00:00Z', eventId: 'e4' },
    { type: 'ACCEPTANCE_REQUESTED', at: '2026-08-23T05:00:00Z', eventId: 'e5' }
  ];
  for (const event of events) {
    const applied = applyFulfillmentEvent({ state, event, date: event.at });
    assert.equal(applied.ok, true, `${event.type}: ${applied.reasonCodes?.join(',')}`);
    state = applied.state;
  }
  return state;
}

test('a bounded ServiceSKU compiles without granting external consequence', () => {
  const compiled = sku();
  assert.equal(compiled.ok, true);
  assert.equal(compiled.businessEffectAuthority, 'NONE');
  for (const value of Object.values(compiled.externalEffectLedger)) assert.equal(value, 0);
});

test('the compiler refuses an underspecified offer instead of inventing defaults', () => {
  assert.equal(compileServiceSku({ skuId: 'x' }).ok, false);
  assert.equal(sku({ recurringTrigger: null }).ok, false);
  assert.equal(sku({ acceptanceCriteria: [] }).ok, false);
  assert.equal(sku({ promise: '' }).ok, false);
});

test('a creator claim cannot become a verified transaction by amount alone', () => {
  const inflated = sku({
    pricing: { amountUsd: 999_999, interval: 'MONTHLY', evidenceClass: 'CREATOR_CLAIM', verifiedTransactionEvidence: true }
  });
  const serialized = JSON.stringify(inflated);
  assert.ok(!serialized.includes('VERIFIED_TRANSACTION'), 'a claimed amount was promoted to transaction evidence');
  assert.ok(PRICING_EVIDENCE_CLASSES.includes('CREATOR_CLAIM'));
  assert.ok(PRICING_EVIDENCE_CLASSES.includes('VERIFIED_TRANSACTION'));
});

test('delivery cannot begin without an exact customer and sku identity', () => {
  assert.equal(compileFulfillmentFromSku({ sku: sku(), customerRef: '' }).ok, false);
  assert.equal(compileFulfillmentFromSku({ sku: { ok: false }, customerRef: 'customer_1' }).ok, false);
});

test('model, operator, synthetic and internal evidence can never self-accept a delivery', () => {
  const pending = deliveredPlan();
  for (const evidenceOrigin of ['MODEL_OUTPUT', 'OPERATOR_ASSERTION', 'SYNTHETIC', 'INTERNAL_DETERMINISTIC']) {
    const attempt = applyFulfillmentEvent({
      state: pending,
      event: { type: 'CUSTOMER_ACCEPTED', evidenceRef: 'x', evidenceOrigin, at: '2026-08-23T06:00:00Z', eventId: `acc_${evidenceOrigin}` },
      date: '2026-08-23T06:00:00Z'
    });
    assert.ok(
      !attempt.ok || !['ACCEPTED', 'SUPPORT_ACTIVE'].includes(attempt.state?.status),
      `${evidenceOrigin} was allowed to accept a delivery on the customer's behalf`
    );
  }
});

test('a delivery stays unaccepted until customer-origin evidence arrives', () => {
  const pending = deliveredPlan();
  assert.equal(pending.status, 'ACCEPTANCE_PENDING');
  assert.notEqual(pending.economicTruth?.acceptedDelivery, true);
});

test('every fulfillment transition receipt reports zero external effect', () => {
  const pending = deliveredPlan();
  for (const value of Object.values(pending.externalEffectLedger || {})) assert.equal(value, 0);
  assert.equal(pending.businessEffectAuthority, 'NONE');
});

test('a repeated event id cannot be reused for contradictory content', () => {
  const compiled = compileFulfillmentFromSku({ sku: sku(), customerRef: 'customer_1', date: PLAN_AT });
  const first = applyFulfillmentEvent({
    state: compiled.fulfillmentPlan,
    event: { type: 'WORK_STARTED', at: '2026-08-23T01:00:00Z', eventId: 'shared' },
    date: '2026-08-23T01:00:00Z'
  });
  assert.equal(first.ok, true);
  const collision = applyFulfillmentEvent({
    state: first.state,
    event: { type: 'CANCELLED', at: '2026-08-23T01:00:00Z', eventId: 'shared' },
    date: '2026-08-23T01:00:00Z'
  });
  assert.ok(!collision.ok || collision.state.status !== 'CANCELLED');
});
