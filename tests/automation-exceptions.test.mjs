import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExceptionQueue, exceptionQueueSummary } from '../src/automation/exceptions.mjs';

test('an empty snapshot produces an empty queue', () => {
  assert.deepEqual(buildExceptionQueue({}), []);
});

test('positive replies rank ahead of default priority and carry an exact action', () => {
  const rows = buildExceptionQueue({
    replies: [{ id: 'r1', prospectId: 'p1', classification: { label: 'interested' }, receivedAt: '2026-01-01T00:00:00Z' }]
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, 'positive_reply');
  assert.equal(rows[0].priority, 'P1');
  assert(rows[0].exactAction.includes('personal'));
});

test('payment disputes and chargebacks are P0 and block fulfillment in their exact action', () => {
  const rows = buildExceptionQueue({
    orders: [
      { id: 'o1', paymentState: 'disputed', updatedAt: '2026-01-01T00:00:00Z' },
      { id: 'o2', paymentState: 'chargeback', updatedAt: '2026-01-01T00:00:00Z' }
    ]
  });
  assert.equal(rows.every(row => row.priority === 'P0'), true);
  assert.equal(rows.find(row => row.id === 'order:o1').category, 'payment_mismatch');
  assert.equal(rows.find(row => row.id === 'order:o2:refund').category, 'chargeback');
});

test('an overdue fulfillment task is flagged with overdue:true', () => {
  const rows = buildExceptionQueue({
    fulfillmentTasks: [{ id: 't1', status: 'in-progress', slaDueAt: '2020-01-01T00:00:00Z', updatedAt: '2020-01-01T00:00:00Z' }]
  }, new Date('2026-01-01T00:00:00Z'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].overdue, true);
});

test('a paused sender inbox is a P0 kill-switch-recovery exception', () => {
  const rows = buildExceptionQueue({ senderHealth: [{ inbox: 'A', paused: true, pauseReason: 'bounce-threshold' }] });
  assert.equal(rows[0].category, 'kill_switch_recovery');
  assert.equal(rows[0].priority, 'P0');
});

test('rows are sorted by priority then recency', () => {
  const rows = buildExceptionQueue({
    replies: [{ id: 'r1', prospectId: 'p1', classification: { label: 'interested' }, receivedAt: '2026-01-02T00:00:00Z' }],
    senderHealth: [{ inbox: 'A', paused: true, lastEventAt: '2026-01-01T00:00:00Z' }]
  });
  assert.equal(rows[0].priority, 'P0');
  assert.equal(rows[1].priority, 'P1');
});

test('exceptionQueueSummary tallies by priority and category', () => {
  const rows = buildExceptionQueue({ senderHealth: [{ inbox: 'A', paused: true }, { inbox: 'B', paused: true }] });
  const summary = exceptionQueueSummary(rows);
  assert.equal(summary.total, 2);
  assert.equal(summary.byPriority.P0, 2);
  assert.equal(summary.byCategory.kill_switch_recovery, 2);
});
