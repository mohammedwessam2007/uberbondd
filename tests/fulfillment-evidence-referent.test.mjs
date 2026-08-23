import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFulfillmentPlan, applyFulfillmentEvent } from '../src/service-fulfillment.mjs';

// Every evidence check in this module was a prefix test and nothing more, so a
// bare prefix satisfied all of them:
//
//   qa:        -> QA passed
//   artifact:  -> delivery recorded
//   customer:  -> external customer acceptance, economicTruth.acceptedDelivery = true
//
// `customer:   ` worked too. A reference with no referent is the acceptance
// equivalent of an unwitnessed revenue row: correct shape, no content. And
// acceptance is the single gate between "we delivered" and "the customer agreed
// we delivered", which is what the whole economic truth chain hangs on.

const plan = () => compileFulfillmentPlan({
  serviceSkuId: 'sku-1', customerRef: 'cust-1',
  requirements: ['a requirement long enough to be real'],
  acceptanceCriteria: ['an acceptance criterion long enough to be real']
});

function driver() {
  const start = plan();
  const base = new Date(start.updatedAt).getTime();
  let state = start;
  return {
    at: n => new Date(base + n * 60000).toISOString(),
    get state() { return state; },
    step(n, event) {
      const result = applyFulfillmentEvent({
        state,
        event: { at: new Date(base + n * 60000).toISOString(), eventId: `ev-${n}`, ...event },
        date: new Date(base + (n + 1) * 60000)
      });
      if (result.ok !== false && !(result.reasonCodes || []).length && result.state) state = result.state;
      return result;
    }
  };
}

const refused = result => (result.reasonCodes || []).length > 0;

test('a bare qa prefix does not pass QA', () => {
  const d = driver();
  d.step(1, { type: 'WORK_STARTED' });
  d.step(2, { type: 'WORK_COMPLETE' });
  assert.ok(refused(d.step(3, { type: 'QA_RESULT', qaPassed: true, evidenceRef: 'qa:' })));
  assert.ok(refused(d.step(3, { type: 'QA_RESULT', qaPassed: true, evidenceRef: 'qa:   ' })));
  // Positive control.
  const ok = d.step(3, { type: 'QA_RESULT', qaPassed: true, evidenceRef: 'qa:run-1' });
  assert.ok(!refused(ok));
  assert.equal(d.state.status, 'READY_FOR_DELIVERY');
});

test('a bare artifact prefix does not record a delivery', () => {
  const d = driver();
  d.step(1, { type: 'WORK_STARTED' });
  d.step(2, { type: 'WORK_COMPLETE' });
  d.step(3, { type: 'QA_RESULT', qaPassed: true, evidenceRef: 'qa:run-1' });
  assert.ok(refused(d.step(4, { type: 'DELIVERY_RECORDED', artifactRefs: ['artifact:'] })));
  assert.ok(refused(d.step(4, { type: 'DELIVERY_RECORDED', artifactRefs: ['artifact:report-1', 'artifact:'] })),
    'one empty reference among real ones is still an empty reference');
  const ok = d.step(4, { type: 'DELIVERY_RECORDED', artifactRefs: ['artifact:report-1'] });
  assert.ok(!refused(ok));
  assert.equal(d.state.status, 'DELIVERED');
});

function atAcceptancePending() {
  const d = driver();
  d.step(1, { type: 'WORK_STARTED' });
  d.step(2, { type: 'WORK_COMPLETE' });
  d.step(3, { type: 'QA_RESULT', qaPassed: true, evidenceRef: 'qa:run-1' });
  d.step(4, { type: 'DELIVERY_RECORDED', artifactRefs: ['artifact:report-1'] });
  d.step(5, { type: 'ACCEPTANCE_REQUESTED' });
  assert.equal(d.state.status, 'ACCEPTANCE_PENDING');
  return d;
}

test('a bare customer prefix is not customer acceptance', () => {
  for (const ref of ['customer:', 'customer:   ', 'receipt:', 'receipt:\t', 'customer:\n ']) {
    const d = atAcceptancePending();
    const result = d.step(6, { type: 'CUSTOMER_ACCEPTED', evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: ref });
    assert.ok(refused(result), `${JSON.stringify(ref)} was accepted as customer evidence`);
    assert.ok(result.reasonCodes.includes('external-customer-acceptance-evidence-required'));
  }
});

test('real external customer evidence is still accepted, and is what sets acceptedDelivery', () => {
  const d = atAcceptancePending();
  const result = d.step(6, {
    type: 'CUSTOMER_ACCEPTED', evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:signed-off-2026-08'
  });
  assert.ok(!refused(result));
  assert.equal(result.state.economicTruth.acceptedDelivery, true);
  assert.equal(result.state.acceptanceEvidenceRef, 'customer:signed-off-2026-08');
});

test('a single character referent is enough, because shape is not quality', () => {
  // The rule is that the reference points at something, not that the something
  // is well chosen. A deliberate false identifier is fraud, which no shape check
  // catches; an empty one is a bug, which this one does.
  const d = atAcceptancePending();
  const result = d.step(6, { type: 'CUSTOMER_ACCEPTED', evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:x' });
  assert.ok(!refused(result));
});

test('the wrong evidence class is still refused whatever the referent', () => {
  for (const evidenceClass of ['INTERNAL', 'TEST_FIXTURE', 'EXTERNAL_PAYMENT', 'external_customer', undefined]) {
    const d = atAcceptancePending();
    const result = d.step(6, { type: 'CUSTOMER_ACCEPTED', evidenceClass, evidenceRef: 'customer:signed-off' });
    assert.ok(refused(result), `evidenceClass ${JSON.stringify(evidenceClass)} was accepted`);
  }
});

test('a qa reference cannot stand in for customer acceptance', () => {
  const d = atAcceptancePending();
  const result = d.step(6, { type: 'CUSTOMER_ACCEPTED', evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'qa:run-1' });
  assert.ok(refused(result));
});
