// The live lead-generation snapshot, which the production-coverage ratchet found
// reachable from a production entry point with no gate running it.
//
// It is the read path between durable storage and a lead handoff, so the
// invariant that matters is that suppression records survive the trip. If
// loadDurableLeadSources ever stopped passing them through, suppressed people
// would enter a handoff and every other check in this repository would still be
// green: the workspace builder would receive an empty suppression list and
// report nothing wrong, because an empty list looks exactly like nobody having
// asked to be left alone.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLiveLeadGenerationSnapshot,
  buildLiveLeadHandoff,
  LIVE_LEAD_GENERATION_VERSION
} from '../src/leadgen-live-snapshot.mjs';

const NOW = new Date('2026-09-17T12:00:00.000Z');

const prospect = (id, email, overrides = {}) => ({
  id,
  company: `${id} Ltd`,
  email,
  domain: email.split('@')[1],
  source: 'local_prospect',
  completedAt: NOW.toISOString(),
  ...overrides
});

// Two prospects, one of whom is suppressed by address.
const PROSPECTS = [
  prospect('p1', 'ops@allowed.example'),
  prospect('p2', 'ops@suppressed.example')
];
const SUPPRESSIONS = [{ value: 'ops@suppressed.example' }];

function storeOf({ prospects = PROSPECTS, suppressions = SUPPRESSIONS } = {}) {
  return {
    list: async collection => {
      if (collection === 'prospects') return prospects;
      if (collection === 'suppressions') return suppressions;
      return [];
    }
  };
}

// The default query requires evidence, which these minimal fixtures do not
// carry. Loosening it here keeps the test about suppression rather than about
// evidence thresholds, which have their own tests.
const OPEN_QUERY = { requireEvidence: false, requireContact: false, minScore: 0, minEvidenceScore: 0 };

test('a suppressed prospect never reaches the handoff at all', async () => {
  // Stronger than being listed and marked blocked: searchLocalLeadCorpus drops a
  // suppressed candidate before it becomes a row, so there is nothing for a
  // later caller to misread as actionable.
  const handoff = await buildLiveLeadHandoff({ store: storeOf(), query: OPEN_QUERY, now: NOW });
  assert.deepEqual(handoff.rows.map(row => row.prospectId), ['p1']);
  assert.equal(handoff.counts.total, 1);
});

test('dropping the suppression record is what changes that answer', async () => {
  // Without this the test above could pass against a build that drops p2 for an
  // unrelated reason. Same prospect, same query, no suppression record.
  const withNone = await buildLiveLeadHandoff({
    store: storeOf({ suppressions: [] }), query: OPEN_QUERY, now: NOW
  });
  assert.deepEqual(withNone.rows.map(row => row.prospectId).sort(), ['p1', 'p2']);
  assert.equal(withNone.counts.total, 2, 'the suppression record is the only difference between these two runs');
});

test('a suppression supplied as a bare string still suppresses', async () => {
  // Suppression lists arrive both as store records and as bare address strings.
  // A silently empty suppression set is the worst failure mode this path has.
  const handoff = await buildLiveLeadHandoff({
    store: storeOf({ suppressions: ['ops@suppressed.example'] }), query: OPEN_QUERY, now: NOW
  });
  assert.deepEqual(handoff.rows.map(row => row.prospectId), ['p1']);
});

test('suppression by domain covers every address on it', async () => {
  const handoff = await buildLiveLeadHandoff({
    store: storeOf({ suppressions: [{ value: 'suppressed.example' }] }), query: OPEN_QUERY, now: NOW
  });
  assert.deepEqual(handoff.rows.map(row => row.prospectId), ['p1']);
});

test('the snapshot counts the suppression records it actually loaded', async () => {
  const snapshot = await buildLiveLeadGenerationSnapshot({ store: storeOf(), now: NOW });
  assert.equal(snapshot.runtime.suppressionRecords, 1);
  assert.equal(snapshot.runtime.prospectRecords, 2);
  assert.equal(snapshot.liveVersion, LIVE_LEAD_GENERATION_VERSION);
  assert.equal(snapshot.liveSource, 'durable-prospects');
});

test('the read path calls no provider and mutates nothing', async () => {
  const snapshot = await buildLiveLeadGenerationSnapshot({ store: storeOf(), now: NOW });
  assert.equal(snapshot.runtime.providerCalls, 0);
  assert.equal(snapshot.runtime.externalEffects, 0);
  assert.equal(snapshot.handoff.mutatesRecords, false);
  assert.equal(snapshot.handoff.requiresRecipientEvidence, true);
  assert.equal(snapshot.handoff.requiresSenderEvidence, true);

  const handoff = await buildLiveLeadHandoff({ store: storeOf(), query: OPEN_QUERY, now: NOW });
  assert.equal(handoff.providerCalls, 0);
  assert.equal(handoff.externalEffects, 0);
  assert.equal(handoff.mutatesRecords, false);
  assert.equal(handoff.requiresCertification, true);
});

test('a missing or unusable store is refused rather than read as empty', async () => {
  // An empty result and an absent store are different facts. Treating the second
  // as the first would report "no suppressions" about a store nobody opened.
  for (const store of [undefined, null, {}, { list: 'not-a-function' }]) {
    await assert.rejects(
      () => buildLiveLeadGenerationSnapshot({ store, now: NOW }),
      /durable store is required/,
      `store ${JSON.stringify(store)} must be refused`
    );
    await assert.rejects(() => buildLiveLeadHandoff({ store, now: NOW }), /durable store is required/);
  }
});

test('a store returning a non-array is read as empty rather than crashing', async () => {
  // The store is external to this module. A malformed answer should degrade to
  // zero records, not throw halfway through building a handoff.
  const store = { list: async () => null };
  const snapshot = await buildLiveLeadGenerationSnapshot({ store, now: NOW });
  assert.equal(snapshot.runtime.prospectRecords, 0);
  assert.equal(snapshot.runtime.suppressionRecords, 0);
});

test('a campaign is carried into the handoff rows', async () => {
  const handoff = await buildLiveLeadHandoff({
    store: storeOf(), campaign: { id: 'c1', name: 'First' }, query: OPEN_QUERY, now: NOW
  });
  assert.equal(handoff.campaign.id, 'c1');
  assert.ok(handoff.rows.length > 0, 'a campaign test needs at least one row to carry it');
  for (const row of handoff.rows) assert.equal(row.campaignId, 'c1');
});
