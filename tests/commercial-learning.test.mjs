import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  summarizeCommercialLearning,
  loadCommercialOutcomeReceipts,
  logCommercialLearning,
  COMMERCIAL_LEARNING_POLICY_VERSION
} from '../src/commercial-learning.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';

const referenceDate = new Date('2026-08-18T10:00:00.000Z');

function cleared(overrides = {}) {
  return {
    ok: true,
    outcomeId: 'out-1',
    status: 'RECORDED_CLEARED_PAYMENT',
    truthLevel: 'CLEARED_PAYMENT',
    outcomeType: 'PAYMENT_CLEARED',
    eventId: 'event-1',
    occurredAt: referenceDate.toISOString(),
    lineage: { opportunityId: 'opp-1', experimentId: 'exp-1', channelId: 'channel-a' },
    paymentProof: { providerEventId: 'provider-1', amountCents: 10000, currency: 'USD' },
    contributionMarginCents: 8000,
    ownerMinutes: 20,
    ...overrides
  };
}

function observation(overrides = {}) {
  return {
    ok: true,
    outcomeId: 'out-observation',
    status: 'RECORDED_NON_REVENUE_OUTCOME',
    truthLevel: 'OBSERVED_OUTCOME',
    outcomeType: 'CHECKOUT_STARTED',
    eventId: 'event-observation',
    occurredAt: referenceDate.toISOString(),
    lineage: { opportunityId: 'opp-1', experimentId: 'exp-1', channelId: 'channel-a' },
    ...overrides
  };
}

test('no payment-proof receipts produce an explicit no-proof result', () => {
  const result = summarizeCommercialLearning({ outcomes: [observation()], date: referenceDate });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'NO_VERIFIED_OUTCOMES');
  assert.equal(result.metrics.grossClearedRevenueCents, 0);
  assert.equal(result.metrics.ignoredObservationCount, 1);
  assert.equal(result.metrics.contributionProfitPerOwnerMinuteCents, null);
});

test('cleared payments aggregate by lineage and expose measured profit per owner minute', () => {
  const result = summarizeCommercialLearning({
    outcomes: [
      cleared(),
      cleared({
        outcomeId: 'out-2', eventId: 'event-2',
        paymentProof: { providerEventId: 'provider-2', amountCents: 5000, currency: 'USD' },
        contributionMarginCents: 3500, ownerMinutes: 15,
        lineage: { opportunityId: 'opp-1', experimentId: 'exp-1', channelId: 'channel-b' }
      })
    ],
    date: referenceDate
  });
  assert.equal(result.status, 'LOCAL_OUTCOME_SUMMARY');
  assert.equal(result.metrics.clearedPaymentCount, 2);
  assert.equal(result.metrics.grossClearedRevenueCents, 15000);
  assert.equal(result.metrics.knownContributionMarginCents, 11500);
  assert.equal(result.metrics.knownOwnerMinutes, 35);
  assert.equal(result.metrics.contributionProfitPerOwnerMinuteCents, 328.57);
  assert.equal(result.groups.length, 2);
  assert.deepEqual(result.groups.map(group => group.channelId), ['channel-a', 'channel-b']);
});

test('refunds reduce cash impact but prevent a false post-refund margin ratio', () => {
  const result = summarizeCommercialLearning({
    outcomes: [
      cleared(),
      {
        ok: true,
        outcomeId: 'out-refund', status: 'RECORDED_REFUND_OR_DISPUTE',
        truthLevel: 'REFUND_OR_DISPUTE', outcomeType: 'REFUND', eventId: 'event-refund',
        occurredAt: referenceDate.toISOString(),
        lineage: { opportunityId: 'opp-1', experimentId: 'exp-1', channelId: 'channel-a' },
        paymentProof: { providerEventId: 'provider-refund', amountCents: 4000, currency: 'USD' },
        economicImpactCents: -4000
      }
    ],
    date: referenceDate
  });
  assert.equal(result.metrics.grossClearedRevenueCents, 10000);
  assert.equal(result.metrics.refundOrDisputeCents, 4000);
  assert.equal(result.metrics.netCashImpactCents, 6000);
  assert.equal(result.metrics.contributionMarginStatus, 'KNOWN_BEFORE_REFUNDS_UNKNOWN_AFTER_REFUNDS');
  assert.equal(result.metrics.contributionProfitPerOwnerMinuteCents, null);
});

test('payment-looking receipts without the complete proof are rejected, not estimated', () => {
  const result = summarizeCommercialLearning({
    outcomes: [cleared({ paymentProof: { amountCents: 10000, currency: 'USD' } })],
    date: referenceDate
  });
  assert.equal(result.status, 'NO_VERIFIED_OUTCOMES');
  assert.equal(result.metrics.rejectedOutcomeCount, 1);
  assert.equal(result.metrics.grossClearedRevenueCents, 0);
});

test('identical receipts deduplicate and contradictory receipts are quarantined', () => {
  const duplicate = cleared();
  const contradiction = cleared({
    paymentProof: { providerEventId: 'provider-other', amountCents: 99999, currency: 'USD' }
  });
  const result = summarizeCommercialLearning({ outcomes: [duplicate, duplicate, contradiction], date: referenceDate });
  assert.equal(result.source.duplicateOutcomeCount, 1);
  assert.equal(result.source.contradictionCount, 1);
  assert.equal(result.metrics.verifiedOutcomeCount, 0);
  assert.equal(result.metrics.rejectedOutcomeCount, 1);
  assert.equal(result.metrics.grossClearedRevenueCents, 0);
});

test('scope filtering and bounded input are deterministic', () => {
  const a = summarizeCommercialLearning({
    outcomes: [cleared(), cleared({ outcomeId: 'out-2', eventId: 'event-2', lineage: { opportunityId: 'opp-2', experimentId: 'exp-1', channelId: 'channel-a' } })],
    scope: { opportunityId: 'opp-2' }, maxOutcomes: 2, date: referenceDate
  });
  const b = summarizeCommercialLearning({
    outcomes: [cleared(), cleared({ outcomeId: 'out-2', eventId: 'event-2', lineage: { opportunityId: 'opp-2', experimentId: 'exp-1', channelId: 'channel-a' } })],
    scope: { opportunityId: 'opp-2' }, maxOutcomes: 2, date: referenceDate
  });
  assert.deepEqual(a, b);
  assert.equal(a.metrics.clearedPaymentCount, 1);
  assert.equal(a.scope.opportunityId, 'opp-2');
});

test('audit loader reuses existing commercial outcome receipts and strips raw data', async () => {
  const rows = await loadCommercialOutcomeReceipts({
    list: async (key, options) => {
      assert.equal(key, 'auditLog');
      assert.deepEqual(options.filters, { type: 'commercial_outcome' });
      return [{ detail: { ...cleared(), payload: { secret: 'must-not-propagate' } } }];
    }
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].truthLevel, 'CLEARED_PAYMENT');
  assert.equal(Object.prototype.hasOwnProperty.call(rows[0], 'payload'), false);
});

test('queue handler summarizes durable receipts and writes one compact learning receipt', async () => {
  const calls = [];
  const handlers = createJobHandlers({
    store: {
      list: async () => [{ detail: cleared() }],
      log: async (type, detail) => { calls.push({ type, detail }); return { id: 'audit-learning' }; }
    },
    cfg: {}
  });
  const result = await handlers['prometheus.learning.summarize']({ date: referenceDate });
  assert.equal(result.status, 'LOCAL_OUTCOME_SUMMARY');
  assert.equal(result.metrics.grossClearedRevenueCents, 10000);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].type, 'commercial_learning');
  assert.equal(calls[0].detail.policyVersion, COMMERCIAL_LEARNING_POLICY_VERSION);
});

test('learning audit writer excludes raw outcomes', async () => {
  const calls = [];
  const summary = summarizeCommercialLearning({ outcomes: [cleared()], date: referenceDate });
  await logCommercialLearning({ log: async (type, detail) => { calls.push({ type, detail }); return { id: 'audit-1' }; } }, summary);
  assert.equal(calls[0].type, 'commercial_learning');
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0].detail, 'outcomes'), false);
});

test('learning module has no provider or filesystem boundary of its own', async () => {
  const source = await fs.readFile(new URL('../src/commercial-learning.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(/);
});
