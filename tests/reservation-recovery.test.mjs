import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { recoverStaleOutboundReservations, classifyStaleReservation, RECOVERY_POLICY_VERSION } from '../src/reservation-recovery.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');
const TIMEOUT_MS = 30 * 60 * 1000;

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-recovery-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

async function seedReservation(store, overrides = {}) {
  const reserved = await store.reserveOutboundSend({
    idempotencyKey: overrides.idempotencyKey || `initial:${overrides.prospectId || 'p1'}`,
    prospectId: overrides.prospectId || 'p1', campaignId: overrides.campaignId || 'camp', inbox: overrides.inbox || 'A',
    recipientEmail: overrides.recipientEmail || 'x@clinic.example', dailyCap: 999, hourlyCap: 999, minGapSeconds: 0,
    now: overrides.reservedAt || monday.toISOString()
  });
  if (overrides.status === 'dispatching') {
    // markOutboundReservation always stamps dispatchedAt to the real wall
    // clock; use a plain patch instead so tests can backdate it deterministically.
    await store.patch('outboundReservations', reserved.reservation.id, { status: 'dispatching', dispatchedAt: overrides.reservedAt || monday.toISOString(), ...(overrides.patch || {}) });
  } else if (overrides.status && overrides.status !== 'reserved') {
    await store.patch('outboundReservations', reserved.reservation.id, { status: 'dispatching', dispatchedAt: overrides.reservedAt || monday.toISOString() });
    await store.markOutboundReservation(reserved.reservation.id, overrides.status, overrides.patch || {});
  }
  return (await store.get('outboundReservations', reserved.reservation.id));
}

async function recoveryLogEntries(store) {
  return (await store.list('auditLog')).filter(e => e.type === 'outbound_reservation_recovery');
}

test('classifyStaleReservation maps the exact reservation state machine', () => {
  assert.equal(classifyStaleReservation('reserved').targetStatus, 'cancelled');
  assert.equal(classifyStaleReservation('reserved').bucket, 'recoverable');
  assert.equal(classifyStaleReservation('dispatching').targetStatus, 'uncertain');
  assert.equal(classifyStaleReservation('dispatching').bucket, 'quarantined');
  assert.equal(classifyStaleReservation('sent'), null);
  assert.equal(classifyStaleReservation('cancelled'), null);
  assert.equal(classifyStaleReservation('uncertain'), null);
});

test('a recent reservation is skipped, not touched', async () => {
  const store = await tempStore();
  const row = await seedReservation(store, { reservedAt: monday.toISOString() });
  const result = await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS });
  assert.equal(result.counts.skipped, 1);
  assert.equal(result.counts.recoverable, 0);
  assert.equal((await store.get('outboundReservations', row.id)).status, 'reserved');
});

test('a stale reserved-but-never-dispatched reservation is safely cancelled: no send occurred', async () => {
  const store = await tempStore();
  const staleAt = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  const row = await seedReservation(store, { reservedAt: staleAt });
  const result = await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS });
  assert.equal(result.counts.recoverable, 1);
  const fresh = await store.get('outboundReservations', row.id);
  assert.equal(fresh.status, 'cancelled');
  assert.equal(fresh.recoveryReason, 'stale-reserved-no-provider-attempt');
});

test('a stale reservation with a provider attempt in flight (dispatching) is quarantined as unknown, never resent', async () => {
  const store = await tempStore();
  const staleAt = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  const row = await seedReservation(store, { reservedAt: staleAt, status: 'dispatching' });
  const result = await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS });
  assert.equal(result.counts.quarantined, 1);
  const fresh = await store.get('outboundReservations', row.id);
  assert.equal(fresh.status, 'uncertain');
  assert.equal(fresh.recoveryReason, 'stale-dispatching-unknown-outcome');
});

test('a confirmed sent reservation is left completely untouched', async () => {
  const store = await tempStore();
  const staleAt = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  const row = await seedReservation(store, { reservedAt: staleAt, status: 'sent', patch: { sentAt: staleAt } });
  const result = await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS });
  assert.equal(result.counts.examined, 0, 'sent reservations are never even queried by the sweep');
  const fresh = await store.get('outboundReservations', row.id);
  assert.equal(fresh.status, 'sent');
});

test('an already-cancelled reservation is left untouched and never re-logged', async () => {
  const store = await tempStore();
  const staleAt = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  await seedReservation(store, { reservedAt: staleAt, status: 'cancelled' });
  const result = await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS });
  assert.equal(result.counts.examined, 0);
});

test('an already-quarantined (uncertain) reservation is left untouched on a second sweep', async () => {
  const store = await tempStore();
  const staleAt = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  await seedReservation(store, { reservedAt: staleAt, status: 'uncertain' });
  const result = await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS });
  assert.equal(result.counts.examined, 0);
});

test('duplicate recovery attempts are idempotent: a second sweep does not re-recover or re-log the same reservation', async () => {
  const store = await tempStore();
  const staleAt = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  await seedReservation(store, { reservedAt: staleAt });
  const first = await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS });
  const second = await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS });
  assert.equal(first.counts.recoverable, 1);
  assert.equal(second.counts.recoverable, 0);
  assert.equal(second.counts.examined, 0, 'the now-cancelled row no longer matches the reserved/dispatching query');
  const entries = await recoveryLogEntries(store);
  assert.equal(entries.length, 1, 'only one receipt should ever exist for this reservation');
});

test('replaying the exact same recovery request twice never produces a duplicate send event', async () => {
  const store = await tempStore();
  const staleAt = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  await seedReservation(store, { reservedAt: staleAt, status: 'dispatching' });
  await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS });
  await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS });
  assert.equal((await store.list('messages')).length, 0, 'the recovery sweep never sends anything under any circumstance');
});

test('a simulated concurrent sweep (re-verify-before-mutate) does not double-recover the same row', async () => {
  const store = await tempStore();
  const staleAt = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  const row = await seedReservation(store, { reservedAt: staleAt });
  // Simulate a second worker's sweep having already recovered the row by the
  // time this sweep's re-verify read runs, by racing the two sweeps directly.
  const [a, b] = await Promise.all([
    recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS }),
    recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS })
  ]);
  const totalRecovered = a.counts.recoverable + b.counts.recoverable;
  assert.equal(totalRecovered, 1, 'exactly one sweep should have won the recovery for this single row');
  const entries = await recoveryLogEntries(store);
  assert.equal(entries.length, 1);
  void row;
});

test('a crash between sweep invocations (partial progress) is safely resumable', async () => {
  const store = await tempStore();
  const staleAt = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  await seedReservation(store, { reservedAt: staleAt, prospectId: 'p1', idempotencyKey: 'initial:p1' });
  await seedReservation(store, { reservedAt: staleAt, prospectId: 'p2', idempotencyKey: 'initial:p2' });
  const partial = await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS, limit: 1 });
  assert.equal(partial.counts.recoverable, 1);
  const resumed = await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS, limit: 1 });
  assert.equal(resumed.counts.recoverable, 1);
  const all = await store.list('outboundReservations');
  assert.ok(all.every(item => item.status === 'cancelled'));
});

test('the sweep is bounded by the configured limit', async () => {
  const store = await tempStore();
  const staleAt = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  for (let i = 0; i < 5; i += 1) await seedReservation(store, { reservedAt: staleAt, prospectId: `p${i}`, idempotencyKey: `initial:p${i}` });
  const result = await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS, limit: 2 });
  assert.equal(result.counts.examined, 2);
  assert.equal(result.counts.recoverable, 2);
});

test('the sweep uses deterministic (oldest-first) ordering', async () => {
  const store = await tempStore();
  const older = new Date(monday.getTime() - TIMEOUT_MS - 5 * 60000).toISOString();
  const newer = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  await seedReservation(store, { reservedAt: newer, prospectId: 'newer', idempotencyKey: 'initial:newer', inbox: 'A' });
  await seedReservation(store, { reservedAt: older, prospectId: 'older', idempotencyKey: 'initial:older', inbox: 'B' });
  const result = await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS, limit: 1 });
  assert.equal(result.decisions[0].prospectId, 'older');
});

test('workspace-scoped recovery only touches the given campaign', async () => {
  const store = await tempStore();
  const staleAt = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  await seedReservation(store, { reservedAt: staleAt, campaignId: 'camp-a', prospectId: 'a1', idempotencyKey: 'initial:a1' });
  await seedReservation(store, { reservedAt: staleAt, campaignId: 'camp-b', prospectId: 'b1', idempotencyKey: 'initial:b1' });
  const result = await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS, workspaceId: 'camp-a' });
  assert.equal(result.counts.examined, 1);
  assert.equal(result.decisions[0].campaignId, 'camp-a');
  const bRow = (await store.list('outboundReservations', { filters: { campaignId: 'camp-b' } }))[0];
  assert.equal(bRow.status, 'reserved', 'the other workspace\'s reservation must be untouched');
});

test('cross-workspace access never leaks: a scoped sweep does not even examine another campaign\'s reservation', async () => {
  const store = await tempStore();
  const staleAt = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  await seedReservation(store, { reservedAt: staleAt, campaignId: 'other-campaign' });
  const result = await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS, workspaceId: 'camp' });
  assert.equal(result.counts.examined, 0);
});

test('malformed reservation data (missing timestamp) is counted as failed-safely, never crashes the sweep', async () => {
  const store = await tempStore();
  const reserved = await store.reserveOutboundSend({
    idempotencyKey: 'initial:malformed', prospectId: 'malformed', campaignId: 'camp', inbox: 'A',
    recipientEmail: 'm@clinic.example', dailyCap: 999, hourlyCap: 999, minGapSeconds: 0, now: monday.toISOString()
  });
  await store.markOutboundReservation(reserved.reservation.id, 'reserved', { reservedAt: 'not-a-real-date' });
  const result = await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS });
  assert.equal(result.counts.failedSafely, 1);
  assert.equal((await store.get('outboundReservations', reserved.reservation.id)).status, 'reserved', 'a row we could not safely classify must not be mutated');
});

test('malformed store input (no store) is denied cleanly without throwing', async () => {
  const result = await recoverStaleOutboundReservations({ date: monday });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'malformed-input-store');
});

test('dry-run mode classifies and reports without mutating any reservation', async () => {
  const store = await tempStore();
  const staleAt = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  const row = await seedReservation(store, { reservedAt: staleAt });
  const result = await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS, dryRun: true });
  assert.equal(result.counts.recoverable, 1);
  assert.equal(result.dryRun, true);
  const fresh = await store.get('outboundReservations', row.id);
  assert.equal(fresh.status, 'reserved', 'dry-run must never mutate the reservation');
  const entries = await recoveryLogEntries(store);
  assert.equal(entries.length, 1, 'a dry-run receipt is still an informational audit entry, not an external effect');
  assert.equal(entries[0].detail.dryRun, true);
});

test('a real sweep followed by a dry-run sweep never re-recovers the already-terminal row', async () => {
  const store = await tempStore();
  const staleAt = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  await seedReservation(store, { reservedAt: staleAt });
  await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS });
  const dryRun = await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS, dryRun: true });
  assert.equal(dryRun.counts.examined, 0);
});

test('every recovery receipt carries the policy version and a deterministic reference timestamp', async () => {
  const store = await tempStore();
  const staleAt = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  await seedReservation(store, { reservedAt: staleAt });
  const result = await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS });
  assert.equal(result.policyVersion, RECOVERY_POLICY_VERSION);
  assert.equal(result.decisions[0].policyVersion, RECOVERY_POLICY_VERSION);
  assert.equal(result.timestamp, monday.toISOString());
});

test('the exact same reference time produces byte-identical recovery decisions on identical fresh state', async () => {
  const storeA = await tempStore();
  const storeB = await tempStore();
  const staleAt = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  await seedReservation(storeA, { reservedAt: staleAt });
  await seedReservation(storeB, { reservedAt: staleAt });
  const resultA = await recoverStaleOutboundReservations({ store: storeA, date: monday, timeoutMs: TIMEOUT_MS });
  const resultB = await recoverStaleOutboundReservations({ store: storeB, date: monday, timeoutMs: TIMEOUT_MS });
  assert.deepEqual(resultA.counts, resultB.counts);
  assert.equal(resultA.decisions[0].reason, resultB.decisions[0].reason);
  assert.equal(resultA.decisions[0].ageMs, resultB.decisions[0].ageMs);
});

test('the recovery sweep never calls a provider or sends anything under any classification', async () => {
  const store = await tempStore();
  const staleAt = new Date(monday.getTime() - TIMEOUT_MS - 60000).toISOString();
  await seedReservation(store, { reservedAt: staleAt, prospectId: 'r1', idempotencyKey: 'initial:r1' });
  await seedReservation(store, { reservedAt: staleAt, prospectId: 'd1', idempotencyKey: 'initial:d1', status: 'dispatching' });
  await recoverStaleOutboundReservations({ store, date: monday, timeoutMs: TIMEOUT_MS });
  assert.equal((await store.list('messages')).length, 0);
  const source = await fs.readFile(new URL('../src/reservation-recovery.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /sendEmail|gmail\.mjs|fetch\(|http\.request|https\.request/);
});
