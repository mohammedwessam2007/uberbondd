import test from 'node:test';
import assert from 'node:assert/strict';
import { getUberSkillAtomSpec } from '../../src/uberskills-core.mjs';

function fixture(atomId){
 const spec=getUberSkillAtomSpec(atomId); const dataClass=atomId==='messaging.send-authorized-email'?'CUSTOMER_AUTHORIZED':'INTERNAL_NON_SECRET';
 const input={networkPolicyRef:'policy:test:network',allowedTargetRef:'target:test',sandboxRef:'sandbox:test',rollbackRef:'rollback:test',maxWrites:2,providerEvidenceRef:'provider:test:payment',queryClass:'READ_ONLY',expectedIdentityRef:'model:test:identity',authoritativeOriginalRef:'context:test:original',repositoryTruthRef:'repo:test:truth'};
 const adapters=spec.effect==='NONE'?[]:[{adapterId:`fixture-${atomId}`,provider:'fixture-provider',evidenceRef:`receipt:test:${atomId}`,observedAt:'2026-09-11T10:00:00Z',callable:true,atomIds:[atomId],allowedDataClasses:[dataClass],effectClass:spec.effect,policyAuthority:false,effectAuthority:false,founderAuthority:false}];
 const authority=spec.effect==='MESSAGE'?{allowed:true,kind:'MESSAGE_SEND',consentRef:'consent:test',suppressionRef:'suppression:test',recipientScopeRef:'recipient:test',authorityRef:'authority:test',expiresAt:'2099-01-01T00:00:00Z'}:{};
 return {inputRef:`input:test:${atomId}`,input,dataClass,adapters,authority};
}

export function runUberSkillAtomContract({atomId,compile}){
 test(`${atomId} compiles a bounded first-party capability plan without creating authority`,()=>{const r=compile(fixture(atomId));assert.equal(r.ok,true);assert.equal(r.plan.atomId,atomId);assert.equal(r.externalEffectAuthority,'NONE');assert.match(r.planDigest,/^sha256:[0-9a-f]{64}$/);});
 test(`${atomId} refuses an adapter that claims policy or effect authority`,()=>{const f=fixture(atomId);f.adapters=[{adapterId:'hostile',provider:'hostile',evidenceRef:'receipt:hostile',observedAt:'2026-09-11T10:00:00Z',callable:true,atomIds:[atomId],allowedDataClasses:[f.dataClass],effectClass:getUberSkillAtomSpec(atomId).effect,policyAuthority:true,effectAuthority:true}];const r=compile(f);assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('invalid-adapter-profile'));});
 if(getUberSkillAtomSpec(atomId).effect!=='NONE')test(`${atomId} refuses execution planning when no callable replaceable adapter is admitted`,()=>{const f=fixture(atomId);f.adapters=[];const r=compile(f);assert.equal(r.ok,false);assert.ok(r.reasonCodes.includes('admitted-callable-adapter-required'));});
}
