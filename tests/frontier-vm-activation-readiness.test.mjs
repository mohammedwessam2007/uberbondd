import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIVATION_MODES,
  assessFrontierVmActivationReadiness
} from '../src/frontier-vm-activation-readiness.mjs';

test('TypingMind cockpit is a first-class activation mode and does not require repo runtime secret',()=>{
  assert.ok(ACTIVATION_MODES.includes('TYPINGMIND_EXTERNAL_COCKPIT'));
  const out=assessFrontierVmActivationReadiness({
    activationMode:'TYPINGMIND_EXTERNAL_COCKPIT',
    sourceReady:true,
    typingMindOpenRouterConnectionRef:'typingmind://openrouter-connected',
    runtimeOpenRouterCredentialPresent:false,
    liveCrownSnapshotRef:'crown://snapshot/current',
    freshTaskSourceRef:'holdout://fresh-custodian'
  });
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(out.status,'FRONTIER_VM_V5_READY_FOR_CONTROLLED_LIVE_BURN_IN');
  assert.equal(out.runtimeOpenRouterCredentialPresent,false);
  assert.match(out.secretHandlingLaw,/REPOSITORY_RUNTIME_SECRET_NOT_REQUIRED/);
  assert.equal(out.providerCallsPerformed,0);
  assert.equal(out.spendAuthorized,false);
});

test('TypingMind mode fails closed when connection evidence is absent',()=>{
  const out=assessFrontierVmActivationReadiness({
    activationMode:'TYPINGMIND_EXTERNAL_COCKPIT',
    sourceReady:true,
    liveCrownSnapshotRef:'crown://snapshot/current',
    freshTaskSourceRef:'holdout://fresh-custodian'
  });
  assert.equal(out.ok,false);
  assert.ok(out.externalBlockers.includes('TYPINGMIND_OPENROUTER_CONNECTION_REF_REQUIRED'));
});

test('unattended runtime mode requires a protected runtime credential',()=>{
  const blocked=assessFrontierVmActivationReadiness({
    activationMode:'UNATTENDED_RUNTIME',
    sourceReady:true,
    runtimeOpenRouterCredentialPresent:false,
    liveCrownSnapshotRef:'crown://snapshot/current',
    freshTaskSourceRef:'holdout://fresh-custodian'
  });
  assert.equal(blocked.ok,false);
  assert.ok(blocked.externalBlockers.includes('OPENROUTER_API_KEY_REQUIRED_IN_PROTECTED_RUNTIME'));

  const ready=assessFrontierVmActivationReadiness({
    activationMode:'UNATTENDED_RUNTIME',
    sourceReady:true,
    runtimeOpenRouterCredentialPresent:true,
    liveCrownSnapshotRef:'crown://snapshot/current',
    freshTaskSourceRef:'holdout://fresh-custodian'
  });
  assert.equal(ready.ok,true);
});

test('all activation modes still require current Crown and fresh task evidence',()=>{
  for(const mode of ACTIVATION_MODES){
    const out=assessFrontierVmActivationReadiness({
      activationMode:mode,
      sourceReady:true,
      typingMindOpenRouterConnectionRef:'typingmind://connected',
      runtimeOpenRouterCredentialPresent:true
    });
    assert.equal(out.ok,false);
    assert.ok(out.externalBlockers.includes('LIVE_CROWN_SNAPSHOT_REF_REQUIRED'));
    assert.ok(out.externalBlockers.includes('FRESH_TASK_SOURCE_REF_REQUIRED'));
  }
});

test('source readiness failure cannot be masked by external credentials',()=>{
  const out=assessFrontierVmActivationReadiness({
    activationMode:'TYPINGMIND_EXTERNAL_COCKPIT',
    sourceReady:false,
    typingMindOpenRouterConnectionRef:'typingmind://connected',
    liveCrownSnapshotRef:'crown://snapshot/current',
    freshTaskSourceRef:'holdout://fresh-custodian'
  });
  assert.equal(out.ok,false);
  assert.ok(out.externalBlockers.includes('SOURCE_NOT_READY'));
});


test('V5 readiness refuses stale $20 budget and underfunded Crown escrow',()=>{
  const stale=assessFrontierVmActivationReadiness({
    activationMode:'TYPINGMIND_EXTERNAL_COCKPIT',
    sourceReady:true,
    typingMindOpenRouterConnectionRef:'typingmind://connected',
    liveCrownSnapshotRef:'crown://snapshot/current',
    freshTaskSourceRef:'holdout://fresh-custodian',
    monthlyAllInTargetUsd:20,
    protectedCrownEscrowUsd:15
  });
  assert.equal(stale.ok,false);
  assert.ok(stale.externalBlockers.includes('V5_MONTHLY_ALL_IN_TARGET_MUST_BE_30'));

  const lowEscrow=assessFrontierVmActivationReadiness({
    activationMode:'TYPINGMIND_EXTERNAL_COCKPIT',
    sourceReady:true,
    typingMindOpenRouterConnectionRef:'typingmind://connected',
    liveCrownSnapshotRef:'crown://snapshot/current',
    freshTaskSourceRef:'holdout://fresh-custodian',
    monthlyAllInTargetUsd:30,
    protectedCrownEscrowUsd:14.99
  });
  assert.equal(lowEscrow.ok,false);
  assert.ok(lowEscrow.externalBlockers.includes('V5_PROTECTED_CROWN_ESCROW_MUST_BE_AT_LEAST_15'));
});

test('V5 readiness refuses any quality-loss tolerance or automatic spend authority',()=>{
  const out=assessFrontierVmActivationReadiness({
    activationMode:'TYPINGMIND_EXTERNAL_COCKPIT',
    sourceReady:true,
    typingMindOpenRouterConnectionRef:'typingmind://connected',
    liveCrownSnapshotRef:'crown://snapshot/current',
    freshTaskSourceRef:'holdout://fresh-custodian',
    maxIntentionalDelta:0.01,
    pairedTaskRegressionAllowed:1,
    automaticSpendAuthority:true
  });
  assert.equal(out.ok,false);
  assert.ok(out.externalBlockers.includes('MAX_INTENTIONAL_QUALITY_DELTA_MUST_BE_ZERO'));
  assert.ok(out.externalBlockers.includes('PAIRED_TASK_REGRESSION_TOLERANCE_MUST_BE_ZERO'));
  assert.ok(out.externalBlockers.includes('AUTOMATIC_SPEND_AUTHORITY_MUST_REMAIN_FALSE'));
});
