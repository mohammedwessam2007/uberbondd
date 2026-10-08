import test from 'node:test';
import assert from 'node:assert/strict';
import {runJevTensorOneShotCanary,JEV_TENSOR_CANARY_KEY,JEV_TENSOR_SYNTHETIC_CANARY_REQUESTS} from '../scripts/jev-tensor-one-shot-live-canary.mjs';
import {compileJevSharedStateTensor} from '../src/jev-shared-state-tensor.mjs';

const NOW=Date.parse('2026-10-08T01:00:00Z');
const auth={evidenceRef:'fixture://signed-prior-authorization',month:'2026-10',
  expiresAt:'2026-11-01T00:00:00Z',maxMonthlyMicrousd:20_000_000};
const key='fixture-key-long-enough-to-authorize-test';
const mkStore=()=>{
 let state={};
 return{transaction:async fn=>fn({
  getSettings:async()=>structuredClone(state),
  setSetting:async(k,v)=>{state[k]=structuredClone(v)}
 }),state:()=>state};
};
const plan=()=>compileJevSharedStateTensor({batchId:'jev-tensor-once-20261008',requests:JEV_TENSOR_SYNTHETIC_CANARY_REQUESTS});
const answers=()=>[
 {requestId:'jev-tensor-one-shot-consumer-a',questionId:'route',answer:{type:'choice',choice:'exact',confidence:.9}},
 {requestId:'jev-tensor-one-shot-consumer-a',questionId:'review',answer:{type:'noul',noul:.2}},
 {requestId:'jev-tensor-one-shot-consumer-b',questionId:'route',answer:{type:'choice',choice:'exact',confidence:.9}},
 {requestId:'jev-tensor-one-shot-consumer-b',questionId:'hard_reasoning',answer:{type:'score',score:0,confidence:.85}}
];
const factory=(handle)=>()=>({compileDecisionTensor:()=>plan(),executeDecisionTensor:handle});
const input=(store,serviceFactory,more={})=>({store,serviceFactory,clock:()=>NOW,paidAuthorization:auth,apiKey:key,marketSnapshot:{},fetchImpl:async()=>{throw Error('provider test unexpectedly crossed network')},...more});

test('one shared public state packs four original questions into three unique ones',()=>{
 const compiled=plan();assert.equal(compiled.ok,true);
 assert.equal(compiled.groupCount,1);assert.equal(compiled.originalQuestionCount,4);
 assert.equal(compiled.uniqueQuestionCount,3);
 assert.equal(compiled.groups[0].mapping.length,4);
});
test('successful synthetic provider response proves mapped answers and observed spend with one request',async()=>{
 const store=mkStore();let calls=0;
 const serviceFactory=factory(async()=>{calls++;return {
  ok:true,providerCallsPerformed:1,observedCostMicrousd:19,
  results:[{providerRequestId:'gen-dec-synthetic-test',providerCallsPerformed:1}],
  answers:answers()
 }});
 const receipt=await runJevTensorOneShotCanary(input(store,serviceFactory));
 assert.equal(receipt.ok,true);
 assert.equal(receipt.status,'JEV_TENSOR_LIVE_PROVIDER_FANOUT_CONFIRMED_SHADOW_ONLY');
 assert.equal(receipt.providerCallsPerformed,1);
 assert.equal(receipt.actualCostUsd,.000019);
 assert.equal(receipt.returnedAnswerCount,4);
 assert.equal(receipt.exactDuplicateAnswerMatched,true);
 assert.equal(receipt.semanticAuthority,'NONE');
 assert.equal(calls,1);
 const second=await runJevTensorOneShotCanary(input(store,serviceFactory));
 assert.equal(second.ok,true);assert.equal(calls,1);
 assert.equal(second.providerCallsPerformedThisBoot,0);
 assert.equal(second.previouslyPersisted,true);
});
test('uncertain provider crossing claims once and is never silently replayed',async()=>{
 const store=mkStore();let calls=0;
 const factoryUncertain=factory(async()=>{calls++;throw Error('simulated network ambiguity')});
 const first=await runJevTensorOneShotCanary(input(store,factoryUncertain));
 assert.equal(first.ok,false);
 assert.equal(first.status,'JEV_TENSOR_CANARY_DISPATCH_UNCERTAIN_NO_RETRY');
 assert.equal(first.providerCallsPerformed,null);
 assert.equal(calls,1);
 const second=await runJevTensorOneShotCanary(input(store,factoryUncertain));
 assert.equal(second.ok,false);assert.equal(calls,1);
 assert.equal(store.state()[JEV_TENSOR_CANARY_KEY].status,'JEV_TENSOR_CANARY_DISPATCH_UNCERTAIN_NO_RETRY');
});
test('partial/mismatched provider response cannot become confirmed',async()=>{
 const store=mkStore(),provider=factory(async()=>({
  ok:true,providerCallsPerformed:1,observedCostMicrousd:19,
  results:[{providerRequestId:'gen-dec-synthetic-test'}],
  answers:answers().slice(0,3)
 }));
 const rec=await runJevTensorOneShotCanary(input(store,provider));
 assert.equal(rec.ok,false);
 assert.equal(rec.status,'JEV_TENSOR_CANARY_RECONCILIATION_REQUIRED_NO_RETRY');
 assert.equal(rec.returnedAnswerCount,3);
});
test('expired or absent paid permission refuses without writing a dispatch claim',async()=>{
 const store=mkStore();let calls=0;
 const provider=factory(async()=>{calls++;throw Error('must never call')});
 const rec=await runJevTensorOneShotCanary(input(store,provider,{paidAuthorization:{...auth,expiresAt:'2026-10-07T00:00:00Z'}}));
 assert.equal(rec.ok,false);
 assert.equal(rec.status,'JEV_TENSOR_CANARY_NOT_AUTHORIZED_NO_DISPATCH');
 assert.equal(rec.providerCallsPerformed,0);
 assert.equal(store.state()[JEV_TENSOR_CANARY_KEY],undefined);
 assert.equal(calls,0);
});
