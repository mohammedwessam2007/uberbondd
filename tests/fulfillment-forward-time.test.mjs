// PR #112 closed backward time travel and left forward time travel open.
//
// It made contractual gates real: SUPPORT_ENDED before `supportEndsAt` and
// RENEWAL_DUE before `renewalDueAt` are refused, and an event dated before
// `state.updatedAt` is a regression. All correct.
//
// But `next.updatedAt` is set from the event's own timestamp, and nothing
// bounded that timestamp from above. Probed against the merged module, with a
// 30-day support window and a 90-day renewal interval:
//
//   SUPPORT_ENDED at 3000-01-01  =>  ALLOW -> RENEWAL_DUE
//
// The renewal became due 974 years early because the caller said so. That is
// retention proven by fast-forwarding contractual time, which is the one thing
// the fulfillment clock exists to prevent. It also freezes the record: state
// time is now year 3000, so every subsequent real event fails
// `event-time-regression` forever.
//
// `date` is the trusted clock -- injectable so a test can simulate elapsed time,
// real in production where no caller supplies it. `at` is the caller's claim.
// A claim that runs ahead of the clock is refused, and a second absolute
// horizon catches a caller who supplies both.
import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFulfillmentPlan, applyFulfillmentEvent } from '../src/service-fulfillment.mjs';

const T0 = new Date('2026-08-23T00:00:00.000Z');
const at = days => new Date(T0.getTime() + days * 86400000).toISOString();

function plan() {
  const result = compileFulfillmentPlan({
    serviceSkuId: 'sku1', customerRef: 'cust1',
    requirements: ['do the thing'], acceptanceCriteria: ['thing is done'],
    supportWindowDays: 30, renewalIntervalDays: 90, date: T0
  });
  assert.equal(result.ok, true);
  return result;
}

function step(state, event, clock) {
  return applyFulfillmentEvent({ state, event, date: clock ?? event.at });
}

function accepted() {
  let state = plan();
  for (const event of [
    { eventId: 'e1', type: 'WORK_STARTED', at: at(0) },
    { eventId: 'e2', type: 'WORK_COMPLETE', at: at(1) },
    { eventId: 'e3', type: 'QA_RESULT', at: at(1), qaPassed: true, evidenceRef: 'qa:pass-1' },
    { eventId: 'e4', type: 'DELIVERY_RECORDED', at: at(1), artifactRefs: ['artifact:a'] },
    { eventId: 'e5', type: 'ACCEPTANCE_REQUESTED', at: at(1) },
    { eventId: 'e6', type: 'CUSTOMER_ACCEPTED', at: at(1), evidenceClass: 'EXTERNAL_CUSTOMER', evidenceRef: 'customer:ack-1' }
  ]) {
    const result = step(state, event);
    assert.equal(result.ok, true, `${event.type}: ${JSON.stringify(result.reasonCodes)}`);
    state = result.state;
  }
  assert.equal(state.status, 'SUPPORT_ACTIVE');
  return state;
}

test('a support window cannot be ended by claiming a future timestamp', () => {
  const state = accepted();
  const result = applyFulfillmentEvent({
    state,
    event: { eventId: 'x', type: 'SUPPORT_ENDED', at: '3000-01-01T00:00:00.000Z' },
    date: at(2)
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('event-time-in-future'));
});

test('a renewal cannot become due by claiming a future timestamp', () => {
  const state = accepted();
  const result = applyFulfillmentEvent({
    state,
    event: { eventId: 'x', type: 'RENEWAL_DUE', at: '3000-01-01T00:00:00.000Z' },
    date: at(2)
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('event-time-in-future'));
  assert.notEqual(result.state.status, 'RENEWAL_DUE');
});

test('a caller who supplies the clock too is still caught by the absolute horizon', () => {
  // The clock is injectable, so a guard comparing `at` to `date` compares a
  // value to itself for anyone who sets both. The horizon does not move.
  const state = accepted();
  const result = applyFulfillmentEvent({
    state,
    event: { eventId: 'x', type: 'SUPPORT_ENDED', at: '3000-01-01T00:00:00.000Z' },
    date: '3000-01-01T00:00:00.000Z'
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('event-time-beyond-horizon'));
});

test('the record is not frozen by a rejected future event', () => {
  const state = accepted();
  const rejected = applyFulfillmentEvent({
    state, event: { eventId: 'x', type: 'SUPPORT_ENDED', at: '3000-01-01T00:00:00.000Z' }, date: at(2)
  });
  assert.equal(rejected.ok, false);
  // Real elapsed time still works afterwards: the refusal must not have written
  // year 3000 into state.updatedAt on its way out.
  const real = applyFulfillmentEvent({
    state, event: { eventId: 'y', type: 'SUPPORT_ENDED', at: state.supportEndsAt }, date: state.supportEndsAt
  });
  assert.equal(real.ok, true);
  assert.equal(real.status, 'ACCEPTED');
});

test('genuine elapsed time still passes both bounds', () => {
  const state = accepted();
  const ended = applyFulfillmentEvent({
    state, event: { eventId: 'end', type: 'SUPPORT_ENDED', at: state.supportEndsAt }, date: state.supportEndsAt
  });
  assert.equal(ended.ok, true);
  assert.equal(ended.status, 'ACCEPTED', 'support ending before the renewal date must not invent a renewal');

  const due = applyFulfillmentEvent({
    state: ended.state, event: { eventId: 'due', type: 'RENEWAL_DUE', at: ended.state.renewalDueAt }, date: ended.state.renewalDueAt
  });
  assert.equal(due.ok, true);
  assert.equal(due.status, 'RENEWAL_DUE');
});

test('ordinary clock skew is tolerated, a claim about tomorrow is not', () => {
  const state = accepted();
  const clock = at(2);
  const skewed = new Date(Date.parse(clock) + 60 * 1000).toISOString();
  const tomorrow = new Date(Date.parse(clock) + 86400000).toISOString();

  // A minute ahead is skew between two machines, and must not break a real send.
  assert.equal(applyFulfillmentEvent({
    state, event: { eventId: 's', type: 'SUPPORT_ENDED', at: skewed }, date: clock
  }).reasonCodes.includes('event-time-in-future'), false);

  assert.equal(applyFulfillmentEvent({
    state, event: { eventId: 't', type: 'SUPPORT_ENDED', at: tomorrow }, date: clock
  }).reasonCodes.includes('event-time-in-future'), true);
});

test('an invalid reference clock fails closed rather than defaulting to now', () => {
  const state = accepted();
  const result = applyFulfillmentEvent({
    state, event: { eventId: 'x', type: 'SUPPORT_ENDED', at: state.supportEndsAt }, date: 'not-a-date'
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('valid-reference-time-required'));
});
