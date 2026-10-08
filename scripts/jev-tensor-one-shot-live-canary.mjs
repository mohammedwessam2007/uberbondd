import { createGovernedJevRuntimeService } from '../src/jev-governed-runtime-service.mjs';
import { redactSecrets } from '../src/secret-patterns.mjs';

export const JEV_TENSOR_CANARY_KEY='ubermindJevTensorOneShotCanary20261008V1';
export const JEV_TENSOR_CANARY_MAX_USD=.001;
export const JEV_TENSOR_CANARY_SCHEMA='uberbond.jev-tensor-one-shot-provider-proof.v1';

const publicScope={
 tenantId:'ubermind-synthetic-only',credentialScopeId:'openrouter-oct-2026-governed',
 dataClass:'PUBLIC',qualityContractHash:'a'.repeat(64),sourceDigest:'b'.repeat(64),
 freshnessClass:'IMMUTABLE',sideEffectClass:'NONE'
};
const routeQuestion={
 type:'choice',instructions:'Which execution route is minimum sufficient for this synthetic static note?',
 criteria:{
   exact:'A verified exact rule settles the static note.',
   bounded:'A bounded semantic decision might help.',
   frontier:'Frontier generative reasoning is necessary.'
 }
};
export const JEV_TENSOR_SYNTHETIC_CANARY_REQUESTS=[
 {
  requestId:'jev-tensor-one-shot-consumer-a',
  scope:publicScope,
  state:{fixture:true,request:'Classify a synthetic public task with no external effects.',
   verified_exact_rule_available:true,customerDataIncluded:false},
  questions:{route:routeQuestion,review:{
   type:'noul',instructions:'Would independent review be useful for this synthetic task?'
  }}
 },
 {
  requestId:'jev-tensor-one-shot-consumer-b',
  scope:publicScope,
  state:{fixture:true,request:'Classify a synthetic public task with no external effects.',
   verified_exact_rule_available:true,customerDataIncluded:false},
  questions:{route:routeQuestion,hard_reasoning:{
   type:'score',instructions:'How much deep generative reasoning is required here?',
   criteria:['Routine bounded','Moderately complex','Exceptional open-ended']
  }}
 }
];

const safeView=row=>({
 ok:row?.status==='JEV_TENSOR_LIVE_PROVIDER_FANOUT_CONFIRMED_SHADOW_ONLY',
 status:row?.status??'UNKNOWN',
 observedAt:row?.observedAt??null,
 providerRequestId:row?.providerRequestId??null,
 actualCostUsd:typeof row?.actualCostUsd==='number'?row.actualCostUsd:null,
 providerCallsPerformed:Number.isSafeInteger(row?.providerCallsPerformed)?row.providerCallsPerformed:null,
 originalQuestionCount:row?.originalQuestionCount??4,
 uniqueQuestionCount:row?.uniqueQuestionCount??3,
 returnedAnswerCount:row?.returnedAnswerCount??null,
 exactDuplicateAnswerMatched:row?.exactDuplicateAnswerMatched??null,
 answerTypes:row?.answerTypes??null,
 maximumSpendUsd:JEV_TENSOR_CANARY_MAX_USD,
 paidAuthorizationPresent:row?.paidAuthorizationPresent??null,
 automaticRetryAuthorized:false,
 secretValuesExposed:false,
 semanticAuthority:'NONE',crownSuppressionAuthority:'NONE',
 externalEffectAuthority:'NONE',
 independentQualityEvidence:false,
 realMatchedSavingsObserved:false,
 generalFrontierEquivalenceProven:false,
 truthBoundary:'Only a one-shot synthetic PUBLIC exact-duplicate question fanout with one real Jev Decisions API request and provider usage-based charge. No independent semantic-quality, generalized savings, or Crown authority is minted.'
});

/** Exactly one invoice-bearing tensor canary attempt. Persist claim before
 * crossing provider boundary; unknown response or cost requires reconciliation,
 * NEVER a silent retry. Optional injected serviceFactory is for mock-only tests.
 */
export async function runJevTensorOneShotCanary({
 store,apiKey,paidAuthorization,marketSnapshot,
 serviceFactory=createGovernedJevRuntimeService,
 fetchImpl=fetch,clock=Date.now
}={}){
 if(typeof store?.transaction!=='function')throw Error('jev-tensor-canary-durable-store-required');
 const prev=await store.transaction(async tx=>(await tx.getSettings())?.[JEV_TENSOR_CANARY_KEY]??null);
 if(prev)return safeView(prev);
 const today=clock();
 if(!paidAuthorization?.evidenceRef||!Number.isFinite(Date.parse(paidAuthorization.expiresAt))||
   Date.parse(paidAuthorization.expiresAt)<=today||
   paidAuthorization.month!==new Date(today).toISOString().slice(0,7)||
   !Number.isSafeInteger(paidAuthorization.maxMonthlyMicrousd)||
   paidAuthorization.maxMonthlyMicrousd<1000||
   typeof apiKey!=='string'||apiKey.length<16)
   return safeView({status:'JEV_TENSOR_CANARY_NOT_AUTHORIZED_NO_DISPATCH',
     providerCallsPerformed:0,paidAuthorizationPresent:Boolean(paidAuthorization?.evidenceRef)});
 const service=serviceFactory({store,apiKey,paidAuthorization,marketSnapshot,fetchImpl,clock});
 const plan=service.compileDecisionTensor({batchId:'jev-tensor-once-20261008',requests:JEV_TENSOR_SYNTHETIC_CANARY_REQUESTS});
 if(!plan?.ok||plan.groupCount!==1||plan.originalQuestionCount!==4||
    plan.uniqueQuestionCount!==3||plan.groups[0].mapping.length!==4)
   return safeView({status:'JEV_TENSOR_CANARY_COMPILER_REFUSED',providerCallsPerformed:0,paidAuthorizationPresent:true});

 const claimed=await store.transaction(async tx=>{
   const prior=(await tx.getSettings())?.[JEV_TENSOR_CANARY_KEY]??null;
   if(prior)return {claimed:false,prior};
   await tx.setSetting(JEV_TENSOR_CANARY_KEY,{
     status:'CLAIMED_NO_AUTOMATIC_RETRY',claimedAt:new Date(clock()).toISOString(),
     providerCallsPerformed:null,paidAuthorizationPresent:true,automaticRetryAuthorized:false
   });
   return {claimed:true};
 });
 if(!claimed.claimed)return safeView(claimed.prior);
 let response;
 try{
   response=await service.executeDecisionTensor({
     batchId:'jev-tensor-once-20261008',requests:JEV_TENSOR_SYNTHETIC_CANARY_REQUESTS,
     maximumTotalSpendUsd:JEV_TENSOR_CANARY_MAX_USD,
     maximumPerGroupSpendUsd:JEV_TENSOR_CANARY_MAX_USD
   });
 }catch(error){
   const row={status:'JEV_TENSOR_CANARY_DISPATCH_UNCERTAIN_NO_RETRY',
     observedAt:new Date(clock()).toISOString(),reason:redactSecrets(String(error?.message??'error')).slice(0,180),
     providerCallsPerformed:null,paidAuthorizationPresent:true};
   await store.transaction(async tx=>tx.setSetting(JEV_TENSOR_CANARY_KEY,row));
   return safeView(row);
 }
 const providerCalls=response?.providerCallsPerformed;
 const cost=response?.observedCostMicrousd;
 const answers=response?.answers;
 const a=Array.isArray(answers)?answers.find(x=>x.requestId==='jev-tensor-one-shot-consumer-a'&&x.questionId==='route'):null;
 const b=Array.isArray(answers)?answers.find(x=>x.requestId==='jev-tensor-one-shot-consumer-b'&&x.questionId==='route'):null;
 const same=Boolean(a&&b&&JSON.stringify(a.answer)===JSON.stringify(b.answer));
 const id=response?.results?.[0]?.providerRequestId??null;
 const ok=response?.ok===true&&providerCalls===1&&
   Number.isSafeInteger(cost)&&cost>=0&&cost<=1000&&
   Array.isArray(answers)&&answers.length===4&&same&&
   typeof id==='string'&&id.length>5&&
   response.results.length===1;
 const row={
   status:ok?'JEV_TENSOR_LIVE_PROVIDER_FANOUT_CONFIRMED_SHADOW_ONLY':
     'JEV_TENSOR_CANARY_RECONCILIATION_REQUIRED_NO_RETRY',
   observedAt:new Date(clock()).toISOString(),
   providerRequestId:typeof id==='string'?id:null,
   providerCallsPerformed:Number.isSafeInteger(providerCalls)?providerCalls:null,
   actualCostUsd:Number.isSafeInteger(cost)?cost/1e6:null,
   originalQuestionCount:4,uniqueQuestionCount:3,
   returnedAnswerCount:Array.isArray(answers)?answers.length:null,
   exactDuplicateAnswerMatched:same,
   answerTypes:Array.isArray(answers)
     ?Object.fromEntries(answers.map(x=>[x.requestId+'/'+x.questionId,x.answer?.type??'UNKNOWN'])):null,
   paidAuthorizationPresent:true,
   automaticRetryAuthorized:false
 };
 await store.transaction(async tx=>tx.setSetting(JEV_TENSOR_CANARY_KEY,row));
 return safeView(row);
}
