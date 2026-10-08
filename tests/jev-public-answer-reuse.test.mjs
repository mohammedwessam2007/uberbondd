import test from 'node:test';
import assert from 'node:assert/strict';
import {createJevPublicAnswerReuse} from '../src/jev-public-answer-reuse.mjs';

const now=Date.parse('2026-10-09T00:30:00Z');
const route={model:'typesafe/jev-1.13',provider:'openrouter',modelRevision:'r-test',
  sourceRef:'https://openrouter.ai/api/v1/models',verifiedAt:new Date(now-1000).toISOString(),
  expiresAt:new Date(now+3600000).toISOString(),inputUsdPerMillion:.042,outputUsdPerMillion:0};
const auth={evidenceRef:'owner-fixture',month:'2026-10',expiresAt:'2026-11-01T00:00:00Z'};
const scope={tenantId:'public-owner',credentialScopeId:'credential-A',
 dataClass:'PUBLIC',qualityContractHash:'a'.repeat(64),sourceDigest:'b'.repeat(64),
 freshnessClass:'DEPENDENCY_BOUND',sideEffectClass:'NONE'};
const input=(patch={})=>({scope:{...scope,...patch},state:{publicIssue:1001},
 questions:{q_001:{type:'noul',instructions:'Is route relevant?'}},inputTokenCeiling:512});
const outcome={ok:true,providerCallsPerformed:1,providerRequestId:'jev-billed-1',
 observedCostMicrousd:19,observedModelRevision:'typesafe/jev-1.13-20261009',
 upstreamProvider:'TypeSafe',proposal:{answers:{q_001:{type:'noul',noul:.67}}}};
function make(){
 let settings={};
 const store={transaction:async fn=>fn({
   transactionClient:false,
   getSettings:async()=>structuredClone(settings),
   setSetting:async(k,v)=>{settings[k]=structuredClone(v);return v}
 }),dump:()=>structuredClone(settings)};
 let time=now;
 return {store,setClock:t=>{time=t;},reuse:createJevPublicAnswerReuse({
  store,route,paidAuthorization:auth,clock:()=>time
 })};
}
test('a billed validated public answer is reproduced exactly without a provider call',async()=>{
 const {reuse}=make(),i=input();
 assert.equal((await reuse.read(i)).result,null);
 const saved=await reuse.record(i,outcome);
 assert.equal(saved.ok,true);
 const hit=await reuse.read(i);
 assert.equal(hit.ok,true);
 assert.equal(hit.result.providerCallsPerformed,0);
 assert.equal(hit.result.observedCostMicrousd,0);
 assert.equal(hit.result.originalObservedCostMicrousd,19);
 assert.equal(hit.result.providerRequestId,'jev-billed-1');
 assert.deepEqual(hit.result.proposal.answers,outcome.proposal.answers);
 assert.equal(hit.result.semanticAuthority,'NONE');
});
test('credential, tenant, source, quality and freshness must remain identical',async()=>{
 const {reuse}=make();
 await reuse.record(input(),outcome);
 for(const changed of [
  {credentialScopeId:'credential-B'}, {tenantId:'other-tenant'},
  {sourceDigest:'c'.repeat(64)},{qualityContractHash:'d'.repeat(64)},
  {freshnessClass:'LIVE'},{dataClass:'CONFIDENTIAL'}
 ]){
  assert.equal((await reuse.read(input(changed))).result,null);
 }
});
test('expired original is not silently served again',async()=>{
 const c=make();await c.reuse.record(input(),outcome);
 c.setClock(now+600001);
 const row=await c.reuse.read(input());
 assert.equal(row.ok,true);
 assert.equal(row.result,null);
 assert.equal(row.status,'JEV_PUBLIC_REUSE_EXPIRED_REVALIDATION_REQUIRED');
});
test('tampered cached decision fails closed rather than silently reusing it',async()=>{
 const c=make();
 await c.reuse.record(input(),outcome);
 const s=c.store.dump();
 const key=Object.keys(s.ubermindJevPublicAnswerReuseV1.items)[0];
 const broken=s.ubermindJevPublicAnswerReuseV1.items[key];
 broken.answers.q_001.noul=.05;
 await c.store.transaction(async tx=>tx.setSetting(
  'ubermindJevPublicAnswerReuseV1',s.ubermindJevPublicAnswerReuseV1));
 const row=await c.reuse.read(input());
 assert.equal(row.ok,false);
 assert.equal(row.providerCallsPerformed,0);
});
test('missing provider bill or ambiguous dispatch cannot create reusable authority',async()=>{
 const {reuse}=make();
 for(const bad of [
  {...outcome,providerCallsPerformed:null},
  {...outcome,providerRequestId:null},
  {...outcome,observedCostMicrousd:null}
 ])assert.equal((await reuse.record(input(),bad)).ok,false);
 assert.equal((await reuse.read(input())).result,null);
});
test('same exact response write is idempotent but a conflicting bill is rejected',async()=>{
 const {reuse}=make();
 assert.equal((await reuse.record(input(),outcome)).recorded,true);
 assert.equal((await reuse.record(input(),outcome)).recorded,false);
 const conflict=await reuse.record(input(),{...outcome,providerRequestId:'different-bill'});
 assert.equal(conflict.ok,false);
});


test('a durable claim permits one leader and blocks duplicate work across callers',async()=>{
 const {reuse,store}=make(),i=input(),owner='public-op-1';
 const first=await reuse.claim(i,owner);
 assert.equal(first.ok,true);assert.equal(first.claimed,true);
 const second=await reuse.claim(i,'public-op-2');
 assert.equal(second.ok,false);
 assert.equal(second.status,'JEV_PUBLIC_EXACT_REQUEST_ALREADY_IN_FLIGHT_OR_UNCERTAIN');
 assert.equal(second.providerCallsPerformed,0);
 assert.equal(Object.keys(store.dump().ubermindJevPublicAnswerReuseV1.pending).length,1);
 const complete=await reuse.record(i,outcome,owner);
 assert.equal(complete.ok,true);assert.equal(complete.recorded,true);
 assert.equal(Object.keys(store.dump().ubermindJevPublicAnswerReuseV1.pending).length,0);
 assert.equal((await reuse.read(i)).result.providerCallsPerformed,0);
});

test('uncertain earlier dispatch is held, not silently sent twice after restart',async()=>{
 const c=make(),i=input();
 const first=await c.reuse.claim(i,'public-op-1');
 assert.equal(first.claimed,true);
 const reboot=createJevPublicAnswerReuse({
   store:c.store,route,paidAuthorization:auth,clock:()=>now});
 const next=await reboot.claim(i,'public-op-2');
 assert.equal(next.ok,false);
 assert.equal(next.providerCallsPerformed,0);
 assert.equal((await reboot.read(i)).result,null);
});

test('only the matching owner may finalize a pending public answer',async()=>{
 const c=make(),i=input();
 await c.reuse.claim(i,'public-op-1');
 const fake=await c.reuse.record(i,outcome,'public-op-2');
 assert.equal(fake.ok,false);
 assert.equal((await c.reuse.claim(i,'public-op-3')).ok,false);
 const real=await c.reuse.record(i,outcome,'public-op-1');
 assert.equal(real.ok,true);assert.equal(real.recorded,true);
});

test('only provably uncalled owner may release a hold',async()=>{
 const c=make(),i=input();
 await c.reuse.claim(i,'public-op-1');
 const forged=await c.reuse.releaseUncalled(i,'public-op-other');
 assert.equal(forged.ok,false);
 assert.equal((await c.reuse.claim(i,'public-op-2')).ok,false);
 const release=await c.reuse.releaseUncalled(i,'public-op-1');
 assert.equal(release.ok,true);assert.equal(release.released,true);
 assert.equal((await c.reuse.claim(i,'public-op-2')).claimed,true);
});

test('confidential or live freshness tasks cannot receive a public claim',async()=>{
 const c=make();
 for(const modified of [{freshnessClass:'LIVE'},{dataClass:'CONFIDENTIAL'}]){
  const claim=await c.reuse.claim(input(modified),'public-op-1');
  assert.equal(claim.ok,true);assert.equal(claim.claimed,false);
 }
 assert.equal(c.store.dump().ubermindJevPublicAnswerReuseV1,undefined);
});
