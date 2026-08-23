import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { evaluateDeliverabilityGuard } from '../src/deliverability-guard.mjs';
import { outboundVolumeWindow, countActiveOutboundReservations } from '../src/send-safety.mjs';

// The guard reads authority from durable storage, exactly as production does:
// the pipeline loads the campaign with store.get before it ever gets here. A
// fixture that hands over a campaign existing only in memory is modelling a
// state the system cannot be in, and it is what let a revoked approval pass the
// final recheck unnoticed.
async function guardWith(store, args = {}) {
  if (args.campaign) await store.upsert('campaigns', args.campaign);
  return evaluateDeliverabilityGuard({ store, ...args });
}


// Proves the Deliverability Guard's read-only precheck and the store's
// authoritative, race-safe reservation transaction agree on volume/quota
// decisions because they now share one canonical helper
// (countActiveOutboundReservations) instead of two independently
// maintained implementations that could silently drift apart.

const monday = new Date('2026-07-13T10:00:00.000Z');

function baseCampaign(overrides = {}) {
  return { id: 'camp', approved: true, autoSend: true, allowedCountries: ['GB'], minScore: 60, dailyCaps: { A: 2 }, maxFollowups: 0, ...overrides };
}
function baseCfg(overrides = {}) {
  return {
    outbound: {
      enabled: true, dryRun: false, allowedCountries: ['United Kingdom'], hourlyCaps: { A: 5 }, minGapSeconds: 0,
      businessHourStart: 9, businessHourEnd: 17, minEvidenceConfidence: .75, maxEvidenceAgeDays: 45,
      hardBouncePauseThreshold: 2, complaintPauseThreshold: 1, failurePauseThreshold: 3,
      ...overrides.outbound
    },
    sender: { name: 'Mohamed', company: 'UberBond', address: 'Business address' }, caps: { A: 2 }, google: {}, encryptionKey: ''
  };
}
function baseProspect(overrides = {}) {
  return {
    id: 'pros', campaignId: 'camp', company: 'Clinic', website: 'https://clinic.example', domain: 'clinic.example', country: 'United Kingdom',
    inbox: 'A', draft: 'Evidence-backed message with reply no.', subject: 'Website observation',
    unsubscribeUrl: 'https://uberbond.example/unsubscribe?token=test', oneClickUnsubscribeUrl: 'https://uberbond.example/api/public/unsubscribe?token=test',
    contact: { email: 'info@clinic.example', source: 'website', verified: 'unverified' },
    score: { total: 80 }, completedAt: monday.toISOString(),
    issue: { title: 'Booking path issue', confidence: .9, safeForOutreach: true, evidenceUrl: 'https://clinic.example/book', evidenceExcerpt: 'Book button returned an error.' },
    ...overrides
  };
}

async function tempStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-volume-'));
  const store = new Store(dir);
  await store.init();
  return store;
}
async function connectedStore(inbox = 'A') {
  const store = await tempStore();
  await store.add('accounts', { id: `acct-${inbox}`, slot: inbox, connected: true, email: `outreach-${inbox}@uberbond.example`, tokens: 'unused' });
  // The pipeline loads the campaign from the store before it reaches
  // maybeSend, and the guard now reads authority back from there. Seeding it
  // is what makes the fixture match production.
  await store.upsert('campaigns', baseCampaign());
  return store;
}
async function seedReservations(store, count, overrides = {}) {
  for (let i = 0; i < count; i += 1) {
    await store.reserveOutboundSend({
      idempotencyKey: `initial:seed-${i}-${overrides.inbox || 'A'}-${overrides.campaignId || 'x'}-${overrides.reservedAt || 'now'}`,
      prospectId: `seed-${i}`, campaignId: overrides.campaignId || 'camp', inbox: overrides.inbox || 'A',
      recipientEmail: `seed${i}@clinic.example`, dailyCap: 999, hourlyCap: 999, minGapSeconds: 0,
      now: overrides.reservedAt || monday.toISOString()
    });
  }
}

test('outboundVolumeWindow buckets are UTC-derived and timezone-independent', () => {
  const window = outboundVolumeWindow(new Date('2026-07-13T23:30:00Z').toISOString());
  assert.deepEqual(window, { day: '2026-07-13', hour: '2026-07-13T23' });
});

test('guard and store agree exactly at the daily cap boundary', async () => {
  const store = await connectedStore();
  await seedReservations(store, 2); // dailyCap in fixtures is 2
  const campaign = baseCampaign();
  const cfg = baseCfg();

  const guardResult = await guardWith(store, {
    prospect: baseProspect(), campaign, cfg, date: monday });
  assert.equal(guardResult.decision, 'DENY');
  assert.ok(guardResult.denyReasonCodes.includes('daily-volume-ceiling-exceeded'));

  const storeResult = await store.reserveOutboundSend({
    idempotencyKey: 'initial:pros', prospectId: 'pros', campaignId: 'camp', inbox: 'A',
    recipientEmail: 'info@clinic.example', dailyCap: 2, hourlyCap: 5, minGapSeconds: 0, now: monday.toISOString()
  });
  assert.equal(storeResult.ok, false);
  assert.equal(storeResult.reason, 'daily-cap');
});

test('guard and store agree one under the daily cap boundary', async () => {
  const store = await connectedStore();
  await seedReservations(store, 1); // one below the cap of 2
  const campaign = baseCampaign();
  const cfg = baseCfg();

  const guardResult = await guardWith(store, {
    prospect: baseProspect(), campaign, cfg, date: monday });
  assert.equal(guardResult.denyReasonCodes.includes('daily-volume-ceiling-exceeded'), false);

  const storeResult = await store.reserveOutboundSend({
    idempotencyKey: 'initial:pros', prospectId: 'pros', campaignId: 'camp', inbox: 'A',
    recipientEmail: 'info@clinic.example', dailyCap: 2, hourlyCap: 5, minGapSeconds: 0, now: monday.toISOString()
  });
  assert.equal(storeResult.ok, true);
});

test('caps are scoped by inbox, not by campaign: a different campaign on the same inbox still counts', async () => {
  const store = await connectedStore();
  await seedReservations(store, 2, { campaignId: 'a-different-campaign' });
  const guardResult = await guardWith(store, {
    prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.ok(guardResult.denyReasonCodes.includes('daily-volume-ceiling-exceeded'), 'the shared inbox cap must still apply across campaigns');
});

test('a different inbox never counts toward this inbox\'s cap', async () => {
  const store = await connectedStore('A');
  await store.add('accounts', { id: 'acct-B', slot: 'B', connected: true, email: 'b@uberbond.example', tokens: 'unused' });
  await seedReservations(store, 2, { inbox: 'B' });
  const guardResult = await guardWith(store, {
    prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(guardResult.denyReasonCodes.includes('daily-volume-ceiling-exceeded'), false);
});

test('a reservation from a different day never counts toward today\'s cap', async () => {
  const store = await connectedStore();
  const yesterday = new Date(monday.getTime() - 86400000).toISOString();
  await seedReservations(store, 5, { reservedAt: yesterday });
  const guardResult = await guardWith(store, {
    prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: monday });
  assert.equal(guardResult.denyReasonCodes.includes('daily-volume-ceiling-exceeded'), false);
});

test('cancelled reservations do not count (known outcome: no send occurred)', async () => {
  const store = await connectedStore();
  const reserved = await store.reserveOutboundSend({
    idempotencyKey: 'initial:cancelled-1', prospectId: 'cx', campaignId: 'camp', inbox: 'A',
    recipientEmail: 'c@clinic.example', dailyCap: 999, hourlyCap: 999, minGapSeconds: 0, now: monday.toISOString()
  });
  await store.markOutboundReservation(reserved.reservation.id, 'cancelled', { cancelReason: 'test' });
  const guardResult = await guardWith(store, {
    prospect: baseProspect(), campaign: baseCampaign({ dailyCaps: { A: 1 } }), cfg: (() => { const c = baseCfg(); c.caps = { A: 1 }; return c; })(), date: monday });
  assert.equal(guardResult.denyReasonCodes.includes('daily-volume-ceiling-exceeded'), false);
});

test('uncertain reservations still count (unknown outcome: capacity stays reserved)', async () => {
  const store = await connectedStore();
  const reserved = await store.reserveOutboundSend({
    idempotencyKey: 'initial:uncertain-1', prospectId: 'ux', campaignId: 'camp', inbox: 'A',
    recipientEmail: 'u@clinic.example', dailyCap: 999, hourlyCap: 999, minGapSeconds: 0, now: monday.toISOString()
  });
  await store.markOutboundReservation(reserved.reservation.id, 'uncertain', { error: 'network timeout' });
  const campaign = baseCampaign({ dailyCaps: { A: 1 } });
  const cfg = baseCfg(); cfg.caps = { A: 1 };
  const guardResult = await guardWith(store, {
    prospect: baseProspect(), campaign, cfg, date: monday });
  assert.ok(guardResult.denyReasonCodes.includes('daily-volume-ceiling-exceeded'), 'an unresolved provider outcome must keep holding its capacity slot');
});

test('concurrent reservation attempts against a cap of 1 allow exactly one to succeed', async () => {
  const store = await connectedStore();
  const attempts = await Promise.all(Array.from({ length: 8 }, (_, i) => store.reserveOutboundSend({
    idempotencyKey: `initial:concurrent-${i}`, prospectId: `p${i}`, campaignId: 'camp', inbox: 'A',
    recipientEmail: `p${i}@clinic.example`, dailyCap: 1, hourlyCap: 1, minGapSeconds: 0, now: monday.toISOString()
  })));
  assert.equal(attempts.filter(item => item.ok).length, 1);
});

test('a replayed idempotency key never creates a second reservation', async () => {
  const store = await connectedStore();
  const first = await store.reserveOutboundSend({
    idempotencyKey: 'initial:replay', prospectId: 'r1', campaignId: 'camp', inbox: 'A',
    recipientEmail: 'r@clinic.example', dailyCap: 10, hourlyCap: 10, minGapSeconds: 0, now: monday.toISOString()
  });
  const second = await store.reserveOutboundSend({
    idempotencyKey: 'initial:replay', prospectId: 'r1', campaignId: 'camp', inbox: 'A',
    recipientEmail: 'r@clinic.example', dailyCap: 10, hourlyCap: 10, minGapSeconds: 0, now: monday.toISOString()
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal((await store.list('outboundReservations')).length, 1);
});

test('a malformed reservedAt timestamp is safely excluded from counting rather than crashing', () => {
  const reservations = [
    { inbox: 'A', status: 'reserved', reservedAt: 'not-a-real-timestamp' },
    { inbox: 'A', status: 'reserved', reservedAt: monday.toISOString() }
  ];
  const { day, hour } = outboundVolumeWindow(monday.toISOString());
  const result = countActiveOutboundReservations(reservations, { inbox: 'A', day, hour });
  assert.equal(result.daily, 1, 'only the valid timestamp should count');
});

test('the guard computes day/hour windows from the injected reference date, never real wall-clock time', async () => {
  const store = await connectedStore();
  const longAgo = new Date('2020-01-01T00:00:00.000Z');
  const guardResult = await guardWith(store, {
    prospect: baseProspect({ completedAt: longAgo.toISOString() }), campaign: baseCampaign(), cfg: baseCfg(), date: longAgo });
  // Evidence age is measured relative to the injected date, so evidence collected
  // "now" (relative to that same injected date) must not be flagged as expired.
  assert.equal(guardResult.denyReasonCodes.includes('evidence-expired'), false);
  assert.equal(guardResult.timestamp, longAgo.toISOString());
});
