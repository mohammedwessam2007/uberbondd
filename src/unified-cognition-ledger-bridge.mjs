import crypto from 'node:crypto';
import { COGNITION_LEDGER_VERSION } from './cognition-ledger.mjs';
import { createUnifiedCognitionLedger, appendCognitionEvent, cognitionLedgerSummary } from './unified-cognition-ledger.mjs';

export const UNIFIED_COGNITION_BRIDGE_VERSION='uberbond.unified-cognition-ledger-bridge.v1';

const hash=x=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const safeId=v=>typeof v==='string'&&v.length>0&&v.length<=300;

export function deriveUnifiedCognitionMonth({ledger,channelId='infinite-opus-runtime',authorizationRef='runtime-authority:unavailable'}={}){
  if(ledger?.version!==COGNITION_LEDGER_VERSION)throw new Error('authoritative-cognition-ledger-required');
  if(!safeId(channelId)||!safeId(authorizationRef))throw new Error('bounded-bridge-provenance-required');
  let unified=createUnifiedCognitionLedger({month:ledger.month});
  const unresolved=[],released=[];
  let settledMicrousd=0;
  for(const call of ledger.calls){
    if(call.status==='RELEASED'){released.push(call.callId);continue;}
    if(call.status!=='SETTLED'){unresolved.push({callId:call.callId,status:call.status,ceilingMicrousd:call.ceilingMicrousd});continue;}
    if(!Number.isSafeInteger(call.actualMicrousd)||call.actualMicrousd<0||!safeId(call.receiptRef))throw new Error('settled-call-observed-cost-required');
    settledMicrousd+=call.actualMicrousd;
    unified=appendCognitionEvent(unified,{
      channel_id:channelId,
      task_id:call.taskId,
      call_id:call.callId,
      provider:call.provider,
      model:call.model,
      provider_route:`${call.provider}:${call.model}`,
      timestamp:`${call.settledDate}T00:00:00.000Z`,
      authorization_ref:authorizationRef,
      billing_month:ledger.month,
      cost_class:'CASH_API_SPEND',
      estimated_cost_usd:call.ceilingMicrousd/1e6,
      actual_cost_usd:call.actualMicrousd/1e6,
      platform_fee_usd:0,
      source_receipt_ref:call.receiptRef,
      source_role:call.role,
      source_quality_class:call.qualityClass,
      source_cache_state:call.cacheState
    });
  }
  const summary=cognitionLedgerSummary(unified);
  const sourceDigest=hash({
    version:ledger.version,month:ledger.month,monthlyCapMicrousd:ledger.monthlyCapMicrousd,
    calls:ledger.calls.map(c=>({callId:c.callId,taskId:c.taskId,model:c.model,provider:c.provider,role:c.role,status:c.status,ceilingMicrousd:c.ceilingMicrousd,actualMicrousd:c.actualMicrousd,receiptRef:c.receiptRef??null,settledDate:c.settledDate??null}))
  });
  return {
    schemaVersion:UNIFIED_COGNITION_BRIDGE_VERSION,
    status:unresolved.length?'DERIVED_PROVIDER_SPEND_WITH_UNRESOLVED_CALLS':'DERIVED_PROVIDER_SPEND_RECONCILED',
    month:ledger.month,
    authoritativeSource:'src/cognition-ledger.mjs',
    authoritativeSourceDigest:sourceDigest,
    unifiedLedger:unified,
    summary:{
      ...summary,
      providerCashUsd:Number((settledMicrousd/1e6).toFixed(9)),
      actualAllInUsdClaimAllowed:false,
      scope:'OBSERVED_SETTLED_PROVIDER_SPEND_ONLY',
      truthBoundary:'Derived one-way from the authoritative cognition ledger. It excludes unresolved calls, released reservations, card/top-up/tax costs and non-provider cognition unless separately provenance-bound. It cannot reserve, dispatch, settle, release or authorize spend.'
    },
    unresolvedCalls:unresolved,
    releasedCallIds:released,
    mutationAuthority:'NONE',
    spendAuthority:'NONE',
    providerCallsPerformed:0
  };
}

export function deriveUnifiedCognitionHistory({currentLedger,archivedLedgers={},channelId='infinite-opus-runtime',authorizationRef='runtime-authority:unavailable'}={}){
  const ledgers=[...Object.values(archivedLedgers||{}),currentLedger].filter(Boolean);
  const months=new Set(),callIds=new Set(),derived=[];
  for(const ledger of ledgers){
    if(months.has(ledger.month))throw new Error('duplicate-authoritative-month');
    months.add(ledger.month);
    for(const call of ledger.calls??[]){
      if(callIds.has(call.callId))throw new Error('cross-month-call-id-collision');
      callIds.add(call.callId);
    }
    derived.push(deriveUnifiedCognitionMonth({ledger,channelId,authorizationRef}));
  }
  derived.sort((a,b)=>a.month.localeCompare(b.month));
  const providerCashUsd=Number(derived.reduce((sum,row)=>sum+row.summary.providerCashUsd,0).toFixed(9));
  return {
    schemaVersion:'uberbond.unified-cognition-history.v1',
    status:derived.some(x=>x.unresolvedCalls.length)?'DERIVED_HISTORY_WITH_UNRESOLVED_CALLS':'DERIVED_HISTORY_RECONCILED',
    months:derived,
    providerCashUsd,
    unresolvedCalls:derived.flatMap(x=>x.unresolvedCalls.map(c=>({...c,month:x.month})),
    mutationAuthority:'NONE',
    spendAuthority:'NONE',
    providerCallsPerformed:0,
    truthBoundary:'Historical aggregation is a read-only derived view. Provider spend authority and settlement truth remain exclusively in src/cognition-ledger.mjs.'
  };
}
