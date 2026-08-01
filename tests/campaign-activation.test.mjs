import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCampaignActivationApproval, persistCampaignActivationApproval, assertCampaignActivation,
  claimCohortSeat, releaseCohortSeat, markCohortSeatTouched, computeCohortHash, CampaignActivationError
} from '../src/campaign-activation.mjs';
import { JsonStore, PostgresStore } from '../src/store.mjs';
import { migratedDb } from './postgres-schema.test.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canon-activation-'));
  const store = new JsonStore(dir);
  await store.init();
  return store;
}

function pgliteAsPool(db) {
  return {
    query: (text, params) => db.query(text, params),
    connect: async () => ({ query: (text, params) => db.query(text, params), release: () => {} }),
    end: async () => {}
  };
}

async function pgStore() {
  const db = await migratedDb();
  const store = new PostgresStore({ pool: pgliteAsPool(db) });
  return { db, store };
}

const now = new Date('2026-08-01T12:00:00.000Z');

function members(count, prefix = 'company') {
  return Array.from({ length: count }, (_, i) => ({
    organizationDomain: `${prefix}-${i}.com`, recipientEmail: `partnerships@${prefix}-${i}.com`
  }));
}

function baseApprovalInput(overrides = {}) {
  return {
    experimentId: 'exp_1', members: members(3), senderSet: ['inbox-a@uberbond.example'],
    policyVersion: 'revenue-os-policy-v1', approvedBy: 'owner@uberbond.example',
    expiresAt: '2026-08-05T00:00:00.000Z', now, ...overrides
  };
}

test('buildCampaignActivationApproval rejects a maxCount that does not equal the exact member count', () => {
  assert.throws(() => buildCampaignActivationApproval({ ...baseApprovalInput(), maxCount: 10 }), CampaignActivationError);
});

test('buildCampaignActivationApproval rejects duplicate organizations or recipients', () => {
  assert.throws(() => buildCampaignActivationApproval({
    ...baseApprovalInput(), members: [{ organizationDomain: 'acme.com', recipientEmail: 'a@acme.com' }, { organizationDomain: 'acme.com', recipientEmail: 'b@acme.com' }]
  }), CampaignActivationError);
});

test('buildCampaignActivationApproval rejects a non-future expiry', () => {
  assert.throws(() => buildCampaignActivationApproval({ ...baseApprovalInput(), expiresAt: '2020-01-01T00:00:00.000Z' }), CampaignActivationError);
});

test('global gate alone (no active approval) fails closed', async () => {
  const store = await makeStore();
  const result = await assertCampaignActivation({
    store, cfg: { acquisition: { workersActive: true } }, experimentId: 'exp_1', organizationDomain: 'company-0.com',
    recipientEmail: 'partnerships@company-0.com', senderSet: ['inbox-a@uberbond.example'], policyVersion: 'revenue-os-policy-v1', at: now
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-active-campaign-activation-approval');
});

test('an active approval alone (master gate off) fails closed', async () => {
  const store = await makeStore();
  await persistCampaignActivationApproval(store, baseApprovalInput());
  const result = await assertCampaignActivation({
    store, cfg: { acquisition: { workersActive: false } }, experimentId: 'exp_1', organizationDomain: 'company-0.com',
    recipientEmail: 'partnerships@company-0.com', senderSet: ['inbox-a@uberbond.example'], policyVersion: 'revenue-os-policy-v1', at: now
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'acquisition-workers-not-active');
});

test('an expired approval fails closed even with the master gate on', async () => {
  const store = await makeStore();
  await persistCampaignActivationApproval(store, baseApprovalInput());
  const result = await assertCampaignActivation({
    store, cfg: { acquisition: { workersActive: true } }, experimentId: 'exp_1', organizationDomain: 'company-0.com',
    recipientEmail: 'partnerships@company-0.com', senderSet: ['inbox-a@uberbond.example'], policyVersion: 'revenue-os-policy-v1',
    at: new Date('2026-09-01T00:00:00.000Z')
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-active-campaign-activation-approval');
});

test('C-P0-003 acceptance: one N-member approval authorizes EACH of its members individually (not just a single-member cohort)', async () => {
  const store = await makeStore();
  const cohort = members(5);
  await persistCampaignActivationApproval(store, baseApprovalInput({ members: cohort }));
  for (const member of cohort) {
    const result = await assertCampaignActivation({
      store, cfg: { acquisition: { workersActive: true } }, experimentId: 'exp_1', organizationDomain: member.organizationDomain,
      recipientEmail: member.recipientEmail, senderSet: ['inbox-a@uberbond.example'], policyVersion: 'revenue-os-policy-v1', at: now
    });
    assert.equal(result.ok, true, `member ${member.organizationDomain} should be individually authorized`);
  }
});

test('an organization NOT in the approved cohort fails closed', async () => {
  const store = await makeStore();
  await persistCampaignActivationApproval(store, baseApprovalInput());
  const result = await assertCampaignActivation({
    store, cfg: { acquisition: { workersActive: true } }, experimentId: 'exp_1', organizationDomain: 'not-in-cohort.com',
    recipientEmail: 'buyer@not-in-cohort.com', senderSet: ['inbox-a@uberbond.example'], policyVersion: 'revenue-os-policy-v1', at: now
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not-a-cohort-member');
});

test('a recipient email that does not match the cohort member record fails closed', async () => {
  const store = await makeStore();
  await persistCampaignActivationApproval(store, baseApprovalInput());
  const result = await assertCampaignActivation({
    store, cfg: { acquisition: { workersActive: true } }, experimentId: 'exp_1', organizationDomain: 'company-0.com',
    recipientEmail: 'someone-else@company-0.com', senderSet: ['inbox-a@uberbond.example'], policyVersion: 'revenue-os-policy-v1', at: now
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'cohort-member-recipient-mismatch');
});

test('claimCohortSeat consumes exactly one seat per member; a second claim for the same member fails', async () => {
  const store = await makeStore();
  await persistCampaignActivationApproval(store, baseApprovalInput());
  const first = await claimCohortSeat(store, {
    cfg: { acquisition: { workersActive: true } }, experimentId: 'exp_1', organizationDomain: 'company-0.com',
    recipientEmail: 'partnerships@company-0.com', senderSet: ['inbox-a@uberbond.example'], policyVersion: 'revenue-os-policy-v1', at: now
  });
  assert.equal(first.ok, true);
  const second = await claimCohortSeat(store, {
    cfg: { acquisition: { workersActive: true } }, experimentId: 'exp_1', organizationDomain: 'company-0.com',
    recipientEmail: 'partnerships@company-0.com', senderSet: ['inbox-a@uberbond.example'], policyVersion: 'revenue-os-policy-v1', at: now
  });
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'cohort-member-not-pending-actual-reserved');
});

test('releaseCohortSeat allows a retried claim after an ineligible-for-other-reasons rejection', async () => {
  const store = await makeStore();
  const { approval } = await persistCampaignActivationApproval(store, baseApprovalInput());
  await claimCohortSeat(store, {
    cfg: { acquisition: { workersActive: true } }, experimentId: 'exp_1', organizationDomain: 'company-0.com',
    recipientEmail: 'partnerships@company-0.com', senderSet: ['inbox-a@uberbond.example'], policyVersion: 'revenue-os-policy-v1', at: now
  });
  await releaseCohortSeat(store, approval.id, 'company-0.com');
  const retried = await claimCohortSeat(store, {
    cfg: { acquisition: { workersActive: true } }, experimentId: 'exp_1', organizationDomain: 'company-0.com',
    recipientEmail: 'partnerships@company-0.com', senderSet: ['inbox-a@uberbond.example'], policyVersion: 'revenue-os-policy-v1', at: now
  });
  assert.equal(retried.ok, true);
});

test('markCohortSeatTouched records the first-touch reservation id', async () => {
  const store = await makeStore();
  const { approval } = await persistCampaignActivationApproval(store, baseApprovalInput());
  await claimCohortSeat(store, {
    cfg: { acquisition: { workersActive: true } }, experimentId: 'exp_1', organizationDomain: 'company-0.com',
    recipientEmail: 'partnerships@company-0.com', senderSet: ['inbox-a@uberbond.example'], policyVersion: 'revenue-os-policy-v1', at: now
  });
  await markCohortSeatTouched(store, approval.id, 'company-0.com', 'reservation_123');
  const [member] = (await store.list('campaignCohortMembers', { filters: { approvalId: approval.id } })).filter(m => m.organizationDomain === 'company-0.com');
  assert.equal(member.status, 'touched');
  assert.equal(member.firstTouchReservationId, 'reservation_123');
});

test('C-P0-003 acceptance: one 100-company approval authorizes exactly 100 first touches, no more', async () => {
  const store = await makeStore();
  const cohort = members(100);
  await persistCampaignActivationApproval(store, baseApprovalInput({ members: cohort }));
  let claimed = 0;
  for (const member of cohort) {
    const result = await claimCohortSeat(store, {
      cfg: { acquisition: { workersActive: true } }, experimentId: 'exp_1', organizationDomain: member.organizationDomain,
      recipientEmail: member.recipientEmail, senderSet: ['inbox-a@uberbond.example'], policyVersion: 'revenue-os-policy-v1', at: now
    });
    if (result.ok) claimed += 1;
  }
  assert.equal(claimed, 100);
  const extra = await claimCohortSeat(store, {
    cfg: { acquisition: { workersActive: true } }, experimentId: 'exp_1', organizationDomain: 'outside-the-cohort.com',
    recipientEmail: 'buyer@outside-the-cohort.com', senderSet: ['inbox-a@uberbond.example'], policyVersion: 'revenue-os-policy-v1', at: now
  });
  assert.equal(extra.ok, false);
});

test('P0-004 acceptance (real Postgres): ten concurrent workers race for one cohort seat and exactly one claim succeeds', async () => {
  const { db, store } = await pgStore();
  try {
    await store.add('experiments', { id: 'exp_1', status: 'active', hypothesis: 'h', lane: 'ai-workflow', variant: 'a', minimumSample: 25, successMetric: 'replies', data: {} });
    await persistCampaignActivationApproval(store, baseApprovalInput({ members: members(1) }));
    const attempts = Array.from({ length: 10 }, () => claimCohortSeat(store, {
      cfg: { acquisition: { workersActive: true } }, experimentId: 'exp_1', organizationDomain: 'company-0.com',
      recipientEmail: 'partnerships@company-0.com', senderSet: ['inbox-a@uberbond.example'], policyVersion: 'revenue-os-policy-v1', at: now
    }));
    const results = await Promise.all(attempts);
    assert.equal(results.filter(r => r.ok).length, 1);
    assert.equal(results.filter(r => !r.ok).length, 9);
  } finally { await db.close(); }
});

test('computeCohortHash is stable regardless of member array order', () => {
  const a = computeCohortHash(members(3));
  const b = computeCohortHash([...members(3)].reverse());
  assert.equal(a, b);
});
