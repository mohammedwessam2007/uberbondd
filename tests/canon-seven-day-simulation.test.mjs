// Mission item 10 ("seven-day acceptance"): runs 7 simulated days of the durable Canon cycle with
// zero external adapters wired to any real network (every signal is injected deterministically by
// this test, never fetched) and asserts the acceptance criteria the mission names. This exercises
// the same stage functions autonomous-cycle.mjs's job handlers call -- the durability/resumability
// half of P0-001 is proven separately (tests/autonomous-cycle.test.mjs's kill-a-worker test); this
// test proves the seven-day BEHAVIORAL properties.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runOpportunityHunt, runProspectDiscovery, runSendPlanning, runDispatch, runReplySweep, runAttribution, runCheckpoint
} from '../src/autonomous-cycle.mjs';
import { createOpportunityAdapters } from '../src/opportunity-hunter.mjs';
import { buildCampaignActivationApproval } from '../src/campaign-activation.mjs';
import { REVENUE_OS_POLICY_VERSION } from '../src/revenue-os.mjs';
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

function prospectCandidatesForDay(dayIndex, at) {
  return Array.from({ length: 30 }, (_, i) => {
    const domain = `company-${dayIndex}-${i}.example`;
    return {
      domain, organization: `Company ${dayIndex}-${i}`, triggerSignal: 'Official hiring signal',
      evidenceUrl: `https://${domain}/careers`, evidenceDate: at.toISOString(),
      contact: { email: `partnerships@${domain}`, publishedOfficially: true },
      contactProvenance: 'Official partnerships address published by company',
      serviceLane: 'ai-workflow'
    };
  });
}

function opportunitySignalForDay(dayIndex, at) {
  const domain = `winner-${dayIndex}.example`;
  return {
    id: `signal_${domain}`, organizationDomain: domain, serviceLane: 'ai-workflow', sourceUrl: `https://${domain}/careers`,
    signalKey: `hiring-${dayIndex}`, organization: `Winner ${dayIndex}`, capturedAt: at.toISOString(),
    official: true, confidence: 0.9, buyerSignal: 'hiring an AI workflow lead',
    expectedValueCents: 50000, ownerMinutes: 10, deliveryHours: 4, killCondition: 'role filled',
    contact: { email: `partnerships@${domain}`, source_url: `https://${domain}/partners`, published_officially: true }
  };
}

test('mission item 10 acceptance: seven simulated days', async (t) => {
  const store = await makeStore();
  const cfg = {
    acquisition: {
      workersActive: true, simulation: true, targetProspectBacklog: 100000, targetDailySends: 50,
      dailyInfraCostCeilingCents: 10, senderSet: ['inbox-a']
    },
    revenueOs: {}, ai: { provider: 'rules' }
  };

  const experiment = await store.add('experiments', {
    id: 'exp_week', status: 'active', hypothesis: 'weekly cohort', lane: 'ai-workflow', variant: 'a', successMetric: 'replies', data: {}
  });

  const daySweptResults = [];

  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
    const at = new Date(START.getTime() + dayIndex * DAY_MS);

    await runProspectDiscovery(store, cfg, { prospectDiscovery: async () => prospectCandidatesForDay(dayIndex, at) }, at);

    const adapters = { opportunity: createOpportunityAdapters({ officialReleases: async () => [opportunitySignalForDay(dayIndex, at)] }) };
    const huntResult = await runOpportunityHunt(store, cfg, adapters, at);
    assert.equal(huntResult.imported, 1, `day ${dayIndex}: exactly one opportunity should import`);

    const todays = (await store.list('opportunities')).find(row => row.data?.organization === `Winner ${dayIndex}`);
    assert.ok(todays, `day ${dayIndex}: today's opportunity should be queryable`);

    const messageVariant = await store.add('messageVariants', {
      id: `mv_${dayIndex}`, opportunityId: todays.id, experimentId: experiment.id, lane: 'ai-workflow',
      subject: `s${dayIndex}`, body: `b${dayIndex}`, bodyHash: `h${dayIndex}`, status: 'approved', data: {}
    });
    const recipientEmail = `partnerships@winner-${dayIndex}.example`;
    const approval = buildCampaignActivationApproval({
      experimentId: experiment.id, recipientEmails: [recipientEmail], senderSet: ['inbox-a'], maxCount: 1,
      policyVersion: REVENUE_OS_POLICY_VERSION, approvedBy: 'owner', expiresAt: '2026-12-31T00:00:00.000Z', now: at
    });
    await store.add('campaignActivationApprovals', approval);

    const planResult = await runSendPlanning(store, cfg, at);
    const reservedToday = planResult.results.find(row => row.opportunityId === todays.id);
    assert.equal(reservedToday?.status, 'reserved', `day ${dayIndex}: today's opportunity should reserve (${JSON.stringify(reservedToday)})`);

    const dispatchResult = await runDispatch(store, cfg, null);
    assert.ok(dispatchResult.results.every(row => row.status === 'simulated_sent'));

    const sweep1 = await runReplySweep(store, cfg, {}, at);
    const sweep2 = await runReplySweep(store, cfg, {}, at); // same simulated instant: must be a no-op
    assert.equal(sweep1.swept, true, `day ${dayIndex}: first sweep of the day should run`);
    assert.equal(sweep2.swept, false, `day ${dayIndex}: a second sweep the same day must not run`);
    daySweptResults.push(sweep1.swept);

    await runAttribution(store);
    await runCheckpoint(store, cfg, at);
  }

  await t.test('exactly one reply sweep ran per simulated day (7 total)', () => {
    assert.equal(daySweptResults.filter(Boolean).length, 7);
  });

  await t.test('zero duplicate recipients across the whole week', async () => {
    const reservations = await store.list('outboundReservations');
    const recipients = reservations.map(r => r.recipientEmail);
    assert.equal(recipients.length, 7);
    assert.equal(new Set(recipients).size, 7);
  });

  await t.test('every reservation dispatched as simulated_sent, never a real sent event', async () => {
    const events = await store.list('outboundEvents');
    assert.equal(events.filter(e => e.eventType === 'sent').length, 0);
    assert.equal(events.filter(e => e.eventType === 'simulated_sent').length, 7);
  });

  await t.test('the prospect-supply backlog grew by 30 unique companies per day, zero duplicates', async () => {
    const prospects = await store.list('prospects');
    assert.equal(prospects.length, 7 * 30);
    assert.equal(new Set(prospects.map(p => p.domain)).size, prospects.length);
  });

  await t.test('bounded infrastructure cost: the ledger never exceeds its configured daily ceiling', async () => {
    const entries = await store.list('costLedgerEntries');
    for (const entry of entries) {
      assert.ok(entry.reservedCents <= entry.budgetCents, `${entry.ledgerDate}/${entry.category}: ${entry.reservedCents} > ${entry.budgetCents}`);
    }
  });

  await t.test('complete audit history exists for every stage, every day', async () => {
    const audit = await store.list('auditLog');
    for (const type of ['canon_opportunity_hunt_completed', 'canon_prospect_discovery_completed', 'canon_send_planning_completed', 'canon_dispatch_completed', 'canon_reply_sweep_completed', 'canon_attribution_snapshot', 'canon_cycle_checkpoint']) {
      const count = audit.filter(row => row.type === type).length;
      assert.equal(count, 7, `${type}: expected 7 entries, found ${count}`);
    }
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
