import { HAIKU55_LIVE_CANARY_SETTING } from './infinite-opus-haiku55-live-canary.mjs';
import { createInfiniteOpusRuntime } from '../src/infinite-opus-native-runtime.mjs';

const CALL_ID='openrouter-haiku55-live-canary-20261007-v1';
const MODEL='anthropic/claude-haiku-5.5';
const REVISIONS=new Set([MODEL,'anthropic/claude-haiku-5.5-20261007']);
export const HAIKU55_RECONCILIATION_SCHEMA='uberbond.haiku55-no-replay-reconciliation.v2';

function result(status,{state=null,call=null,metadataCalls=0,observed=null,reason=null}={}){
  return {
    ok:status==='HAIKU_5_5_LIVE_PROVIDER_CALLABILITY_PROVEN_SHADOW_ONLY',
    schemaVersion:HAIKU55_RECONCILIATION_SCHEMA,status,
    model:MODEL,modelRevision:observed?.modelRevision??null,
    upstreamProvider:observed?.upstreamProvider??null,
    providerRequestId:observed?.providerRequestId??null,
    actualCostUsd:observed?.actualCostUsd??null,
    ledgerStatus:call?.status??null,reason,
    originalProviderCrossing:state?.providerCallsPerformed??null,
    reconciliationInferenceCallsPerformed:0,metadataCallsPerformed:metadataCalls,
    automaticRetryAuthorized:false,semanticAuthority:'NONE',
    crownSuppressionAuthority:'NONE',businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    truthBoundary:'No inference is ever replayed. DISPATCHED without an exact trusted provider request ID remains UNKNOWN and its reservation stays quarantined. Metadata is not quality/Crown authority.'
  };
}

/** Reconcile only durable trusted IDs. Never infer a vanished request ID or repeat inference. */
export async function reconcileHaiku55CanaryWithoutReplay({store,apiKey,fetchImpl=fetch,clock=Date.now}={}){
  if(typeof store?.transaction!=='function')throw new Error('haiku55-durable-store-required');
  const settings=await store.transaction(async tx=>await tx.getSettings());
  const state=settings?.[HAIKU55_LIVE_CANARY_SETTING]??null;
  const ledger=settings?.infiniteOpusRuntimeV1?.ledger??null;
  const call=ledger?.calls?.find?.(x=>x?.callId===CALL_ID)??null;
  if(!state)return result('HAIKU_5_5_CANARY_STATE_ABSENT',{call});
  if(!call)return result('HAIKU_5_5_CANARY_LEDGER_ABSENT',{state});
  if(call.taskId!=='haiku55-live-canary-20261007-v1'||call.model!==MODEL||
     call.provider!=='openrouter'||call.role!=='WORKER')
    return result('HAIKU_5_5_LEDGER_IDENTITY_REFUSED',{state,call});
  if(call.status==='RESERVED')
    return result('HAIKU_5_5_CANARY_RESERVED_NOT_DISPATCHED',{state,call});
  if(!['DISPATCHED','SETTLED'].includes(call.status))
    return result('HAIKU_5_5_CANARY_LEDGER_NOT_RECONCILABLE',{state,call});

  // A missing ID is not evidence of a free or failed inference. Nothing can
  // safely be requested from OpenRouter by an invented ID.
  const id=typeof call.receiptRef==='string'&&call.receiptRef.trim()?call.receiptRef:null;
  if(!id)return result('HAIKU_5_5_DISPATCH_UNCERTAIN_ID_UNRECOVERED',{state,call});
  if(!apiKey)return result('HAIKU_5_5_READONLY_METADATA_CREDENTIAL_REQUIRED',{state,call});

  let meta;
  try{
    const response=await fetchImpl('https://openrouter.ai/api/v1/generation?id='+encodeURIComponent(id),{
      method:'GET',headers:{Authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(15000)
    });
    if(!response.ok)return result('HAIKU_5_5_PROVIDER_METADATA_UNAVAILABLE',{state,call,metadataCalls:1});
    const body=await response.json();meta=body?.data;
  }catch{
    return result('HAIKU_5_5_PROVIDER_METADATA_UNAVAILABLE',{state,call,metadataCalls:1});
  }
  const cost=meta?.total_cost;
  const revision=meta?.model;
  const provider=meta?.provider_name;
  if(meta?.id!==id||typeof cost!=='number'||!Number.isFinite(cost)||cost<0||
     cost>0.001||!REVISIONS.has(revision)||typeof provider!=='string'||!provider.trim())
    return result('HAIKU_5_5_PROVIDER_METADATA_REFUSED',{state,call,metadataCalls:1});

  const observed={modelRevision:revision,upstreamProvider:provider,providerRequestId:id,actualCostUsd:cost};
  if(call.status==='SETTLED'){
    if(!call.receiptHash||!Number.isSafeInteger(call.actualMicrousd)||
       call.actualMicrousd!==Math.ceil(cost*1e6))
      return result('HAIKU_5_5_SETTLEMENT_METADATA_MISMATCH',{state,call,metadataCalls:1});
  }else{
    const settlement=await createInfiniteOpusRuntime({store,clock}).reconcileCall({
      callId:CALL_ID,actualMicrousd:Math.ceil(cost*1e6),receiptRef:id,
      observedModel:MODEL,observedProvider:'openrouter'
    }).catch(()=>null);
    if(!settlement?.ok)return result('HAIKU_5_5_COST_RECONCILIATION_REQUIRED',{state,call,metadataCalls:1,observed});
  }
  const row={...state,status:'HAIKU_5_5_LIVE_PROVIDER_CALLABILITY_PROVEN_SHADOW_ONLY',
    modelRevision:revision,upstreamProvider:provider,providerRequestId:id,
    actualCostUsd:cost,observedAt:new Date(clock()).toISOString(),
    providerCallsPerformed:1,automaticRetryAuthorized:false};
  await store.transaction(async tx=>await tx.setSetting(HAIKU55_LIVE_CANARY_SETTING,row));
  return result(row.status,{state:row,call:{...call,status:'SETTLED'},metadataCalls:1,observed});
}
