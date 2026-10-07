import { INTERRUPTED_RESUME_KEY, RESUME_KEY, validCrownResumeAuthority } from './crown-resume-checkpoint.mjs';

export const CROWN_OWNER_RESUME_CONFIRMATION='RESUME_EXACT_TWO_MISSING_EDGES_MAX_0_30_USD';
export const CROWN_OWNER_RESUME_MAX_INCREMENTAL_USD=0.30;
export const CROWN_OWNER_RESUME_MAX_INCREMENTAL_MICROUSD=300000;
export const CROWN_OWNER_RESUME_MAX_TOTAL_EVALUATION_MICROUSD=450000;
export const CROWN_OWNER_RESUME_MAX_REMAINING_PAID_CALLS=2;
export const CROWN_OWNER_RESUME_EVIDENCE_REF='owner-approved-two-missing-crown-edges-r3';

export function compileCrownOwnerResumeAuthority(input={}, {now=Date.now(),ttlMs=10*60*1000}={}){
  if(input?.approved!==true)return {ok:false,status:'EXPLICIT_OWNER_APPROVAL_REQUIRED'};
  if(input?.confirmation!==CROWN_OWNER_RESUME_CONFIRMATION)return {ok:false,status:'EXACT_CONFIRMATION_REQUIRED'};
  if(Number(input?.maximumIncrementalUsd)!==CROWN_OWNER_RESUME_MAX_INCREMENTAL_USD)
    return {ok:false,status:'EXACT_0_30_USD_INCREMENTAL_CAP_REQUIRED'};
  if(!Number.isSafeInteger(ttlMs)||ttlMs<=0||ttlMs>15*60*1000)return {ok:false,status:'AUTHORITY_TTL_REFUSED'};
  const authority={
    operation:'resume-existing-sealed-general-crown-evaluation',
    attemptKey:INTERRUPTED_RESUME_KEY,
    sourceKey:RESUME_KEY,
    maxIncrementalMicrousd:CROWN_OWNER_RESUME_MAX_INCREMENTAL_MICROUSD,
    maxTotalEvaluationMicrousd:CROWN_OWNER_RESUME_MAX_TOTAL_EVALUATION_MICROUSD,
    monthlyCapMicrousd:20000000,
    maxRemainingPaidCalls:CROWN_OWNER_RESUME_MAX_REMAINING_PAID_CALLS,
    evidenceRef:CROWN_OWNER_RESUME_EVIDENCE_REF,
    authorizedAt:new Date(now).toISOString(),
    expiresAt:new Date(now+ttlMs).toISOString()
  };
  if(!validCrownResumeAuthority(authority,now))return {ok:false,status:'COMPILED_AUTHORITY_INVALID'};
  return {
    ok:true,status:'EXACT_TWO_EDGE_RESUME_AUTHORITY_COMPILED',authority,
    maximumIncrementalUsd:CROWN_OWNER_RESUME_MAX_INCREMENTAL_USD,
    maximumRemainingPaidCalls:CROWN_OWNER_RESUME_MAX_REMAINING_PAID_CALLS,
    sideEffectAuthority:'NONE',
    truthBoundary:'This authority permits only the existing sealed GENERAL_CROWN continuation, with at most two paid model calls and at most USD 0.30 incremental provider spend. The runtime also enforces the existing USD 0.45 total evaluation envelope and monthly USD 20 cap.'
  };
}
