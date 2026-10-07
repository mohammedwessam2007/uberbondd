import { createGovernedJevRuntimeService } from '../src/jev-governed-runtime-service.mjs';

export const JEV_LIVE_CANARY_SETTING='infiniteOpusJevLiveCanary20261007V1';
export const JEV_LIVE_CANARY_MAX_USD=.001;

const safeReceipt=row=>({
  ok:row?.status==='JEV_LIVE_PROVIDER_CALLABILITY_PROVEN_SHADOW_ONLY',
  status:row?.status??'UNKNOWN',
  observedAt:row?.observedAt??null,
  model:row?.model??'typesafe/jev-1.13',
  modelRevision:row?.modelRevision??null,
  upstreamProvider:row?.upstreamProvider??null,
  providerRequestId:row?.providerRequestId??null,
  actualCostUsd:Number.isFinite(Number(row?.actualCostUsd))?Number(row.actualCostUsd):null,
  inputTokens:Number.isFinite(Number(row?.inputTokens))?Number(row.inputTokens):null,
  outputTokens:Number.isFinite(Number(row?.outputTokens))?Number(row.outputTokens):null,
  answerTypes:row?.answerTypes??null,
  providerCallsPerformed:Number.isFinite(Number(row?.providerCallsPerformed))?Number(row.providerCallsPerformed):0,
  semanticAuthority:'NONE',
  crownSuppressionAuthority:'NONE',
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  automaticRetryAuthorized:false,
  hiddenDecisionValuesExposed:false,
  maximumSpendUsd:JEV_LIVE_CANARY_MAX_USD,
  truthBoundary:'This receipt proves only real Jev provider callability, exact observed billing and typed decision output on a synthetic non-sensitive shadow canary. It grants no semantic, Crown-suppression, customer or business-effect authority.'
});

export async function runGovernedJevLiveCanary({store,apiKey,paidAuthorization,marketSnapshot,fetchImpl=fetch,clock=Date.now}={}){
  if(!store||typeof store.transaction!=='function')throw new Error('jev-live-canary-store-required');
  const existing=await store.transaction(async tx=>(await tx.getSettings())?.[JEV_LIVE_CANARY_SETTING]??null);
  if(existing)return safeReceipt(existing);

  const service=createGovernedJevRuntimeService({store,apiKey,paidAuthorization,marketSnapshot,fetchImpl,clock});
  const claimedAt=new Date(clock()).toISOString();
  const claimed=await store.transaction(async tx=>{
    const settings=await tx.getSettings();
    const prior=settings?.[JEV_LIVE_CANARY_SETTING]??null;
    if(prior)return {claimed:false,prior};
    const row={status:'CLAIMED_NO_AUTOMATIC_RETRY',claimedAt,model:'typesafe/jev-1.13',maximumSpendUsd:JEV_LIVE_CANARY_MAX_USD,providerCallsPerformed:0,automaticRetryAuthorized:false,semanticAuthority:'NONE',crownSuppressionAuthority:'NONE'};
    await tx.setSetting(JEV_LIVE_CANARY_SETTING,row);
    return {claimed:true,prior:null};
  });
  if(!claimed.claimed)return safeReceipt(claimed.prior);

  let result;
  try{
    result=await service.executeDecision({
      operationId:'jev-live-canary-20261007-v1',
      inputTokenCeiling:512,
      maximumSpendUsd:JEV_LIVE_CANARY_MAX_USD,
      state:{task_class:'SYNTHETIC_CALLABILITY_CANARY',evidence_complete:true,exact_lane_available:false,consequence_class:'NONE',sensitive_data_present:false},
      questions:{
        route:{type:'choice',instructions:'Which minimum sufficient mechanism fits this synthetic state?',criteria:{exact:'Deterministic exact handling is enough.',bounded:'A bounded semantic judgement is useful.',frontier:'Deep generative reasoning is required.'}},
        hard_reasoning:{type:'score',instructions:'How much deep generative reasoning is required?',criteria:['routine','moderate','hard']},
        crown_necessity:{type:'noul',instructions:'Would frontier review be necessary for a high-quality answer to this synthetic state?'}
      }
    });
  }catch(error){
    const row={status:'FAILED_RECONCILIATION_REQUIRED_NO_RETRY',reason:String(error?.message||error).slice(0,220),observedAt:new Date(clock()).toISOString(),model:'typesafe/jev-1.13',providerCallsPerformed:null,automaticRetryAuthorized:false,maximumSpendUsd:JEV_LIVE_CANARY_MAX_USD,semanticAuthority:'NONE',crownSuppressionAuthority:'NONE'};
    await store.transaction(async tx=>await tx.setSetting(JEV_LIVE_CANARY_SETTING,row));
    return safeReceipt(row);
  }

  if(!result?.ok){
    const row={status:String(result?.status||'JEV_LIVE_CANARY_FAILED_NO_RETRY'),observedAt:new Date(clock()).toISOString(),model:'typesafe/jev-1.13',modelRevision:result?.observedModelRevision??null,providerRequestId:result?.providerRequestId??null,providerCallsPerformed:Number(result?.providerCallsPerformed??0),actualCostUsd:Number.isFinite(Number(result?.observedCostMicrousd))?Number(result.observedCostMicrousd)/1e6:null,automaticRetryAuthorized:false,maximumSpendUsd:JEV_LIVE_CANARY_MAX_USD,semanticAuthority:'NONE',crownSuppressionAuthority:'NONE'};
    await store.transaction(async tx=>await tx.setSetting(JEV_LIVE_CANARY_SETTING,row));
    return safeReceipt(row);
  }

  const answers=result?.proposal?.answers??{};
  const answerTypes=Object.fromEntries(Object.entries(answers).map(([key,value])=>[key,typeof value?.type==='string'?value.type:typeof value?.choice==='string'?'choice':Number.isFinite(Number(value?.score))?'score':Number.isFinite(Number(value?.noul))?'noul':'unknown']));
  const actualCostUsd=Number(result.observedCostMicrousd??0)/1e6;
  if(!Number.isFinite(actualCostUsd)||actualCostUsd<0||actualCostUsd>JEV_LIVE_CANARY_MAX_USD)throw new Error('jev-live-canary-observed-cost-outside-bound');

  const row={status:'JEV_LIVE_PROVIDER_CALLABILITY_PROVEN_SHADOW_ONLY',observedAt:new Date(clock()).toISOString(),model:'typesafe/jev-1.13',modelRevision:result.observedModelRevision??null,upstreamProvider:result.upstreamProvider??null,providerRequestId:result.providerRequestId??null,actualCostUsd,inputTokens:Number(result?.usage?.inputTokens??0),outputTokens:Number(result?.usage?.outputTokens??0),answerTypes,providerCallsPerformed:1,automaticRetryAuthorized:false,maximumSpendUsd:JEV_LIVE_CANARY_MAX_USD,semanticAuthority:'NONE',crownSuppressionAuthority:'NONE'};
  await store.transaction(async tx=>await tx.setSetting(JEV_LIVE_CANARY_SETTING,row));
  return safeReceipt(row);
}
