import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANON_JOB_TYPES, scheduleCanonCycle, createCanonCycleHandlers,
  runOpportunityHunt, runProspectDiscovery, runSendPlanning, runDispatch, runReplySweep, runAttribution, runCheckpoint
} from '../src/autonomous-cycle.mjs';
import { createOpportunityAdapters } from '../src/opportunity-hunter.mjs';
import { buildCampaignActivationApproval } from '../src/campaign-activation.mjs';
import { REVENUE_OS_POLICY_VERSION } from '../src/revenue-os.mjs';
import { DurableQueue } from '../src/queue.mjs';
import { JsonStore } from '../src/store.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canon-cycle-'));
  const store = new JsonStore(dir);
  await store.init();
  return store;
}

const baseCfg = {
  acquisition: {
    workersActive: true, simulation: true, targetProspectBacklog: 100, targetDailySends: 100,
    dailyInfraCostCeilingCents: 1000, senderSet: ['inbox-a']
  },
  revenueOs: {}, ai: { provider: 'rules' }
};

test('runOpportunityHunt: an unconfigured adapter set fails closed with zero imports', async () => {
  const store = await makeStore();
  const result = await runOpportunityHunt(store, baseCfg, { opportunity: createOpportunityAdapters({}) });
  assert.equal(result.signalCount, 0);
  assert.equal(result.imported, 0);
  assert.equal(result.blocked.length, 6);
});

test('runOpportunityHunt: a configured adapter signal is imported as a real, queryable opportunity', async () => {
  const store = await makeStore();
  const adapters = { opportunity: createOpportunityAdapters({
    officialReleases: async () => [{
      organizationDomain: 'acme.com', serviceLane: 'ai-workflow', sourceUrl: 'https://acme.com/careers',
      signalKey: 'hiring-ai-lead', organization: 'Acme', capturedAt: '2026-07-30T00:00:00.000Z',
      official: true, confidence: 0.9, buyerSignal: 'hiring an AI workflow lead',
      expectedValueCents: 50000, ownerMinutes: 10, deliveryHours: 4, killCondition: 'role filled',
      contact: { email: 'partnerships@acme.com', source_url: 'https://acme.com/partners', published_officially: true }
    }]
  }) };
  const result = await runOpportunityHunt(store, baseCfg, adapters);
  assert.equal(result.imported, 1);
  const opportunities = await store.list('opportunities');
  assert.equal(opportunities.length, 1);
  assert.equal(opportunities[0].stage, 'ready_for_message');
});

test('runProspectDiscovery: no adapter configured blocks with zero additions, never fabricates prospects', async () => {
  const store = await makeStore();
  const result = await runProspectDiscovery(store, baseCfg, {});
  assert.equal(result.added, 0);
  const audit = await store.list('auditLog');
  assert.ok(audit.some(row => row.type === 'canon_prospect_discovery_blocked_no_adapter'));
});

async function seedReadySendCandidate(store, at) {
  const evidence = await store.add('sourceEvidence', {
    id: 'ev_1', organizationDomain: 'acme.com', sourceUrl: 'https://acme.com/careers', sourceType: 'official-company',
    status: 'active', contactEmail: 'partnerships@acme.com', contentHash: 'h1', capturedAt: '2026-07-30T00:00:00.000Z', data: {}
  });
  const opportunity = await store.add('opportunities', {
    id: 'opp_1', idempotencyKey: 'idem_1', sourceEvidenceId: evidence.id, stage: 'ready_for_message',
    serviceLane: 'ai-workflow', expectedValueCents: 50000, currency: 'USD', ownerMinutes: 10, deliveryHours: 4,
    scoreTotal: 80, scoreVersion: 'v1', data: {}
  });
  await store.add('policyDecisions', { id: 'pd_1', opportunityId: opportunity.id, policyVersion: REVENUE_OS_POLICY_VERSION, decision: 'pass', reasonCodes: [], evaluatedAt: at.toISOString(), data: {} });
  const experiment = await store.add('experiments', { id: 'exp_1', status: 'active', hypothesis: 'h', lane: 'ai-workflow', variant: 'a', successMetric: 'replies', data: {} });
  const messageVariant = await store.add('messageVariants', { id: 'mv_1', opportunityId: opportunity.id, experimentId: experiment.id, lane: 'ai-workflow', subject: 's', body: 'b', bodyHash: 'h', status: 'approved', data: {} });
  const approval = buildCampaignActivationApproval({
    experimentId: experiment.id, recipientEmails: ['partnerships@acme.com'], senderSet: ['inbox-a'], maxCount: 1,
    policyVersion: REVENUE_OS_POLICY_VERSION, approvedBy: 'owner', expiresAt: '2026-12-31T00:00:00.000Z', now: at
  });
  await store.add('campaignActivationApprovals', approval);
  return { opportunity, experiment, messageVariant };
}

test('runSendPlanning reserves an eligible opportunity exactly once, replays are a no-op', async () => {
  const store = await makeStore();
  const at = new Date('2026-08-01T12:00:00.000Z');
  await seedReadySendCandidate(store, at);
  const first = await runSendPlanning(store, baseCfg);
  assert.equal(first.results[0].status, 'reserved');
  const second = await runSendPlanning(store, baseCfg);
  // idempotencyKey already has a reservation -> loop `continue`s before pushing any result
  assert.equal(second.results.length, 0);
  const reservations = await store.list('outboundReservations');
  assert.equal(reservations.length, 1);
});

test('runSendPlanning + runDispatch (simulation) produces exactly one simulated_sent event, never a real sent event', async () => {
  const store = await makeStore();
  const at = new Date('2026-08-01T12:00:00.000Z');
  await seedReadySendCandidate(store, at);
  await runSendPlanning(store, baseCfg);
  const dispatchResult = await runDispatch(store, baseCfg, null);
  assert.equal(dispatchResult.count, 1);
  assert.equal(dispatchResult.results[0].status, 'simulated_sent');
  const events = await store.list('outboundEvents');
  assert.equal(events.some(e => e.eventType === 'sent'), false);
});

test('runReplySweep is gated to once per 24h and blocks with no adapter configured', async () => {
  const store = await makeStore();
  const first = await runReplySweep(store, baseCfg, {});
  assert.equal(first.swept, true);
  const second = await runReplySweep(store, baseCfg, {});
  assert.equal(second.swept, false);
  assert.equal(second.reason, 'not-due');
});

test('runAttribution and runCheckpoint report durable, read-only snapshots', async () => {
  const store = await makeStore();
  const snapshot = await runAttribution(store);
  assert.equal(typeof snapshot.opportunities, 'number');
  const checkpoint = await runCheckpoint(store, baseCfg);
  assert.ok(checkpoint.checkpointAt);
  const heartbeats = await store.list('workerHeartbeats');
  assert.ok(heartbeats.some(h => h.role === 'canon-cycle'));
});

test('P0-001 acceptance: a worker killed mid-stage is recovered and the stage completes from another worker', async () => {
  const store = await makeStore();
  const at = new Date('2026-08-01T12:00:00.000Z');
  await seedReadySendCandidate(store, at);
  const cfg = { ...baseCfg, queue: { concurrency: 1, pollMs: 50, maxAttempts: 5, retryBaseMs: 10, retryMaxMs: 100, lockTimeoutMs: 50, jobHeartbeatMs: 10000, workerHeartbeatMs: 10000, workerStaleMs: 90000, maxRuntimeMs: 900000 } };
  const queueA = new DurableQueue(store, cfg, { error() {} });
  await scheduleCanonCycle(queueA, { now: at });

  const handlers = createCanonCycleHandlers({ store, cfg, adapters: {}, provider: null });
  // Worker A claims the send_planning job (simulating a lease) but "dies" before completing --
  // never calls completeJob/failJob, so the job stays 'active' with a stale heartbeat.
  const claimed = await store.claimJobs(queueA.workerId, 10, cfg.queue.lockTimeoutMs);
  const sendPlanningJob = claimed.find(job => job.type === CANON_JOB_TYPES.SEND_PLANNING);
  assert.ok(sendPlanningJob, 'send_planning job should have been claimed');

  // Simulate the lease going stale without a real sleep (store.mjs floors lockTimeoutMs at
  // 1000ms, so backdating the heartbeat directly is faster and just as real a test of the
  // recovery path as waiting out the clock would be).
  await store.patch('jobs', sendPlanningJob.id, { heartbeatAt: new Date(Date.now() - 5000).toISOString() });

  // A second worker recovers the stale lease and completes the job itself.
  const queueB = new DurableQueue(store, cfg, { error() {} });
  const recovered = await store.recoverStaleJobs(cfg.queue.lockTimeoutMs);
  assert.equal(recovered.recovered >= 1, true);
  const reclaimed = await store.claimJobs(queueB.workerId, 10, cfg.queue.lockTimeoutMs);
  const resumedJob = reclaimed.find(job => job.id === sendPlanningJob.id);
  assert.ok(resumedJob, 'the recovered job should be claimable by another worker');
  await queueB.runJob(resumedJob, handlers);

  const completedJob = await store.get('jobs', sendPlanningJob.id);
  assert.equal(completedJob.status, 'completed');
  const reservations = await store.list('outboundReservations');
  assert.equal(reservations.length, 1, 'exactly one durable reservation, not zero and not duplicated');
});
