import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../revenue-os/src/store.mjs';
import {
  screenSignalForIngest, prepareBuyerIntentBatch, ingestBuyerIntentSignals,
  revalidateSignal, revalidateAndExpireOpportunities,
  isRouteSuppressed, suppressRoute, selectWorkableOpportunities,
  estimateExpectedContribution, rankByExpectedContribution, BuyerIntentError
} from '../../revenue-os/src/buyer-intent.mjs';

async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ros-buyer-intent-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

// Every domain below is a synthetic .invalid fixture -- none of it represents a real prospect, per
// the mission's own instruction not to hard-code any specific candidate.
function goodSignal(overrides = {}) {
  return {
    organizationDomain: 'buyer-signal-one.invalid', channel: 'published_contact_form',
    purposeLabel: 'business_inquiry', sourceUrl: 'https://buyer-signal-one.invalid/contact',
    capturedAt: new Date().toISOString(), confidence: 0.8, verified: 'true', ...overrides
  };
}

// --- ingest screening ---

test('screenSignalForIngest accepts a lawful business-purpose signal on an allowed medium', () => {
  const result = screenSignalForIngest(goodSignal());
  assert.equal(result.ok, true);
  assert.equal(result.classification, 'business_inquiry');
});

test('hostile: an allowed medium pointed at a denied purpose is still rejected (two independent gates)', () => {
  const result = screenSignalForIngest(goodSignal({ purposeLabel: 'careers' }));
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some(r => r.includes('disallowed-purpose')));
});

test('hostile: a lawful purpose on a disallowed medium is still rejected', () => {
  const result = screenSignalForIngest(goodSignal({ channel: 'carrier_pigeon' }));
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('unsupported-channel-medium'));
});

test('hostile: a missing purposeLabel fails closed rather than being treated as not-applicable', () => {
  const result = screenSignalForIngest(goodSignal({ purposeLabel: undefined }));
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some(r => r.includes('malformed-purpose-label')));
});

test('hostile: future-dated evidence is blocked at the screening layer, before importer.mjs ever sees it', () => {
  const farFuture = new Date(Date.now() + 30 * 86400000).toISOString();
  const result = screenSignalForIngest(goodSignal({ capturedAt: farFuture }));
  assert.equal(result.ok, false);
  assert.ok(result.reasons.some(r => r.includes('future-dated-evidence')));
});

test('prepareBuyerIntentBatch reports purpose-screening blocks and importer quarantines in one list', () => {
  const rows = [goodSignal(), goodSignal({ organizationDomain: 'buyer-signal-two.invalid', purposeLabel: 'support' }), goodSignal({ organizationDomain: 'not a domain' })];
  const { accepted, quarantined } = prepareBuyerIntentBatch(rows, { packType: 'buyer_intent' });
  assert.equal(accepted.length, 1);
  assert.equal(quarantined.length, 2);
});

test('ingestBuyerIntentSignals persists screened, accepted signals as opportunities', async () => {
  const store = await harness();
  const rows = [goodSignal(), goodSignal({ organizationDomain: 'buyer-signal-two.invalid', purposeLabel: 'emergency' })];
  const result = await ingestBuyerIntentSignals(store, rows, { packType: 'buyer_intent' });
  assert.equal(result.imported, 1);
  assert.equal(result.quarantined, 1);
  const opportunities = await store.list('opportunities');
  assert.equal(opportunities.length, 1);
  assert.equal(opportunities[0].organizationDomain, 'buyer-signal-one.invalid');
});

// --- revalidate / expire ---

test('revalidateSignal passes for a fresh, structurally valid signal', () => {
  const result = revalidateSignal({ organizationDomain: 'buyer-signal-one.invalid', channel: 'published_email', capturedAt: new Date().toISOString() });
  assert.equal(result.valid, true);
});

test('revalidateSignal rejects a stale timestamp with a specific reason', () => {
  const result = revalidateSignal({ organizationDomain: 'buyer-signal-one.invalid', channel: 'published_email', capturedAt: '2000-01-01T00:00:00.000Z' });
  assert.equal(result.valid, false);
  assert.ok(result.reasons.includes('stale-evidence'));
});

test('revalidateSignal reports every distinct problem at once, not just the first', () => {
  const result = revalidateSignal({ organizationDomain: 'not a domain', channel: 'carrier_pigeon', capturedAt: 'not-a-date' });
  assert.equal(result.valid, false);
  assert.ok(result.reasons.includes('invalid-or-missing-domain'));
  assert.ok(result.reasons.includes('unsupported-channel-medium'));
  assert.ok(result.reasons.includes('missing-or-invalid-timestamp'));
});

test('revalidateAndExpireOpportunities expires an opportunity whose only evidence has gone stale', async () => {
  const store = await harness();
  const { importedIds } = await (async () => {
    const rows = [goodSignal()];
    return ingestBuyerIntentSignals(store, rows, { packType: 'buyer_intent' });
  })();
  const [oppId] = importedIds;
  const opp = await store.get('opportunities', oppId);
  assert.equal(opp.status, 'candidate');

  // Simulate the evidence aging out: patch its capturedAt into the past directly (this test drives
  // time forward on the evidence record itself, it does not fabricate a second real import).
  const evidence = (await store.list('evidenceItems', { filters: { opportunityId: oppId } }))[0];
  await store.patch('evidenceItems', evidence.id, { capturedAt: '2000-01-01T00:00:00.000Z' });

  const result = await revalidateAndExpireOpportunities(store);
  assert.equal(result.expired, 1);
  assert.equal(result.revalidated, 0);
  const after = await store.get('opportunities', oppId);
  assert.equal(after.status, 'expired');
  assert.ok(after.data.expiryReasons.includes('stale-evidence'));
});

test('revalidateAndExpireOpportunities revalidates a still-fresh opportunity without touching its status', async () => {
  const store = await harness();
  const { importedIds } = await ingestBuyerIntentSignals(store, [goodSignal()], { packType: 'buyer_intent' });
  const result = await revalidateAndExpireOpportunities(store);
  assert.equal(result.revalidated, 1);
  assert.equal(result.expired, 0);
  const opp = await store.get('opportunities', importedIds[0]);
  assert.equal(opp.status, 'candidate');
});

test('revalidateAndExpireOpportunities skips opportunities already in a terminal status', async () => {
  const store = await harness();
  const { importedIds } = await ingestBuyerIntentSignals(store, [goodSignal()], { packType: 'buyer_intent' });
  await store.patch('opportunities', importedIds[0], { status: 'converted' });
  const result = await revalidateAndExpireOpportunities(store);
  assert.equal(result.expired, 0);
  assert.equal(result.revalidated, 0);
});

// --- suppress prohibited routes ---

test('suppressRoute adds a route once and isRouteSuppressed reflects it', async () => {
  const store = await harness();
  assert.equal(await isRouteSuppressed(store, 'buyer-signal-one.invalid'), false);
  const first = await suppressRoute(store, 'buyer-signal-one.invalid', 'prohibited-route');
  assert.equal(first.added, true);
  assert.equal(await isRouteSuppressed(store, 'buyer-signal-one.invalid'), true);
  const second = await suppressRoute(store, 'buyer-signal-one.invalid', 'prohibited-route');
  assert.equal(second.added, false, 'suppressing an already-suppressed domain is a no-op, not a duplicate entry');
});

test('hostile: suppressRoute throws rather than silently accepting a blank domain', async () => {
  const store = await harness();
  await assert.rejects(() => suppressRoute(store, ''), BuyerIntentError);
});

test('selectWorkableOpportunities excludes suppressed domains even when the opportunity itself looks fine', async () => {
  const store = await harness();
  await ingestBuyerIntentSignals(store, [goodSignal()], { packType: 'buyer_intent' });
  await suppressRoute(store, 'buyer-signal-one.invalid', 'complaint');
  const workable = await selectWorkableOpportunities(store);
  assert.equal(workable.length, 0);
});

test('selectWorkableOpportunities excludes terminal-status opportunities and includes fresh candidates', async () => {
  const store = await harness();
  const { importedIds } = await ingestBuyerIntentSignals(store, [goodSignal(), goodSignal({ organizationDomain: 'buyer-signal-two.invalid' })], { packType: 'buyer_intent' });
  await store.patch('opportunities', importedIds[0], { status: 'expired' });
  const workable = await selectWorkableOpportunities(store);
  assert.equal(workable.length, 1);
  assert.equal(workable[0].organizationDomain, 'buyer-signal-two.invalid');
});

// --- rank by expected contribution margin and owner minutes ---

test('estimateExpectedContribution computes margin, expected value, and per-owner-minute value from a fixed-price offer', () => {
  const value = estimateExpectedContribution({ offerKey: 'FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC', paymentProbability: 0.2, fulfillmentCostCents: 5000, ownerMinutes: 20 });
  assert.equal(value.priceCents, 25000);
  assert.equal(value.contributionMarginCents, 20000);
  assert.equal(value.contributionMarginRate, 0.8);
  assert.equal(value.expectedContributionCents, 4000);
  assert.equal(value.expectedContributionCentsPerOwnerMinute, 200);
});

test('estimateExpectedContribution derives a representative price from a ranged offer (monitoring)', () => {
  const value = estimateExpectedContribution({ offerKey: 'AGENCY_MONITORING', paymentProbability: 1, fulfillmentCostCents: 0, ownerMinutes: 10 });
  assert.equal(value.priceCents, Math.round((19900 + 49900) / 2));
});

test('hostile: an unknown offer key throws rather than silently ranking as zero-value', () => {
  assert.throws(() => estimateExpectedContribution({ offerKey: 'NOT_A_REAL_OFFER', paymentProbability: 1, ownerMinutes: 1 }), BuyerIntentError);
});

test('hostile: ownerMinutes of zero or negative does not divide by zero or invert the ranking', () => {
  const value = estimateExpectedContribution({ offerKey: 'FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC', paymentProbability: 1, ownerMinutes: 0 });
  assert.equal(value.ownerMinutes, 1);
  assert.ok(Number.isFinite(value.expectedContributionCentsPerOwnerMinute));
});

test('rankByExpectedContribution orders a cheap-to-fulfill high-probability opportunity above an expensive slow one', () => {
  const cheapFast = { opportunity: { id: 'opp_a' }, offerKey: 'FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC', paymentProbability: 0.5, fulfillmentCostCents: 2000, ownerMinutes: 10 };
  const expensiveSlow = { opportunity: { id: 'opp_b' }, offerKey: 'AGENCY_IMPLEMENTATION_PACKAGE', paymentProbability: 0.05, fulfillmentCostCents: 80000, ownerMinutes: 180 };
  const ranked = rankByExpectedContribution([expensiveSlow, cheapFast]);
  assert.equal(ranked[0].opportunity.id, 'opp_a');
});

test('rankByExpectedContribution on an empty list returns an empty list, not an error', () => {
  assert.deepEqual(rankByExpectedContribution([]), []);
});
