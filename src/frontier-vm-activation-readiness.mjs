import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FRONTIER_VM_ACTIVATION_READINESS_VERSION='uberbond.frontier-vm-activation-readiness.v1';
export const ACTIVATION_MODES=Object.freeze([
  'TYPINGMIND_EXTERNAL_COCKPIT',
  'UNATTENDED_RUNTIME'
]);

const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const text=(value,max=1000)=>String(value??'').trim().slice(0,max);

function envelope(extra={}){
  return {
    readinessVersion:FRONTIER_VM_ACTIVATION_READINESS_VERSION,
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    externalEffectLedger:zeroEffects(),
    providerCallsPerformed:0,
    spendAuthorized:false,
    ...extra
  };
}

export function assessFrontierVmActivationReadiness({
  activationMode='TYPINGMIND_EXTERNAL_COCKPIT',
  sourceReady=false,
  typingMindOpenRouterConnectionRef='',
  runtimeOpenRouterCredentialPresent=false,
  liveCrownSnapshotRef='',
  freshTaskSourceRef='',
  monthlyAllInTargetUsd=30,
  protectedCrownEscrowUsd=15,
  maxIntentionalDelta=0,
  pairedTaskRegressionAllowed=0,
  automaticSpendAuthority=false
}={}){
  const mode=text(activationMode,80).toUpperCase();
  const blockers=[];
  if(!ACTIVATION_MODES.includes(mode)) blockers.push('RECOGNIZED_ACTIVATION_MODE_REQUIRED');
  if(sourceReady!==true) blockers.push('SOURCE_NOT_READY');

  if(mode==='TYPINGMIND_EXTERNAL_COCKPIT'){
    if(!text(typingMindOpenRouterConnectionRef,1600)) blockers.push('TYPINGMIND_OPENROUTER_CONNECTION_REF_REQUIRED');
  }
  if(mode==='UNATTENDED_RUNTIME' && runtimeOpenRouterCredentialPresent!==true){
    blockers.push('OPENROUTER_API_KEY_REQUIRED_IN_PROTECTED_RUNTIME');
  }

  if(!text(liveCrownSnapshotRef,1600)) blockers.push('LIVE_CROWN_SNAPSHOT_REF_REQUIRED');
  if(!text(freshTaskSourceRef,1600)) blockers.push('FRESH_TASK_SOURCE_REF_REQUIRED');

  const budget=Number(monthlyAllInTargetUsd);
  const escrow=Number(protectedCrownEscrowUsd);
  if(!Number.isFinite(budget)||budget!==30) blockers.push('V5_MONTHLY_ALL_IN_TARGET_MUST_BE_30');
  if(!Number.isFinite(escrow)||escrow<15) blockers.push('V5_PROTECTED_CROWN_ESCROW_MUST_BE_AT_LEAST_15');
  if(Number.isFinite(budget)&&Number.isFinite(escrow)&&escrow>budget) blockers.push('CROWN_ESCROW_CANNOT_EXCEED_MONTHLY_BUDGET');
  if(Number(maxIntentionalDelta)!==0) blockers.push('MAX_INTENTIONAL_QUALITY_DELTA_MUST_BE_ZERO');
  if(Number(pairedTaskRegressionAllowed)!==0) blockers.push('PAIRED_TASK_REGRESSION_TOLERANCE_MUST_BE_ZERO');
  if(automaticSpendAuthority!==false) blockers.push('AUTOMATIC_SPEND_AUTHORITY_MUST_REMAIN_FALSE');

  const ready=blockers.length===0;
  return envelope({
    ok:ready,
    status:ready
      ? 'FRONTIER_VM_V5_READY_FOR_CONTROLLED_LIVE_BURN_IN'
      : 'FRONTIER_VM_V5_PRE_LIVE_BLOCKED',
    activationMode:mode,
    sourceReady:sourceReady===true,
    externalBlockers:blockers,
    typingMindOpenRouterConnectionRefPresent:Boolean(text(typingMindOpenRouterConnectionRef,1600)),
    runtimeOpenRouterCredentialPresent:runtimeOpenRouterCredentialPresent===true,
    liveCrownSnapshotRefPresent:Boolean(text(liveCrownSnapshotRef,1600)),
    freshTaskSourceRefPresent:Boolean(text(freshTaskSourceRef,1600)),
    policy:{
      monthlyAllInTargetUsd:Number.isFinite(budget)?budget:null,
      protectedCrownEscrowUsd:Number.isFinite(escrow)?escrow:null,
      maxIntentionalDelta:Number(maxIntentionalDelta),
      pairedTaskRegressionAllowed:Number(pairedTaskRegressionAllowed),
      automaticSpendAuthority:automaticSpendAuthority===true
    },
    qualityPressureLaw:'QUEUE_DEFER_BATCH_WAIT_NEVER_DOWNGRADE',
    secretHandlingLaw:mode==='TYPINGMIND_EXTERNAL_COCKPIT'
      ? 'OPENROUTER_SECRET_STAYS_IN_TYPINGMIND_OR_PROVIDER_CREDENTIAL_STORE; REPOSITORY_RUNTIME_SECRET_NOT_REQUIRED'
      : 'OPENROUTER_SECRET_STAYS_IN_PROTECTED_RUNTIME; NEVER_COMMIT_OR_LOG_SECRET_VALUE',
    truthBoundary:'Readiness proves only that the declared activation prerequisites and frozen V5 budget/quality policy are present. It does not prove quality equivalence, compression, current Crown superiority, economic success, or permission to spend.'
  });
}
