// The gate immediately before an irreversible message to a real person.
//
// Pipeline.maybeSend loads a campaign once at the top of a batch and threads
// the same object through admission, reservation, and a final recheck whose own
// comment says it exists because "state (suppression, evidence, authority,
// sender health, policy) may have changed since admission". It re-read
// suppression, sender health, settings and the account from the store -- and
// evaluated authority from that in-memory object.
//
// A probe revoked the campaign approval in the database and called the final
// recheck:
//
//   durable campaign approved:   false
//   in-flight campaign approved: true
//   final-recheck decision:      ALLOW_LOCAL_PREPARATION
//   denyReasonCodes:             []
//
// Revoking permission did not stop the send. Authority is now read from durable
// storage on every evaluation, and a disagreement between the caller's snapshot
// and the durable row is itself reported -- it means an authority change landed
// while a send was in flight, and the operator should see that the gate caught
// it rather than only that it denied.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { evaluateDeliverabilityGuard } from '../src/deliverability-guard.mjs';
import { Store } from '../src/store.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');

const baseCampaign = (overrides = {}) => ({
  id: 'camp', approved: true, autoSend: true, allowedCountries: ['GB'],
  minScore: 60, dailyCaps: { A: 10 }, maxFollowups: 0, ...overrides
});

const baseCfg = () => ({
  outbound: {
    enabled: false, dryRun: true, allowedCountries: ['United Kingdom'], hourlyCaps: { A: 3 }, minGapSeconds: 0,
    businessHourStart: 9, businessHourEnd: 17, minEvidenceConfidence: 0.75, maxEvidenceAgeDays: 45,
    hardBouncePauseThreshold: 2, complaintPauseThreshold: 1, failurePauseThreshold: 3
  },
  sender: { name: 'Mohamed', company: 'UberBond', address: 'Business address' },
  caps: { A: 10 }, google: {}, encryptionKey: ''
});

const baseProspect = () => ({
  id: 'pros', campaignId: 'camp', company: 'Clinic', website: 'https://clinic.example',
  domain: 'clinic.example', country: 'United Kingdom', inbox: 'A',
  draft: 'Evidence-backed message with reply no.', subject: 'Website observation',
  unsubscribeUrl: 'https://uberbond.example/unsubscribe?token=test',
  oneClickUnsubscribeUrl: 'https://uberbond.example/api/public/unsubscribe?token=test',
  contact: { email: 'info@clinic.example', source: 'website', verified: 'unverified' },
  score: { total: 80 }, completedAt: monday.toISOString(),
  issue: {
    title: 'Booking path issue', confidence: 0.9, safeForOutreach: true,
    evidenceUrl: 'https://clinic.example/book', evidenceExcerpt: 'Book button returned an error.'
  }
});

async function storeWith(durableCampaign) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberbond-stale-auth-'));
  const store = new Store(dir);
  await store.init();
  await store.add('accounts', { id: 'acct-A', slot: 'A', connected: true, email: 'outreach@uberbond.example', tokens: 'unused' });
  if (durableCampaign) await store.upsert('campaigns', durableCampaign);
  return store;
}

const guard = (store, campaign) => evaluateDeliverabilityGuard({
  store, prospect: baseProspect(), campaign, cfg: baseCfg(), date: monday,
  body: baseProspect().draft, subject: baseProspect().subject
});

test('an approval revoked in the database stops a send already in flight', async () => {
  const store = await storeWith(baseCampaign({ approved: false, autoSend: false }));
  const inFlight = baseCampaign(); // what the batch loop loaded before the revocation
  const result = await guard(store, inFlight);

  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.includes('authority-campaign-not-approved'));
  assert.equal(result.authorityUsed.campaignApproved, false,
    'the receipt must record the durable approval, not one that existed only in memory');
});

test('a snapshot that disagrees with the durable row is reported, not quietly overruled', async () => {
  const store = await storeWith(baseCampaign({ approved: false, autoSend: false }));
  const result = await guard(store, baseCampaign());
  assert.ok(result.denyReasonCodes.some(code => code.startsWith('authority-snapshot-stale:')),
    'an authority change landing mid-send is something the operator should see');
  assert.deepEqual(result.authorityUsed.authoritySnapshotDrift, ['approved', 'autoSend']);
});

test('a ceiling lowered in the database is not overridden by the loaded snapshot', async () => {
  // A cap is authority too: a stale one authorizes volume the owner took back.
  const store = await storeWith(baseCampaign({ dailyCaps: { A: 0 } }));
  const result = await guard(store, baseCampaign({ dailyCaps: { A: 10 } }));
  assert.equal(result.decision, 'DENY');
  assert.ok(result.authorityUsed.authoritySnapshotDrift.includes('dailyCaps'));
});

test('an authority that cannot be read is not an authority', async () => {
  const store = await storeWith(null); // no campaign row at all
  const result = await guard(store, baseCampaign());
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.includes('authority-campaign-not-found'));
  assert.equal(result.authorityUsed.authorityReadFrom, 'UNREADABLE');
});

test('a store that cannot answer fails closed rather than falling back to the caller', async () => {
  const store = await storeWith(baseCampaign());
  const blind = {
    list: (...args) => store.list(...args),
    findOne: (...args) => store.findOne(...args),
    getSettings: () => store.getSettings(),
    log: (...args) => store.log(...args)
    // no `get`
  };
  const result = await evaluateDeliverabilityGuard({
    store: blind, prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: monday,
    body: baseProspect().draft, subject: baseProspect().subject
  });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.includes('authority-not-readable-from-durable-store'),
    'falling back to the caller\'s object is the defect, not the fallback');
});

test('a store whose read throws fails closed too', async () => {
  const store = await storeWith(baseCampaign());
  const broken = {
    list: (...args) => store.list(...args),
    findOne: (...args) => store.findOne(...args),
    getSettings: () => store.getSettings(),
    log: (...args) => store.log(...args),
    get: async () => { throw new Error('connection reset'); }
  };
  const result = await evaluateDeliverabilityGuard({
    store: broken, prospect: baseProspect(), campaign: baseCampaign(), cfg: baseCfg(), date: monday,
    body: baseProspect().draft, subject: baseProspect().subject
  });
  assert.equal(result.decision, 'DENY');
  assert.ok(result.denyReasonCodes.includes('authority-not-readable-from-durable-store'));
});

test('a matching snapshot still allows: the gate is a gate, not a wall', async () => {
  const store = await storeWith(baseCampaign());
  const result = await guard(store, baseCampaign());
  assert.equal(result.decision, 'ALLOW_LOCAL_PREPARATION');
  assert.deepEqual(result.denyReasonCodes, []);
  assert.deepEqual(result.authorityUsed.authoritySnapshotDrift, []);
  assert.equal(result.authorityUsed.authorityReadFrom, 'DURABLE_STORE');
});
