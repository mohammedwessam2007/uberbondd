import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createInfiniteOpusRuntime, INFINITE_OPUS_TASK_SCHEMA } from '../src/infinite-opus-native-runtime.mjs';
import { semanticHash } from '../src/semantic-closure-kernel.mjs';

const h=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
const hp=x=>'sha256:'+h(x);
const now=Date.parse('2026-09-30T20:00:00Z');

function makeStore(){
 let settings={};
 return {
  transaction:async fn=>fn({
    transactionClient:false,
    getSettings:async()=>structuredClone(settings),
    setSetting:async(k,v)=>{settings={...settings,[k]:structuredClone(v)};}
  })
 };
}
function context(){
 return {
  scope:'DF_RUNTIME',crownRevision:'opus-5.5-r1',qualityContractHash:h('quality'),
  sourceHashes:{policy:h('policy-state')},invalidators:{drift:false},
  requiredClaimIds:['decision'],authorizedProgramHash:h('program')
 };
}
function franchise(){
 const spec={
  schemaVersion:'uberbond.decision-franchise.spec.v1',taskClass:'ROUTE_DECISION',
  qualityContractHash:h('quality'),sideEffectClass:'NONE',relevantKeys:['risk'],
  policy:{
   domain:[{risk:'LOW'},{risk:'HIGH'}],
   rows:[{input:{risk:'LOW'},output:{route:'AUTO'}},{input:{risk:'HIGH'},output:{route:'CROWN'}}]
  }
 };
 const record={
  kind:'DECISION_FRANCHISE',status:'ACTIVE',id:'df:'+semanticHash(spec),spec,
  crownRevision:'opus-5.5-r1',sourceDependencies:{policy:h('policy-state')},invalidators:{drift:false},
  closureArtifactHash:h('artifact'),closureContextHash:h('ctx'),proofClass:'E3',
  evidenceRef:'proof://df-runtime',expiresAt:'2026-10-01T00:00:00Z',mintedAt:'2026-09-30T19:00:00Z'
 };
 return {record,trustPin:semanticHash(record)};
}
const task=i=>({
 schemaVersion:INFINITE_OPUS_TASK_SCHEMA,taskId:'task-'+i,taskClass:'ROUTE_DECISION',stakes:'LOW',
 sideEffectClass:'NONE',payload:{risk:i%2?'HIGH':'LOW',requestId:'unique-'+i},
 obligation:{kind:'ROUTE_DECISION',consumer:'consumer-'+i}
});
function referenceResolver(){
 return async ({output,executionClass})=>{
  assert.equal(executionClass,'E3');
  const directReference={
   model:'anthropic/claude-opus-5.5',priceEvidenceRef:'fixture://price',
   counterfactualOptimizationEvidenceRef:'fixture://direct-route',
   freshInputTokens:1000,cachedInputTokens:0,outputTokens:20,
   inputUsdPerMillion:4,outputUsdPerMillion:20,cacheReadUsdPerMillion:.2,
   batchMultiplier:1,providerPriceMultiplier:1,platformFeeRate:0,
   identicalRequest:false,responseCacheEligible:false,
   cheapestLegitimateRouteVerified:true,batchEconomicsConsidered:true,
   promptCacheEconomicsConsidered:true,responseCacheEconomicsConsidered:true,retryEconomicsConsidered:true,
   promptHash:hp('prompt'),matchedOutputHash:hp(JSON.stringify(output)),tokenizerHash:hp('tokenizer'),
   tokenizerReceiptRef:'fixture://tokenizer'
  };
  const referenceContractHash='sha256:'+crypto.createHash('sha256').update(JSON.stringify(directReference)).digest('hex');
  return {ok:true,directReference,referenceContractHash};
 };
}

test('native runtime closes franchise task before any model and records E3 proof economics',async()=>{
 const f=franchise();
 const runtime=createInfiniteOpusRuntime({
  store:makeStore(),clock:()=>now,contextLoader:async()=>context(),
  decisionFranchises:[f],referenceContractResolver:referenceResolver()
 });
 const out=await runtime.execute(task(1));
 assert.equal(out.ok,true);assert.equal(out.status,'CLOSED_DECISION_FRANCHISE');
 assert.deepEqual(out.decision,{route:'CROWN'});assert.equal(out.providerCallsPerformed,0);assert.equal(out.proofClass,'E3');
 assert.equal(out.executionShell,'GHOST_AGENT');assert.match(out.ghostHash,/^[a-f0-9]{64}$/);
 const econ=await runtime.provableEconomics(1000);
 assert.equal(econ.ok,true);assert.equal(econ.certifiedExecutions,1);assert.ok(econ.referenceCompressionFactor>1);
});

test('replay is idempotent and does not need model inference',async()=>{
 const f=franchise();
 const runtime=createInfiniteOpusRuntime({store:makeStore(),clock:()=>now,contextLoader:async()=>context(),decisionFranchises:[f]});
 const first=await runtime.execute(task(2));const second=await runtime.execute(task(2));
 assert.equal(first.status,'CLOSED_DECISION_FRANCHISE');assert.equal(second.status,'IDEMPOTENT_DECISION_FRANCHISE_HIT');
 assert.deepEqual(first.decision,second.decision);assert.equal(first.executionShell,'GHOST_AGENT');assert.equal(second.executionShell,'GHOST_AGENT');assert.equal(second.providerCallsPerformed,0);
});

test('two simultaneously valid franchises fail closed instead of voting',async()=>{
 const f=franchise();
 const runtime=createInfiniteOpusRuntime({store:makeStore(),clock:()=>now,contextLoader:async()=>context(),decisionFranchises:[f,structuredClone(f)]});
 const out=await runtime.execute(task(3));
 assert.equal(out.ok,false);assert.equal(out.status,'AMBIGUOUS_DECISION_FRANCHISE_PAGE_FAULT');assert.equal(out.providerCallsPerformed,0);
});

test('drifted franchise misses and falls through to frontier page fault',async()=>{
 const f=franchise();
 const drift={...context(),sourceHashes:{policy:h('changed')}};
 const runtime=createInfiniteOpusRuntime({store:makeStore(),clock:()=>now,contextLoader:async()=>drift,decisionFranchises:[f]});
 const out=await runtime.execute(task(4));
 assert.equal(out.ok,false);assert.equal(out.status,'CROWN_PAGE_FAULT_QUEUED');assert.equal(out.providerCallsPerformed,0);
});
