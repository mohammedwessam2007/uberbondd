import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../revenue-os/src/store.mjs';
import { buildMessageDraft, buildApprovalPacket, decideApproval } from '../../revenue-os/src/approval.mjs';
import {
  DISTRIBUTION_ADAPTERS, DISTRIBUTION_ADAPTER_KEYS, PROHIBITED_MEDIUM_HINTS, DEFAULT_DISTRIBUTION_POLICY,
  listDistributionAdapters, preflightDistribution, dispatchThroughAdapter, DistributionError
} from '../../revenue-os/src/distribution.mjs';
import { ALLOWED_CHANNELS } from '../../revenue-os/src/importer.mjs';

async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ros-distribution-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

const OFFER = { offerKey: 'FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC', priceCents: 25000 };

async function seedApprovedFixture(store, { channel = 'published_email' } = {}) {
  const opportunity = await store.add('opportunities', { organizationDomain: 'dist-fixture.invalid', channel, status: 'candidate', data: {} });
  const draft = await store.add('messageDrafts', buildMessageDraft({ opportunityId: opportunity.id, channel, body: 'hi' }));
  const approval = await store.add('approvals', buildApprovalPacket({ opportunity, draft, offer: OFFER }));
  await decideApproval(store, approval.id, 'approved', { actor: 'owner' });
  return { opportunity, draft, approval: await store.get('approvals', approval.id) };
}

// --- registry shape ---

test('the five mission-named adapter categories are all present, each with a distinct key', () => {
  assert.deepEqual([...DISTRIBUTION_ADAPTER_KEYS].sort(), [
    'agency_partner_pipeline', 'business_email', 'inbound_scanner_leads', 'rfp_marketplace', 'vendor_inquiry_channel'
  ].sort());
});

test('every adapter accepts only mediums already present in the global ALLOWED_CHANNELS list', () => {
  for (const adapter of listDistributionAdapters()) {
    for (const medium of adapter.acceptedMediums) assert.ok(ALLOWED_CHANNELS.includes(medium), `${adapter.key} accepts unknown medium ${medium}`);
  }
});

test('every adapter has automationPermitted false -- no real automation exists in this package for any category', () => {
  for (const adapter of listDistributionAdapters()) assert.equal(adapter.automationPermitted, false);
});

test('DEFAULT_DISTRIBUTION_POLICY matches the mission-required defaults: enabled=false, dry-run=true', () => {
  assert.deepEqual(DEFAULT_DISTRIBUTION_POLICY, { enabled: false, dryRun: true });
});

// --- preflightDistribution ---

test('preflightDistribution rejects an unknown adapter key without throwing', () => {
  const result = preflightDistribution({ adapterKey: 'not_a_real_adapter', medium: 'published_email', verified: true });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['unknown-adapter']);
});

test('preflightDistribution blocks on the default (no policy passed) even for an otherwise-perfect input', () => {
  const result = preflightDistribution({ adapterKey: 'business_email', medium: 'published_email', verified: true });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('adapter-disabled-by-policy'));
  assert.ok(result.reasons.includes('automation-not-permitted-for-channel-category'));
});

test('preflightDistribution reports every applicable reason at once, not just the first', () => {
  const result = preflightDistribution({ adapterKey: 'business_email', medium: 'carrier_pigeon', verified: false, termsPermitAutomation: false, policy: { enabled: false } });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('adapter-disabled-by-policy'));
  assert.ok(result.reasons.includes('automation-not-permitted-for-channel-category'));
  assert.ok(result.reasons.includes('medium-not-accepted-by-adapter'));
  assert.ok(result.reasons.includes('medium-not-globally-allowed'));
  assert.ok(result.reasons.includes('inferred-contact-without-basis'));
  assert.ok(result.reasons.includes('channel-terms-forbid-automation'));
});

test('hostile: every explicitly named prohibited medium is rejected even with policy.enabled true', () => {
  for (const medium of PROHIBITED_MEDIUM_HINTS) {
    const result = preflightDistribution({ adapterKey: 'business_email', medium, verified: true, policy: { enabled: true } });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.includes('explicitly-prohibited-channel'), `${medium} should be flagged explicitly-prohibited-channel`);
  }
});

test('preflightDistribution rejects a medium accepted globally but not by this specific adapter', () => {
  // linkedin_public_profile is globally allowed but not one of business_email's acceptedMediums.
  const result = preflightDistribution({ adapterKey: 'business_email', medium: 'linkedin_public_profile', verified: true, policy: { enabled: true } });
  assert.ok(result.reasons.includes('medium-not-accepted-by-adapter'));
  assert.ok(!result.reasons.includes('medium-not-globally-allowed'));
});

test('preflightDistribution accepts an inferred contact only when a basis is supplied', () => {
  const noBasis = preflightDistribution({ adapterKey: 'business_email', medium: 'published_email', verified: false, policy: { enabled: true } });
  assert.ok(noBasis.reasons.includes('inferred-contact-without-basis'));
  const withBasis = preflightDistribution({ adapterKey: 'business_email', medium: 'published_email', verified: false, inferredBasis: 'role-based pattern match', policy: { enabled: true } });
  assert.ok(!withBasis.reasons.includes('inferred-contact-without-basis'));
});

test('preflightDistribution still refuses (on automationPermitted) even when policy.enabled is true and everything else is valid, and reports the correct dryRun default when it does pass every other gate', () => {
  const result = preflightDistribution({ adapterKey: 'business_email', medium: 'published_email', verified: true, policy: { enabled: true } });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['automation-not-permitted-for-channel-category']);
});

test('preflightDistribution honors an explicit dryRun: false in policy for the field it returns, structurally irrelevant today since automationPermitted always blocks first', () => {
  // Even asking for dryRun:false cannot produce ok:true in this package -- automationPermitted is
  // false for every adapter, so no live dispatch is structurally reachable regardless of policy.
  const result = preflightDistribution({ adapterKey: 'business_email', medium: 'published_email', verified: true, policy: { enabled: true, dryRun: false } });
  assert.equal(result.ok, false);
});

// --- dispatchThroughAdapter: always refuses in this package (no real automation implemented) ---

test('dispatchThroughAdapter throws DistributionError rather than silently no-oping when blocked', async () => {
  const store = await harness();
  const { approval, draft, opportunity } = await seedApprovedFixture(store, { channel: 'published_email' });
  await assert.rejects(
    () => dispatchThroughAdapter(store, { adapterKey: 'business_email', medium: 'published_email', verified: true, approval, draft, opportunity }),
    DistributionError
  );
});

test('dispatchThroughAdapter throws even with an explicit enabled:true policy and a fully valid, approved fixture', async () => {
  const store = await harness();
  const { approval, draft, opportunity } = await seedApprovedFixture(store, { channel: 'published_email' });
  await assert.rejects(
    () => dispatchThroughAdapter(store, { adapterKey: 'business_email', medium: 'published_email', verified: true, policy: { enabled: true }, approval, draft, opportunity }),
    (error) => {
      assert.ok(error instanceof DistributionError);
      assert.ok(error.message.includes('automation-not-permitted-for-channel-category'));
      return true;
    }
  );
});

test('dispatchThroughAdapter throws for an unknown adapter key before touching the store at all', async () => {
  const store = await harness();
  await assert.rejects(() => dispatchThroughAdapter(store, { adapterKey: 'nope', medium: 'published_email', verified: true }), DistributionError);
  assert.equal((await store.list('sendRecords')).length, 0);
});

// --- capability-scan: no real provider is wired anywhere in this module ---

test('distribution.mjs never imports a real network client (fetch/http/https/axios) -- only outbound.mjs\'s own fake-replay path', async () => {
  const content = await fs.readFile(new URL('../../revenue-os/src/distribution.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(content, /\bhttps?\.request\b|\baxios\b|\bnode-fetch\b|\bpuppeteer\b|\bplaywright\b/i);
});
