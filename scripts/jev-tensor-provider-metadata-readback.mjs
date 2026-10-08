import { JEV_TENSOR_CANARY_KEY } from './jev-tensor-one-shot-live-canary.mjs';

export const JEV_TENSOR_METADATA_KEY='ubermindJevTensorProviderMetadata20261008V1';
export const JEV_TENSOR_METADATA_SCHEMA='uberbond.jev-tensor-generation-readback.v1';

const view=(state,extra={})=>({
 ok:state?.status==='JEV_TENSOR_PROVIDER_BILLING_METADATA_CONFIRMED',
 schemaVersion:JEV_TENSOR_METADATA_SCHEMA,
 status:state?.status??'UNKNOWN',
 observedAt:state?.observedAt??null,
 providerRequestId:state?.providerRequestId??null,
 modelRevision:state?.modelRevision??null,
 providerName:state?.providerName??null,
 originalUsageCostUsd:state?.originalUsageCostUsd??null,
 providerMetadataCostUsd:state?.providerMetadataCostUsd??null,
 exactCostMatch:state?.exactCostMatch??null,
 providerMetadataCallsThisBoot:extra.calls??0,
 providerInferenceCallsThisBoot:0,
 automaticInferenceRetryAuthorized:false,
 semanticAuthority:'NONE',crownSuppressionAuthority:'NONE',
 qualityEquivalenceProven:false,globalEconomicCompressionProven:false,
 ...extra,
 truthBoundary:'Read-only generation metadata audit for the EXACT original Jev tensor provider request; does not repeat inference or prove general semantic quality.'
});

export async function readJevTensorProviderBilling({
 store,apiKey,fetchImpl=fetch,clock=Date.now
}={}){
 if(typeof store?.transaction!=='function')throw Error('jev-metadata-durable-store-required');
 const settings=await store.transaction(async tx=>tx.getSettings());
 const existing=settings?.[JEV_TENSOR_METADATA_KEY]??null;
 if(existing?.status==='JEV_TENSOR_PROVIDER_BILLING_METADATA_CONFIRMED')
   return view(existing,{calls:0,previouslyPersisted:true});
 const canary=settings?.[JEV_TENSOR_CANARY_KEY]??null;
 if(canary?.status!=='JEV_TENSOR_LIVE_PROVIDER_FANOUT_CONFIRMED_SHADOW_ONLY'||
   typeof canary?.providerRequestId!=='string'||!/^gen-[A-Za-z0-9_-]{6,}$/.test(canary.providerRequestId))
   return view({status:'JEV_TENSOR_METADATA_ORIGINAL_PROVIDER_ID_UNAVAILABLE'},{calls:0});
 if(typeof apiKey!=='string'||apiKey.length<16)
   return view({status:'JEV_TENSOR_METADATA_CREDENTIAL_REQUIRED'},{calls:0});
 const id=canary.providerRequestId;
 let body;
 try{
   const response=await fetchImpl('https://openrouter.ai/api/v1/generation?id='+encodeURIComponent(id),{
     method:'GET',headers:{Authorization:'Bearer '+apiKey},
     signal:AbortSignal.timeout(15000)
   });
   if(!response?.ok)return view({status:'JEV_TENSOR_PROVIDER_METADATA_HTTP_UNAVAILABLE',
     providerRequestId:id},{calls:1,httpStatus:response?.status??null});
   body=await response.json();
 }catch{
   return view({status:'JEV_TENSOR_PROVIDER_METADATA_NETWORK_UNAVAILABLE',providerRequestId:id},{calls:1});
 }
 const data=body?.data;
 const validId=data?.id===id;
 const model=typeof data?.model==='string'?data.model:null;
 const name=typeof data?.provider_name==='string'?data.provider_name:null;
 const cost=data?.total_cost;
 if(!validId||!model?.startsWith('typesafe/jev-1.13')||name!=='TypeSafe'||
   typeof cost!=='number'||!Number.isFinite(cost)||cost<0||cost>.001)
   return view({status:'JEV_TENSOR_PROVIDER_METADATA_IDENTITY_OR_COST_REFUSED',
      providerRequestId:id,modelRevision:model,providerName:name},{calls:1});
 const original=canary.actualCostUsd;
 // Original runtime ledger records integer microdollar precision.
 const exactCostMatch=typeof original==='number'&&
   Math.ceil(cost*1_000_000)===Math.round(original*1_000_000);
 const row={status:exactCostMatch?'JEV_TENSOR_PROVIDER_BILLING_METADATA_CONFIRMED':
   'JEV_TENSOR_PROVIDER_METADATA_COST_MISMATCH',
   observedAt:new Date(clock()).toISOString(),
   providerRequestId:id,modelRevision:model,providerName:name,
   originalUsageCostUsd:original,
   providerMetadataCostUsd:cost,exactCostMatch};
 if(exactCostMatch)await store.transaction(async tx=>
   tx.setSetting(JEV_TENSOR_METADATA_KEY,row));
 return view(row,{calls:1,previouslyPersisted:false});
}
