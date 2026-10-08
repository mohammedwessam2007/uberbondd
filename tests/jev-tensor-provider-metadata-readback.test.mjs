import test from 'node:test';
import assert from 'node:assert/strict';
import {readJevTensorProviderBilling,JEV_TENSOR_METADATA_KEY} from '../scripts/jev-tensor-provider-metadata-readback.mjs';
import {JEV_TENSOR_CANARY_KEY} from '../scripts/jev-tensor-one-shot-live-canary.mjs';
const NOW=Date.parse('2026-10-08T02:00:00Z');
const ID='gen-dec-fixture-12345';
const store=(seed={})=>{
 let state=structuredClone(seed);
 return{transaction:async fn=>fn({
  getSettings:async()=>structuredClone(state),
  setSetting:async(k,v)=>{state[k]=structuredClone(v)}
 }),get:()=>state};
};
const canary=()=>({status:'JEV_TENSOR_LIVE_PROVIDER_FANOUT_CONFIRMED_SHADOW_ONLY',providerRequestId:ID,actualCostUsd:.00002});
const okay=(opts={})=>({ok:true,json:async()=>({data:{
 id:ID,model:'typesafe/jev-1.13-20260917',provider_name:'TypeSafe',
 total_cost:.00002,...opts
}})});
const input=(st,fetchImpl)=>({store:st,apiKey:'test-fixture-key-long-enough',clock:()=>NOW,fetchImpl});
test('exact independent generation metadata readback confirms original observed $0.00002 bill',async()=>{
 const s=store({[JEV_TENSOR_CANARY_KEY]:canary()});let calls=0;
 const fetchImpl=async (url,opt)=>{calls++;assert.equal(opt.method,'GET');
   assert.equal(url,'https://openrouter.ai/api/v1/generation?id='+ID);
   return okay();
 };
 const first=await readJevTensorProviderBilling(input(s,fetchImpl));
 assert.equal(first.ok,true);
 assert.equal(first.status,'JEV_TENSOR_PROVIDER_BILLING_METADATA_CONFIRMED');
 assert.equal(first.exactCostMatch,true);
 assert.equal(first.providerInferenceCallsThisBoot,0);
 assert.equal(first.providerMetadataCallsThisBoot,1);
 assert.equal(first.providerMetadataCostUsd,.00002);
 assert.equal(s.get()[JEV_TENSOR_METADATA_KEY].providerRequestId,ID);
 const second=await readJevTensorProviderBilling(input(s,fetchImpl));
 assert.equal(second.ok,true);assert.equal(second.providerMetadataCallsThisBoot,0);
 assert.equal(second.previouslyPersisted,true);assert.equal(calls,1);
});
test('provider metadata identity mismatch refuses confirmation',async()=>{
 const s=store({[JEV_TENSOR_CANARY_KEY]:canary()});
 const out=await readJevTensorProviderBilling(input(s,async()=>okay({id:'gen-dec-attacker'})));
 assert.equal(out.ok,false);
 assert.equal(out.status,'JEV_TENSOR_PROVIDER_METADATA_IDENTITY_OR_COST_REFUSED');
 assert.equal(s.get()[JEV_TENSOR_METADATA_KEY],undefined);
});
test('provider-cost mismatch preserves uncertainty and does not claim exact match',async()=>{
 const s=store({[JEV_TENSOR_CANARY_KEY]:canary()});
 const out=await readJevTensorProviderBilling(input(s,async()=>okay({total_cost:.00003})));
 assert.equal(out.ok,false);
 assert.equal(out.status,'JEV_TENSOR_PROVIDER_METADATA_COST_MISMATCH');
 assert.equal(out.exactCostMatch,false);
 assert.equal(s.get()[JEV_TENSOR_METADATA_KEY],undefined);
});
test('no original provider receipt makes no external metadata request',async()=>{
 const s=store();let calls=0;
 const out=await readJevTensorProviderBilling(input(s,async()=>{calls++;throw Error('should not call')}));
 assert.equal(out.ok,false);
 assert.equal(out.status,'JEV_TENSOR_METADATA_ORIGINAL_PROVIDER_ID_UNAVAILABLE');
 assert.equal(calls,0);
});
test('network failure is explicit and never replays original inference',async()=>{
 const s=store({[JEV_TENSOR_CANARY_KEY]:canary()});
 const out=await readJevTensorProviderBilling(input(s,async()=>{throw Error('provider metadata unavailable')}));
 assert.equal(out.ok,false);
 assert.equal(out.providerMetadataCallsThisBoot,1);
 assert.equal(out.providerInferenceCallsThisBoot,0);
 assert.equal(out.status,'JEV_TENSOR_PROVIDER_METADATA_NETWORK_UNAVAILABLE');
});
