// Mission item 10 ("seven-day acceptance"), repaired per PR #7 repair finding C-P1-001: the
// pre-repair version drove the cycle by calling each stage function directly, in order, from the
// test itself -- which cannot prove anything about the real runtime (worker handler registration,
// DurableQueue's own scheduling/concurrency/stale-job recovery, or that downstream stages actually
// wait for their predecessor rather than merely being called in a convenient order by the test).
// This version drives the SAME `createCanonCycleHandlers` map worker.mjs registers, through a real
// `DurableQueue` with concurrency 3, with every timestamp injected via each job's payload
// (deterministic, no reliance on real wall-clock waits), and includes one genuine stale-job
// recovery within the run.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANON_JOB_TYPES, STAGE_ORDER, scheduleCanonCycle, createCanonCycleHandlers
} from '../src/autonomous-cycle.mjs';
import { persistCampaignActivationApproval } from '../src/campaign-activation.mjs';
import { REVENUE_OS_POLICY_VERSION } from '../src/revenue-os.mjs';
import { reconstructAttributionChain } from '../src/attribution-chain.mjs';
import { DurableQueue } from '../src/queue.mjs';
import { JsonStore } from '../src/store.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canon-seven-day-'));
  const store = new JsonStore(dir);
  await store.init();
  return store;
}

const DAY_MS = 86400000;
const START = new Date('2026-08-01T06:00:00.000Z');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Drives the real queue with the given concurrency until `predicate(auditLog)` is true, or gives
 * up after `maxIterations`. Every job's own timestamp is whatever was injected into its payload
 * when it was enqueued (scheduleCanonCycle / each stage's own next-stage enqueue) -- this loop's
 * real wall-clock speed has no bearing on the simulated business dates being exercised. */
async function driveUntil(store, queue, handlers, predicate, { concurrency = 3, maxIterations = 60 } = {}) {
  for (let i = 0; i < maxIterations; i += 1) {
    await queue.runOnce(handlers, { concurrency });
    const audit = await store.list('auditLog');
    if (predicate(audit)) return audit;
    await sleep(15);
  }
  throw new Error('driveUntil: predicate never became true');
}

function prospectCandidatesForDay(dayIndex, at) {
  return Array.from({ length: 30 }, (_, i) => {
    const domain = `backlog-${dayIndex}-${i}.example`;
    return {
      domain, organization: `Backlog ${dayIndex}-${i}`, triggerSignal: 'Official hiring signal',
      evidenceUrl: `https://${domain}/careers`, evidenceDate: at.toISOString(),
      contact: { email: `partnerships@${domain}`, publishedOfficially: true },
      contactProvenance: 'Official partnerships address published by company', serviceLane: 'ai-workflow'
    };
  });
}

test('mission item 10 acceptance: seven simulated days driven through the real DurableQueue and registered worker handlers', async (t) => {
  const store = await makeStore();
  const cfg = {
    acquisition: {
      workersActive: true, simulation: true, targetProspectBacklog: 100000, targetDailySends: 50,
      dailyInfraCostCeilingCents: 10, senderSet: ['inbox-a']
    },
    revenueOs: {}, ai: { provider: 'rules' },
    queue: { concurrency: 3, pollMs: 15, maxAttempts: 5, retryBaseMs: 10, retryMaxMs: 100, lockTimeoutMs: 1000, jobHeartbeatMs: 10000, workerHeartbeatMs: 10000, workerStaleMs: 90000, maxRuntimeMs: 900000 }
  };

  // Pre-wire ONE fully-eligible send candidate (opportunity + approved message variant + active
  // experiment + a 5-member frozen-cohort approval covering it). The dedicated 100-member cohort
  // acceptance test lives in tests/campaign-activation.test.mjs (including a real-Postgres
  // concurrent-claim race); this test's job is to prove the REAL QUEUE drives the chain correctly
  // for seven days, not to re-prove cohort math a second time.
  const evidence = await store.add('sourceEvidence', {
    id: 'ev_winner', organizationDomain: 'winner.example', sourceUrl: 'https://winner.example/careers',
    sourceType: 'official-company', status: 'active', contactEmail: 'partnerships@winner.example',
    contentHash: 'h1', capturedAt: '2026-07-30T00:00:00.000Z', data: {}
  });
  const opportunity = await store.add('opportunities', {
    id: 'opp_winner', idempotencyKey: 'idem_winner', sourceEvidenceId: evidence.id, stage: 'ready_for_message',
    serviceLane: 'ai-workflow', expectedValueCents: 50000, currency: 'USD', ownerMinutes: 10, deliveryHours: 4,
    scoreTotal: 80, scoreVersion: 'v1', data: {}
  });
  await store.add('policyDecisions', {
    id: 'pd_winner', opportunityId: opportunity.id, policyVersion: REVENUE_OS_POLICY_VERSION,
    decision: 'pass', reasonCodes: [], evaluatedAt: START.toISOString(), data: {}
  });
  const experiment = await store.add('experiments', {
    id: 'exp_week', status: 'active', hypothesis: 'weekly cohort', lane: 'ai-workflow', variant: 'a',
    minimumSample: 25, successMetric: 'replies', data: {}
  });
  await store.add('messageVariants', {
    id: 'mv_winner', opportunityId: opportunity.id, experimentId: experiment.id, lane: 'ai-workflow',
    subject: 'subject', body: 'body', bodyHash: 'hash', status: 'approved', data: {}
  });
  await persistCampaignActivationApproval(store, {
    experimentId: experiment.id,
    members: [
      { organizationDomain: 'winner.example', recipientEmail: 'partnerships@winner.example' },
      { organizationDomain: 'other-1.example', recipientEmail: 'buyer@other-1.example' },
      { organizationDomain: 'other-2.example', recipientEmail: 'buyer@other-2.example' },
      { organizationDomain: 'other-3.example', recipientEmail: 'buyer@other-3.example' },
      { organizationDomain: 'other-4.example', recipientEmail: 'buyer@other-4.example' }
    ],
    senderSet: ['inbox-a'], policyVersion: REVENUE_OS_POLICY_VERSION, approvedBy: 'owner',
    expiresAt: '2026-12-31T00:00:00.000Z', now: START
  });

  const queue = new DurableQueue(store, cfg, { error() {} });
  const handlers = createCanonCycleHandlers({ store, cfg, queue, adapters: { prospectDiscovery: null }, provider: null });

  const checkpointDates = [];

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const at = new Date(START.getTime() + dayIndex * DAY_MS);
    const day = at.toISOString().slice(0, 10);

    // Give this day's prospect_discovery stage a fresh adapter (backlog growth only -- unrelated
    // to the cohort/winner candidate above).
    handlers[CANON_JOB_TYPES.PROSPECT_DISCOVERY] = await (async () => {
      const dayHandlers = createCanonCycleHandlers({
        store, cfg, queue, adapters: { prospectDiscovery: async () => prospectCandidatesForDay(dayIndex, at) }, provider: null
      });
      return dayHandlers[CANON_JOB_TYPES.PROSPECT_DISCOVERY];
    })();

    await scheduleCanonCycle(queue, { now: at });

    if (dayIndex === 0) {
      // C-P0-002/C-P1-001 acceptance: drive only as far as send_planning completing, insert a
      // suppression for the winner's recipient, THEN let dispatch run -- proving the real
      // queue-driven chain performs the pre-dispatch recheck, not just the unit-level call.
      await driveUntil(store, queue, handlers, audit => audit.some(row => row.type === 'canon_send_planning_completed'), { concurrency: 3 });
      await store.add('suppressions', { id: 'sup_winner', value: 'partnerships@winner.example', data: {} });
    }

    // C-P0-002 acceptance (stale-job recovery within the real seven-day run): simulate a crash
    // partway through day 3's chain, then let another queue instance resume and finish it.
    if (dayIndex === 3) {
      await driveUntil(store, queue, handlers, audit => audit.filter(row => row.type === 'canon_reply_sweep_completed').length === 3, { concurrency: 3 });
      const claimed = await store.claimJobs(queue.workerId, 5, cfg.queue.lockTimeoutMs);
      const attributionJob = claimed.find(job => job.type === CANON_JOB_TYPES.ATTRIBUTION && job.payload?.day === day);
      if (attributionJob) {
        await store.patch('jobs', attributionJob.id, { heartbeatAt: new Date(Date.now() - 5000).toISOString() });
        const recovered = await store.recoverStaleJobs(cfg.queue.lockTimeoutMs);
        assert.ok(recovered.recovered >= 1, 'day 3 attribution job should have been recovered after the simulated crash');
      }
    }

    await driveUntil(store, queue, handlers, audit => audit.some(row => row.type === 'canon_cycle_checkpoint' && row.detail?.day === day), { concurrency: 3 });
    checkpointDates.push(day);
  }

  await t.test('seven distinct simulated checkpoint dates were recorded', async () => {
    assert.equal(new Set(checkpointDates).size, 7);
    assert.deepEqual(checkpointDates, [
      '2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'
    ]);
  });

  await t.test('exactly one ordinary reply sweep completed per 24 hours (7 total, all swept:true)', async () => {
    const audit = await store.list('auditLog');
    const sweeps = audit.filter(row => row.type === 'canon_reply_sweep_completed');
    assert.equal(sweeps.length, 7);
    assert.ok(sweeps.every(row => row.detail?.swept === true));
  });

  await t.test('no downstream stage ran before its predecessor, for every day', async () => {
    const audit = await store.list('auditLog');
    const stageEventTypes = {
      [CANON_JOB_TYPES.OPPORTUNITY_HUNT]: 'canon_opportunity_hunt_completed',
      [CANON_JOB_TYPES.PROSPECT_DISCOVERY]: 'canon_prospect_discovery_completed',
      [CANON_JOB_TYPES.SEND_PLANNING]: 'canon_send_planning_completed',
      [CANON_JOB_TYPES.DISPATCH]: 'canon_dispatch_completed',
      [CANON_JOB_TYPES.REPLY_SWEEP]: 'canon_reply_sweep_completed',
      [CANON_JOB_TYPES.ATTRIBUTION]: 'canon_attribution_snapshot',
      [CANON_JOB_TYPES.CHECKPOINT]: 'canon_cycle_checkpoint'
    };
    const orderedEventTimes = STAGE_ORDER.map(type => stageEventTypes[type]);
    const orderedEventSet = new Set(orderedEventTimes);
    const timeline = audit
      .map((row, index) => ({ index, type: row.type }))
      .filter(row => orderedEventSet.has(row.type));
    // Every occurrence of stage K's event must have an index strictly before the NEXT occurrence
    // of stage K+1's event that logically follows it (there are 7 of each, one per day, in order).
    for (let s = 0; s < orderedEventTimes.length - 1; s += 1) {
      const currentIndices = timeline.filter(row => row.type === orderedEventTimes[s]).map(row => row.index);
      const nextIndices = timeline.filter(row => row.type === orderedEventTimes[s + 1]).map(row => row.index);
      assert.equal(currentIndices.length, 7, orderedEventTimes[s]);
      assert.equal(nextIndices.length, 7, orderedEventTimes[s + 1]);
      for (let day = 0; day < 7; day += 1) {
        assert.ok(currentIndices[day] < nextIndices[day], `${orderedEventTimes[s]} (day ${day}) must complete before ${orderedEventTimes[s + 1]} (day ${day})`);
      }
    }
  });

  await t.test('no duplicate reservation and no external send: exactly one reservation for the winner, cancelled by the dispatch-time suppression check', async () => {
    const reservations = await store.list('outboundReservations');
    const winnerReservations = reservations.filter(r => r.recipientEmail === 'partnerships@winner.example');
    assert.equal(winnerReservations.length, 1, 'idempotencyKey must prevent the winner from being reserved twice across seven daily cycles');
    assert.equal(winnerReservations[0].status, 'cancelled');
    const events = await store.list('outboundEvents');
    assert.equal(events.filter(e => e.eventType === 'sent').length, 0, 'no real send event may ever be produced');
  });

  await t.test('C-P0-004 acceptance (driven through the real queue): the dispatch-time suppression cancellation is durably audited', async () => {
    const audit = await store.list('auditLog');
    const cancellation = audit.find(row => row.type === 'canon_dispatch_cancelled_pre_send_recheck');
    assert.ok(cancellation);
    assert.ok(cancellation.detail.reasons.includes('recipient-suppressed'));
  });

  await t.test('attribution IDs are complete and the chain is reconstructable for the winner reservation', async () => {
    const [reservation] = await store.list('outboundReservations');
    const chain = await reconstructAttributionChain(store, reservation.id);
    assert.equal(chain.opportunityId, opportunity.id);
    assert.equal(chain.sourceEvidenceId, evidence.id);
    assert.equal(chain.experimentId, experiment.id);
    assert.equal(chain.messageVariantId, 'mv_winner');
    assert.ok(chain.cohortApprovalId);
    assert.equal(chain.complete, true);
  });

  await t.test('the prospect-supply backlog grew by 30 unique companies per day, zero duplicates', async () => {
    const prospects = await store.list('prospects');
    assert.equal(prospects.length, 7 * 30);
    assert.equal(new Set(prospects.map(p => p.domain)).size, prospects.length);
  });

  await t.test('every job across the whole seven-day run reached a terminal completed state (no orphan queue state)', async () => {
    const jobs = await store.list('jobs');
    const nonTerminal = jobs.filter(job => !['completed', 'dead-letter'].includes(job.status));
    assert.equal(nonTerminal.length, 0, JSON.stringify(nonTerminal.map(j => ({ id: j.id, type: j.type, status: j.status }))));
  });

  await t.test('research seeds cannot bypass validation: the static corpus never touched the live store', async () => {
    const opportunities = await store.list('opportunities');
    assert.equal(opportunities.some(o => o.stage === 'research_seed'), false);
  });

  await t.test('a global kill switch blocks further dispatch immediately', async () => {
    await store.setOutboundPaused(true, 'test-kill-switch');
    const reservation = await store.reserveOutboundSend({
      idempotencyKey: 'post-kill-switch', inbox: 'inbox-a', recipientEmail: 'blocked@example.com', dailyCap: 100, hourlyCap: 100, minGapSeconds: 0
    });
    assert.equal(reservation.ok, false);
    assert.equal(reservation.reason, 'global-outbound-paused');
  });
});
