import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SPRINT_STATES,
  applySprintEvent,
  commercialDeliveryCount,
  openLeadPathSprint,
  runSyntheticFulfillmentCanary,
  summarizeLeadPathSprint
} from '../src/lead-path-sprint-fulfillment.mjs';

const START = '2026-09-02T00:00:00.000Z';
const minute = n => new Date(Date.parse(START) + n * 60_000).toISOString();

function openCommercialSprint(overrides = {}) {
  return openLeadPathSprint({
    customerRef: 'cust_agency_1',
    requirements: ['one HVAC lead-path export covering 30 days'],
    acceptanceCriteria: ['every reported leak is reproducible from the export'],
    paymentEvidence: { origin: 'EXTERNAL', evidenceClass: 'EXTERNAL_PAYMENT', evidenceRef: 'payment:pi_test_1' },
    date: new Date(START),
    ...overrides
  });
}

// applySprintEvent returns a result envelope carrying the new sprint under
// `.sprint`; the sprint itself is what the next call takes. Feeding the
// envelope back reports valid-sprint-state-required, which reads like a
// rejected transition and is really a caller mistake.
function drive(sprint, events) {
  let cursor = sprint;
  for (const [index, event] of events.entries()) {
    const applied = applySprintEvent({
      sprint: cursor,
      event: { eventId: `evt_${index + 1}`, origin: 'INTERNAL', at: minute(index + 1), ...event }
    });
    if (!applied.ok) return applied;
    cursor = applied.sprint;
  }
  return { ok: true, sprint: cursor, state: cursor.state, reasonCodes: [] };
}

const TO_DELIVERED = [
  { type: 'INPUTS_RECEIVED' },
  { type: 'ANALYSIS_STARTED' },
  { type: 'ANALYSIS_COMPLETE' },
  { type: 'QA_RESULT', qaPassed: true, evidenceRef: 'qa:internal-check' },
  { type: 'DELIVERY_PACKAGED' },
  { type: 'DELIVERY_SENT', artifactRefs: ['artifact:evidence-pack-1'] }
];

test('a commercial sprint cannot open without external payment evidence', () => {
  const unpaid = openLeadPathSprint({
    customerRef: 'cust_agency_1',
    requirements: ['x'],
    acceptanceCriteria: ['y'],
    date: new Date(START)
  });
  assert.equal(unpaid.ok, false);
  assert.ok(unpaid.reasonCodes.includes('commercial-sprint-requires-external-payment-evidence'));

  // An internally asserted payment is the same thing as no payment.
  const selfAsserted = openCommercialSprint({
    paymentEvidence: { origin: 'INTERNAL', evidenceClass: 'EXTERNAL_PAYMENT', evidenceRef: 'payment:pi_test_1' }
  });
  assert.equal(selfAsserted.ok, false);
  assert.ok(selfAsserted.reasonCodes.includes('commercial-sprint-requires-external-payment-origin'));

  assert.equal(openCommercialSprint().ok, true);
});

test('the sprint opens at PAID and refuses to skip ahead', () => {
  const sprint = openCommercialSprint();
  assert.equal(sprint.state, 'PAID');

  const skipped = applySprintEvent({
    sprint,
    event: { eventId: 'evt_jump', type: 'DELIVERY_SENT', origin: 'INTERNAL', at: minute(1) }
  });
  assert.equal(skipped.ok, false, 'a sprint jumped from PAID straight to DELIVERED');
});

test('the whole legal path reaches DELIVERED', () => {
  const delivered = drive(openCommercialSprint(), TO_DELIVERED);
  assert.equal(delivered.ok, true, `stopped early: ${delivered.reasonCodes}`);
  assert.equal(delivered.sprint.state, 'DELIVERED');
});

test('internal QA cannot produce customer acceptance', () => {
  const delivered = drive(openCommercialSprint(), TO_DELIVERED);

  // The exact shape internal work can produce: our own origin, and the
  // evidence class the customer would have carried.
  const selfAccepted = applySprintEvent({
    sprint: delivered.sprint,
    event: { eventId: 'evt_self', type: 'CUSTOMER_ACCEPTED', origin: 'INTERNAL', evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:agency_1', at: minute(20) }
  });
  assert.equal(selfAccepted.ok, false, 'the seller accepted the delivery on the buyer\'s behalf');

  const accepted = applySprintEvent({
    sprint: delivered.sprint,
    event: { eventId: 'evt_accept', type: 'CUSTOMER_ACCEPTED', origin: 'EXTERNAL', evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:agency_1', at: minute(20) }
  });
  assert.equal(accepted.ok, true, `external acceptance refused: ${accepted.reasonCodes}`);
  assert.equal(accepted.sprint.state, 'CUSTOMER_ACCEPTED');
});

test('silence is a distinct outcome from acceptance', () => {
  const delivered = drive(openCommercialSprint(), TO_DELIVERED);
  const silent = applySprintEvent({
    sprint: delivered.sprint,
    event: { eventId: 'evt_silent', type: 'CUSTOMER_SILENCE_TIMEOUT', origin: 'INTERNAL', at: minute(60 * 24 * 30) }
  });
  assert.equal(silent.ok, true, `silence timeout refused: ${silent.reasonCodes}`);
  assert.equal(silent.sprint.state, 'CUSTOMER_SILENT');
  assert.equal(summarizeLeadPathSprint(silent.sprint).acceptedDelivery, false);
  assert.equal(commercialDeliveryCount([silent.sprint]), 0, 'silence counted as a delivered sale');
});

test('only an externally accepted commercial sprint counts as a delivery', () => {
  const delivered = drive(openCommercialSprint(), TO_DELIVERED);
  const accepted = applySprintEvent({
    sprint: delivered.sprint,
    event: { eventId: 'evt_accept', type: 'CUSTOMER_ACCEPTED', origin: 'EXTERNAL', evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:agency_1', at: minute(20) }
  });
  assert.equal(commercialDeliveryCount([accepted.sprint]), 1);
  assert.equal(commercialDeliveryCount([delivered.sprint]), 0, 'delivering is not being accepted');
  assert.equal(summarizeLeadPathSprint(accepted.sprint).acceptedDelivery, true);
});

test('the synthetic canary walks every state and produces no commerce whatsoever', () => {
  const canary = runSyntheticFulfillmentCanary({ date: new Date(START) });
  assert.equal(canary.ok, true);
  assert.deepEqual(canary.unvisitedStates, [], 'a state the canary never reaches is a state nothing exercises');
  assert.equal(canary.statesVisited.length, SPRINT_STATES.length);

  // The entire point. A rehearsal that could move any of these is not a
  // rehearsal, it is an unaudited write to commercial truth.
  assert.equal(canary.commercialDeliveryCount, 0);
  assert.equal(canary.acceptedDeliveryCount, 0);
  assert.equal(canary.clearedRevenueCents, 0);
  assert.equal(canary.realCustomers, 0);
});

test('a synthetic event cannot drive a commercial sprint, and an external one cannot drive a canary', () => {
  const commercial = drive(openCommercialSprint(), TO_DELIVERED);
  const syntheticIntoCommercial = applySprintEvent({
    sprint: commercial.sprint,
    event: { eventId: 'evt_synth', type: 'CUSTOMER_ACCEPTED', origin: 'SYNTHETIC', evidenceClass: 'SYNTHETIC_CANARY', at: minute(30) }
  });
  assert.equal(syntheticIntoCommercial.ok, false, 'a fixture accepted a real delivery');

  const canarySprint = openLeadPathSprint({
    customerRef: 'canary:accepted',
    requirements: ['canary requirement'],
    acceptanceCriteria: ['canary criterion'],
    paymentEvidence: { origin: 'SYNTHETIC', evidenceClass: 'SYNTHETIC_CANARY' },
    mode: 'SYNTHETIC_CANARY',
    date: new Date(START)
  });
  assert.equal(canarySprint.ok, true);
  const externalIntoCanary = applySprintEvent({
    sprint: canarySprint,
    event: { eventId: 'evt_ext', type: 'INPUTS_RECEIVED', origin: 'EXTERNAL', evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:real', at: minute(1) }
  });
  assert.equal(externalIntoCanary.ok, false, 'real customer evidence leaked into a rehearsal');
});

test('an event with no durable identity is refused, so a replay can be recognised as one', () => {
  const sprint = openCommercialSprint();
  const anonymous = applySprintEvent({
    sprint,
    event: { type: 'INPUTS_RECEIVED', origin: 'INTERNAL', at: minute(1) }
  });
  assert.equal(anonymous.ok, false);
  assert.ok(anonymous.reasonCodes.includes('durable-sprint-event-id-required'));
});

test('a stored sprint claiming acceptance without customer-origin evidence counts as nothing', () => {
  // Not reachable through applySprintEvent, which is the point: this is the
  // shape a drifted row, an older writer, or a hand-edited record would have.
  // The count is read from storage, so it defends itself at the point of
  // counting rather than trusting that everything that ever wrote a row was
  // this version of the state machine.
  const forged = {
    mode: 'COMMERCIAL',
    state: 'CUSTOMER_ACCEPTED',
    acceptedDelivery: true,
    acceptanceEvidenceClass: 'INTERNAL_QA'
  };
  assert.equal(commercialDeliveryCount([forged]), 0,
    'a sprint that accepted itself was counted as a delivered sale');

  const unclassified = { ...forged, acceptanceEvidenceClass: null };
  assert.equal(commercialDeliveryCount([unclassified]), 0);

  const synthetic = { ...forged, mode: 'SYNTHETIC_CANARY', acceptanceEvidenceClass: 'EXTERNAL_CUSTOMER' };
  assert.equal(commercialDeliveryCount([synthetic]), 0, 'a rehearsal counted as commerce');
});
