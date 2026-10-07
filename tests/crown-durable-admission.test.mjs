import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { issueCrownAdmissionReceipt } from '../src/crown-admission.mjs';
import { persistDurableCrownAdmission,resolveDurableCrownAdmission,DURABLE_CROWN_ADMISSION_SETTING } from '../src/crown-durable-admission.mjs';

const h=x=>'sha256:'+crypto.createHash('sha256').update(String(x)).digest('hex');
const now=Date.parse('2026-10-07T00:00:00Z');
const expected={exactModelId:'anthropic/claude-opus-5.5',modelRevision:'anthropic/claude-opus-5.5-20260921',taskClassRole:'GENERAL_CROWN',routeIdentity:'openrouter:auto-provider-zdr-deny-required-parameters-v1'};
function receipt(){
 const r=issueCrownAdmissionReceipt({
  providerCallId:'gen-test',exactModelId:expected.exactModelId,modelRevision:expected.modelRevision,providerIdentity:'Amazon Bedrock',routeIdentity:expected.routeIdentity,
  taskClassRole:expected.taskClassRole,promptProgramHash:h('p'),semanticInputHash:h('i'),qualityContractHash:h('q'),sourceDependencyHashes:[h('s')],evidenceReferences:['sealed://trial/a','sealed://trial/b'],
  outputHash:h('o'),timestamp:new Date(now-1000).toISOString(),expiresAt:new Date(now+3600000).toISOString(),budgetAuthorizationRef:'owner-oct',
  costReceiptRef:'openrouter-generation://gen-test',modelCallabilityReceiptRef:'openrouter-generation://gen-test',revalidationPolicy:'expiry',
  actualCostMicrousd:1000,sideEffectAuthority:'NONE',providerBillObserved:true,modelIdentityVerified:true,modelCallabilityVerified:true,tournamentEvidenceVerified:true,roleTournamentEvidenceRef:'tour',authorizationStatus:'AUTHORIZED_FOR_THIS_CALL'
 });
 assert.equal(r.ok,true);return r.receipt;
}
function store(seed={}){
 let settings=structuredClone(seed);
 return {get:()=>settings,transaction:async fn=>fn({getSettings:async()=>structuredClone(settings),setSetting:async(k,v)=>{settings={...settings,[k]:structuredClone(v)};}})};
}

test('verified Crown admission persists and resolves from durable canon',async()=>{
 const s=store(),r=receipt();
 const saved=await persistDurableCrownAdmission(s,r,{expected,sourceAttemptKey:'infinite_opus_crown_resume_20261002_r3',now});
 assert.equal(saved.ok,true);assert.equal(s.get()[DURABLE_CROWN_ADMISSION_SETTING].receiptHash,r.receiptHash);
 const resolved=await resolveDurableCrownAdmission(s,{expected,now:now+1});
 assert.equal(resolved.ok,true);assert.equal(resolved.source,'DURABLE_CANON');assert.equal(resolved.receipt.receiptHash,r.receiptHash);
});

test('forged durable receipt never becomes Crown authority',async()=>{
 const r=receipt(),s=store({[DURABLE_CROWN_ADMISSION_SETTING]:{receipt:{...r,exactModelId:'other/model'}}});
 const resolved=await resolveDurableCrownAdmission(s,{expected,now});
 assert.equal(resolved.ok,false);assert.equal(resolved.receipt,null);
});

test('completed exact sealed attempt is a recoverable durable fallback',async()=>{
 const r=receipt(),s=store({infinite_opus_crown_resume_20261002_r3:{status:'COMPLETE',crownAdmission:r}});
 const resolved=await resolveDurableCrownAdmission(s,{expected,now});
 assert.equal(resolved.ok,true);assert.equal(resolved.source,'SEALED_ATTEMPT');
});
