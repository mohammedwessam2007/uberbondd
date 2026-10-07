import crypto from 'node:crypto';
import { createInfiniteOpusRuntime } from '../src/infinite-opus-native-runtime.mjs';
import { createOpenRouterGovernedAdapter } from '../src/openrouter-governed-adapter.mjs';
import { selectCurrentPrice } from '../src/infinite-opus-market.mjs';
import { estimateCognitionCeiling } from '../src/cognition-ledger.mjs';
import { COGNITION_PERIMETER_ADMISSION } from '../src/cognition-transport-guard.mjs';
import { TYPINGMIND_HAIKU55_MODEL } from '../src/infinite-opus-typingmind-live.mjs';

export const HAIKU55_LIVE_CANARY_SETTING='infiniteOpusHaiku55LiveCanary20261007V1';
export const HAIKU55_LIVE_CANARY_MAX_USD=.001;
const FEE=.055;

const digest=value=>'sha256:'+crypto.createHash('sha256').update(String(value??'')).digest('hex');
const contentText=message=>{
  if(typeof message?.content==='string')return message.content;
  if(Array.isArray(message?.content))return message.content.map(x=>typeof x==='string'?x:String(x?.text??'')).join('');
  return '';
};
const safe=row=>({
  ok:row?.status==='HAIKU_5_5_LIVE_PROVIDER_CALLABILITY_PROVEN_SHADOW_ONLY',
  status:row?.status??'UNKNOWN',
  observedAt:row?.observedAt??null,
  model:TYPINGMIND_HAIKU55_MODEL,
  modelRevision:row?.modelRevision??null,
  upstreamProvider:row?.upstreamProvider??null,
  providerRequestId:row?.providerRequestId??null,
  actualCostUsd:Number.isFinite(Number(row?.actualCostUsd))?Number(row.actualCostUsd):null,
  inputTokens:Number.isFinite(Number(row?.inputTokens))?Number(row.inputTokens):null,
  outputTokens:Number.isFinite(Number(row?.outputTokens))?Number(row.outputTokens):null,
  outputDigest:typeof row?.outputDigest==='string'?row.outputDigest:null,
  providerCallsPerformed:Number.isFinite(Number(row?.providerCallsPerformed))?Number(row.providerCallsPerformed):0,
  semanticAuthority:'NONE',
  crownSuppressionAuthority:'NONE',
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  automaticRetryAuthorized:false,
  maximumSpendUsd:HAIKU55_LIVE_CANARY_MAX_USD,
  hiddenOutputExposed:false,
  truthBoundary:'This proves only current owner-account Haiku 5.5 callability, served model revision, provider identity and observed billing on one synthetic non-sensitive shadow call. It proves no general quality equivalence, Crown status, or future callability.'
});

export async function runGovernedHaiku55LiveCanary({
  store,apiKey,paidAuthorization,marketSnapshot,fetchImpl=fetch,clock=Date.now
}={}){
  if(!store||typeof store.transaction!=='function')throw new Error('haiku55-live-canary-store-required');
  const existing=await store.transaction(async tx=>(await tx.getSettings())?.[HAIKU55_LIVE_CANARY_SETTING]??null);
  if(existing)return safe(existing);

  let route;
  try{route=selectCurrentPrice(marketSnapshot,TYPINGMIND_HAIKU55_MODEL,clock());}
  catch{return safe({status:'HAIKU_5_5_CURRENT_FIXED_PRICE_ROUTE_REQUIRED',providerCallsPerformed:0});}

  const claimedAt=new Date(clock()).toISOString();
  const claim=await store.transaction(async tx=>{
    const settings=await tx.getSettings();
    const prior=settings?.[HAIKU55_LIVE_CANARY_SETTING]??null;
    if(prior)return {claimed:false,prior};
    const row={
      status:'CLAIMED_NO_AUTOMATIC_RETRY',claimedAt,model:TYPINGMIND_HAIKU55_MODEL,
      maximumSpendUsd:HAIKU55_LIVE_CANARY_MAX_USD,providerCallsPerformed:0,
      automaticRetryAuthorized:false,semanticAuthority:'NONE',crownSuppressionAuthority:'NONE'
    };
    await tx.setSetting(HAIKU55_LIVE_CANARY_SETTING,row);
    return {claimed:true};
  });
  if(!claim.claimed)return safe(claim.prior);

  const adapter=createOpenRouterGovernedAdapter({
    apiKeyProvider:async()=>apiKey,
    fetchImpl,
    expectedKeyLimitUsd:20,
    cognitionPerimeterAdmission:COGNITION_PERIMETER_ADMISSION
  });
  const paidExecutor=async payload=>{
    const result=await adapter.execute({
      model:TYPINGMIND_HAIKU55_MODEL,
      expectedCanonicalModel:route.modelRevision,
      messages:payload.messages,
      maxTokens:payload.maxTokens,
      providerPolicy:{data_collection:'deny',require_parameters:true,zdr:true},
      responseCache:false
    });
    if(!result?.ok)return result;
    const servedRevision=result.generationReceipt?.model??result.observedModel??null;
    if(servedRevision!==TYPINGMIND_HAIKU55_MODEL&&servedRevision!==route.modelRevision){
      return {...result,ok:false,status:'HAIKU_5_5_SERVED_REVISION_DRIFT_REFUSED'};
    }
    return {
      ...result,
      observedModel:TYPINGMIND_HAIKU55_MODEL,
      observedModelRevision:servedRevision,
      upstreamProvider:result.provider??null,
      provider:'openrouter'
    };
  };
  const runtime=createInfiniteOpusRuntime({
    store,clock,paidExecutor,paidAuthorization,routePrices:[route],platformFeeRate:FEE
  });

  const inputTokenCeiling=512,maxTokens=32;
  const estimated=estimateCognitionCeiling({
    route,inputTokens:inputTokenCeiling,maxOutputTokens:maxTokens,now:clock(),overheadRate:FEE
  });
  const ceilingMicrousd=Math.max(100,Math.ceil(estimated/100)*100);
  if(ceilingMicrousd>HAIKU55_LIVE_CANARY_MAX_USD*1e6)
    throw new Error('haiku55-canary-estimated-cost-exceeds-hard-bound');

  const taskId='haiku55-live-canary-20261007-v1';
  const callId='openrouter-haiku55-live-canary-20261007-v1';
  let result;
  try{
    const prepared=await runtime.preparePaidCall({
      callId,taskId,model:TYPINGMIND_HAIKU55_MODEL,provider:'openrouter',
      qualityClass:'Q_SHADOW_CONTROL',role:'WORKER',cacheState:'MISS_OR_UNKNOWN',ceilingMicrousd
    });
    if(!prepared.ok){
      const row={status:String(prepared.status||'HAIKU55_CANARY_PREPARE_REFUSED'),observedAt:new Date(clock()).toISOString(),
        providerCallsPerformed:0,maximumSpendUsd:HAIKU55_LIVE_CANARY_MAX_USD,automaticRetryAuthorized:false};
      await store.transaction(async tx=>await tx.setSetting(HAIKU55_LIVE_CANARY_SETTING,row));
      return safe(row);
    }
    result=await runtime.dispatchPaidCall(callId,{
      model:TYPINGMIND_HAIKU55_MODEL,
      task:{taskId,objective:'Synthetic Haiku 5.5 account callability probe',consequenceClass:'LOCAL_PREPARATION'},
      messages:[
        {role:'system',content:'This is a synthetic non-sensitive provider callability canary. Reply with a very short acknowledgement.'},
        {role:'user',content:'Acknowledge this canary in one short line.'}
      ],
      maxTokens,inputTokenCeiling,costCeilingMicrousd:ceilingMicrousd
    });
  }catch(error){
    const row={status:'FAILED_RECONCILIATION_REQUIRED_NO_RETRY',reason:String(error?.message||error).slice(0,220),
      observedAt:new Date(clock()).toISOString(),providerCallsPerformed:null,
      maximumSpendUsd:HAIKU55_LIVE_CANARY_MAX_USD,automaticRetryAuthorized:false};
    await store.transaction(async tx=>await tx.setSetting(HAIKU55_LIVE_CANARY_SETTING,row));
    return safe(row);
  }

  if(!result?.ok){
    const row={status:String(result?.status||'HAIKU55_LIVE_CANARY_FAILED_NO_RETRY'),
      observedAt:new Date(clock()).toISOString(),modelRevision:result?.observedModelRevision??null,
      upstreamProvider:result?.upstreamProvider??null,providerRequestId:result?.providerRequestId??null,
      actualCostUsd:Number.isFinite(Number(result?.observedCostMicrousd))?Number(result.observedCostMicrousd)/1e6:null,
      inputTokens:Number(result?.usage?.inputTokens??0),outputTokens:Number(result?.usage?.outputTokens??0),
      providerCallsPerformed:Number(result?.providerCallsPerformed??0),automaticRetryAuthorized:false,
      maximumSpendUsd:HAIKU55_LIVE_CANARY_MAX_USD};
    await store.transaction(async tx=>await tx.setSetting(HAIKU55_LIVE_CANARY_SETTING,row));
    return safe(row);
  }

  const actualCostUsd=Number(result.observedCostMicrousd??0)/1e6;
  if(!Number.isFinite(actualCostUsd)||actualCostUsd<0||actualCostUsd>HAIKU55_LIVE_CANARY_MAX_USD)
    throw new Error('haiku55-live-canary-observed-cost-outside-bound');
  const text=contentText(result.proposal);
  const row={
    status:'HAIKU_5_5_LIVE_PROVIDER_CALLABILITY_PROVEN_SHADOW_ONLY',
    observedAt:new Date(clock()).toISOString(),
    model:TYPINGMIND_HAIKU55_MODEL,
    modelRevision:result.observedModelRevision??null,
    upstreamProvider:result.upstreamProvider??null,
    providerRequestId:result.providerRequestId??null,
    actualCostUsd,
    inputTokens:Number(result?.usage?.inputTokens??0),
    outputTokens:Number(result?.usage?.outputTokens??0),
    outputDigest:digest(text),
    providerCallsPerformed:1,
    automaticRetryAuthorized:false,
    maximumSpendUsd:HAIKU55_LIVE_CANARY_MAX_USD,
    semanticAuthority:'NONE',
    crownSuppressionAuthority:'NONE'
  };
  await store.transaction(async tx=>await tx.setSetting(HAIKU55_LIVE_CANARY_SETTING,row));
  return safe(row);
}
