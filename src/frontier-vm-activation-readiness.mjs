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
  freshTaskSourceRef=''
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
    secretHandlingLaw:mode==='TYPINGMIND_EXTERNAL_COCKPIT'
      ? 'OPENROUTER_SECRET_STAYS_IN_TYPINGMIND_OR_PROVIDER_CREDENTIAL_STORE; REPOSITORY_RUNTIME_SECRET_NOT_REQUIRED'
      : 'OPENROUTER_SECRET_STAYS_IN_PROTECTED_RUNTIME; NEVER_COMMIT_OR_LOG_SECRET_VALUE',
    truthBoundary:'Readiness proves only that the declared activation prerequisites are present. It does not prove quality equivalence, compression, current Crown superiority, or economic success.'
  });
}
