import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  signCampaignPolicy, verifyCampaignPolicy, isCampaignPolicyActive, CampaignPolicyError
} from '../src/automation/campaign-policy.mjs';

const demo = JSON.parse(await fs.readFile(new URL('../config/campaigns/demo-healthcare-dry-run.json', import.meta.url), 'utf8'));
const cfg = { automation: { policySecret: 'a'.repeat(32) } };
const policyInput = () => ({
  ...structuredClone(demo),
  enabled: true,
  allowedChannelTypes: ['email'],
  postalAddressConfirmed: true,
  paymentRailConfirmed: true,
  pauseThresholds: { hardBounce: 2, complaint: 1, failure: 3 },
  expiresAt: new Date(Date.now() + 30 * 86400000).toISOString()
});

test('a fully specified policy signs and verifies', () => {
  const policy = signCampaignPolicy(policyInput(), cfg, { ownerId: 'mohamed' });
  assert.equal(policy.owner, 'mohamed');
  assert.equal(policy.evidenceThreshold, demo.minimumEvidenceConfidence);
  assert(policy.signature.length === 64);
  assert.equal(verifyCampaignPolicy(policy, cfg).valid, true);
  assert.equal(isCampaignPolicyActive(policy, cfg).active, true);
});

test('missing policy extras are rejected even though the base campaign schema is satisfied', () => {
  const input = policyInput();
  delete input.allowedChannelTypes;
  assert.throws(() => signCampaignPolicy(input, cfg), CampaignPolicyError);
});

test('a non-email channel type is rejected', () => {
  const input = policyInput();
  input.allowedChannelTypes = ['sms'];
  assert.throws(() => signCampaignPolicy(input, cfg), CampaignPolicyError);
});

test('tampering with any signed field invalidates the signature', () => {
  const policy = signCampaignPolicy(policyInput(), cfg);
  const tampered = { ...policy, campaign: { ...policy.campaign, dailySendCap: 999 } };
  assert.equal(verifyCampaignPolicy(tampered, cfg).valid, false);
  assert.equal(isCampaignPolicyActive(tampered, cfg).active, false);
});

test('an expired policy is not active even with a valid signature', () => {
  const input = policyInput();
  input.expiresAt = new Date(Date.now() - 1000).toISOString();
  const policy = signCampaignPolicy(input, cfg);
  assert.equal(verifyCampaignPolicy(policy, cfg).valid, true);
  const active = isCampaignPolicyActive(policy, cfg);
  assert.equal(active.active, false);
  assert.equal(active.reason, 'policy-expired');
});

test('signing without a configured secret fails closed', () => {
  assert.throws(() => signCampaignPolicy(policyInput(), { automation: {} }), CampaignPolicyError);
});

test('a disabled campaign policy is never active regardless of signature or expiry', () => {
  const input = policyInput();
  input.enabled = false;
  const policy = signCampaignPolicy(input, cfg);
  assert.equal(isCampaignPolicyActive(policy, cfg).reason, 'policy-campaign-disabled');
});
