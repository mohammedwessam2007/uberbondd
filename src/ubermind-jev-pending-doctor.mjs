import crypto from 'node:crypto';

export const UBERMIND_JEV_PENDING_DOCTOR_SCHEMA='uberbond.ubermind-jev-pending-doctor.v1';
const hash=x=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const SHA=/^sha256:[a-f0-9]{64}$/;
const isObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fail=reason=>({ok:false,status:'JEV_PENDING_DOCTOR_INVALID_PROTECTED_STATE',
  reason,pendingClaimCount:null,claimsNeedingOwnerReconciliation:null,
  providerCallsPerformed:0,automaticReleaseAuthorized:false,
  actualSavingsUsd:null,independentlyAuditedMultiplier:null});

/**
 * Protected-store read-only inspector. A claimed decision must NEVER expire
 * into an automatic new paid dispatch. This only identifies the native call's
 * known settlement state; no claims are deleted and no raw IDs are logged.
 */
export function inspectJevPendingClaims({reuseState=null,nativeState=null,now=Date.now(),
  staleAfterMs=600_000}={}){
 if(!Number.isFinite(now)||!Number.isSafeInteger(staleAfterMs)||
    staleAfterMs<60_000||staleAfterMs>86_400_000)
   return fail('bounded-inspection-clock-required');
 if(reuseState===null)return {ok:true,schemaVersion:UBERMIND_JEV_PENDING_DOCTOR_SCHEMA,
   status:'NO_PUBLIC_REUSE_LEDGER',pendingClaimCount:0,
   staleClaimCount:0,claimsNeedingOwnerReconciliation:0,
   statusCounts:{},nativeLedgerAvailable:!!nativeState?.ledger,
   providerCallsPerformed:0,automaticReleaseAuthorized:false,
   actualSavingsUsd:null,independentlyAuditedMultiplier:null};
 if(!isObject(reuseState)||reuseState.schemaVersion!=='uberbond.jev-public-answer-reuse.v1'||
    !isObject(reuseState.items)||!isObject(reuseState.pending??{}))
   return fail('protected-reuse-ledger-shape-invalid');
 const pending=reuseState.pending??{},keys=Object.keys(pending);
 if(keys.length>64)return fail('pending-claim-cap-exceeded');
 const nativeCalls=nativeState?.ledger?.calls;
 if(nativeState!==null&&nativeCalls!==undefined&&!Array.isArray(nativeCalls))
   return fail('native-cost-ledger-shape-invalid');
 const seen=new Set(),counts={},identityProof=[];
 let stale=0,needs=0;
 for(const key of keys){
   const c=pending[key];
   if(!SHA.test(key)||!isObject(c)||c.key!==key||
      !SHA.test(c.bindingDigest)||typeof c.operationId!=='string'||
      !/^[A-Za-z0-9_.:-]{1,180}$/.test(c.operationId)||
      c.status!=='CLAIMED_BEFORE_PROVIDER_EFFECT'||
      !Number.isSafeInteger(c.claimedAt)||c.claimedAt>now||
      (c.nativeCallId!==undefined&&!/^jev-shadow-call-[a-f0-9]{24}$/.test(c.nativeCallId))||
      seen.has(c.nativeCallId??c.operationId))
     return fail('pending-claim-identity-or-replay-invalid');
   seen.add(c.nativeCallId??c.operationId);
   const aged=now-c.claimedAt>=staleAfterMs;
   if(aged)stale++;
   const matching=Array.isArray(nativeCalls)&&c.nativeCallId?
     nativeCalls.filter(x=>x?.callId===c.nativeCallId):[];
   if(matching.length>1)return fail('ambiguous-native-provider-call-receipts');
   const nativeStatus=matching.length===1?matching[0].status:
     (Array.isArray(nativeCalls)?'NO_MATCHING_NATIVE_CALL':'NATIVE_LEDGER_UNAVAILABLE');
   if(!['RESERVED','DISPATCHED','SETTLED','RELEASED','NO_MATCHING_NATIVE_CALL',
     'NATIVE_LEDGER_UNAVAILABLE'].includes(nativeStatus))
     return fail('unexpected-native-call-state');
   counts[nativeStatus]=(counts[nativeStatus]??0)+1;
   if(aged||['DISPATCHED','SETTLED'].includes(nativeStatus))needs++;
   identityProof.push({fingerprint:key,claimedAt:c.claimedAt,nativeStatus});
 }
 return {ok:true,schemaVersion:UBERMIND_JEV_PENDING_DOCTOR_SCHEMA,
   status:needs?'PROTECTED_CLAIMS_NEED_RECONCILIATION':
      keys.length?'PROTECTED_PUBLIC_JEV_CLAIMS_IN_FLIGHT':'NO_PENDING_PUBLIC_JEV_CLAIMS',
   pendingClaimCount:keys.length,staleClaimCount:stale,
   claimsNeedingOwnerReconciliation:needs,
   statusCounts:counts,nativeLedgerAvailable:Array.isArray(nativeCalls),
   inventoryDigest:hash(identityProof),
   rawClaimIdentifiersExposed:false,providerCallsPerformed:0,
   automaticReleaseAuthorized:false,automaticRetryAuthorized:false,
   actualSavingsUsd:null,independentlyAuditedMultiplier:null,
   truthBoundary:'The protected source ledger is inspected only. A stale, dispatched, settled or unreconciled decision stays on hold until independent provider/budget reconciliation. This inspector cannot clear claims, retry paid inference or certify model quality or cost savings.'};
}
