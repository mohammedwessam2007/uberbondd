import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const SOVEREIGN_REVENUE_RUNTIME_VERSION='uberbond.sovereign-revenue-runtime.v1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const text=(v,m=1000)=>String(v??'').trim().slice(0,m);
const refs=v=>[...new Set((Array.isArray(v)?v:[]).map(x=>text(x,500)).filter(Boolean))];
const digest=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;

export const SOVEREIGN_REVENUE_ORGANS=Object.freeze([
  'UBERCLOUD','UBERCEL','UBERRUNTIME','UBERCONTROL','UBERMIND','UBERAGENTS','UBERRESEARCH',
  'UBERECONOMY','UBERPAY','UBERMAIL','UBERDELIVERY','UBERDISTRIBUTION'
]);

export function compileSovereignRevenueRuntime({
  organEvidence={},
  founderMissionActive=false,
  durableQueueReady=false,
  paymentReconciliationReady=false,
  outboundAuthority=null,
  fulfillmentReady=false,
  acceptedDeliveryTruthReady=false
}={}){
  const organs=SOVEREIGN_REVENUE_ORGANS.map(id=>{
    const e=organEvidence?.[id]||{};
    const evidenceRefs=refs(e.evidenceRefs);
    const ready=e.sourceReady===true&&e.runtimeReady===true&&e.authorityRoot==='UBERBOND'&&evidenceRefs.length>0;
    return {id,ready,evidenceRefs,reasonCodes:ready?[]:[
      ...(e.sourceReady===true?[]:['source-ready-required']),
      ...(e.runtimeReady===true?[]:['runtime-ready-required']),
      ...(e.authorityRoot==='UBERBOND'?[]:['uberbond-authority-root-required']),
      ...(evidenceRefs.length?[]:['evidence-ref-required'])
    ]};
  });
  const organBlockers=organs.filter(x=>!x.ready).map(x=>x.id);
  const outboundReady=Boolean(
    outboundAuthority?.current===true&&
    text(outboundAuthority?.channel,200)&&
    text(outboundAuthority?.audience,500)&&
    outboundAuthority?.senderHealthVerified===true&&
    outboundAuthority?.suppressionRecheckRequired===true&&
    text(outboundAuthority?.authorityRef,1000)
  );
  const checks={
    founderMissionActive:founderMissionActive===true,
    durableQueueReady:durableQueueReady===true,
    paymentReconciliationReady:paymentReconciliationReady===true,
    outboundReady,
    fulfillmentReady:fulfillmentReady===true,
    acceptedDeliveryTruthReady:acceptedDeliveryTruthReady===true,
    organsReady:organBlockers.length===0
  };
  const blockers=Object.entries(checks).filter(([,ok])=>!ok).map(([k])=>k);
  const ready=blockers.length===0;
  const loop=[
    'DISCOVER_AND_RESEARCH','RANK_BY_RISK_ADJUSTED_CLEARED_CONTRIBUTION_PER_FOUNDER_MINUTE',
    'PREPARE_OR_BUILD_OFFER','GOVERNED_DISTRIBUTION','REPLY_AND_CONVERSION_PROCESSING',
    'PROVIDER_ORIGIN_PAYMENT_RECONCILIATION','ACCEPTANCE_BOUND_FULFILLMENT','RENEWAL_OR_EXPANSION',
    'ECONOMIC_LEARNING_AND_REALLOCATION','REPEAT'
  ];
  const receipt={
    schema:SOVEREIGN_REVENUE_RUNTIME_VERSION,
    ready,
    status:ready?'SOVEREIGN_REVENUE_RUNTIME_READY':'SOVEREIGN_REVENUE_RUNTIME_BLOCKED',
    organs,
    checks,
    blockers,
    loop,
    executionPolicy:'OWNED_UBER_STACK_PRIMARY__EXTERNAL_PROVIDERS_REPLACEABLE_SUPPLIERS',
    authorityPolicy:'EXISTING_GOVERNED_EFFECT_AUTHORITY_ONLY__CAPABILITY_NEVER_MINTS_AUTHORITY',
    businessEffectAuthority:ready?'EXISTING_GATES_ONLY':'NONE',
    externalEffectAuthority:ready?'EXISTING_GATES_ONLY':'NONE',
    externalEffectLedger:zero(),
    truthBoundary:'READY means the owned sovereign revenue loop is composition-ready under already-proven effect authority. It does not fabricate elapsed-time endurance, customer demand, cleared cash, or accepted-delivery outcomes.'
  };
  return {...receipt,receiptDigest:digest(receipt)};
}
