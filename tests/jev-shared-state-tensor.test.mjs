import test from 'node:test';
import assert from 'node:assert/strict';
import {compileJevSharedStateTensor,executeGovernedJevTensor,JEV_TENSOR_SCHEMA} from '../src/jev-shared-state-tensor.mjs';

const H='a'.repeat(64);
const scope=(o={})=>({tenantId:'owner',credentialScopeId:'openrouter-key-1',
  dataClass:'PUBLIC',qualityContractHash:H,sourceDigest:H,
  freshnessClass:'DEPENDENCY_BOUND',sideEffectClass:'NONE',...o});
const q=(instructions='Is this an important observation?')=>({type:'noul',instructions});
const row=(requestId='r1',extra={})=>({requestId,state:{source:'public snapshot',turn:1},
  scope:scope(),questions:{novelty:q()},...extra});
const fixture=(n=12)=>Array.from({length:n},(_,i)=>row('r'+i,{questions:{['k'+i]:q()}}));

test('shared state 20 decision questions compiles into one distinct-ID safe Jev request',()=>{
 const p=compileJevSharedStateTensor({batchId:'b1',requests:fixture(20)});
 assert.equal(p.ok,true);assert.equal(p.schemaVersion,JEV_TENSOR_SCHEMA);
 assert.equal(p.groupCount,1);assert.equal(p.originalQuestionCount,20);
 assert.equal(p.potentialRequestReduction,19);
 assert.equal(p.providerCallsPerformed,0);assert.equal(p.spendAuthorized,false);
 assert.equal(p.crownSuppressionAuthority,'NONE');
 assert.equal(Object.keys(p.groups[0].questions).length,20);
 assert.equal(new Set(p.groups[0].mapping.map(x=>x.questionId)).size,20);
});
test('different tenants, credential scopes and freshness separate calls',()=>{
 const p=compileJevSharedStateTensor({batchId:'separated',requests:[
  row('a'),row('b',{scope:scope({tenantId:'other'})}),
  row('c',{scope:scope({credentialScopeId:'another'})}),
  row('d',{scope:scope({freshnessClass:'LIVE'})})
 ]});
 assert.equal(p.groupCount,4);
});
test('different state values cannot share a tensor',()=>{
 const p=compileJevSharedStateTensor({batchId:'state',requests:[
  row('a'),row('b',{state:{source:'public snapshot',turn:2}})
 ]});
 assert.equal(p.groupCount,2);
});
test('129 questions split at 128 without group ID collision or dropped rows',()=>{
 const p=compileJevSharedStateTensor({batchId:'split',requests:fixture(129)});
 assert.equal(p.ok,true);assert.equal(p.groupCount,2);
 assert.equal(p.groups[0].mapping.length,128);assert.equal(p.groups[1].mapping.length,1);
 assert.notEqual(p.groups[0].operationId,p.groups[1].operationId);
 assert.equal(p.groups.flatMap(g=>g.mapping).length,129);
});
test('duplicate request IDs fail closed',()=>{
 assert.equal(compileJevSharedStateTensor({batchId:'dupe',requests:[row('a'),row('a')]}).ok,false);
});
test('malformed typed questions, arbitrary criteria and invented state fail closed',()=>{
 for(const questions of [{z:{type:'Choice',instructions:'wrong'}},
   {bad:{type:'choice',instructions:'route',criteria:{only:'one'}}},
   {bad:{type:'score',instructions:'score',criteria:['only']}}]){
   assert.equal(compileJevSharedStateTensor({batchId:'bad',requests:[row('x',{questions})]}).ok,false);
 }
 assert.equal(compileJevSharedStateTensor({batchId:'bad',requests:[row('x',{state:null})]}).ok,false);
});
test('oversized one-question state cannot under-reserve tokens',()=>{
 const p=compileJevSharedStateTensor({batchId:'huge',requests:[
  row('large',{state:{body:'a'.repeat(35000)}})
 ]});
 assert.equal(p.ok,false);assert.equal(p.reason,'single-question-exceeds-jev-context');
});
test('undisclosed data class, authority widening, and repeated request IDs rejected',()=>{
 assert.equal(compileJevSharedStateTensor({batchId:'bad',requests:[row('x',{scope:scope({dataClass:'SECRET'})})]}).ok,false);
 assert.equal(compileJevSharedStateTensor({batchId:'bad',requests:[row('x',{scope:scope({sideEffectClass:'SEND_EMAIL'})})]}).ok,false);
});
test('real dispatch blocked for private state even when planning was allowed',async()=>{
 let called=0;
 const plan=compileJevSharedStateTensor({batchId:'private',requests:[row('x',{scope:scope({dataClass:'CONFIDENTIAL'})})]});
 assert.equal(plan.ok,true);
 const out=await executeGovernedJevTensor({plan,executeDecision:async()=>{called++}});
 assert.equal(out.ok,false);assert.equal(out.status,'JEV_TENSOR_GROUP_INTEGRITY_REFUSED');
 assert.equal(called,0);
});
test('total reserved ceiling fails before any provider crossing',async()=>{
 let calls=0;
 const plan=compileJevSharedStateTensor({batchId:'ceiling',requests:fixture(129)});
 const out=await executeGovernedJevTensor({plan,maximumTotalSpendUsd:.001,
    maximumPerGroupSpendUsd:.001,executeDecision:async()=>{calls++}});
 assert.equal(out.ok,false);assert.equal(out.status,'JEV_TENSOR_TOTAL_RESERVATION_EXCEEDS_BOUND');
 assert.equal(calls,0);
});
test('valid one-call mock maps 3 answers back to exact original identities',async()=>{
 let calls=0;
 const plan=compileJevSharedStateTensor({batchId:'success',requests:fixture(3)});
 const out=await executeGovernedJevTensor({plan,executeDecision:async params=>{
   calls++;assert.equal(params.inputTokenCeiling,plan.groups[0].inputTokenCeiling);
   return {ok:true,status:'PAID_PROPOSAL_RECEIVED_NOT_SEMANTIC_AUTHORITY',
     providerCallsPerformed:1,providerRequestId:'gen-fixture',
     observedCostMicrousd:2,
     proposal:{answers:Object.fromEntries(
       Object.keys(params.questions).map(k=>[k,{type:'noul',noul:0.75}]))}};
 }});
 assert.equal(out.ok,true);assert.equal(calls,1);assert.equal(out.answers.length,3);
 assert.deepEqual(out.answers.map(x=>x.requestId),['r0','r1','r2']);
 assert.equal(out.observedCostMicrousd,2);
 assert.equal(out.semanticAuthority,'NONE');assert.equal(out.crownSuppressionAuthority,'NONE');
 assert.equal(out.savingsEvidence,'NO_MATCHED_COUNTERFACTUAL_OBSERVED');
});
test('forged tensor mapping fails before network',async()=>{
 const plan=compileJevSharedStateTensor({batchId:'mapping',requests:fixture(3)});
 plan.groups[0].mapping[0].requestId='attacker';
 let n=0;
 const out=await executeGovernedJevTensor({plan,executeDecision:async()=>{n++}});
 assert.equal(out.ok,false);assert.equal(out.status,'JEV_TENSOR_GROUP_INTEGRITY_REFUSED');
 assert.equal(n,0);
});
test('missing provider answers never become valid observed decisions',async()=>{
 const plan=compileJevSharedStateTensor({batchId:'missing',requests:fixture(2)});
 let n=0;
 const out=await executeGovernedJevTensor({plan,executeDecision:async()=>{n++;return{
   ok:true,providerCallsPerformed:1,observedCostMicrousd:2,proposal:{answers:{q_001:{type:'noul',noul:0.2}}}}}});
 assert.equal(out.ok,false);assert.equal(out.status,'JEV_TENSOR_ANSWER_COMPLETENESS_REFUSED');
 assert.equal(n,1);
});
test('uncertain dispatch never retries and count remains unknown',async()=>{
 const plan=compileJevSharedStateTensor({batchId:'unknown',requests:fixture(1)});
 let n=0;
 const out=await executeGovernedJevTensor({plan,executeDecision:async()=>{n++;throw Error('network unknown')}});
 assert.equal(n,1);assert.equal(out.ok,false);
 assert.equal(out.providerCallsPerformed,null);
 assert.equal(out.automaticRetryAuthorized,false);
});
