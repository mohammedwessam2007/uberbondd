import { RESUME_KEY } from '../src/crown-resume-checkpoint.mjs';
import { verifyCrownProviderModel } from '../src/crown-model-identity.mjs';
const ID='gen-1790900587-TKEqsFrik1iupnf4Ljrd';
// One metadata GET, no inference and no failed-attempt reset or semantic promotion.
export async function reconcileInterruptedCrownGeneration(store,{apiKey,fetchImpl=fetch}={}){
 const state=await store.transaction(async tx=>(await tx.getSettings())[RESUME_KEY]);
 if(state?.status!=='FAILED_NO_AUTOMATIC_RETRY'||state.reason!=='generation-reconciliation-required:'+ID)
  return {status:'EXACT_INTERRUPTED_ATTEMPT_NOT_PRESENT',providerCallsPerformed:0};
 const prior=state.generationJournal?.find(r=>r.id===ID);
 if(!prior||prior.model!=='openai/gpt-6.1-sol-pro')return {status:'EXACT_DISPATCH_BINDING_REQUIRED',providerCallsPerformed:0};
 if(prior.status==='RECONCILED_BILL_ONLY_NO_RETAINED_ANSWER')return {status:prior.status,id:ID,costUsd:prior.costUsd,providerCallsPerformed:0};
 if(prior.status==='UNKNOWN_CHARGE_MAX_RESERVE_QUARANTINED')return {status:prior.status,id:ID,actualCostUsd:null,conservativeLiabilityUsd:prior.conservativeLiabilityUsd,providerCallsPerformed:0};
 if(prior.status!=='DISPATCHED_UNRECONCILED'||!apiKey||!Number.isFinite(prior.reservedWorstCaseUsd)||prior.reservedWorstCaseUsd<=0)return {status:'DISPATCHED_UNRECONCILED',id:ID,providerCallsPerformed:0};
 let response;
 try{response=await fetchImpl('https://openrouter.ai/api/v1/generation?id='+encodeURIComponent(ID),{method:'GET',headers:{authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(15000)});}
 catch{return {status:'DISPATCHED_UNRECONCILED',id:ID,metadataLookup:'TRANSPORT_FAILED',providerCallsPerformed:0};}
 if(!response.ok){
  if(response.status!==404)return {status:'DISPATCHED_UNRECONCILED',id:ID,metadataHttpStatus:response.status,providerCallsPerformed:0};
  const quarantinedAt=new Date().toISOString();
  const quarantine={id:ID,status:'UNKNOWN_CHARGE_MAX_RESERVE_QUARANTINED',model:prior.model,actualCostUsd:null,
   conservativeLiabilityUsd:prior.reservedWorstCaseUsd,metadataHttpStatus:404,semanticAuthority:'NONE',
   reconciliationPolicy:'RETAIN_MAX_PRECALL_RESERVE_UNTIL_PROVIDER_EVIDENCE_ARRIVES',quarantinedAt};
  const updated=await store.transaction(async tx=>{
   const settings=await tx.getSettings(),s=settings[RESUME_KEY],row=s?.generationJournal?.find(r=>r.id===ID);
   if(s?.status!==state.status||s.reason!==state.reason||row?.status!=='DISPATCHED_UNRECONCILED'||row.reservedWorstCaseUsd!==prior.reservedWorstCaseUsd)return false;
   await tx.setSetting(RESUME_KEY,{...s,generationJournal:s.generationJournal.map(r=>r.id===ID?{...r,...quarantine}:r),
    pendingCall:s.pendingCall?.generationId===ID?{...s.pendingCall,reconciliationStatus:quarantine.status}:s.pendingCall,
    financialQuarantine:quarantine,updatedAt:quarantinedAt});return true;
  });
  return {...quarantine,status:updated?quarantine.status:'CONCURRENT_STATE_CHANGED',providerCallsPerformed:0};
 }
 let d;try{d=(await response.json()).data;}catch{return {status:'DISPATCHED_UNRECONCILED',id:ID,metadataLookup:'MALFORMED',providerCallsPerformed:0};}
 const cost=d?.total_cost;
 if(d?.id!==ID||typeof cost!=='number'||!Number.isFinite(cost)||cost<0||cost>prior.reservedWorstCaseUsd||!verifyCrownProviderModel({requestedModel:prior.model,observedModel:d.model,provider:d.provider_name}))
  return {status:'DISPATCHED_UNRECONCILED',id:ID,metadataLookup:'BILL_IDENTITY_OR_COST_REFUSED',providerCallsPerformed:0};
 const bill={id:ID,status:'RECONCILED_BILL_ONLY_NO_RETAINED_ANSWER',model:prior.model,observedModel:d.model,provider:d.provider_name,costUsd:cost,
  promptTokens:d.native_tokens_prompt??null,completionTokens:d.native_tokens_completion??null,reasoningTokens:d.native_tokens_reasoning??null,finishReason:d.finish_reason??null};
 const updated=await store.transaction(async tx=>{
  const settings=await tx.getSettings(),s=settings[RESUME_KEY],row=s?.generationJournal?.find(r=>r.id===ID);
  if(s?.status!==state.status||s.reason!==state.reason||row?.status!=='DISPATCHED_UNRECONCILED')return false;
  await tx.setSetting(RESUME_KEY,{...s,generationJournal:s.generationJournal.map(r=>r.id===ID?{...r,...bill}:r),newSpendUsd:s.newSpendUsd+cost,
   pendingCall:s.pendingCall?.generationId===ID?{...s.pendingCall,reconciliationStatus:bill.status}:s.pendingCall,
   financialReconciliation:{...bill,semanticAuthority:'NONE',reconciledAt:new Date().toISOString()},updatedAt:new Date().toISOString()});return true;
 });
 return {...bill,status:updated?bill.status:'CONCURRENT_STATE_CHANGED',providerCallsPerformed:0};
}
