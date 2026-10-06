import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createInfiniteOpusRuntime,INFINITE_OPUS_TASK_SCHEMA} from '../src/infinite-opus-native-runtime.mjs';
import {semanticHash} from '../src/semantic-closure-kernel.mjs';

const h=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
const hj=x=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const now=Date.parse('2026-09-30T20:00:00Z');

function store(){
 let settings={};
 return {transaction:async fn=>fn({transactionClient:false,getSettings:async()=>structuredClone(settings),setSetting:async(k,v)=>{settings={...settings,[k]:structuredClone(v)};}})};
}
const context={scope:'ECON_TEST',crownRevision:'opus-5.5-r1',qualityContractHash:h('quality'),sourceHashes:{rules:h('rules')},invalidators:{drift:false},requiredClaimIds:['decision'],authorizedProgramHash:h('program')};
function bundle(){
 const domain=[{state:'A'},{state:'B'}];
 const observations=domain.map((input,i)=>{const decision={result:i?'B':'A'};const o={observationId:'obs-'+i,semanticAuthority:'CURRENT_TASK_CLASS_CROWN',exactModelId:'anthropic/claude-opus-5.5',taskClass:'ECON_DECISION',qualityContractHash:context.qualityContractHash,crownRevision:context.crownRevision,input,inputHash:semanticHash(input),decision,decisionHash:semanticHash(decision),providerReceiptRef:'provider://obs-'+i};return o;});
 return {domain,observations,observationTrustPins:Object.fromEntries(observations.map(o=>[o.observationId,semanticHash(o)])),taskClass:'ECON_DECISION',qualityContractHash:context.qualityContractHash,relevantKeys:['state'],crownRevision:context.crownRevision,sourceDependencies:context.sourceHashes,invalidators:context.invalidators,evidenceRef:'proof://df',expiresAt:'2026-10-01T00:00:00Z'};
}
const task={schemaVersion:INFINITE_OPUS_TASK_SCHEMA,taskId:'econ-task-1',taskClass:'ECON_DECISION',stakes:'KNOWN_LOW',sideEffectClass:'NONE',payload:{state:'B'},obligation:{kind:'ECON_DECISION'}};
function directReference(){
 return {model:'anthropic/claude-opus-5.5',providerRoute:'openrouter:anthropic/claude-opus-5.5:batch',priceEvidenceRef:'price://2026-09-30',counterfactualOptimizationEvidenceRef:'route://fair',
 freshInputTokens:1000,cachedInputTokens:0,outputTokens:20,inputUsdPerMillion:2,cacheReadUsdPerMillion:.2,outputUsdPerMillion:10,batchMultiplier:1,providerPriceMultiplier:1,platformFeeRate:0,identicalRequest:false,responseCacheEligible:false,
 cheapestLegitimateRouteVerified:true,batchEconomicsConsidered:true,promptCacheEconomicsConsidered:true,responseCacheEconomicsConsidered:true,retryEconomicsConsidered:true,promptHash:'sha256:'+h('prompt'),matchedOutputHash:'sha256:'+h('output'),tokenizerReceiptRef:'tokenizer://verified',tokenizerHash:'sha256:'+h('tokenizer')};
}

test('real-task reference vault + E3 hit + observed costs closes a finite receipt-grade multiplier',async()=>{
 const s=store(),rt=createInfiniteOpusRuntime({store:s,clock:()=>now,contextLoader:async()=>context});
 const campaign=await rt.createCognitiveCapitalCampaign({campaignId:'real-econ-1',requiredCostClasses:['RUNTIME_COMPUTE']});assert.equal(campaign.ok,true);
 const admitted=await rt.admitExhaustiveDecisionFranchise(bundle());assert.equal(admitted.ok,true);
 const ref=directReference(),contract={taskId:task.taskId,taskHash:semanticHash(task),taskClass:task.taskClass,qualityContractHash:context.qualityContractHash,directReference:ref,referenceContractHash:hj(ref),evidenceRef:'counterfactual://verified',expiresAt:'2026-10-01T00:00:00Z'};
 assert.equal((await rt.admitReferenceContract(contract)).ok,true);
 const out=await rt.execute(task);assert.equal(out.ok,true);assert.equal(out.providerCallsPerformed,0);
 assert.equal((await rt.appendCognitiveCapitalCost({campaignId:'real-econ-1',receipt:{receiptId:'runtime-meter-1',assetId:admitted.franchiseId,costClass:'RUNTIME_COMPUTE',actualMicrousd:100,basis:'OBSERVED_RUNTIME_METER',evidenceRef:'meter://observed',observedAt:'2026-09-30T20:00:00Z'}})).ok,true);
 const audit=await rt.closeCognitiveCapitalCampaign({campaignId:'real-econ-1',closureEvidenceRef:'audit://closed'});
 assert.equal(audit.ok,true);assert.equal(audit.status,'COGNITIVE_CAPITAL_ECONOMICS_AUDITED');assert.ok(audit.referenceCompressionFactor>1);assert.equal(audit.certifiedExecutions,1);
});

test('tampered reference contract cannot enter the durable vault',async()=>{
 const rt=createInfiniteOpusRuntime({store:store(),clock:()=>now,contextLoader:async()=>context});
 const ref=directReference(),bad={taskId:task.taskId,taskHash:semanticHash(task),taskClass:task.taskClass,qualityContractHash:context.qualityContractHash,directReference:{...ref,outputTokens:999},referenceContractHash:hj(ref),evidenceRef:'counterfactual://verified',expiresAt:'2026-10-01T00:00:00Z'};
 const out=await rt.admitReferenceContract(bad);assert.equal(out.ok,false);assert.ok(out.reasons.includes('reference-contract-hash-mismatch'));
});

test('failed zero-denominator economics audit does not seal campaign',async()=>{
 const rt=createInfiniteOpusRuntime({store:store(),clock:()=>now,contextLoader:async()=>context});
 await rt.createCognitiveCapitalCampaign({campaignId:'zero',requiredCostClasses:['RUNTIME_COMPUTE']});
 await rt.appendCognitiveCapitalCost({campaignId:'zero',receipt:{receiptId:'zero-meter',assetId:'a',costClass:'RUNTIME_COMPUTE',actualMicrousd:0,basis:'OBSERVED_ZERO_COST',evidenceRef:'meter://zero',observedAt:'2026-09-30T20:00:00Z'}});
 const out=await rt.closeCognitiveCapitalCampaign({campaignId:'zero',closureEvidenceRef:'audit://attempt'});
 assert.equal(out.ok,false);assert.equal(out.status,'COGNITIVE_CAPITAL_CAMPAIGN_AUDIT_BLOCKED');
 const rows=await rt.listCognitiveCapitalCampaigns();assert.equal(rows.campaigns.find(x=>x.campaignId==='zero').closed,false);
});
