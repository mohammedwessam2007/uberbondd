import test from 'node:test';
import assert from 'node:assert/strict';
import {compileJevSharedStateTensor,executeGovernedJevTensor} from '../src/jev-shared-state-tensor.mjs';

const SHA='a'.repeat(64);
const scope={tenantId:'owner',credentialScopeId:'public-credential',
 dataClass:'PUBLIC',qualityContractHash:SHA,sourceDigest:SHA,
 freshnessClass:'IMMUTABLE',sideEffectClass:'NONE'};
const input=(count)=>Array.from({length:count},(_,i)=>({
 requestId:'request-'+i,scope,state:{publicFact: 'version-'+i},
 questions:{decision:{type:'noul',instructions:'Is this item ready for source review?'}}
}));
const answers={q_001:{type:'noul',noul:.81}};
const lookup=async({state})=>({ok:true,
 result:state.publicFact==='version-31'?null:{
 ok:true,status:'JEV_PUBLIC_EXACT_PRIOR_ANSWER_REUSED',
 providerCallsPerformed:0,observedCostMicrousd:0,
 providerRequestId:'previous-legitimate-provider-receipt',
 proposal:{answers},semanticAuthority:'NONE',crownSuppressionAuthority:'NONE'
 }});
test('32 actual distinct states with 31 paid-prior receipts require only one new budget reservation',async()=>{
 const plan=compileJevSharedStateTensor({batchId:'verified-public-32',requests:input(32)});
 assert.equal(plan.ok,true);assert.equal(plan.groupCount,32);
 let providerCalls=0,cacheChecks=0;
 const out=await executeGovernedJevTensor({
   plan,maximumTotalSpendUsd:.001,maximumPerGroupSpendUsd:.001,
   lookupValidatedPublicAnswer:async payload=>{cacheChecks++;return lookup(payload);},
   executeDecision:async payload=>{
    providerCalls++;
    assert.equal(payload.state.publicFact,'version-31');
    return {ok:true,status:'PAID_PROPOSAL_RECEIVED_NOT_SEMANTIC_AUTHORITY',
     providerCallsPerformed:1,observedCostMicrousd:19,
     providerRequestId:'new-paid-provider-receipt',proposal:{answers}};
   }
 });
 assert.equal(out.ok,true);
 assert.equal(providerCalls,1);
 assert.equal(out.providerCallsPerformed,1);
 assert.equal(out.observedCostMicrousd,19);
 assert.equal(out.answers.length,32);
 assert.equal(out.exactPriorAnswerGroupsReused,31);
 assert.equal(out.exactPriorQuestionAnswersRestored,31);
 assert.equal(out.freshProviderGroupReservations,1);
 assert.equal(out.totalMaxSpendMicrousd,1000);
 assert.equal(out.independentlyAuditedEconomicMultiplier,null);
 assert.ok(cacheChecks>=64);
 assert.equal(out.crownSuppressionAuthority,'NONE');
 assert.equal(out.savingsEvidence,'NO_MATCHED_COUNTERFACTUAL_OBSERVED');
});
test('all-new 6-group work refuses a one-group limit before ANY provider dispatch',async()=>{
 const plan=compileJevSharedStateTensor({batchId:'all-new-six',requests:input(6)});
 let calls=0;
 const out=await executeGovernedJevTensor({plan,
  maximumTotalSpendUsd:.001,maximumPerGroupSpendUsd:.001,
  lookupValidatedPublicAnswer:async()=>({ok:true,result:null}),
  executeDecision:async()=>{calls++;throw Error('should never dispatch');}
 });
 assert.equal(out.ok,false);
 assert.equal(out.status,'JEV_TENSOR_TOTAL_RESERVATION_EXCEEDS_BOUND');
 assert.equal(out.providerCallsPerformed,0);
 assert.equal(calls,0);
});
test('full cache-backed 32-group work is valid with one-group spend ceiling and no provider calls',async()=>{
 const plan=compileJevSharedStateTensor({batchId:'all-previously-billed',requests:input(32)});
 let calls=0;
 const out=await executeGovernedJevTensor({
  plan,maximumTotalSpendUsd:.001,maximumPerGroupSpendUsd:.001,
  lookupValidatedPublicAnswer:async()=>({
   ok:true,result:{ok:true,providerCallsPerformed:0,observedCostMicrousd:0,
    providerRequestId:'genuine-prior-receipt',proposal:{answers}}
  }),
  executeDecision:async()=>{calls++;throw Error('unexpected provider call');}
 });
 assert.equal(out.ok,true);assert.equal(out.providerCallsPerformed,0);
 assert.equal(out.observedCostMicrousd,0);
 assert.equal(out.exactPriorAnswerGroupsReused,32);
 assert.equal(out.exactPriorQuestionAnswersRestored,32);
 assert.equal(out.freshProviderGroupReservations,0);
 assert.equal(calls,0);
});
test('poisoned or failed cache preflight refuses before any paid crossing',async()=>{
 const plan=compileJevSharedStateTensor({batchId:'unsafe-cache',requests:input(3)});
 let paid=0;
 const out=await executeGovernedJevTensor({
  plan,maximumTotalSpendUsd:.001,maximumPerGroupSpendUsd:.001,
  lookupValidatedPublicAnswer:async()=>({ok:false,status:'INTEGRITY_FAILED'}),
  executeDecision:async()=>{paid++;}
 });
 assert.equal(out.ok,false);
 assert.equal(out.status,'JEV_TENSOR_BUDGET_PREFLIGHT_CACHE_REFUSED');
 assert.equal(out.providerCallsPerformed,0);assert.equal(paid,0);
});
test('cache disappearing after preflight cannot overrun reserved ceiling',async()=>{
 const plan=compileJevSharedStateTensor({batchId:'changing-cache',requests:input(2)});
 let calls=0;
 let cacheReads=0;
 const out=await executeGovernedJevTensor({
  plan,maximumTotalSpendUsd:.001,maximumPerGroupSpendUsd:.001,
  lookupValidatedPublicAnswer:async()=>{
    cacheReads++;
    return {ok:true,result:cacheReads===1?{
      ok:true,providerCallsPerformed:0,observedCostMicrousd:0,
      providerRequestId:'prior',proposal:{answers}
    }:null};
  },
  executeDecision:async()=>{calls++;return {
   ok:true,providerCallsPerformed:1,observedCostMicrousd:2,
   providerRequestId:'first',proposal:{answers}
  }}
 });
 assert.equal(out.ok,false);
 assert.equal(out.status,'JEV_TENSOR_TOTAL_RESERVATION_EXCEEDS_BOUND');
 assert.equal(calls,1);
 assert.equal(out.providerCallsPerformed,1);
});
