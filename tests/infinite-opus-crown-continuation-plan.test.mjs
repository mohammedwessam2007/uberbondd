import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crownContinuationBudget,
  buildCrownResumeAuthority
} from '../src/infinite-opus-crown-continuation-plan.mjs';

test('Crown continuation charges unknown historical spend at full conservative liability', () => {
  const b = crownContinuationBudget({ knownSpendUsd: 0.11058375, uncertainLiabilityUsd: 0.03975639 });
  assert.equal(b.knownSpendMicrousd, 110584);
  assert.equal(b.uncertainLiabilityMicrousd, 39757);
  assert.equal(b.economicExposureMicrousd, 150341);
  assert.equal(b.remainingEnvelopeMicrousd, 299659);
  assert.equal(b.maxIncrementalMicrousd, 299659);
  assert.equal(b.maxIncrementalUsd, 0.299659);
});

test('Crown continuation never exceeds the $0.30 retry or $0.45 total evaluation ceilings', () => {
  assert.equal(crownContinuationBudget({ knownSpendUsd: 0, uncertainLiabilityUsd: 0 }).maxIncrementalMicrousd, 300000);
  assert.equal(crownContinuationBudget({ knownSpendUsd: 0.44, uncertainLiabilityUsd: 0.02 }).maxIncrementalMicrousd, 0);
});

test('authority is short-lived and copies only the exact precomputed owner ceiling', () => {
  const now = Date.parse('2026-10-07T00:10:00Z');
  const plan = {
    ok: true,
    state: 'OWNER_EXACT_SPEND_AUTHORIZATION_REQUIRED',
    operation: 'resume-existing-sealed-general-crown-evaluation',
    attemptKey: 'infinite_opus_crown_resume_20261002_r3',
    sourceKey: 'infinite_opus_crown_resume_20261001_r2',
    maxIncrementalMicrousd: 299659,
    maxTotalEvaluationMicrousd: 450000,
    monthlyCapMicrousd: 20000000,
    evidenceRef: 'owner-approved-two-missing-crown-edges-r3'
  };
  const a = buildCrownResumeAuthority(plan, { now });
  assert.equal(a.maxIncrementalMicrousd, 299659);
  assert.equal(a.maxRemainingPaidCalls, 2);
  assert.equal(Date.parse(a.expiresAt) - Date.parse(a.authorizedAt), 10 * 60 * 1000);
});
