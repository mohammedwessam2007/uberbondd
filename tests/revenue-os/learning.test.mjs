import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../revenue-os/src/store.mjs';
import {
  computeComplaintAndBounceRates, computeRecurringRevenueCents, computeFulfillmentCapacity,
  computeLearningMetrics, evaluateChannelPerformance, MIN_SAMPLE_FOR_CHANNEL_DECISION, LOSING_CHANNEL_PAYMENT_RATE_THRESHOLD
} from '../../revenue-os/src/learning.mjs';

async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ros-learning-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

// --- complaint / bounce rates ---

test('computeComplaintAndBounceRates returns null rates (not zero) when nothing has been delivered yet', async () => {
  const store = await harness();
  const result = await computeComplaintAndBounceRates(store);
  assert.equal(result.delivered, 0);
  assert.equal(result.complaintRate, null);
  assert.equal(result.bounceRate, null);
});

test('computeComplaintAndBounceRates computes rates against delivered send count', async () => {
  const store = await harness();
  for (let i = 0; i < 10; i += 1) await store.add('sendRecords', { status: 'exported', idempotencyKey: `k${i}`, recipientMessageHash: `rmh${i}`, data: {} });
  await store.add('suppressions', { reason: 'complaint', data: { organizationDomain: 'a.invalid' } });
  await store.add('suppressions', { reason: 'bounce', data: { organizationDomain: 'b.invalid' } });
  await store.add('suppressions', { reason: 'unsubscribe', data: { organizationDomain: 'c.invalid' } });
  const result = await computeComplaintAndBounceRates(store);
  assert.equal(result.delivered, 10);
  assert.equal(result.complaintRate, 0.1);
  assert.equal(result.bounceRate, 0.1);
});

// --- recurring revenue ---

test('computeRecurringRevenueCents sums only active monitoring offers', async () => {
  const store = await harness();
  await store.add('monitoringOffers', { active: true, priceCents: 29900, data: {} });
  await store.add('monitoringOffers', { active: true, priceCents: 19900, data: {} });
  await store.add('monitoringOffers', { active: false, priceCents: 49900, data: {} });
  assert.equal(await computeRecurringRevenueCents(store), 49800);
});

// --- fulfillment capacity ---

test('computeFulfillmentCapacity reports null averageFulfillmentHours with no recorded metrics, and open count excludes terminal statuses', async () => {
  const store = await harness();
  await store.add('diagnosticProjects', { organizationDomain: 'a.invalid', status: 'PAID', data: {} });
  await store.add('diagnosticProjects', { organizationDomain: 'b.invalid', status: 'CLOSED', data: {} });
  const result = await computeFulfillmentCapacity(store);
  assert.equal(result.openCount, 1);
  assert.equal(result.averageFulfillmentHours, null);
});

test('computeFulfillmentCapacity averages actualFulfillmentHours across projects that have recorded fulfillment metrics', async () => {
  const store = await harness();
  await store.add('diagnosticProjects', { organizationDomain: 'a.invalid', status: 'DELIVERED', data: { fulfillmentMetrics: { actualFulfillmentHours: 10 } } });
  await store.add('diagnosticProjects', { organizationDomain: 'b.invalid', status: 'DELIVERED', data: { fulfillmentMetrics: { actualFulfillmentHours: 20 } } });
  const result = await computeFulfillmentCapacity(store);
  assert.equal(result.completedWithMetricsCount, 2);
  assert.equal(result.averageFulfillmentHours, 15);
});

// --- computeLearningMetrics: the full mission-named set ---

test('computeLearningMetrics reports every mission-named measure', async () => {
  const store = await harness();
  await store.add('opportunities', { organizationDomain: 'a.invalid', channel: 'referral_intro', status: 'candidate', score: 40, data: {} });
  const metrics = await computeLearningMetrics(store, { revenueCents: 50000 });
  for (const key of ['paymentProbability', 'qualifiedReplyRate', 'revenuePerProspect', 'contributionMarginRate', 'repeatPurchaseRate', 'recurringRevenueCents', 'ownerMinutesTotal', 'complaintRate', 'bounceRate', 'fulfillmentCapacity']) {
    assert.ok(key in metrics, `missing metric: ${key}`);
  }
  assert.equal(metrics.revenuePerProspect, 50000);
});

// --- channel performance / losing-channel recommendations ---

test('evaluateChannelPerformance reports insufficient-sample below the minimum sample size, never a pause recommendation on thin data', async () => {
  const store = await harness();
  await store.add('opportunities', { organizationDomain: 'a.invalid', channel: 'published_email', status: 'candidate', data: {} });
  const results = await evaluateChannelPerformance(store);
  assert.equal(results.length, 1);
  assert.equal(results[0].sufficientSample, false);
  assert.equal(results[0].recommendation, 'insufficient-sample');
});

test('evaluateChannelPerformance recommends pausing a channel with sufficient sample and a payment rate below the threshold', async () => {
  const store = await harness();
  await store.add('opportunities', { organizationDomain: 'losing-channel.invalid', channel: 'published_email', status: 'candidate', data: {} });
  for (let i = 0; i < MIN_SAMPLE_FOR_CHANNEL_DECISION; i += 1) {
    await store.add('sendRecords', { status: 'exported', idempotencyKey: `send${i}`, recipientMessageHash: `rmh${i}`, data: { channel: 'published_email' } });
  }
  // Zero payments for this channel -- paymentRate 0, well below LOSING_CHANNEL_PAYMENT_RATE_THRESHOLD.
  const results = await evaluateChannelPerformance(store);
  const channelResult = results.find(r => r.channel === 'published_email');
  assert.equal(channelResult.sufficientSample, true);
  assert.equal(channelResult.paymentRate, 0);
  assert.equal(channelResult.recommendation, 'recommend-pause');
});

test('evaluateChannelPerformance reports no-action for a channel with sufficient sample and a healthy payment rate', async () => {
  const store = await harness();
  await store.add('opportunities', { organizationDomain: 'healthy-channel.invalid', channel: 'referral_intro', status: 'candidate', data: {} });
  for (let i = 0; i < MIN_SAMPLE_FOR_CHANNEL_DECISION; i += 1) {
    await store.add('sendRecords', { status: 'exported', idempotencyKey: `hsend${i}`, recipientMessageHash: `hrmh${i}`, data: { channel: 'referral_intro' } });
  }
  for (let i = 0; i < 3; i += 1) {
    await store.add('payments', { status: 'VERIFIED', data: { organizationDomain: 'healthy-channel.invalid' } });
  }
  const results = await evaluateChannelPerformance(store);
  const channelResult = results.find(r => r.channel === 'referral_intro');
  assert.ok(channelResult.paymentRate > LOSING_CHANNEL_PAYMENT_RATE_THRESHOLD);
  assert.equal(channelResult.recommendation, 'no-action');
});

test('learning.mjs never itself modifies a production rule -- capability scan', async () => {
  const content = await fs.readFile(new URL('../../revenue-os/src/learning.mjs', import.meta.url), 'utf8');
  const importLines = content.split('\n').filter(line => line.trim().startsWith('import '));
  const forbidden = ['distribution.mjs', 'campaign-policy.mjs', 'channel-safety.mjs', 'outbound.mjs'];
  for (const line of importLines) {
    for (const module of forbidden) assert.ok(!line.includes(module), `learning.mjs must never import ${module}: ${line}`);
  }
});
