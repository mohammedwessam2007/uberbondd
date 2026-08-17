import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { buildOutboundOperatorSummary } from '../src/outbound-operator-summary.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');
const TIMEOUT_MS = 30 * 60 * 1000;

function cfg(overrides = {}) {
  return {
    outbound: { enabled: false, dryRun: true, reservationRecoveryTimeoutMs: TIMEOUT_MS, reservationRecoverySweepLimit: 200, ...overrides.outbound }
  };
}

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-opsummary-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

test('malformed store input is reported cleanly, never throws', async () => {
  const result = await buildOutboundOperatorSummary({ date: monday });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'malformed-input-store');
});

test('an empty store reports a healthy, no-action-needed summary', async () => {
  const store = await tempStore();
  const result = await buildOutboundOperatorSummary({ store, cfg: cfg({ outbound: { enabled: true, dryRun: false } }), date: monday });
  assert.equal(result.ok, true);
  assert.equal(result.reservations.reserved, 0);
  assert.equal(result.killSwitch.outboundStructurallyEnabled, true);
  assert.match(result.nextSafeAction, /No blocking condition detected/);
});

test('the kill switch state is reported accurately when structurally disabled', async () => {
  const store = await tempStore();
  const result = await buildOutboundOperatorSummary({ store, cfg: cfg(), date: monday });
  assert.equal(result.killSwitch.outboundStructurallyEnabled, false);
  assert.match(result.nextSafeAction, /structurally disabled/);
});

test('a global outbound pause is surfaced and takes priority in the next safe action', async () => {
  const store = await tempStore();
  await store.setOutboundPaused(true, 'owner requested pause');
  const result = await buildOutboundOperatorSummary({ store, cfg: cfg({ outbound: { enabled: true, dryRun: false } }), date: monday });
  assert.equal(result.killSwitch.globalOutboundPaused, true);
  assert.match(result.nextSafeAction, /globally paused/);
});

test('stale reservations are previewed without being mutated', async () => {
  const store = await tempStore();
  const staleAt = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  await store.reserveOutboundSend({ idempotencyKey: 'initial:x', prospectId: 'x', campaignId: 'camp', inbox: 'A', recipientEmail: 'x@clinic.example', dailyCap: 999, hourlyCap: 999, minGapSeconds: 0, now: staleAt });
  const result = await buildOutboundOperatorSummary({ store, cfg: cfg(), date: monday });
  assert.equal(result.staleRecoveryPreview.wouldRecover, 1);
  const row = (await store.list('outboundReservations'))[0];
  assert.equal(row.status, 'reserved', 'the summary must never mutate reservations, only preview');
  assert.match(result.nextSafeAction, /reservation recovery sweep/);
});

test('quarantined (uncertain) reservations are counted and drive the next safe action', async () => {
  const store = await tempStore();
  const reserved = await store.reserveOutboundSend({ idempotencyKey: 'initial:u', prospectId: 'u', campaignId: 'camp', inbox: 'A', recipientEmail: 'u@clinic.example', dailyCap: 999, hourlyCap: 999, minGapSeconds: 0, now: monday.toISOString() });
  await store.markOutboundReservation(reserved.reservation.id, 'uncertain', {});
  const result = await buildOutboundOperatorSummary({ store, cfg: cfg(), date: monday });
  assert.equal(result.reservations.quarantined, 1);
  assert.equal(result.reservations.unknownOutcome, 1);
  assert.match(result.nextSafeAction, /quarantined reservation/);
});

test('confirmed sends and cancellations are counted separately and correctly', async () => {
  const store = await tempStore();
  const sent = await store.reserveOutboundSend({ idempotencyKey: 'initial:s', prospectId: 's', campaignId: 'camp', inbox: 'A', recipientEmail: 's@clinic.example', dailyCap: 999, hourlyCap: 999, minGapSeconds: 0, now: monday.toISOString() });
  await store.markOutboundReservation(sent.reservation.id, 'sent', { sentAt: monday.toISOString() });
  const cancelled = await store.reserveOutboundSend({ idempotencyKey: 'initial:c', prospectId: 'c', campaignId: 'camp', inbox: 'A', recipientEmail: 'c@clinic.example', dailyCap: 999, hourlyCap: 999, minGapSeconds: 0, now: monday.toISOString() });
  await store.markOutboundReservation(cancelled.reservation.id, 'cancelled', {});
  const result = await buildOutboundOperatorSummary({ store, cfg: cfg(), date: monday });
  assert.equal(result.reservations.sent, 1);
  assert.equal(result.reservations.cancelled, 1);
});

test('paused sender health is surfaced with a reason', async () => {
  const store = await tempStore();
  await store.setSenderPaused('A', true, 'hard-bounce-threshold');
  const result = await buildOutboundOperatorSummary({ store, cfg: cfg(), date: monday });
  assert.equal(result.providerHealth.pausedSenderCount, 1);
  assert.equal(result.providerHealth.pausedSenders[0].inbox, 'A');
  assert.equal(result.providerHealth.pausedSenders[0].reason, 'hard-bounce-threshold');
  assert.match(result.nextSafeAction, /health-paused/);
});

test('campaigns awaiting owner approval (approved but autoSend disabled) are counted as review-required', async () => {
  const store = await tempStore();
  await store.add('campaigns', { id: 'camp', approved: true, autoSend: false, allowedCountries: [], minScore: 0, dailyCaps: {}, maxFollowups: 0, createdAt: monday.toISOString() });
  const result = await buildOutboundOperatorSummary({ store, cfg: cfg(), date: monday });
  assert.equal(result.reviewRequired.campaignsAwaitingApproval, 1);
});

test('recent DENY guard decisions are counted as blocked actions, bounded by the audit limit', async () => {
  const store = await tempStore();
  for (let i = 0; i < 3; i += 1) {
    await store.log('deliverability_guard_decision', { phase: 'admission', decision: 'DENY', receipt: { denyReasonCodes: ['suppressed:manual'] } });
  }
  await store.log('deliverability_guard_decision', { phase: 'admission', decision: 'ALLOW_LOCAL_PREPARATION', receipt: { denyReasonCodes: [] } });
  const result = await buildOutboundOperatorSummary({ store, cfg: cfg(), date: monday, auditLimit: 500 });
  assert.equal(result.blockedActions, 3);
});

test('duplicate/replay attempts are detected from persisted guard receipts', async () => {
  const store = await tempStore();
  await store.log('deliverability_guard_decision', { phase: 'admission', decision: 'DENY', receipt: { denyReasonCodes: ['replay-idempotency-key:sent'] } });
  const result = await buildOutboundOperatorSummary({ store, cfg: cfg(), date: monday });
  assert.equal(result.duplicateReplayAttempts, 1);
});

test('transactional report-email audit entries are summarized separately from cold-outreach guard decisions', async () => {
  const store = await tempStore();
  await store.log('report_email_audit', { effectClass: 'transactional-report-email', outcome: 'blocked', reason: 'kill-switch-disabled' });
  await store.log('report_email_audit', { effectClass: 'transactional-report-email', outcome: 'uncertain', reason: 'provider-result-uncertain' });
  const result = await buildOutboundOperatorSummary({ store, cfg: cfg(), date: monday });
  assert.equal(result.transactionalReportEmail.blockedRecently, 1);
  assert.equal(result.transactionalReportEmail.unresolvedOutcomesRecently, 1);
  assert.equal(result.blockedActions, 0, 'report-email audit entries must never be counted as cold-outreach guard decisions');
});

test('the summary never sends anything or mutates any collection it reads from', async () => {
  const store = await tempStore();
  const staleAt = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  await store.reserveOutboundSend({ idempotencyKey: 'initial:x', prospectId: 'x', campaignId: 'camp', inbox: 'A', recipientEmail: 'x@clinic.example', dailyCap: 999, hourlyCap: 999, minGapSeconds: 0, now: staleAt });
  await buildOutboundOperatorSummary({ store, cfg: cfg(), date: monday });
  assert.equal((await store.list('messages')).length, 0);
  const source = await fs.readFile(new URL('../src/outbound-operator-summary.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /sendEmail|gmail\.mjs|fetch\(|http\.request|https\.request/);
});

test('the exact same reference time produces a byte-identical summary on identical fresh state', async () => {
  const storeA = await tempStore();
  const storeB = await tempStore();
  const resultA = await buildOutboundOperatorSummary({ store: storeA, cfg: cfg(), date: monday });
  const resultB = await buildOutboundOperatorSummary({ store: storeB, cfg: cfg(), date: monday });
  assert.deepEqual(resultA.reservations, resultB.reservations);
  assert.equal(resultA.timestamp, resultB.timestamp);
  assert.equal(resultA.nextSafeAction, resultB.nextSafeAction);
});
