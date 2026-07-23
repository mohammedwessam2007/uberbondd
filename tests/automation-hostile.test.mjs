import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { config as baseConfig } from '../src/config.mjs';
import { RevenueEngine } from '../src/revenue.mjs';
import { createAutomationJobHandlers } from '../src/automation/job-handlers.mjs';
import { createFakeOutboundProvider } from '../src/automation/outbound-adapter.mjs';
import { MonitoringError } from '../src/automation/monitoring.mjs';
import { FulfillmentError } from '../src/automation/fulfillment.mjs';

async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-automation-hostile-'));
  const store = new Store(dir);
  await store.init();
  const cfg = { ...baseConfig, revenue: { ...baseConfig.revenue, allowTestUnlock: true }, apify: { enabled: false } };
  const pipeline = { running: false, paused: false, runBatch: async () => {} };
  const revenue = new RevenueEngine(store, cfg, pipeline);
  const handlers = createAutomationJobHandlers({ store, cfg, revenue });
  return { store, cfg, revenue, handlers };
}

async function paidMonitoringOffer(store, revenue) {
  const lead = await revenue.createLead({ company: 'Acme HVAC', website: 'https://acmehvac.example.com', email: 'owner@acmehvac.example.com', consent: true });
  const leadRecord = await store.get('leads', lead.leadId);
  await store.patch('prospects', leadRecord.prospectId, { issue: { title: 'Broken quote form', evidenceUrl: 'https://acmehvac.example.com/quote', evidenceExcerpt: 'form does not submit' } });
  const unlocked = await revenue.unlockLead(lead.leadId, 'monitoring', { provider: 'test' });
  const offer = (await revenue.offersForProspect(unlocked.prospectId))[0];
  return { lead: unlocked, offer };
}

test('HOSTILE: fulfillment cannot be created before a delivery is payment-gated and delivery-queued', async () => {
  const { store } = await harness();
  await assert.rejects(async () => {
    const { createFulfillmentTask } = await import('../src/automation/fulfillment.mjs');
    createFulfillmentTask({ id: 'no-such-delivery' });
  }, FulfillmentError);
  assert.equal((await store.list('fulfillmentTasks')).length, 0);
});

test('HOSTILE: fulfillment.process never double-creates a task for the same delivery on repeated runs', async () => {
  const { store, handlers } = await harness();
  await store.add('deliveries', {
    id: 'delivery-1', status: 'delivery-queued', prospectId: 'p1', amountPaid: { amountCents: 5000 },
    selectedIssue: { service: 'Website diagnostic' }, testMode: true
  });
  const first = await handlers['fulfillment.process']({});
  const second = await handlers['fulfillment.process']({});
  assert.equal(first.created, 1);
  assert.equal(second.created, 0);
  assert.equal((await store.list('fulfillmentTasks')).length, 1);
});

test('HOSTILE: monitoring enrollment is refused without consent even for a paid monitoring offer', async () => {
  const { store, revenue, handlers } = await harness();
  const { offer } = await paidMonitoringOffer(store, revenue);
  await assert.rejects(handlers['monitoring.enroll']({ offerId: offer.id, consent: {} }), MonitoringError);
});

test('HOSTILE: monitoring enrollment is refused for an unpaid offer even with full consent', async () => {
  const { store, revenue, handlers } = await harness();
  const lead = await revenue.createLead({ company: 'Beta HVAC', website: 'https://betahvac.example.com', email: 'owner@betahvac.example.com', consent: true });
  const leadRecord = await store.get('leads', lead.leadId);
  await store.patch('prospects', leadRecord.prospectId, { issue: { title: 'x', evidenceUrl: 'https://betahvac.example.com', evidenceExcerpt: 'x' } });
  const offer = await revenue.createOffer(leadRecord.prospectId, { type: 'monitoring', scope: 'Monitor the reported issue monthly', amountCents: 9900, currency: 'USD', provider: 'test' });
  const consent = { explicitOptIn: true, consentedAt: new Date().toISOString(), priceAcknowledged: true };
  await assert.rejects(handlers['monitoring.enroll']({ offerId: offer.id, consent }), /monitoring-enrollment-requires-paid/);
});

test('HOSTILE: monitoring enrollment succeeds only with both consent and a paid offer, and is idempotent-safe', async () => {
  const { store, revenue, handlers } = await harness();
  const { lead, offer } = await paidMonitoringOffer(store, revenue);
  const consent = { explicitOptIn: true, consentedAt: new Date().toISOString(), priceAcknowledged: true };
  const subscription = await handlers['monitoring.enroll']({ leadId: lead.id, offerId: offer.id, consent });
  assert.equal(subscription.status, 'active');
});

test('HOSTILE: duplicate outbound sends are impossible even under repeated reserve/send races via the fake provider', async () => {
  const provider = createFakeOutboundProvider();
  const results = await Promise.all(Array.from({ length: 20 }, () => provider.reserve('race-key')));
  const reservationIds = new Set(results.map(result => result.reservationId));
  assert.equal(reservationIds.size, 1);
  const sendResults = await Promise.all([...reservationIds].flatMap(reservationId => [provider.send(reservationId), provider.send(reservationId)]));
  assert.equal(sendResults.filter(result => !result.duplicate).length, 1);
});

test('HOSTILE: malformed Apify import text fails closed and writes nothing', async () => {
  const { store, handlers } = await harness();
  await assert.rejects(handlers['apify.import']({ text: '{not valid json', campaignId: 'camp_1' }));
  assert.equal((await store.list('prospects')).length, 0);
});

test('HOSTILE: apify.poll refuses to run against real network without explicit enablement', async () => {
  const { handlers } = await harness();
  await assert.rejects(handlers['apify.poll']({ campaignId: 'camp_1' }));
});

test('HOSTILE: the daily digest never crashes on an empty system and reports zero exceptions honestly', async () => {
  const { handlers } = await harness();
  const digest = await handlers['digest.daily']({});
  assert.equal(digest.exceptions.total, 0);
  assert.match(digest.nextOwnerAction, /No exceptions/);
});

test('HOSTILE: a dead-lettered job surfaces in the exception queue via the daily digest', async () => {
  const { store, handlers } = await harness();
  await store.add('jobs', {
    id: 'job-1', type: 'research.batch', queue: 'research.batch', status: 'dead-letter', payload: {}, priority: 0,
    attempts: 5, maxAttempts: 5, runAt: new Date().toISOString(), scheduledAt: new Date().toISOString(), createdAt: new Date().toISOString(), lastError: 'boom'
  });
  const digest = await handlers['digest.daily']({});
  assert.equal(digest.exceptions.total, 1);
  assert.equal(digest.exceptions.byCategory.kill_switch_recovery, 1);
});

test('HOSTILE: weekly digest is honestly unhealthy when a dead-letter trend exists', async () => {
  const { store, handlers } = await harness();
  await store.add('jobs', {
    id: 'job-2', type: 'research.batch', queue: 'research.batch', status: 'dead-letter', payload: {}, priority: 0,
    attempts: 5, maxAttempts: 5, runAt: new Date().toISOString(), scheduledAt: new Date().toISOString(), createdAt: new Date().toISOString(), lastError: 'boom'
  });
  await handlers['digest.daily']({});
  const weekly = await handlers['digest.weekly']({});
  assert.equal(weekly.healthy, false);
});
