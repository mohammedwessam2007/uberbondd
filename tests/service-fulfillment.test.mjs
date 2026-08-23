import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFulfillmentPlan, applyFulfillmentEvent, summarizeFulfillment } from '../src/service-fulfillment.mjs';

function plan(overrides = {}) {
  return compileFulfillmentPlan({
    serviceSkuId: 'sku_ai_receptionist',
    customerRef: 'customer:demo-1',
    requirements: ['answer inbound calls', 'write CRM disposition'],
    acceptanceCriteria: ['test call reaches flow', 'CRM event exists'],
    maxRevisions: 2,
    supportWindowDays: 30,
    renewalIntervalDays: 30,
    date: '2026-08-23T00:00:00Z',
    ...overrides
  });
}

let eventCounter = 0;
function apply(state, type, extra = {}, at = '2026-08-23T01:00:00Z') {
  eventCounter += 1;
  return applyFulfillmentEvent({ state, event: { eventId: `evt_${eventCounter}`, type, at, ...extra } });
}

function reachAcceptancePending() {
  let s = plan();
  s = apply(s, 'WORK_STARTED').state;
  s = apply(s, 'WORK_COMPLETE').state;
  s = apply(s, 'QA_RESULT', { qaPassed: true, evidenceRef: 'qa:run-1' }).state;
  s = apply(s, 'DELIVERY_RECORDED', { artifactRefs: ['artifact:delivery-1'] }).state;
  s = apply(s, 'ACCEPTANCE_REQUESTED').state;
  return s;
}

test('plan requires requirements and acceptance criteria', () => {
  assert.equal(plan({ requirements: [] }).ok, false);
  assert.equal(plan({ acceptanceCriteria: [] }).ok, false);
});

test('new plan is zero-authority and does not infer revenue', () => {
  const p = plan();
  assert.equal(p.ok, true);
  assert.equal(p.status, 'PLANNED');
  assert.equal(p.businessEffectAuthority, 'NONE');
  assert.equal(p.economicTruth.clearedRevenue, 'NOT_INFERRED');
});

test('cannot deliver before QA', () => {
  const p = plan();
  const result = apply(p, 'DELIVERY_RECORDED', { artifactRefs: ['artifact:x'] });
  assert.equal(result.ok, false);
  assert.match(result.reasonCodes[0], /invalid-transition/);
});

test('QA fail routes back through revision work', () => {
  let s = plan();
  s = apply(s, 'WORK_STARTED').state;
  s = apply(s, 'WORK_COMPLETE').state;
  const failed = apply(s, 'QA_RESULT', { qaPassed: false, evidenceRef: 'qa:fail-1' });
  assert.equal(failed.status, 'QA_FAILED');
  const restarted = apply(failed.state, 'REVISION_STARTED');
  assert.equal(restarted.status, 'IN_PROGRESS');
});

test('QA evidence must be explicit and typed', () => {
  let s = plan();
  s = apply(s, 'WORK_STARTED').state;
  s = apply(s, 'WORK_COMPLETE').state;
  assert.equal(apply(s, 'QA_RESULT', { qaPassed: true }).ok, false);
  assert.equal(apply(s, 'QA_RESULT', { qaPassed: true, evidenceRef: 'evidence:not-qa' }).ok, false);
});

test('delivery requires artifact receipts', () => {
  let s = plan();
  s = apply(s, 'WORK_STARTED').state;
  s = apply(s, 'WORK_COMPLETE').state;
  s = apply(s, 'QA_RESULT', { qaPassed: true, evidenceRef: 'qa:pass' }).state;
  assert.equal(apply(s, 'DELIVERY_RECORDED').ok, false);
  assert.equal(apply(s, 'DELIVERY_RECORDED', { artifactRefs: ['delivery:not-artifact'] }).ok, false);
});

test('model claim cannot create customer acceptance', () => {
  const s = reachAcceptancePending();
  const result = apply(s, 'CUSTOMER_ACCEPTED', { evidenceClass: 'MODEL_OUTPUT', evidenceRef: 'customer:claimed' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('external-customer-acceptance-evidence-required'));
});

test('delivery receipt alone cannot create customer acceptance', () => {
  const s = reachAcceptancePending();
  const result = apply(s, 'CUSTOMER_ACCEPTED', { evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'delivery:receipt-1' });
  assert.equal(result.ok, false);
});

test('external customer acceptance creates accepted-delivery truth but not revenue', () => {
  const s = reachAcceptancePending();
  const accepted = apply(s, 'CUSTOMER_ACCEPTED', { evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:acceptance-1' });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.status, 'SUPPORT_ACTIVE');
  assert.equal(accepted.state.economicTruth.acceptedDelivery, true);
  assert.equal(accepted.state.economicTruth.clearedRevenue, 'NOT_INFERRED');
  assert.equal(accepted.state.businessEffectAuthority, 'NONE');
});

test('customer rejection requires external customer evidence', () => {
  const s = reachAcceptancePending();
  assert.equal(apply(s, 'CUSTOMER_REJECTED', { evidenceClass: 'MODEL_OUTPUT', evidenceRef: 'customer:nope' }).ok, false);
  assert.equal(apply(s, 'CUSTOMER_REJECTED', { evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:reject-1' }).status, 'REJECTED');
});

test('revision requests are bounded', () => {
  let s = reachAcceptancePending();
  s = apply(s, 'REVISION_REQUESTED', { evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:rev-1' }).state;
  s = apply(s, 'REVISION_STARTED').state;
  s = apply(s, 'WORK_COMPLETE').state;
  s = apply(s, 'QA_RESULT', { qaPassed: true, evidenceRef: 'qa:rev-1' }).state;
  s = apply(s, 'DELIVERY_RECORDED', { artifactRefs: ['artifact:rev-1'] }).state;
  s = apply(s, 'ACCEPTANCE_REQUESTED').state;
  s = apply(s, 'REVISION_REQUESTED', { evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:rev-2' }).state;
  s = apply(s, 'REVISION_STARTED').state;
  s = apply(s, 'WORK_COMPLETE').state;
  s = apply(s, 'QA_RESULT', { qaPassed: true, evidenceRef: 'qa:rev-2' }).state;
  s = apply(s, 'DELIVERY_RECORDED', { artifactRefs: ['artifact:rev-2'] }).state;
  s = apply(s, 'ACCEPTANCE_REQUESTED').state;
  const third = apply(s, 'REVISION_REQUESTED', { evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:rev-3' });
  assert.equal(third.ok, false);
  assert.ok(third.reasonCodes.includes('revision-limit-reached'));
});

test('missing durable event id fails closed', () => {
  const result = applyFulfillmentEvent({ state: plan(), event: { type: 'WORK_STARTED', at: '2026-08-23T01:00:00Z' } });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('durable-event-id-required'));
});

test('invalid explicit event time fails closed instead of falling back to now', () => {
  const result = applyFulfillmentEvent({ state: plan(), event: { type: 'WORK_STARTED', at: 'not-a-date', eventId: 'evt_bad_time' } });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('valid-event-time-required'));
});

test('event time cannot move fulfillment state backward', () => {
  const p = plan();
  const first = applyFulfillmentEvent({ state: p, event: { type: 'WORK_STARTED', at: '2026-08-23T02:00:00Z', eventId: 'evt_forward' } });
  const regressed = applyFulfillmentEvent({ state: first.state, event: { type: 'WORK_COMPLETE', at: '2026-08-23T01:00:00Z', eventId: 'evt_backward' } });
  assert.equal(regressed.ok, false);
  assert.ok(regressed.reasonCodes.includes('event-time-regression'));
});

test('duplicate identical event is idempotent', () => {
  const p = plan();
  const event = { type: 'WORK_STARTED', at: '2026-08-23T01:00:00Z', eventId: 'evt_fixed' };
  const first = applyFulfillmentEvent({ state: p, event });
  const second = applyFulfillmentEvent({ state: first.state, event });
  assert.equal(second.ok, true);
  assert.equal(second.result, 'DUPLICATE_IGNORED');
  assert.equal(second.state.eventLog.length, 1);
});

test('same event id with different content is rejected', () => {
  const p = plan();
  const first = applyFulfillmentEvent({ state: p, event: { type: 'WORK_STARTED', at: '2026-08-23T01:00:00Z', eventId: 'evt_fixed' } });
  const collision = applyFulfillmentEvent({ state: first.state, event: { type: 'CANCELLED', at: '2026-08-23T01:00:00Z', eventId: 'evt_fixed' } });
  assert.equal(collision.ok, false);
  assert.ok(collision.reasonCodes.includes('event-id-identity-collision'));
});

test('renewal cannot exist on nonrecurring service', () => {
  let s = plan({ renewalIntervalDays: null });
  s = apply(s, 'WORK_STARTED').state;
  s = apply(s, 'WORK_COMPLETE').state;
  s = apply(s, 'QA_RESULT', { qaPassed: true, evidenceRef: 'qa:x' }).state;
  s = apply(s, 'DELIVERY_RECORDED', { artifactRefs: ['artifact:x'] }).state;
  s = apply(s, 'ACCEPTANCE_REQUESTED').state;
  s = apply(s, 'CUSTOMER_ACCEPTED', { evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:ok' }).state;
  assert.equal(apply(s, 'RENEWAL_DUE').ok, false);
});

test('support and renewal cannot be fast-forwarded before their elapsed windows', () => {
  let s = reachAcceptancePending();
  s = apply(s, 'CUSTOMER_ACCEPTED', { evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:time-proof' }).state;

  const earlySupportEnd = apply(s, 'SUPPORT_ENDED', {}, '2026-08-24T01:00:00Z');
  assert.equal(earlySupportEnd.ok, false);
  assert.ok(earlySupportEnd.reasonCodes.includes('support-window-not-ended'));
  assert.equal(s.economicTruth.retainedCustomer, 'NOT_INFERRED');

  const earlyRenewal = apply(s, 'RENEWAL_DUE', {}, '2026-08-24T01:00:00Z');
  assert.equal(earlyRenewal.ok, false);
  assert.ok(earlyRenewal.reasonCodes.includes('renewal-not-due'));
  assert.equal(s.economicTruth.retainedCustomer, 'NOT_INFERRED');
});

test('support ending before a later renewal due date does not invent renewal due', () => {
  let s = plan({ supportWindowDays: 1, renewalIntervalDays: 30 });
  s = apply(s, 'WORK_STARTED').state;
  s = apply(s, 'WORK_COMPLETE').state;
  s = apply(s, 'QA_RESULT', { qaPassed: true, evidenceRef: 'qa:short-support' }).state;
  s = apply(s, 'DELIVERY_RECORDED', { artifactRefs: ['artifact:short-support'] }).state;
  s = apply(s, 'ACCEPTANCE_REQUESTED').state;
  s = apply(s, 'CUSTOMER_ACCEPTED', { evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:short-support' }).state;

  const supportEnded = apply(s, 'SUPPORT_ENDED', {}, '2026-08-24T01:00:00Z');
  assert.equal(supportEnded.ok, true);
  assert.equal(supportEnded.status, 'ACCEPTED');

  const earlyDue = apply(supportEnded.state, 'RENEWAL_DUE', {}, '2026-08-25T01:00:00Z');
  assert.equal(earlyDue.ok, false);
  assert.ok(earlyDue.reasonCodes.includes('renewal-not-due'));

  const due = apply(supportEnded.state, 'RENEWAL_DUE', {}, '2026-09-22T01:00:00Z');
  assert.equal(due.ok, true);
  assert.equal(due.status, 'RENEWAL_DUE');
});

test('renewal confirmation requires external payment evidence after elapsed due time', () => {
  let s = reachAcceptancePending();
  s = apply(s, 'CUSTOMER_ACCEPTED', { evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:ok-2' }).state;
  s = apply(s, 'SUPPORT_ENDED', {}, '2026-09-22T01:00:00Z').state;
  assert.equal(s.status, 'RENEWAL_DUE');
  assert.equal(apply(s, 'RENEWAL_CONFIRMED', { evidenceClass: 'MODEL_OUTPUT', evidenceRef: 'payment:fake' }, '2026-09-22T02:00:00Z').ok, false);
  const renewed = apply(s, 'RENEWAL_CONFIRMED', { evidenceClass: 'EXTERNAL_PAYMENT', evidenceRef: 'payment:settled-1' }, '2026-09-22T02:00:00Z');
  assert.equal(renewed.status, 'RENEWED');
  assert.equal(renewed.state.economicTruth.retainedCustomer, true);
  assert.equal(renewed.state.economicTruth.clearedRevenue, 'NOT_INFERRED');
});

test('customer churn requires external customer evidence', () => {
  let s = reachAcceptancePending();
  s = apply(s, 'CUSTOMER_ACCEPTED', { evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:ok-3' }).state;
  assert.equal(apply(s, 'CUSTOMER_CHURNED', { evidenceClass: 'MODEL_OUTPUT', evidenceRef: 'customer:fake-churn' }).ok, false);
  const churned = apply(s, 'CUSTOMER_CHURNED', { evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:cancel-1' });
  assert.equal(churned.status, 'CHURNED');
  assert.equal(churned.state.economicTruth.retainedCustomer, false);
});

test('unsupported event fails closed', () => {
  const result = apply(plan(), 'MAGIC_COMPLETE');
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('unsupported-fulfillment-event'));
});

test('summary keeps commercial truth boundaries explicit', () => {
  let s = reachAcceptancePending();
  s = apply(s, 'CUSTOMER_ACCEPTED', { evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'receipt:customer-signoff-1' }).state;
  const summary = summarizeFulfillment(s);
  assert.equal(summary.ok, true);
  assert.equal(summary.acceptedDelivery, true);
  assert.equal(summary.clearedRevenue, 'NOT_INFERRED');
  assert.equal(summary.claimBoundary.clearedRevenue, 'NOT_INFERRED_FROM_FULFILLMENT');
  assert.equal(summary.businessEffectAuthority, 'NONE');
  assert.deepEqual(Object.values(summary.externalEffectLedger), Array(8).fill(0));
});
