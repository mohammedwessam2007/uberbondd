import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { inspectNativeCapabilityUniverse } from './native-capability-universe.mjs';
import { inspectNativeRuntimeSubstitutes } from './native-runtime-substitutes.mjs';
import { inspectNativeResearchSecurityCoverage } from './native-research-security-adapters.mjs';
import { evaluateSafeExternalCapabilityReality } from './external-capability-reality-safe.mjs';

export const CAPABILITY_TOTAL_STATE_VERSION='uberbond.capability-total-state.v1.2';
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra});

const SAFE_EXTERNAL_DEFINITIONS=Object.freeze({
  'autonomous-exploit-verification-runtime':{supplierExamples:['strix','codex-security'],boundary:'REQUIRES_OWNED_OR_EXPLICITLY_AUTHORIZED_TARGET_AND_REAL_BOUNDED_RUNTIME_EXECUTION'},
  'live-cross-platform-public-research-adapters':{supplierExamples:['agent-reach'],boundary:'REQUIRES_REAL_LIVE_PLATFORM_ADAPTERS_AND_SOURCE_POLICY_COMPLIANCE'},
  'messaging-provider-redundancy':{boundary:'REQUIRES_TWO_INDEPENDENT_AUTHORIZED_LIVE_MESSAGING_PATHS'},
  'live-payment-settlement-or-recovery':{boundary:'REQUIRES_REAL_PROVIDER_SETTLEMENT_OR_RECOVERY_RECEIPT'},
  'independent-deployment-provider':{boundary:'REQUIRES_DISTINCT_PHYSICAL_PROVIDER_BOOT_CUTOVER_AND_ROLLBACK'},
  'credential-custody':{boundary:'REQUIRES_OBSERVED_OWNER_ENROLLMENT_ACROSS_FACTORS_AND_CUSTODY_DOMAINS'},
  'sovereign-identity':{boundary:'REQUIRES_OWNER_CONSENT_LIVENESS_AND_RECOVERY_REHEARSAL'}
});

export function inspectCapabilityTotalState({sourceRevision='WORKTREE',observedAt=new Date(),externalRealityReceipts=[]}={}){
  const native=inspectNativeCapabilityUniverse({sourceRevision,observedAt});
  const substitutes=inspectNativeRuntimeSubstitutes();
  const researchSecurity=inspectNativeResearchSecurityCoverage();
  const reality=evaluateSafeExternalCapabilityReality({receipts:externalRealityReceipts,now:observedAt});
  const internalOk=native.ok===true&&substitutes.ok===true&&researchSecurity.ok===true&&reality.ok===true;
  const externalOnly=reality.openIds.map(id=>({id,...SAFE_EXTERNAL_DEFINITIONS[id]}));
  const closedExternalReality=reality.closedIds.map(id=>({id,receiptDigest:reality.verdicts.find(v=>v.id===id)?.receiptDigest||null}));
  const state={
    nativeFirstParty:{status:native.status,total:native.state?.total||0,active:native.state?.active||0,failed:native.state?.failed||0,atomIds:native.state?.atomIds||[]},
    optionalRuntimeSubstitutes:{status:substitutes.status,total:substitutes.substituteCount||0,ready:substitutes.readyCount||0,substitutes:substitutes.substitutes||{}},
    boundedResearchSecurity:{status:researchSecurity.status,total:researchSecurity.total||0,ready:researchSecurity.readyCount||0,coverage:researchSecurity.coverage||{}},
    externalOnly,
    closedExternalReality,
    externalRealityVerdictDigest:reality.verdictDigest,
    internalCapabilityGapCount:internalOk?0:null,
    externalRealityGapCount:externalOnly.length
  };
  return envelope({ok:internalOk,status:internalOk?'CAPABILITY_TOTAL_INTERNAL_SURFACE_READY':'CAPABILITY_TOTAL_INTERNAL_SURFACE_DEGRADED',state,stateDigest:hash(state),truthBoundary:'WORLD-SUPPLIER PROMOTION, FIRST-PARTY NATIVE CAPABILITIES, OPTIONAL RUNTIME SUBSTITUTES, AND EXTERNAL REALITY GAPS ARE SEPARATE CLASSES. SAFE EXTERNAL GAPS, INCLUDING OWNED-TARGET SECURITY RUNTIME, CLOSE ONLY FROM CUT-SPECIFIC FRESH NON-SYNTHETIC RECEIPTS.'});
}
