import { buildCrownResumeAuthority } from './infinite-opus-crown-continuation-plan.mjs';

export const CROWN_OWNER_RESUME_EVIDENCE_REF='owner-approved-two-missing-crown-edges-r3';
export const CROWN_OWNER_RESUME_MAX_REMAINING_PAID_CALLS=2;

export function compileCrownOwnerResumeAuthority(input={}, {plan,now=Date.now()}={}){
  if(!plan?.ok||plan.state!=='OWNER_EXACT_SPEND_AUTHORIZATION_REQUIRED')
    return {ok:false,status:'CURRENT_EXACT_CROWN_CONTINUATION_PLAN_REQUIRED'};
  if(input?.approved!==true)return {ok:false,status:'EXPLICIT_OWNER_APPROVAL_REQUIRED'};
  if(input?.acknowledgeUnknownHistoricalChargeAtFullReserve!==true)
    return {ok:false,status:'UNKNOWN_HISTORICAL_CHARGE_RESERVE_ACK_REQUIRED'};
  if(Number(input?.confirmPaidCalls)!==CROWN_OWNER_RESUME_MAX_REMAINING_PAID_CALLS)
    return {ok:false,status:'EXACT_TWO_PAID_CALLS_CONFIRMATION_REQUIRED'};
  if(!Number.isSafeInteger(input?.maxIncrementalMicrousd)||input.maxIncrementalMicrousd!==plan.maxIncrementalMicrousd)
    return {ok:false,status:'EXACT_CURRENT_MICROUSD_CAP_REQUIRED'};
  if(String(input?.confirmation||'')!==plan.ownerConfirmationPhrase)
    return {ok:false,status:'EXACT_CURRENT_CONFIRMATION_REQUIRED'};
  const authority=buildCrownResumeAuthority(plan,{now});
  return {
    ok:true,status:'EXACT_TWO_EDGE_RESUME_AUTHORITY_COMPILED',authority,
    maximumIncrementalMicrousd:plan.maxIncrementalMicrousd,
    maximumIncrementalUsd:plan.maxIncrementalUsd,
    maximumRemainingPaidCalls:CROWN_OWNER_RESUME_MAX_REMAINING_PAID_CALLS,
    uncertainHistoricalChargeActualUsd:null,
    uncertainHistoricalChargeLiabilityUsd:plan.uncertainHistoricalChargeLiabilityUsd,
    sideEffectAuthority:'NONE',
    truthBoundary:'This authority permits only the existing sealed GENERAL_CROWN continuation. The exact incremental ceiling is derived from the current durable evaluation spend plus the full conservative reserve for the historical UNKNOWN charge, and is valid for ten minutes with at most two paid model calls.'
  };
}
