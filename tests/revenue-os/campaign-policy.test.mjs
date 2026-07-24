import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../../revenue-os/src/store.mjs';
import {
  validateCampaignPolicy, createCampaignPolicy, decideCampaignPolicy, expireStaleCampaignPolicies,
  evaluateSendUnderPolicy, CAMPAIGN_POLICY_DEFAULTS, MAX_POLICY_DURATION_DAYS, CampaignPolicyError
} from '../../revenue-os/src/campaign-policy.mjs';

async function harness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ros-campaign-policy-'));
  const store = new Store(dir);
  await store.init();
  return store;
}

function goodPolicyInput(overrides = {}) {
  const startAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 14 * 86400000).toISOString();
  return {
    campaignName: 'Founding diagnostic outreach, wave 1', offerKey: 'FOUNDING_AGENCY_REVENUE_LEAK_DIAGNOSTIC',
    audience: 'Agencies with a public hiring page for client-facing roles', channels: ['published_email', 'referral_intro'],
    maxProspects: 50, maxDailySends: 10, senderIdentity: 'Mohamed Wessam',
    approvedMessageRules: ['Must use the approved diagnostic-offer template.', 'Must never promise a specific dollar outcome.'],
    startAt, expiresAt, ...overrides
  };
}

// --- validation ---

test('a fully-formed campaign policy input validates', () => {
  assert.deepEqual(validateCampaignPolicy(goodPolicyInput()).problems, []);
});

test('createCampaignPolicy applies the mission-required defaults when fields are omitted', () => {
  const policy = createCampaignPolicy(goodPolicyInput());
  assert.equal(policy.outboundEnabled, false);
  assert.equal(policy.dryRun, true);
  assert.equal(policy.liveSendApproval, false);
  assert.equal(policy.provider, 'test');
  assert.equal(policy.budgetCeilingCents, 0);
  assert.equal(policy.status, 'pending');
  assert.deepEqual(CAMPAIGN_POLICY_DEFAULTS, { outboundEnabled: false, dryRun: true, liveSendApproval: false, provider: 'test', budgetCeilingCents: 0 });
});

test('createCampaignPolicy honors explicit owner-chosen values instead of defaults', () => {
  const policy = createCampaignPolicy(goodPolicyInput({ provider: 'sendgrid-sandbox', budgetCeilingCents: 50000, outboundEnabled: true, dryRun: false, liveSendApproval: true }));
  assert.equal(policy.provider, 'sendgrid-sandbox');
  assert.equal(policy.budgetCeilingCents, 50000);
  assert.equal(policy.outboundEnabled, true);
  assert.equal(policy.dryRun, false);
  assert.equal(policy.liveSendApproval, true);
});

// --- hostile: required fields ---

test('hostile: blank required text fields are all rejected at once', () => {
  const result = validateCampaignPolicy(goodPolicyInput({ campaignName: '', audience: '  ', senderIdentity: '' }));
  assert.equal(result.valid, false);
  assert.ok(result.problems.includes('blank-campaignName'));
  assert.ok(result.problems.includes('blank-audience'));
  assert.ok(result.problems.includes('blank-senderIdentity'));
});

test('hostile: an offer key not present in SERVICE_CATALOG is rejected', () => {
  assert.ok(validateCampaignPolicy(goodPolicyInput({ offerKey: 'NOT_A_REAL_OFFER' })).problems.includes('unknown-offer-key'));
});

test('hostile: missing or unsupported channels are rejected', () => {
  assert.ok(validateCampaignPolicy(goodPolicyInput({ channels: [] })).problems.includes('missing-channels'));
  assert.ok(validateCampaignPolicy(goodPolicyInput({ channels: ['carrier_pigeon'] })).problems.includes('channel-not-globally-allowed'));
});

test('hostile: non-positive or non-integer maxProspects/maxDailySends are rejected', () => {
  assert.ok(validateCampaignPolicy(goodPolicyInput({ maxProspects: 0 })).problems.includes('invalid-maxProspects'));
  assert.ok(validateCampaignPolicy(goodPolicyInput({ maxProspects: -5 })).problems.includes('invalid-maxProspects'));
  assert.ok(validateCampaignPolicy(goodPolicyInput({ maxProspects: 1.5 })).problems.includes('invalid-maxProspects'));
  assert.ok(validateCampaignPolicy(goodPolicyInput({ maxDailySends: 0 })).problems.includes('invalid-maxDailySends'));
});

test('hostile: missing or blank-entry approvedMessageRules is rejected', () => {
  assert.ok(validateCampaignPolicy(goodPolicyInput({ approvedMessageRules: [] })).problems.includes('missing-or-blank-approvedMessageRules'));
  assert.ok(validateCampaignPolicy(goodPolicyInput({ approvedMessageRules: ['real rule', '   '] })).problems.includes('missing-or-blank-approvedMessageRules'));
});

test('hostile: a negative budget ceiling is rejected', () => {
  assert.ok(validateCampaignPolicy(goodPolicyInput({ budgetCeilingCents: -1 })).problems.includes('invalid-budgetCeilingCents'));
});

// --- hostile: "no approval may become unlimited or permanent" ---

test('hostile: a missing start or expiry is rejected -- there is no permanent-by-omission policy', () => {
  assert.ok(validateCampaignPolicy(goodPolicyInput({ startAt: '' })).problems.includes('missing-or-invalid-startAt'));
  assert.ok(validateCampaignPolicy(goodPolicyInput({ expiresAt: '' })).problems.includes('missing-or-invalid-expiresAt'));
  assert.ok(validateCampaignPolicy(goodPolicyInput({ startAt: 'not-a-date' })).problems.includes('missing-or-invalid-startAt'));
});

test('hostile: an expiry at or before start is rejected', () => {
  const startAt = new Date().toISOString();
  assert.ok(validateCampaignPolicy(goodPolicyInput({ startAt, expiresAt: startAt })).problems.includes('expiry-not-after-start'));
  assert.ok(validateCampaignPolicy(goodPolicyInput({ startAt, expiresAt: new Date(Date.parse(startAt) - 1000).toISOString() })).problems.includes('expiry-not-after-start'));
});

test('hostile: a policy duration beyond MAX_POLICY_DURATION_DAYS is rejected regardless of how far in the future', () => {
  const startAt = new Date().toISOString();
  const tooLong = new Date(Date.now() + (MAX_POLICY_DURATION_DAYS + 1) * 86400000).toISOString();
  const result = validateCampaignPolicy(goodPolicyInput({ startAt, expiresAt: tooLong }));
  assert.ok(result.problems.includes('duration-exceeds-maximum'));
  const oneHundredYears = new Date(Date.now() + 100 * 365 * 86400000).toISOString();
  assert.ok(validateCampaignPolicy(goodPolicyInput({ startAt, expiresAt: oneHundredYears })).problems.includes('duration-exceeds-maximum'), 'a far-future expiry is still bounded, never accepted as effectively permanent');
});

test('createCampaignPolicy throws CampaignPolicyError with every problem listed, and rejects non-object input without throwing from validateCampaignPolicy itself', () => {
  assert.throws(() => createCampaignPolicy(goodPolicyInput({ campaignName: '' })), (err) => {
    assert.ok(err instanceof CampaignPolicyError);
    assert.ok(err.message.includes('blank-campaignName'));
    return true;
  });
  assert.equal(validateCampaignPolicy(null).valid, false);
  assert.equal(validateCampaignPolicy(undefined).valid, false);
});

// --- decision lifecycle ---

test('decideCampaignPolicy approves a pending policy and records the reviewer', async () => {
  const store = await harness();
  const policy = await store.add('campaignPolicies', createCampaignPolicy(goodPolicyInput()));
  const decided = await decideCampaignPolicy(store, policy.id, 'approved', { actor: 'owner' });
  assert.equal(decided.status, 'approved');
  assert.equal(decided.reviewedBy, 'owner');
});

test('decideCampaignPolicy refuses to re-decide an already-decided policy', async () => {
  const store = await harness();
  const policy = await store.add('campaignPolicies', createCampaignPolicy(goodPolicyInput()));
  await decideCampaignPolicy(store, policy.id, 'approved', { actor: 'owner' });
  await assert.rejects(() => decideCampaignPolicy(store, policy.id, 'rejected', { actor: 'owner' }), CampaignPolicyError);
});

test('decideCampaignPolicy refuses to approve a policy that expired before it was decided', async () => {
  const store = await harness();
  const policy = await store.add('campaignPolicies', createCampaignPolicy(goodPolicyInput({ startAt: new Date(Date.now() - 20000).toISOString(), expiresAt: new Date(Date.now() - 10000).toISOString() })));
  await assert.rejects(() => decideCampaignPolicy(store, policy.id, 'approved'), CampaignPolicyError);
  assert.equal((await store.get('campaignPolicies', policy.id)).status, 'expired');
});

test('expireStaleCampaignPolicies expires an already-approved policy once its own expiresAt has passed -- an approved policy is not a standing, permanent authority', async () => {
  const store = await harness();
  const policy = await store.add('campaignPolicies', createCampaignPolicy(goodPolicyInput({
    startAt: new Date(Date.now() - 20000).toISOString(), expiresAt: new Date(Date.now() + 5000).toISOString()
  })));
  await decideCampaignPolicy(store, policy.id, 'approved', { actor: 'owner' });
  const sweptEarly = await expireStaleCampaignPolicies(store, Date.now());
  assert.equal(sweptEarly.expired, 0);
  assert.equal((await store.get('campaignPolicies', policy.id)).status, 'approved');

  const sweptLate = await expireStaleCampaignPolicies(store, Date.now() + 10000);
  assert.equal(sweptLate.expired, 1);
  assert.equal((await store.get('campaignPolicies', policy.id)).status, 'expired');
});

// --- evaluateSendUnderPolicy: bound checks ---

function approvedPolicy(overrides = {}) {
  return createCampaignPolicy(goodPolicyInput({ ...overrides }));
}

test('evaluateSendUnderPolicy blocks a policy that has never been approved', () => {
  const policy = { ...approvedPolicy(), status: 'pending' };
  const result = evaluateSendUnderPolicy(policy, { channel: 'published_email' });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('policy-not-approved'));
  assert.ok(result.reasons.includes('outbound-disabled-by-policy'));
});

test('evaluateSendUnderPolicy reports every violated bound at once', () => {
  const policy = { ...approvedPolicy({ maxProspects: 5, maxDailySends: 2, budgetCeilingCents: 1000, channels: ['published_email'] }), status: 'approved', outboundEnabled: true };
  const result = evaluateSendUnderPolicy(policy, { channel: 'referral_intro', prospectsSentSoFar: 5, sentToday: 2, spendSoFarCents: 900, estimatedCostCents: 200 });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('channel-not-in-policy'));
  assert.ok(result.reasons.includes('max-prospects-reached'));
  assert.ok(result.reasons.includes('max-daily-sends-reached'));
  assert.ok(result.reasons.includes('budget-ceiling-exceeded'));
});

test('evaluateSendUnderPolicy blocks a send before startAt and after expiresAt', () => {
  const future = { ...approvedPolicy({ startAt: new Date(Date.now() + 3600000).toISOString(), expiresAt: new Date(Date.now() + 90000000).toISOString() }), status: 'approved', outboundEnabled: true };
  assert.ok(evaluateSendUnderPolicy(future, { channel: 'published_email' }).reasons.includes('policy-not-yet-started'));

  const expired = { ...approvedPolicy({ startAt: new Date(Date.now() - 20000).toISOString(), expiresAt: new Date(Date.now() - 10000).toISOString() }), status: 'approved', outboundEnabled: true };
  assert.ok(evaluateSendUnderPolicy(expired, { channel: 'published_email' }).reasons.includes('policy-expired'));
});

test('evaluateSendUnderPolicy passes for a send fully within an approved, enabled policy\'s bounds, and reports dryRun/live-send-approval status', () => {
  const policy = { ...approvedPolicy({ maxProspects: 50, maxDailySends: 10, budgetCeilingCents: 100000, channels: ['published_email'] }), status: 'approved', outboundEnabled: true };
  const result = evaluateSendUnderPolicy(policy, { channel: 'published_email', prospectsSentSoFar: 1, sentToday: 0, spendSoFarCents: 0, estimatedCostCents: 25000 });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.requiresLiveSendApproval, true, 'liveSendApproval defaults false, so requiresLiveSendApproval must default true');
});

test('evaluateSendUnderPolicy with no policy at all returns a single clear reason rather than throwing', () => {
  const result = evaluateSendUnderPolicy(null, { channel: 'published_email' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.reasons, ['no-policy']);
});
