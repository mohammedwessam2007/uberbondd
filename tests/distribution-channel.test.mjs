import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  normalizeDistributionChannel,
  allocateDistribution,
  logDistributionAllocation,
  DISTRIBUTION_CHANNEL_POLICY_VERSION
} from '../src/distribution-channel.mjs';

const referenceDate = new Date('2026-08-18T10:00:00.000Z');
const experiment = { ok: true, status: 'READY_FOR_OWNER_REVIEW', experimentId: 'exp-1' };

test('normalizes known channels but keeps authority owner-gated', () => {
  const result = normalizeDistributionChannel({ id: 'partner-1', type: 'partner', name: 'Agency partners' });
  assert.equal(result.ok, true);
  assert.equal(result.type, 'PARTNER');
  assert.equal(result.status, 'UNCONFIGURED');
  assert.equal(result.authorization, 'OWNER_REQUIRED');
  assert.equal(result.capability, 'LOCAL_PREPARATION_ONLY');
});

test('rejects malformed and unknown channel contracts', () => {
  assert.equal(normalizeDistributionChannel({ name: 'Missing ID' }).ok, false);
  assert.equal(normalizeDistributionChannel({ id: 'x', name: 'Unknown', type: 'TELEPATHY' }).reason, 'unknown-channel-type:TELEPATHY');
  assert.equal(normalizeDistributionChannel({ id: 'x', name: 'Partner', type: 'PARTNER', status: 'READY_TO_SEND' }).ok, false);
});

test('no verified cleared-payment history means DO_NOT_DISTRIBUTE', () => {
  const result = allocateDistribution({
    experiment,
    channels: [
      { id: 'outbound', type: 'OUTBOUND', name: 'Outbound', status: 'PREPARATION_ONLY' },
      { id: 'partner', type: 'PARTNER', name: 'Partners' }
    ],
    outcomes: [
      { channelId: 'outbound', truthLevel: 'OBSERVED_OUTCOME', contributionMarginCents: 1000, ownerMinutes: 10 },
      { channelId: 'partner', truthLevel: 'CLEARED_PAYMENT', contributionMarginCents: null, ownerMinutes: 10 }
    ],
    date: referenceDate
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'DO_NOT_DISTRIBUTE');
  assert.ok(result.reasonCodes.includes('no-verified-cleared-payment-outcome-history'));
  assert.ok(result.plans.every(plan => plan.status === 'UNPROVEN'));
  assert.equal(result.externalEffectLedger.messages, 0);
  assert.equal(result.externalEffectLedger.spendCents, 0);
});

test('verified payment outcomes can rank preparation plans but never enable a live action', () => {
  const result = allocateDistribution({
    experiment,
    channels: [
      { id: 'a', type: 'PARTNER', name: 'Partner route' },
      { id: 'b', type: 'OWNED_CONTENT', name: 'Owned content' }
    ],
    outcomes: [
      { channelId: 'a', truthLevel: 'CLEARED_PAYMENT', contributionMarginCents: 900, ownerMinutes: 10 },
      { channelId: 'b', truthLevel: 'CLEARED_PAYMENT', contributionMarginCents: 400, ownerMinutes: 10 }
    ],
    date: referenceDate
  });
  assert.equal(result.status, 'PREPARE_ONLY_RANKED');
  assert.equal(result.plans[0].channelId, 'a');
  assert.equal(result.plans[0].measuredContributionCentsPerOwnerMinute, 90);
  assert.ok(result.plans.every(plan => plan.authorization === 'OWNER_REQUIRED'));
  assert.ok(result.plans.every(plan => plan.externalAction === 'DISABLED'));
});

test('untrusted channel entries are rejected without aborting valid preparation', () => {
  const result = allocateDistribution({
    experiment,
    channels: [
      { id: 'valid', type: 'REFERRAL', name: 'Referrals' },
      { id: 'bad', type: 'UNKNOWN', name: 'Bad' }
    ],
    date: referenceDate
  });
  assert.equal(result.plans.length, 1);
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].status, 'REJECTED');
});

test('an unready experiment cannot be allocated even with outcome history', () => {
  const result = allocateDistribution({
    experiment: { ...experiment, status: 'REVIEW_REQUIRED' },
    channels: [{ id: 'a', type: 'PARTNER', name: 'Partner route' }],
    outcomes: [{ channelId: 'a', truthLevel: 'CLEARED_PAYMENT', contributionMarginCents: 100, ownerMinutes: 10 }],
    date: referenceDate
  });
  assert.equal(result.status, 'DO_NOT_DISTRIBUTE');
  assert.ok(result.reasonCodes.includes('experiment-not-ready-for-owner-review'));
  assert.equal(result.plans[0].externalAction, 'DISABLED');
});

test('audit logging stores only the bounded allocation receipt', async () => {
  const calls = [];
  const allocation = allocateDistribution({ experiment, channels: [], date: referenceDate });
  await logDistributionAllocation({ log: async (type, detail) => { calls.push({ type, detail }); return { id: 'audit-1' }; } }, allocation);
  assert.equal(calls[0].type, 'distribution_allocation');
  assert.equal(calls[0].detail.policyVersion, DISTRIBUTION_CHANNEL_POLICY_VERSION);
  assert.equal(Object.prototype.hasOwnProperty.call(calls[0].detail, 'outcomes'), false);
});

test('allocator has no provider or filesystem boundary of its own', async () => {
  const source = await fs.readFile(new URL('../src/distribution-channel.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(/);
});
