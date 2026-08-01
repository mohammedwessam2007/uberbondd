import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANON_JOB_TYPES, STAGE_ORDER, scheduleCanonCycle, createCanonCycleHandlers,
  runOpportunityHunt, runProspectDiscovery, runSendPlanning, runDispatch, runReplySweep, runAttribution, runCheckpoint
} from '../src/autonomous-cycle.mjs';
import { createOpportunityAdapters } from '../src/opportunity-hunter.mjs';
import { persistCampaignActivationApproval } from '../src/campaign-activation.mjs';
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
  const result = await runOpportunityHunt(store, baseCfg, { opportunity: createOpportunityAdapters({}) }, new Date());
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
  const result = await runOpportunityHunt(store, baseCfg, adapters, new Date());
  assert.equal(result.imported, 1);
  const opportunities = await store.list('opportunities');
  assert.equal(opportunities.length, 1);
  assert.equal(opportunities[0].stage, 'ready_for_message');
});

test('runProspectDiscovery: no adapter configured blocks with zero additions, never fabricates prospects', async () => {
  const store = await makeStore();
  const result = await runProspectDiscovery(store, baseCfg, {}, new Date());
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
  const experiment = await store.add('experiments', { id: 'exp_1', status: 'active', hypothesis: 'h', lane: 'ai-workflow', variant: 'a', minimumSample: 25, successMetric: 'replies', data: {} });
  const messageVariant = await store.add('messageVariants', { id: 'mv_1', opportunityId: opportunity.id, experimentId: experiment.id, lane: 'ai-workflow', subject: 's', body: 'b', bodyHash: 'h', status: 'approved', data: {} });
  await persistCampaignActivationApproval(store, {
    experimentId: experiment.id, members: [{ organizationDomain: 'acme.com', recipientEmail: 'partnerships@acme.com' }],
    senderSet: ['inbox-a'], policyVersion: REVENUE_OS_POLICY_VERSION, approvedBy: 'owner', expiresAt: '2026-12-31T00:00:00.000Z', now: at
  });
  return { opportunity, experiment, messageVariant };
}

test('runSendPlanning reserves an eligible opportunity exactly once, replays are a no-op', async () => {
  const store = await makeStore();
  const at = new Date('2026-08-01T12:00:00.000Z');
  await seedReadySendCandidate(store, at);
  const first = await runSendPlanning(store, baseCfg, at);
  assert.equal(first.results[0].status, 'reserved');
  const second = await runSendPlanning(store, baseCfg, at);
  assert.equal(second.results.length, 0);
  const reservations = await store.list('outboundReservations');
  assert.equal(reservations.length, 1);
});

test('runSendPlanning persists the full canonical message + attribution identity on the reservation (C-P0-005/006)', async () => {
  const store = await makeStore();
  const at = new Date('2026-08-01T12:00:00.000Z');
  const { opportunity, experiment, messageVariant } = await seedReadySendCandidate(store, at);
  await runSendPlanning(store, baseCfg, at);
  const [reservation] = await store.list('outboundReservations');
  assert.equal(reservation.messageVariantId, messageVariant.id);
  assert.equal(reservation.contentHash, messageVariant.bodyHash);
  assert.equal(reservation.subject, messageVariant.subject);
  assert.equal(reservation.body, messageVariant.body);
  assert.equal(reservation.opportunityId, opportunity.id);
  assert.equal(reservation.sourceEvidenceId, 'ev_1');
  assert.equal(reservation.experimentId, experiment.id);
  assert.equal(reservation.organizationDomain, 'acme.com');
  assert.ok(reservation.cohortApprovalId);
});

test('runSendPlanning + runDispatch (simulation) produces exactly one simulated_sent event, never a real sent event', async () => {
  const store = await makeStore();
  const at = new Date('2026-08-01T12:00:00.000Z');
  await seedReadySendCandidate(store, at);
  await runSendPlanning(store, baseCfg, at);
  const dispatchResult = await runDispatch(store, baseCfg, null, at);
  assert.equal(dispatchResult.count, 1);
  assert.equal(dispatchResult.results[0].status, 'simulated_sent');
  const events = await store.list('outboundEvents');
  assert.equal(events.some(e => e.eventType === 'sent'), false);
});

test('C-P0-004 acceptance: suppression inserted after reservation but before dispatch blocks dispatch; provider spy never called', async () => {
  const store = await makeStore();
  const at = new Date('2026-08-01T12:00:00.000Z');
  await seedReadySendCandidate(store, at);
  await runSendPlanning(store, baseCfg, at);
  await store.add('suppressions', { id: 'sup_1', value: 'partnerships@acme.com', data: {} });
  const providerSpy = { called: false, send: async () => { providerSpy.called = true; return { messageId: 'should-not-happen' }; } };
  const dispatchResult = await runDispatch(store, baseCfg, providerSpy, at);
  assert.equal(providerSpy.called, false, 'provider.send must never be called once suppression blocks the pre-dispatch recheck');
  assert.equal(dispatchResult.results[0].status, 'cancelled');
  assert.ok(dispatchResult.results[0].reasons.includes('recipient-suppressed'));
  const [reservation] = await store.list('outboundReservations');
  assert.equal(reservation.status, 'cancelled');
});

test('C-P0-004 acceptance: an expired campaign activation approval discovered at dispatch time blocks dispatch', async () => {
  const store = await makeStore();
  const at = new Date('2026-08-01T12:00:00.000Z');
  await seedReadySendCandidate(store, at);
  await runSendPlanning(store, baseCfg, at);
  const [approval] = await store.list('campaignActivationApprovals');
  await store.patch('campaignActivationApprovals', approval.id, { expiresAt: '2026-08-01T13:00:00.000Z' });
  const later = new Date('2026-08-01T14:00:00.000Z');
  const providerSpy = { called: false, send: async () => { providerSpy.called = true; return {}; } };
  const dispatchResult = await runDispatch(store, baseCfg, providerSpy, later);
  assert.equal(providerSpy.called, false);
  assert.equal(dispatchResult.results[0].status, 'cancelled');
});

test('a global outbound pause blocks dispatch immediately regardless of an otherwise-eligible reservation', async () => {
  const store = await makeStore();
  const at = new Date('2026-08-01T12:00:00.000Z');
  await seedReadySendCandidate(store, at);
  await runSendPlanning(store, baseCfg, at);
  await store.setOutboundPaused(true, 'test');
  const providerSpy = { called: false, send: async () => { providerSpy.called = true; return {}; } };
  const dispatchResult = await runDispatch(store, baseCfg, providerSpy, at);
  assert.equal(providerSpy.called, false);
  assert.equal(dispatchResult.results[0].reasons[0], 'global-outbound-paused');
});

test('runReplySweep is gated to once per 24h and blocks with no adapter configured', async () => {
  const store = await makeStore();
  const at = new Date('2026-08-01T12:00:00.000Z');
  const first = await runReplySweep(store, baseCfg, {}, at);
  assert.equal(first.swept, true);
  const second = await runReplySweep(store, baseCfg, {}, at);
  assert.equal(second.swept, false);
  assert.equal(second.reason, 'not-due');
});

test('runAttribution and runCheckpoint report durable, read-only snapshots', async () => {
  const store = await makeStore();
  const at = new Date('2026-08-01T12:00:00.000Z');
  const snapshot = await runAttribution(store);
  assert.equal(typeof snapshot.opportunities, 'number');
  assert.equal(typeof snapshot.attributionComplete, 'boolean');
  const checkpoint = await runCheckpoint(store, baseCfg, at, '2026-08-01');
  assert.ok(checkpoint.checkpointAt);
  assert.equal(checkpoint.day, '2026-08-01');
  const heartbeats = await store.list('workerHeartbeats');
  assert.ok(heartbeats.some(h => h.role === 'canon-cycle'));
});

test('C-P0-006 acceptance: the attribution chain is fully reconstructable from one reservation', async () => {
  const store = await makeStore();
  const at = new Date('2026-08-01T12:00:00.000Z');
  await seedReadySendCandidate(store, at);
  await runSendPlanning(store, baseCfg, at);
  const [reservation] = await store.list('outboundReservations');
  const { reconstructAttributionChain } = await import('../src/attribution-chain.mjs');
  const chain = await reconstructAttributionChain(store, reservation.id);
  assert.equal(chain.complete, true);
  assert.equal(chain.firstTouch, true);
  assert.ok(chain.chain.opportunity);
  assert.ok(chain.chain.sourceEvidence);
  assert.ok(chain.chain.experiment);
  assert.ok(chain.chain.messageVariant);
  assert.ok(chain.chain.cohortMember);
});

test('C-P0-002 acceptance: with queue concurrency >= 3, downstream stages never exist as jobs before their predecessor completes', async () => {
  const store = await makeStore();
  const at = new Date('2026-08-01T12:00:00.000Z');
  await seedReadySendCandidate(store, at);
  const cfg = { ...baseCfg, queue: { concurrency: 3, pollMs: 20, maxAttempts: 5, retryBaseMs: 10, retryMaxMs: 100, lockTimeoutMs: 1000, jobHeartbeatMs: 10000, workerHeartbeatMs: 10000, workerStaleMs: 90000, maxRuntimeMs: 900000 } };
  const queue = new DurableQueue(store, cfg, { error() {} });
  const handlers = createCanonCycleHandlers({ store, cfg, queue, adapters: {}, provider: null });
  await scheduleCanonCycle(queue, { now: at });

  const completionOrder = [];
  const wrapped = {};
  for (const type of STAGE_ORDER) {
    wrapped[type] = async (payload, job) => {
      // At the moment this stage BEGINS, no later stage may already have completed.
      const laterStages = STAGE_ORDER.slice(STAGE_ORDER.indexOf(type) + 1);
      assert.ok(laterStages.every(later => !completionOrder.includes(later)), `${type} started after a later stage (${completionOrder.join(',')}) had already completed`);
      const result = await handlers[type](payload, job);
      completionOrder.push(type);
      return result;
    };
  }

  // Drive the real queue with concurrency 3 until every stage job has been claimed and completed.
  for (let i = 0; i < 30 && completionOrder.length < STAGE_ORDER.length; i += 1) {
    await queue.runOnce(wrapped, { concurrency: 3 });
    await new Promise(resolve => setTimeout(resolve, 30));
  }

  assert.deepEqual(completionOrder, [...STAGE_ORDER]);
  const jobs = await store.list('jobs');
  assert.equal(jobs.filter(job => job.status === 'completed').length, STAGE_ORDER.length);
});

test('P0-001/C-P0-002 acceptance: a worker killed mid-stage is recovered and the chain resumes and continues exactly once', async () => {
  const store = await makeStore();
  const at = new Date('2026-08-01T12:00:00.000Z');
  await seedReadySendCandidate(store, at);
  const cfg = { ...baseCfg, queue: { concurrency: 1, pollMs: 50, maxAttempts: 5, retryBaseMs: 10, retryMaxMs: 100, lockTimeoutMs: 1000, jobHeartbeatMs: 10000, workerHeartbeatMs: 10000, workerStaleMs: 90000, maxRuntimeMs: 900000 } };
  const queueA = new DurableQueue(store, cfg, { error() {} });
  await scheduleCanonCycle(queueA, { now: at });

  const handlers = createCanonCycleHandlers({ store, cfg, queue: queueA, adapters: {}, provider: null });
  // Worker A claims the opportunity_hunt job (simulating a lease) but "dies" before completing --
  // never calls completeJob/failJob, so the job stays 'active' with a heartbeat we then backdate.
  const claimed = await store.claimJobs(queueA.workerId, 10, cfg.queue.lockTimeoutMs);
  const opportunityHuntJob = claimed.find(job => job.type === CANON_JOB_TYPES.OPPORTUNITY_HUNT);
  assert.ok(opportunityHuntJob, 'opportunity_hunt job should have been claimed');
  assert.equal(claimed.length, 1, 'no downstream stage job should exist yet');

  await store.patch('jobs', opportunityHuntJob.id, { heartbeatAt: new Date(Date.now() - 5000).toISOString() });

  const queueB = new DurableQueue(store, cfg, { error() {} });
  const handlersB = createCanonCycleHandlers({ store, cfg, queue: queueB, adapters: {}, provider: null });
  const recovered = await store.recoverStaleJobs(cfg.queue.lockTimeoutMs);
  assert.equal(recovered.recovered >= 1, true);
  const reclaimed = await store.claimJobs(queueB.workerId, 10, cfg.queue.lockTimeoutMs);
  const resumedJob = reclaimed.find(job => job.id === opportunityHuntJob.id);
  assert.ok(resumedJob, 'the recovered job should be claimable by another worker');
  await queueB.runJob(resumedJob, handlersB);

  const completedJob = await store.get('jobs', opportunityHuntJob.id);
  assert.equal(completedJob.status, 'completed');

  // The chain must have continued exactly once: prospect_discovery now exists as a single job.
  const allJobs = await store.list('jobs');
  const discoveryJobs = allJobs.filter(job => job.type === CANON_JOB_TYPES.PROSPECT_DISCOVERY);
  assert.equal(discoveryJobs.length, 1, 'the next stage must be enqueued exactly once after resume');
});
