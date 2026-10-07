import { HAIKU55_LIVE_CANARY_SETTING } from './infinite-opus-haiku55-live-canary.mjs';

export const HAIKU55_CANARY_RECONCILIATION_SCHEMA='uberbond.haiku55-canary-reconciliation.v1';

const safe=row=>({
  ok:row?.status==='HAIKU_5_5_LIVE_PROVIDER_CALLABILITY_PROVEN_SHADOW_ONLY',
  schemaVersion:HAIKU55_CANARY_RECONCILIATION_SCHEMA,
  status:row?.status??'UNKNOWN',
  observedAt:row?.observedAt??null,
  model:'anthropic/claude-haiku-5.5',
  modelRevision:row?.modelRevision??null,
  upstreamProvider:row?.upstreamProvider??null,
  providerRequestId:row?.providerRequestId??null,
  actualCostUsd:Number.isFinite(Number(row?.actualCostUsd))?Number(row.actualCostUsd):null,
  inputTokens:Number.isFinite(Number(row?.inputTokens))?Number(row.inputTokens):null,
  outputTokens:Number.isFinite(Number(row?.outputTokens))?Number(row.outputTokens):null,
  providerCallsPerformed:0,
  metadataCallsPerformed:Number(row?.metadataCallsPerformed??0),
  automaticRetryAuthorized:false,
  semanticAuthority:'NONE',
  crownSuppressionAuthority:'NONE',
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  truthBoundary:'Reconciliation may inspect durable local state and OpenRouter metadata only. It never replays Haiku inference and grants no quality or semantic authority.'
});

export async function reconcileHaiku55Canary({
  store,apiKey,fetchImpl=fetch,clock=Date.now
}={}){
  if(!store||typeof store.transaction!=='function')throw new Error('haiku55-reconcile-store-required');
  const state=await store.transaction(async tx=>(await tx.getSettings())?.[HAIKU55_LIVE_CANARY_SETTING]??null);
  if(!state)return safe({status:'HAIKU_5_5_CANARY_STATE_ABSENT'});
  if(state.status!=='FAILED_RECONCILIATION_REQUIRED_NO_RETRY')return safe(state);

  const settings=await store.transaction(async tx=>await tx.getSettings());
  const runtime=settings?.infiniteOpusRuntime??settings?.infinite_opus_runtime??null;
  const calls=Array.isArray(runtime?.ledger?.calls)?runtime.ledger.calls:[];
  const call=calls.find(x=>x.callId==='openrouter-haiku55-live-canary-20261007-v1')??null;
  if(!call)return safe({...state,status:'HAIKU_5_5_CANARY_LEDGER_CALL_NOT_FOUND'});

  if(call.status==='SETTLED'&&typeof call.receiptRef==='string'&&call.receiptRef){
    const row={...state,status:'HAIKU_5_5_LIVE_PROVIDER_CALLABILITY_PROVEN_SHADOW_ONLY',
      observedAt:new Date(clock()).toISOString(),providerRequestId:call.receiptRef,
      actualCostUsd:Number(call.actualMicrousd??0)/1e6,metadataCallsPerformed:0};
    await store.transaction(async tx=>await tx.setSetting(HAIKU55_LIVE_CANARY_SETTING,row));
    return safe(row);
  }

  if(!['DISPATCHED','RESERVED'].includes(call.status))
    return safe({...state,status:'HAIKU_5_5_CANARY_LEDGER_STATE_NOT_RECONCILABLE'});

  const receiptRef=typeof call.receiptRef==='string'&&call.receiptRef?call.receiptRef:null;
  if(!receiptRef)return safe({...state,status:'HAIKU_5_5_CANARY_PROVIDER_REQUEST_ID_UNRECOVERED'});

  const response=await fetchImpl('https://openrouter.ai/api/v1/generation?id='+encodeURIComponent(receiptRef),{
    method:'GET',headers:{authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(15000)
  });
  if(!response.ok)return safe({...state,status:'HAIKU_5_5_CANARY_METADATA_UNAVAILABLE',metadataCallsPerformed:1});
  const body=await response.json(),meta=body?.data??{};
  const cost=Number(meta.total_cost);
  if(meta.id!==receiptRef||!Number.isFinite(cost)||cost<0||cost>.001)
    return safe({...state,status:'HAIKU_5_5_CANARY_METADATA_REFUSED',metadataCallsPerformed:1});
  const observedModel=String(meta.model??'');
  if(!['anthropic/claude-haiku-5.5','anthropic/claude-haiku-5.5-20261007'].includes(observedModel))
    return safe({...state,status:'HAIKU_5_5_CANARY_MODEL_IDENTITY_REFUSED',metadataCallsPerformed:1});

  const row={...state,status:'HAIKU_5_5_LIVE_PROVIDER_CALLABILITY_PROVEN_SHADOW_ONLY',
    observedAt:new Date(clock()).toISOString(),modelRevision:observedModel,
    upstreamProvider:String(meta.provider_name??''),providerRequestId:receiptRef,actualCostUsd:cost,
    inputTokens:Number(meta.tokens_prompt??0),outputTokens:Number(meta.tokens_completion??0),metadataCallsPerformed:1};
  await store.transaction(async tx=>await tx.setSetting(HAIKU55_LIVE_CANARY_SETTING,row));
  return safe(row);
}
