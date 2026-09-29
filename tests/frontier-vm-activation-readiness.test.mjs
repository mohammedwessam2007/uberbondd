import test from 'node:test';
import assert from 'node:assert/strict';

import { assessFrontierVmActivationReadiness } from '../src/frontier-vm-activation-readiness.mjs';

const campaignConfig = {
  quality: { maxIntentionalDelta: 0, pairedTaskRegressionAllowed: 0 },
  budget: {
    monthlyAllInTargetUsd: 30,
    protectedCrownEscrowUsd: 15,
    automaticSpendAuthority: false
  }
};

const cloudConfig = {
  requiredResources: [
    { id: 'cognition-budget', default: '30' },
    { id: 'crown-escrow', default: '15' }
  ],
  recommendedPolicies: [
    { env: 'OPENROUTER_PLATFORM_FEE_RATE', default: '0.055' }
  ]
};

const baseEnv = {
  OPENROUTER_API_KEY: 'sk-or-v1-test-secret',
  UBERMIND_LIVE_CROWN_SNAPSHOT_REF: 'crown://2026-09-29/general',
  UBERMIND_FRESH_TASK_SOURCE_REF: 'tasks://fresh-custodian/1',
  OPENROUTER_PROVIDER_SORT: 'price',
  OPENROUTER_REQUIRE_ZDR: 'true'
};

test('interactive TypingMind burn-in can be ready while backend executor remains disabled', () => {
  const out = assessFrontierVmActivationReadiness({
    mode: 'INTERACTIVE',
    env: { ...baseEnv, OPENROUTER_AGENT_ENABLED: 'false' },
    campaignConfig,
    cloudConfig,
    sourceReady: true
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.status, 'FRONTIER_VM_READY_FOR_CONTROLLED_TYPINGMIND_BURN_IN');
  assert.equal(out.resources.monthlyAllInTargetUsd, 30);
  assert.equal(out.resources.protectedCrownEscrowUsd, 15);
  assert.ok(out.warnings.includes('BACKEND_EXECUTOR_DISABLED__OK_FOR_TYPINGMIND_INTERACTIVE_ONLY'));
  assert.equal(out.spendAuthority, 'NONE');
});

test('unattended burn-in requires backend OpenRouter execution to be explicitly enabled', () => {
  const blocked = assessFrontierVmActivationReadiness({
    mode: 'UNATTENDED',
    env: { ...baseEnv, OPENROUTER_AGENT_ENABLED: 'false' },
    campaignConfig,
    cloudConfig
  });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.blockers.includes('OPENROUTER_AGENT_ENABLED_TRUE_REQUIRED_FOR_UNATTENDED'));

  const ready = assessFrontierVmActivationReadiness({
    mode: 'UNATTENDED',
    env: { ...baseEnv, OPENROUTER_AGENT_ENABLED: 'true' },
    campaignConfig,
    cloudConfig
  });
  assert.equal(ready.ok, true, JSON.stringify(ready));
  assert.equal(ready.status, 'FRONTIER_VM_READY_FOR_CONTROLLED_UNATTENDED_BURN_IN');
});

test('stale $20 budget cannot masquerade as the frozen $30 V5 experiment', () => {
  const out = assessFrontierVmActivationReadiness({
    mode: 'INTERACTIVE',
    env: { ...baseEnv, UBERMIND_MONTHLY_COGNITION_BUDGET_USD: '20' },
    campaignConfig,
    cloudConfig
  });
  assert.equal(out.ok, false);
  assert.ok(out.blockers.includes('MONTHLY_BUDGET_MUST_MATCH_FROZEN_CAMPAIGN'));
});

test('Crown escrow below $15 blocks activation', () => {
  const out = assessFrontierVmActivationReadiness({
    mode: 'INTERACTIVE',
    env: { ...baseEnv, UBERMIND_PROTECTED_CROWN_ESCROW_USD: '14.99' },
    campaignConfig,
    cloudConfig
  });
  assert.equal(out.ok, false);
  assert.ok(out.blockers.includes('PROTECTED_CROWN_ESCROW_BELOW_FROZEN_MINIMUM'));
});

test('missing live Crown or fresh task source blocks burn-in', () => {
  const noCrown = assessFrontierVmActivationReadiness({
    mode: 'INTERACTIVE',
    env: { ...baseEnv, UBERMIND_LIVE_CROWN_SNAPSHOT_REF: '' },
    campaignConfig,
    cloudConfig
  });
  assert.equal(noCrown.ok, false);
  assert.ok(noCrown.blockers.includes('LIVE_CROWN_SNAPSHOT_REF_REQUIRED'));

  const noTasks = assessFrontierVmActivationReadiness({
    mode: 'INTERACTIVE',
    env: { ...baseEnv, UBERMIND_FRESH_TASK_SOURCE_REF: '' },
    campaignConfig,
    cloudConfig
  });
  assert.equal(noTasks.ok, false);
  assert.ok(noTasks.blockers.includes('FRESH_TASK_SOURCE_REF_REQUIRED'));
});

test('nonzero quality loss tolerance or automatic spend authority fails closed', () => {
  const out = assessFrontierVmActivationReadiness({
    mode: 'INTERACTIVE',
    env: baseEnv,
    campaignConfig: {
      quality: { maxIntentionalDelta: 0.01, pairedTaskRegressionAllowed: 1 },
      budget: {
        monthlyAllInTargetUsd: 30,
        protectedCrownEscrowUsd: 15,
        automaticSpendAuthority: true
      }
    },
    cloudConfig
  });
  assert.equal(out.ok, false);
  assert.ok(out.blockers.includes('MAX_INTENTIONAL_QUALITY_DELTA_MUST_BE_ZERO'));
  assert.ok(out.blockers.includes('PAIRED_TASK_REGRESSION_TOLERANCE_MUST_BE_ZERO'));
  assert.ok(out.blockers.includes('AUTOMATIC_SPEND_AUTHORITY_MUST_REMAIN_FALSE'));
});

test('ZDR disabled is a visible warning, not hidden', () => {
  const out = assessFrontierVmActivationReadiness({
    mode: 'INTERACTIVE',
    env: { ...baseEnv, OPENROUTER_REQUIRE_ZDR: 'false' },
    campaignConfig,
    cloudConfig
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.ok(out.warnings.includes('OPENROUTER_ZDR_NOT_REQUIRED__REVIEW_PRIVACY_POLICY_BEFORE_PRIVATE_DATA'));
});
