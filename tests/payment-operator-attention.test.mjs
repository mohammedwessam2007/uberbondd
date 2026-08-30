import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  classifyPaymentAttentionEntry,
  summarizePaymentOperatorAttention
} from '../src/payment-operator-attention.mjs';

const payment = (classification, reasonCodes = []) => ({
  type: 'payment_classification',
  detail: { classification, reasonCodes }
});

test('unrelated audit rows are ignored', () => {
  assert.equal(classifyPaymentAttentionEntry({ type: 'other', detail: {} }).state, 'IGNORE');
});

test('REVIEW_REQUIRED always needs operator attention', () => {
  const result = classifyPaymentAttentionEntry(payment('REVIEW_REQUIRED', ['unknown-lead']));
  assert.equal(result.state, 'REVIEW_REQUIRED');
  assert.equal(result.attentionRequired, true);
});

test('an on-trial subscription creation is expected pending and stays quiet', () => {
  const result = classifyPaymentAttentionEntry(payment('PENDING_OR_UNCLEAR', ['subscription-status-on_trial']));
  assert.equal(result.state, 'EXPECTED_PENDING');
  assert.equal(result.attentionRequired, false);
});

test('an unpaid subscription creation is anomalous and visible', () => {
  const result = classifyPaymentAttentionEntry(payment('PENDING_OR_UNCLEAR', ['subscription-status-unpaid']));
  assert.equal(result.state, 'ANOMALOUS_PENDING');
  assert.equal(result.attentionRequired, true);
});

test('a failed payment attempt is anomalous and visible', () => {
  const result = classifyPaymentAttentionEntry(payment('PENDING_OR_UNCLEAR', ['failed-payment-attempt']));
  assert.equal(result.state, 'ANOMALOUS_PENDING');
  assert.equal(result.attentionRequired, true);
});

test('a pending event with no reason is anomalous rather than silently ignored', () => {
  const result = classifyPaymentAttentionEntry(payment('PENDING_OR_UNCLEAR'));
  assert.equal(result.state, 'ANOMALOUS_PENDING');
  assert.equal(result.attentionRequired, true);
});

test('summary separates expected pending from events that need attention', () => {
  const result = summarizePaymentOperatorAttention([
    payment('PENDING_OR_UNCLEAR', ['subscription-status-on_trial']),
    payment('PENDING_OR_UNCLEAR', ['subscription-status-unpaid']),
    payment('REVIEW_REQUIRED', ['unknown-lead']),
    payment('CLEARED_ONE_TIME_PAYMENT', ['cleared-one-time-payment'])
  ]);
  assert.deepEqual(result, {
    reviewRequired: 1,
    expectedPending: 1,
    anomalousPending: 1,
    attentionRequired: 2
  });
});

test('founder command center is wired to the canonical payment-attention summary', async () => {
  const source = await fs.readFile(new URL('../src/founder-command-center.mjs', import.meta.url), 'utf8');
  assert.match(source, /summarizePaymentOperatorAttention\(recentAudit\)/);
  assert.match(source, /operatorAttentionRecently:\s*paymentAttention\.attentionRequired/);
  assert.match(source, /expectedPendingRecently:\s*paymentAttention\.expectedPending/);
  assert.match(source, /anomalousPendingRecently:\s*paymentAttention\.anomalousPending/);
});
