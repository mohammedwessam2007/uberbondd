#!/usr/bin/env node
import { UBERSKILL_COMPILERS, compileRegisteredUberSkill } from '../src/uberskills-registry.mjs';
import { getUberSkillAtomSpec } from '../src/uberskills-core.mjs';
const now='2026-09-11T10:00:00Z';
const result=[];
for(const atomId of Object.keys(UBERSKILL_COMPILERS)){
 const spec=getUberSkillAtomSpec(atomId);const dataClass=spec.effect==='MESSAGE'?'CUSTOMER_AUTHORIZED':'INTERNAL_NON_SECRET';
 const input={networkPolicyRef:'doctor:network',allowedTargetRef:'doctor:target',sandboxRef:'doctor:sandbox',rollbackRef:'doctor:rollback',maxWrites:2,providerEvidenceRef:'doctor:provider',queryClass:'READ_ONLY',expectedIdentityRef:'doctor:model',authoritativeOriginalRef:'doctor:original',repositoryTruthRef:'doctor:repo'};
 const adapters=spec.effect==='NONE'?[]:[{adapterId:`doctor-${atomId}`,provider:'doctor-fixture',evidenceRef:`doctor:evidence:${atomId}`,observedAt:now,callable:true,atomIds:[atomId],allowedDataClasses:[dataClass],effectClass:spec.effect}];
 const authority=spec.effect==='MESSAGE'?{allowed:true,kind:'MESSAGE_SEND',consentRef:'doctor:consent',suppressionRef:'doctor:suppression',recipientScopeRef:'doctor:recipient',authorityRef:'doctor:authority',expiresAt:'2099-01-01T00:00:00Z'}:{};
 const r=compileRegisteredUberSkill(atomId,{inputRef:`doctor:input:${atomId}`,input,dataClass,adapters,authority});result.push({atomId,ok:r.ok,status:r.status});
}
const failed=result.filter(r=>!r.ok);console.log(JSON.stringify({ok:failed.length===0,status:failed.length?'UBERSKILLS_DOCTOR_BLOCKED':'UBERSKILLS_SOURCE_CONTRACTS_READY',atomCount:result.length,result,failed,simulationOnly:true,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:'Doctor validates source-level capability semantics with synthetic adapters. It does not prove provider callability or external effects.'},null,2));if(failed.length)process.exitCode=2;
