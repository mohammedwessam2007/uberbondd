import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../revenue-os/src/store.mjs';
import { FUNNEL_STAGES, computeFunnelCounts, computeFunnelRates, assignVariant, summarizeExperiment, recordExperimentOutcome, ExperimentError } from '../../revenue-os/src/funnel.mjs';
import { compileOwnerActionQueue, computeVerdict } from '../../revenue-os/src/owner-actions.mjs';
import { renderOwnerCommandCenter } from '../../revenue-os/src/portal/owner-command-center.mjs';

async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ros-funnel-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

// --- funnel counts ---

test('FUNNEL_STAGES has exactly the mission\'s 18 named stages', () => {
  assert.equal(FUNNEL_STAGES.length, 18);
});

test('computeFunnelCounts derives every count from real persisted records, not a separate counter', async () => {
  const store = await harness();
  await store.add('opportunities', { organizationDomain: 'a.example.com', channel: 'referral_intro', status: 'candidate', score: 50, data: {} });
  await store.add('opportunities', { organizationDomain: 'b.example.com', channel: 'referral_intro', status: 'candidate', score: 10, data: {} });
  await store.add('replies', { classification: 'pricing', data: {} });
  await store.add('replies', { classification: 'bounce', data: {} });
  await store.add('payments', { status: 'VERIFIED', data: {} });
  const counts = await computeFunnelCounts(store);
  assert.equal(counts.researched, 2);
  assert.equal(counts.qualified, 1, 'only the score>=35 opportunity counts as qualified');
  assert.equal(counts.replied, 2);
  assert.equal(counts.meaningful_reply, 1, 'only pricing is a meaningful-reply category here, not bounce');
  assert.equal(counts.bounced, 1);
  assert.equal(counts.payment, 1);
});

test('computeFunnelRates returns null (not zero or a divide-by-zero crash) for a rate with no denominator', () => {
  const rates = computeFunnelRates({ replied: 0, externally_sent: 0, meaningful_reply: 0, qualified_conversation: 0, proposal: 0, payment: 0, payment_request: 0, repeat_order: 0, monitoring: 0, delivery: 0 });
  assert.equal(rates.responseRate, null);
  assert.equal(rates.paymentRate, null);
});

test('computeFunnelRates computes real, non-null rates when denominators are present', () => {
  const rates = computeFunnelRates({ replied: 5, externally_sent: 10, meaningful_reply: 3, qualified_conversation: 2, proposal: 1, payment: 1, payment_request: 2, repeat_order: 0, monitoring: 0, delivery: 1 }, { totalRevenueCents: 25000, totalDirectCostCents: 10000 });
  assert.equal(rates.responseRate, 0.5);
  assert.equal(rates.paymentRate, 0.5);
  assert.equal(rates.contributionMarginRate, 0.6);
});

// --- experiments ---

test('assignVariant is deterministic and idempotent per subject+experiment', async () => {
  const store = await harness();
  const first = await assignVariant(store, { experimentName: 'subject-line-test', variable: 'subject_line', subjectId: 'org-a', variants: ['A', 'B'] });
  const second = await assignVariant(store, { experimentName: 'subject-line-test', variable: 'subject_line', subjectId: 'org-a', variants: ['A', 'B'] });
  assert.equal(first.variant, second.variant);
  assert.equal(first.id, second.id);
});

test('assignVariant requires a named variable (prevents a hidden multi-variable change)', async () => {
  const store = await harness();
  await assert.rejects(() => assignVariant(store, { experimentName: 'x', subjectId: 'org-a', variants: ['A', 'B'] }), ExperimentError);
});

test('assignVariant refuses an overlapping active experiment for the same subject', async () => {
  const store = await harness();
  await assignVariant(store, { experimentName: 'exp-1', variable: 'subject_line', subjectId: 'org-a', variants: ['A', 'B'] });
  await assert.rejects(() => assignVariant(store, { experimentName: 'exp-2', variable: 'offer_price', subjectId: 'org-a', variants: ['low', 'high'] }), ExperimentError);
});

test('summarizeExperiment never claims significance and requires a minimum sample size per variant', () => {
  const smallSample = summarizeExperiment([{ variant: 'A', outcome: 'converted' }, { variant: 'B', outcome: null }], { minSampleSize: 30 });
  assert.equal(smallSample.sufficientSample, false);
  assert.equal(smallSample.significant, false);
  const bigSample = summarizeExperiment(Array.from({ length: 40 }, (_, i) => ({ variant: i % 2 === 0 ? 'A' : 'B', outcome: i % 3 === 0 ? 'converted' : null })), { minSampleSize: 15 });
  assert.equal(bigSample.sufficientSample, true);
  assert.equal(bigSample.significant, false, 'this module never computes real statistical significance, even with enough sample');
});

test('recordExperimentOutcome is an audited event, not a silent field write', async () => {
  const store = await harness();
  const assignment = await assignVariant(store, { experimentName: 'exp-1', variable: 'subject_line', subjectId: 'org-a', variants: ['A', 'B'] });
  const updated = await recordExperimentOutcome(store, assignment.id, 'converted', { actor: 'owner' });
  assert.equal(updated.outcome, 'converted');
  const auditLog = await store.list('auditLog', { filters: { type: 'experiment_outcome_recorded' } });
  assert.equal(auditLog.length, 1);
});

// --- owner actions ---

test('compileOwnerActionQueue produces every action with all 6 mission-required fields', async () => {
  const store = await harness();
  await store.add('approvals', { status: 'pending', expiresAt: new Date(Date.now() + 3600000).toISOString(), data: { organizationDomain: 'a.example.com' } });
  await store.add('blockers', { workstream: 'importer', code: 'archive-too-many-entries', status: 'open' });
  await store.add('payments', { status: 'PENDING_VERIFICATION', data: {} });
  const actions = await compileOwnerActionQueue(store);
  assert.equal(actions.length, 3);
  for (const action of actions) {
    for (const field of ['target', 'minutes', 'costCents', 'proofRequired', 'default', 'urgency']) assert.ok(field in action, `missing ${field}`);
  }
});

test('compileOwnerActionQueue ranks high-urgency items first', async () => {
  const store = await harness();
  await store.add('approvals', { status: 'pending', expiresAt: new Date(Date.now() + 100 * 3600000).toISOString(), data: { organizationDomain: 'a.example.com' } });
  await store.add('blockers', { workstream: 'importer', code: 'x', status: 'open' });
  const actions = await compileOwnerActionQueue(store);
  assert.equal(actions[0].subjectType, 'blocker'); // blockers are always high urgency
});

test('computeVerdict prioritizes blockers over approvals over payments over monitoring, and reports "no action" at zero', () => {
  assert.match(computeVerdict({ pendingApprovals: 0, openBlockers: 2, pendingPayments: 1, activeMonitoring: 1 }), /blocker/);
  assert.match(computeVerdict({ pendingApprovals: 3, openBlockers: 0, pendingPayments: 1, activeMonitoring: 1 }), /approval/);
  assert.match(computeVerdict({ pendingApprovals: 0, openBlockers: 0, pendingPayments: 2, activeMonitoring: 1 }), /payment/);
  assert.match(computeVerdict({ pendingApprovals: 0, openBlockers: 0, pendingPayments: 0, activeMonitoring: 3 }), /monitoring/);
  assert.match(computeVerdict({ pendingApprovals: 0, openBlockers: 0, pendingPayments: 0, activeMonitoring: 0 }), /No owner action/);
});

// --- owner command center portal ---

test('renderOwnerCommandCenter shows exactly the 5 mission-named home-screen items plus every detail section, and escapes hostile input', () => {
  const html = renderOwnerCommandCenter({
    verdict: 'Test verdict', ownerActions: [{ target: '<script>alert(1)</script>', minutes: 1, costCents: 0, proofRequired: 'x', default: 'x', urgency: 'high' }],
    blockers: [], scoreboard: { researched: 5 }, importStatus: { packsImported: 2, quarantined: 1 }
  });
  assert.match(html, /Current Verdict/);
  assert.match(html, /Next 3 Owner Actions/);
  assert.match(html, /Active Blockers/);
  assert.match(html, /Real Scoreboard/);
  assert.match(html, /Import \/ Employee Status/);
  assert.match(html, /Opportunity Ranking/);
  assert.match(html, /Approval Queue/);
  assert.match(html, /Provider Health/);
  assert.match(html, /Scheduler Health/);
  assert.match(html, /Audit Log/);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('renderOwnerCommandCenter redacts reply sender emails in the Replies section', () => {
  const html = renderOwnerCommandCenter({ replies: [{ classification: 'pricing', data: { from: 'buyer@realcompany.example' } }] });
  assert.ok(!html.includes('buyer@realcompany.example'));
});

// 24/7 Continuous Revenue Core, section 12: reproduces the exact named defect ("cached READY while
// required gates were false") as a hostile test and proves this codebase's real dashboard now
// refuses to render it, rather than just documenting that it should.
test('hostile: renderOwnerCommandCenter refuses to render a verdict that claims READY while blockers are present', () => {
  assert.throws(() => renderOwnerCommandCenter({ verdict: 'READY', blockers: [{ code: 'payment-not-verified', workstream: 'diagnostic' }] }));
});

test('computeVerdict (the real verdict source this codebase actually uses) never produces the word "ready" while any count is non-zero', () => {
  const scenarios = [
    { pendingApprovals: 1, openBlockers: 0, pendingPayments: 0, activeMonitoring: 0 },
    { pendingApprovals: 0, openBlockers: 2, pendingPayments: 0, activeMonitoring: 0 },
    { pendingApprovals: 0, openBlockers: 0, pendingPayments: 3, activeMonitoring: 0 },
    { pendingApprovals: 0, openBlockers: 0, pendingPayments: 0, activeMonitoring: 1 }
  ];
  for (const scenario of scenarios) assert.doesNotMatch(computeVerdict(scenario), /\bready\b/i);
});
