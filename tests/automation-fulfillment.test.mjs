import test from 'node:test';
import assert from 'node:assert/strict';
import { selectFulfillmentLane, createFulfillmentTask, updateFulfillmentTask, isFulfillmentTaskOverdue, FulfillmentError } from '../src/automation/fulfillment.mjs';

const baseDelivery = () => ({ id: 'delivery-1', status: 'delivery-queued', amountPaid: { amountCents: 5000 }, selectedIssue: { service: 'Website diagnostic' } });

test('lane selection routes high-value deliveries to a contractor', () => {
  const delivery = { ...baseDelivery(), amountPaid: { amountCents: 150000 } };
  assert.equal(selectFulfillmentLane(delivery).lane, 'contractor');
});

test('lane selection routes site-change work to the client-authorized provider, detected structurally rather than by free-text label', () => {
  // Mirrors what src/delivery.mjs's TEMPLATES['implementation-sprint'] actually produces --
  // selectedIssue.service is deliberately left as an unrelated free-text label here, to prove
  // detection no longer depends on that field's wording (see the fix this review made).
  const delivery = {
    ...baseDelivery(),
    selectedIssue: { service: 'Website strategy' },
    implementationChecklist: [{ id: 'confirm-authorization', status: 'pending' }, { id: 'implement-scope', status: 'pending' }],
    requiredCustomerInputs: [{ id: 'written-authorization', status: 'pending' }, { id: 'access-provisioned', status: 'pending' }]
  };
  assert.equal(selectFulfillmentLane(delivery).lane, 'client_provider');
});

test('lane selection does not misroute a diagnostic delivery just because its issue label mentions "website"', () => {
  const delivery = { ...baseDelivery(), selectedIssue: { service: 'Website conversion diagnostic' } };
  assert.equal(selectFulfillmentLane(delivery).lane, 'mohamed');
});

test('lane selection defaults small diagnostic deliveries internally', () => {
  assert.equal(selectFulfillmentLane(baseDelivery()).lane, 'mohamed');
});

test('test-mode deliveries always stay internal regardless of value or type', () => {
  const delivery = { ...baseDelivery(), testMode: true, amountPaid: { amountCents: 999999 } };
  assert.equal(selectFulfillmentLane(delivery).lane, 'mohamed');
});

test('an owner can force a lane override', () => {
  assert.equal(selectFulfillmentLane(baseDelivery(), { forceLane: 'contractor' }).lane, 'contractor');
});

test('a task cannot be created for a delivery that is not yet delivery-queued (fulfillment before payment)', () => {
  assert.throws(() => createFulfillmentTask({ id: 'd1', status: 'awaiting-inputs' }), FulfillmentError);
  assert.throws(() => createFulfillmentTask({}), FulfillmentError);
});

test('a created task carries onboarding and QA checklists and an SLA due timestamp', () => {
  const task = createFulfillmentTask(baseDelivery(), {}, '2026-01-01T00:00:00.000Z');
  assert.equal(task.status, 'assigned');
  assert(task.onboardingChecklist.length > 0);
  assert(task.qaChecklist.length > 0);
  assert.equal(new Date(task.slaDueAt).getTime() > new Date('2026-01-01T00:00:00.000Z').getTime(), true);
});

test('completing a task requires every QA checklist item to be completed first', () => {
  const task = createFulfillmentTask(baseDelivery());
  const inProgress = updateFulfillmentTask(task, { status: 'in-progress' });
  assert.throws(() => updateFulfillmentTask(inProgress, { status: 'completed' }), /qa-incomplete/);
  const qaChecklistUpdates = task.qaChecklist.map(entryItem => ({ id: entryItem.id, status: 'completed' }));
  const completed = updateFulfillmentTask(inProgress, { status: 'completed', qaChecklistUpdates });
  assert.equal(completed.status, 'completed');
});

test('a completed task cannot transition further (terminal)', () => {
  const task = createFulfillmentTask(baseDelivery());
  const inProgress = updateFulfillmentTask(task, { status: 'in-progress' });
  const qaChecklistUpdates = task.qaChecklist.map(entryItem => ({ id: entryItem.id, status: 'completed' }));
  const completed = updateFulfillmentTask(inProgress, { status: 'completed', qaChecklistUpdates });
  assert.throws(() => updateFulfillmentTask(completed, { status: 'in-progress' }), /transition-invalid/);
});

test('overdue detection only flags active tasks past their SLA', () => {
  const task = createFulfillmentTask(baseDelivery(), {}, new Date(Date.now() - 200 * 3600000).toISOString());
  assert.equal(isFulfillmentTaskOverdue(task, new Date()), true);
  const completedTask = { ...task, status: 'completed' };
  assert.equal(isFulfillmentTaskOverdue(completedTask, new Date()), false);
});
