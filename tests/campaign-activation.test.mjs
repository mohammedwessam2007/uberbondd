import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCampaignActivationApproval, assertCampaignActivation, computeRecipientsHash, computeBatchHash, CampaignActivationError
} from '../src/campaign-activation.mjs';
import { JsonStore } from '../src/store.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

async function makeStore() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'canon-activation-'));
  const store = new JsonStore(dir);
  await store.init();
  return store;
}

const recipients = ['a@example.com', 'b@example.com', 'c@example.com'];
const now = new Date('2026-08-01T12:00:00.000Z');

function baseApproval(overrides = {}) {
  return buildCampaignActivationApproval({
    experimentId: 'exp_1', recipientEmails: recipients, senderSet: ['inbox-a@uberbond.example'],
    maxCount: 3, policyVersion: 'revenue-os-policy-v1', approvedBy: 'owner@uberbond.example',
    expiresAt: '2026-08-05T00:00:00.000Z', now, ...overrides
  });
}

test('buildCampaignActivationApproval rejects a maxCount above the approved recipient list', () => {
  assert.throws(() => buildCampaignActivationApproval({
    experimentId: 'exp_1', recipientEmails: recipients, senderSet: ['a@uberbond.example'],
    maxCount: 10, policyVersion: 'v1', approvedBy: 'owner', expiresAt: '2026-08-05T00:00:00.000Z', now
  }), CampaignActivationError);
});

test('buildCampaignActivationApproval rejects a non-future expiry', () => {
  assert.throws(() => buildCampaignActivationApproval({
    experimentId: 'exp_1', recipientEmails: recipients, senderSet: ['a@uberbond.example'],
    maxCount: 1, policyVersion: 'v1', approvedBy: 'owner', expiresAt: '2020-01-01T00:00:00.000Z', now
  }), CampaignActivationError);
});

test('global gate alone (no matching approval) fails closed', async () => {
  const store = await makeStore();
  const result = await assertCampaignActivation({
    store, cfg: { acquisition: { workersActive: true } }, experimentId: 'exp_1',
    recipientEmails: recipients, senderSet: ['inbox-a@uberbond.example'], requestedCount: 3,
    policyVersion: 'revenue-os-policy-v1', at: now
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-matching-campaign-activation-approval');
});

test('batch approval alone (master gate off) fails closed', async () => {
  const store = await makeStore();
  await store.add('campaignActivationApprovals', baseApproval());
  const result = await assertCampaignActivation({
    store, cfg: { acquisition: { workersActive: false } }, experimentId: 'exp_1',
    recipientEmails: recipients, senderSet: ['inbox-a@uberbond.example'], requestedCount: 3,
    policyVersion: 'revenue-os-policy-v1', at: now
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'acquisition-workers-not-active');
});

test('an expired approval fails closed even with the master gate on', async () => {
  const store = await makeStore();
  await store.add('campaignActivationApprovals', baseApproval());
  const result = await assertCampaignActivation({
    store, cfg: { acquisition: { workersActive: true } }, experimentId: 'exp_1',
    recipientEmails: recipients, senderSet: ['inbox-a@uberbond.example'], requestedCount: 3,
    policyVersion: 'revenue-os-policy-v1', at: new Date('2026-09-01T00:00:00.000Z')
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'campaign-activation-approval-expired');
});

test('global gate plus an exactly matching, unexpired approval passes', async () => {
  const store = await makeStore();
  await store.add('campaignActivationApprovals', baseApproval());
  const result = await assertCampaignActivation({
    store, cfg: { acquisition: { workersActive: true } }, experimentId: 'exp_1',
    recipientEmails: recipients, senderSet: ['inbox-a@uberbond.example'], requestedCount: 3,
    policyVersion: 'revenue-os-policy-v1', at: now
  });
  assert.equal(result.ok, true);
  assert.equal(result.approval.batchHash, computeBatchHash({
    experimentId: 'exp_1', recipientsHash: computeRecipientsHash(recipients),
    senderSet: ['inbox-a@uberbond.example'], maxCount: 3, policyVersion: 'revenue-os-policy-v1'
  }));
});

test('a recipient set different from the approved one fails closed', async () => {
  const store = await makeStore();
  await store.add('campaignActivationApprovals', baseApproval());
  const result = await assertCampaignActivation({
    store, cfg: { acquisition: { workersActive: true } }, experimentId: 'exp_1',
    recipientEmails: [...recipients, 'extra@example.com'], senderSet: ['inbox-a@uberbond.example'],
    requestedCount: 4, policyVersion: 'revenue-os-policy-v1', at: now
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-matching-campaign-activation-approval');
});

test('a sender outside the approved sender set fails closed', async () => {
  const store = await makeStore();
  await store.add('campaignActivationApprovals', baseApproval());
  const result = await assertCampaignActivation({
    store, cfg: { acquisition: { workersActive: true } }, experimentId: 'exp_1',
    recipientEmails: recipients, senderSet: ['inbox-rogue@uberbond.example'], requestedCount: 3,
    policyVersion: 'revenue-os-policy-v1', at: now
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-matching-campaign-activation-approval');
});
