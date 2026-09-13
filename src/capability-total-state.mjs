import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { inspectNativeCapabilityUniverse } from './native-capability-universe.mjs';
import { inspectNativeRuntimeSubstitutes } from './native-runtime-substitutes.mjs';
import { inspectNativeResearchSecurityCoverage } from './native-research-security-adapters.mjs';

export const CAPABILITY_TOTAL_STATE_VERSION='uberbond.capability-total-state.v1';
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra});

export function inspectCapabilityTotalState({sourceRevision='WORKTREE',observedAt=new Date()}={}){
  const native=inspectNativeCapabilityUniverse({sourceRevision,observedAt});
  const substitutes=inspectNativeRuntimeSubstitutes();
  const researchSecurity=inspectNativeResearchSecurityCoverage();
  const internalOk=native.ok===true&&substitutes.ok===true&&researchSecurity.ok===true;
  const externalOnly=[
    {id:'autonomous-exploit-verification-runtime',supplierExamples:['strix'],boundary:'REQUIRES_OWNED_OR_EXPLICITLY_AUTHORIZED_TARGET_AND_REAL_RUNTIME_EXECUTION'},
    {id:'live-cross-platform-public-research-adapters',supplierExamples:['agent-reach'],boundary:'REQUIRES_REAL_LIVE_PLATFORM_ADAPTERS_AND_SOURCE_POLICY_COMPLIANCE'},
    {id:'messaging-provider-redundancy',boundary:'REQUIRES_TWO_INDEPENDENT_AUTHORIZED_LIVE_MESSAGING_PATHS'},
    {id:'live-payment-settlement-or-recovery',boundary:'REQUIRES_REAL_PROVIDER_SETTLEMENT_OR_RECOVERY_RECEIPT'},
    {id:'independent-deployment-provider',boundary:'REQUIRES_DISTINCT_PHYSICAL_PROVIDER_BOOT_CUTOVER_AND_ROLLBACK'},
    {id:'credential-custody',boundary:'REQUIRES_OBSERVED_OWNER_ENROLLMENT_ACROSS_FACTORS_AND_CUSTODY_DOMAINS'},
    {id:'sovereign-identity',boundary:'REQUIRES_OWNER_CONSENT_LIVENESS_AND_RECOVERY_REHEARSAL'}
  ];
  const state={
    nativeFirstParty:{status:native.status,total:native.state?.total||0,active:native.state?.active||0,failed:native.state?.failed||0,atomIds:native.state?.atomIds||[]},
    optionalRuntimeSubstitutes:{status:substitutes.status,total:substitutes.substituteCount||0,ready:substitutes.readyCount||0,substitutes:substitutes.substitutes||{}},
    boundedResearchSecurity:{status:researchSecurity.status,total:researchSecurity.total||0,ready:researchSecurity.readyCount||0,coverage:researchSecurity.coverage||{}},
    externalOnly,
    internalCapabilityGapCount:internalOk?0:null,
    externalRealityGapCount:externalOnly.length
  };
  return envelope({ok:internalOk,status:internalOk?'CAPABILITY_TOTAL_INTERNAL_SURFACE_READY':'CAPABILITY_TOTAL_INTERNAL_SURFACE_DEGRADED',state,stateDigest:hash(state),truthBoundary:'WORLD_SUPPLIER_PROMOTION, FIRST_PARTY_NATIVE_CAPABILITIES, OPTIONAL_RUNTIME_SUBSTITUTES, AND EXTERNAL_REALITY GAPS ARE SEPARATE CLASSES. ZERO WORLD-SUPPLIER APPROVAL DOES NOT MEAN ZERO ACTIVE NATIVE CAPABILITIES.'});
}
