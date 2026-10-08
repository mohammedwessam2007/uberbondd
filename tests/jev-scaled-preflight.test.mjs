import test from 'node:test';
import assert from 'node:assert/strict';
import {compileScaledJevPreflight,expandScaledJevAnswers,executeScaledJevUnderBudget} from '../src/jev-scaled-preflight.mjs';
import {compileJevSharedStateTensor} from '../src/jev-shared-state-tensor.mjs';

const SHA='a'.repeat(64);
const scope=(tenantId='owner')=>({
 tenantId,credentialScopeId:'one-credential',dataClass:'PUBLIC',
 qualityContractHash:SHA,sourceDigest:SHA,
 freshnessClass:'IMMUTABLE',sideEffectClass:'NONE'
});
const question={type:'noul',instructions:'Is this same bounded public statement uncertain?'};
const row=(i,options={})=>({
 requestId:'consumer-'+i,
 state:{kind:'PUBLIC_FIXTURE',snapshot:1},
 scope:scope(),
 questions:{ask:question},...options
});
const makeRows=n=>Array.from({length:n},(_,i)=>row(i));
const providerResults=p=>p.plans.map(chunk=>({
 ok:true,status:'JEV_TENSOR_ADVISORY_DECISIONS_OBSERVED',
 providerCallsPerformed:0,observedCostMicrousd:0,
 answers:chunk.requests.map(r=>({
   requestId:r.requestId,questionId:'v',
   answer:{type:'noul',noul:.85},semanticAuthority:'NONE'
 }))
}));

test('2048 exact public consumer questions coalesce to ONE governed typed decision with original identities',()=>{
 const rows=makeRows(2048);
 const p=compileScaledJevPreflight({batchId:'scale-proof',requests:rows});
 assert.equal(p.ok,true);
 assert.equal(p.originalRequestCount,2048);
 assert.equal(p.uniqueQuestionCount,1);
 assert.equal(p.exactRedundanciesEliminated,2047);
 assert.equal(p.requiredGovernedShardCount,1);
 assert.equal(p.plans[0].compiled.groupCount,1);
 assert.equal(p.providerCallsPerformed,0);
 assert.equal(p.paidSpendAuthorized,false);
 assert.equal(p.observedSavingsUsd,null);
 assert.equal(p.observedNewQualityHoldouts,0);
 const restored=expandScaledJevAnswers({plan:p,shardResults:providerResults(p)});
 assert.equal(restored.ok,true);
 assert.equal(restored.restoredAnswerCount,2048);
 assert.equal(new Set(restored.answers.map(a=>a.requestId)).size,2048);
 assert.equal(restored.semanticAuthority,'NONE');
});
test('different tenants cannot be merged even when the question and state match',()=>{
 const p=compileScaledJevPreflight({batchId:'separated',requests:[
  row(0),row(1,{scope:scope('another-tenant')})]});
 assert.equal(p.ok,true);
 assert.equal(p.uniqueQuestionCount,2);
 assert.equal(p.exactRedundanciesEliminated,0);
 assert.equal(p.plans[0].compiled.groupCount,2);
});
test('different source version never silently reuses a cached decision',()=>{
 const p=compileScaledJevPreflight({batchId:'versions',requests:[
  row(0),row(1,{scope:{...scope(),sourceDigest:'b'.repeat(64)}})]});
 assert.equal(p.ok,true);
 assert.equal(p.uniqueQuestionCount,2);
});
test('different question content cannot claim exact equivalence',()=>{
 const p=compileScaledJevPreflight({batchId:'diff',requests:[
  row(0),row(1,{questions:{ask:{type:'noul',instructions:'A different task?' }}})]});
 assert.equal(p.ok,true);
 assert.equal(p.uniqueQuestionCount,2);
});
test('one original request with four different typed questions remains four atoms',()=>{
 const p=compileScaledJevPreflight({batchId:'four',requests:[row(0,{
  questions:{a:question,b:{type:'noul',instructions:'Question B'},
   c:{type:'noul',instructions:'Question C'},
   d:{type:'noul',instructions:'Question D'}}
 })]});
 assert.equal(p.ok,true);
 assert.equal(p.uniqueQuestionCount,4);
 assert.equal(p.originalQuestionCount,4);
 assert.equal(expandScaledJevAnswers({plan:p,shardResults:providerResults(p)}).restoredAnswerCount,4);
});
test('more than 32 separately scoped groups split into bounded governed shards',()=>{
 const inputs=Array.from({length:90},(_,i)=>row(i,{
  scope:scope('owner-'+i)
 }));
 const p=compileScaledJevPreflight({batchId:'split',requests:inputs});
 assert.equal(p.ok,true);
 assert.ok(p.plans.length>1);
 assert.equal(p.uniqueQuestionCount,90);
 for(const part of p.plans)assert.ok(part.compiled.groupCount<=32);
 const restored=expandScaledJevAnswers({plan:p,shardResults:providerResults(p)});
 assert.equal(restored.ok,true);
 assert.equal(restored.restoredAnswerCount,90);
});
test('one altered original fanout destination invalidates hash BEFORE result expansion',()=>{
 const p=compileScaledJevPreflight({batchId:'tamper',requests:makeRows(3)});
 p.atomMappings[0].fanout[1].requestId='intruder';
 const result=expandScaledJevAnswers({plan:p,shardResults:providerResults(p)});
 assert.equal(result.ok,false);
 assert.equal(result.reason,'preflight-mapping-integrity-failed');
});
test('changing representative question after compilation invalidates hash',()=>{
 const p=compileScaledJevPreflight({batchId:'question-tamper',requests:makeRows(3)});
 p.plans[0].requests[0].questions.v.instructions='different';
 const result=expandScaledJevAnswers({plan:p,shardResults:providerResults(p)});
 assert.equal(result.ok,false);
 assert.equal(result.reason,'preflight-mapping-integrity-failed');
});
test('partial observed shard result does not yield partial consumer answers',()=>{
 const p=compileScaledJevPreflight({batchId:'partial',requests:makeRows(2)});
 const partial=providerResults(p);partial[0].answers=[];
 const result=expandScaledJevAnswers({plan:p,shardResults:partial});
 assert.equal(result.ok,false);
 assert.equal(result.reason,'missing-or-unverified-governed-shard');
});
test('private data and no scope never enter preflight',()=>{
 const a=compileScaledJevPreflight({batchId:'private',requests:[row(0,{
  scope:{...scope(),dataClass:'CONFIDENTIAL'}
 })]});
 assert.equal(a.ok,false);assert.equal(a.reason,'public-only-preflight');
 const b=compileScaledJevPreflight({batchId:'bad',requests:[row(0,{scope:null})]});
 assert.equal(b.ok,false);
});
test('duplicated original request IDs and secret-bearing state refuse',()=>{
 const a=compileScaledJevPreflight({batchId:'same-ids',requests:[row(0),row(0)]});
 assert.equal(a.ok,false);
 const b=compileScaledJevPreflight({batchId:'secret',requests:[row(0,{
   state:{secret:'sk-proj-'+'a'.repeat(45)}})]});
 assert.equal(b.ok,false);
 assert.equal(b.reason,'governed-compiler-refused');
});
test('capacity is bounded, never silently samples a huge user submission',()=>{
 const p=compileScaledJevPreflight({batchId:'over',requests:makeRows(16385)});
 assert.equal(p.ok,false);assert.equal(p.reason,'bounded-batch-required');
});

test('malformed advisory probability is blocked before mass fanout',()=>{
 const p=compileScaledJevPreflight({batchId:'out-of-range',requests:makeRows(5)});
 const forged=providerResults(p);forged[0].answers[0].answer.noul=99;
 const result=expandScaledJevAnswers({plan:p,shardResults:forged});
 assert.equal(result.ok,false);
 assert.equal(result.reason,'invalid-governed-shard-answer');
});

const fakeGovernedShard=async({batchId,requests})=>{
 const compiled=compileJevSharedStateTensor({batchId,requests});
 assert.equal(compiled.ok,true);
 return {ok:true,status:'JEV_TENSOR_ADVISORY_DECISIONS_OBSERVED',
  providerCallsPerformed:compiled.groupCount,
  observedCostMicrousd:compiled.groupCount*10,
  answers:requests.map(r=>({requestId:r.requestId,questionId:'v',
   answer:{type:'noul',noul:.85},semanticAuthority:'NONE'}))
 };
};

test('end-to-end scaled executor fans out 2048 exact public questions with one governed group',async()=>{
 let executed=0;
 const r=await executeScaledJevUnderBudget({
  batchId:'large-execution',requests:makeRows(2048),
  executeShard:async arg=>{executed++;return fakeGovernedShard(arg);}
 });
 assert.equal(r.ok,true);
 assert.equal(r.status,'JEV_SCALED_GOVERNED_ADVISORY_COMPLETE');
 assert.equal(r.originalQuestionCount,2048);
 assert.equal(r.restoredAnswerCount,2048);
 assert.equal(r.exactRedundanciesEliminated,2047);
 assert.equal(r.governedGroupCount,1);
 assert.equal(r.providerCallsPerformed,1);
 assert.equal(r.observedCostMicrousd,10);
 assert.equal(r.independentlyVerifiedSavingsUsd,null);
 assert.equal(r.generalFrontierEquivalenceProven,false);
 assert.equal(r.semanticAuthority,'NONE');
 assert.equal(executed,1);
});

test('all planned shards execute in order with one pre-reserved global budget',async()=>{
 const inputs=Array.from({length:35},(_,i)=>row(i,{scope:scope('tenant-'+i)}));
 let executed=0;
 const r=await executeScaledJevUnderBudget({
  batchId:'bounded-35-scopes',requests:inputs,
  maximumTotalSpendUsd:.005,maximumPerGroupSpendUsd:.0001,
  executeShard:async arg=>{
   executed++;
   assert.equal(arg.maximumPerGroupSpendUsd,.0001);
   return fakeGovernedShard(arg);
  }
 });
 assert.equal(r.ok,true);
 assert.ok(r.requiredGovernedShardCount>=2);
 assert.equal(r.governedGroupCount,35);
 assert.equal(r.providerCallsPerformed,35);
 assert.equal(r.observedCostMicrousd,350);
 assert.equal(r.restoredAnswerCount,35);
 assert.equal(executed,r.requiredGovernedShardCount);
});

test('51 separate authority scopes refuse at global bound BEFORE any model request',async()=>{
 const inputs=Array.from({length:51},(_,i)=>row(i,{scope:scope('tenant-'+i)}));
 let calls=0;
 const r=await executeScaledJevUnderBudget({
  batchId:'global-reservation-refusal',requests:inputs,
  maximumTotalSpendUsd:.005,maximumPerGroupSpendUsd:.0001,
  executeShard:async arg=>{calls++;return fakeGovernedShard(arg);}
 });
 assert.equal(r.ok,false);
 assert.equal(r.status,'JEV_SCALED_GLOBAL_RESERVATION_EXCEEDS_BOUND');
 assert.equal(r.providerCallsPerformed,0);
 assert.equal(calls,0);
});

test('provider error after first shard aborts entire fanout and marks cost unknown',async()=>{
 const inputs=Array.from({length:35},(_,i)=>row(i,{scope:scope('tenant-'+i)}));
 let calls=0;
 const r=await executeScaledJevUnderBudget({
  batchId:'partial-batch-unknown',requests:inputs,
  maximumTotalSpendUsd:.005,maximumPerGroupSpendUsd:.0001,
  executeShard:async arg=>{calls++;if(calls===2)throw Error('lost provider response');return fakeGovernedShard(arg);}
 });
 assert.equal(r.ok,false);
 assert.equal(r.status,'JEV_SCALED_DISPATCH_UNCERTAIN_NO_RETRY');
 assert.equal(r.automaticRetryAuthorized,false);
 assert.equal(r.providerCallsPerformed,null);
 assert.equal(r.observedCostMicrousd,null);
 assert.equal(r.completedShardCount,1);
 assert.equal(r.answers,undefined);
 assert.equal(calls,2);
});

test('tampered or missing answer in a fully returned shard never leaks partial output',async()=>{
 const r=await executeScaledJevUnderBudget({
  batchId:'forged-result',requests:makeRows(3),
  executeShard:async arg=>({
   ...await fakeGovernedShard(arg),
   answers:[{requestId:'atom-00001',questionId:'v',answer:{type:'noul',noul:15},semanticAuthority:'NONE'}]
  })
 });
 assert.equal(r.ok,false);
 assert.equal(r.status,'JEV_SCALED_FANOUT_INTEGRITY_HOLD');
 assert.equal(r.providerCallsPerformed,null);
 assert.equal(r.answers,undefined);
});

test('unsupported spend ceiling or per-group minimum refuses before even compiling work',async()=>{
 let calls=0;
 for(const args of [
  {maximumTotalSpendUsd:.1},
  {maximumPerGroupSpendUsd:.00001},
  {maximumTotalSpendUsd:.00005},
  {maximumPerGroupSpendUsd:Infinity}
 ]){
  const r=await executeScaledJevUnderBudget({
   batchId:'bad-cost',requests:[row(0)],
   executeShard:async()=>{calls++;throw Error('should not invoke');},...args
  });
  assert.equal(r.ok,false);
  assert.equal(r.status,'JEV_SCALED_EXECUTION_POLICY_REFUSED');
 }
 assert.equal(calls,0);
});
