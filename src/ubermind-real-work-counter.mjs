import crypto from 'node:crypto';

export const UBERMIND_REAL_WORK_COUNTER_SCHEMA='uberbond.ubermind-real-work-counter.v1';
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_.:/-]{1,240}$/.test(x);
const fail=reason=>({ok:false,status:'UBERMIND_REAL_WORK_COUNTER_REFUSED',
  reason,independentlyAuditedEconomicMultiplier:null,global33333xConfirmed:false,
  providerInferenceCallsPerformed:0,externalEffectAuthority:'NONE'});

/**
 * Read-only reconciliation of the EXISTING protected Infinite Opus runtime,
 * not a caller-asserted "I finished X jobs" API.
 *
 * A completion requires a durable task result PLUS a matching trusted-runtime
 * execution receipt. The E3 counter is strictly a bounded certified-policy
 * service counter; it never turns into an independently audited frontier
 * benchmark or any dollar savings without separate external proof.
 */
export function reconcileUberMindRealWorkCounter({runtimeState=null,period=null}={}){
 if(runtimeState===null)return {ok:true,
   schemaVersion:UBERMIND_REAL_WORK_COUNTER_SCHEMA,
   status:'NO_TRUSTED_RUNTIME_STATE_YET',period,
   certifiedPolicyWorkCompleted:0,proofLedgerExecutionCount:0,
   unresolvedPageFaultCount:0,independentFrontierHoldoutsAdmitted:0,
   independentlyAuditedEconomicMultiplier:null,global33333xConfirmed:false,
   providerInferenceCallsPerformed:0,externalEffectAuthority:'NONE'};
 if(!runtimeState||runtimeState.schemaVersion!=='uberbond.infinite-opus.task.v1'||
    !runtimeState.tasks||typeof runtimeState.tasks!=='object'||Array.isArray(runtimeState.tasks)||
    !Array.isArray(runtimeState.receipts)||
    !runtimeState.proofLedger||!Array.isArray(runtimeState.proofLedger.executions))
   return fail('trusted-native-runtime-state-required');
 if(period!==null&&!/^\d{4}-\d{2}$/.test(period))return fail('valid-optional-period-required');
 const closed=new Map(),pageFaults=new Set(),receipted=new Map(),proofs=new Set();
 for(const [id,row] of Object.entries(runtimeState.tasks)){
   if(!validId(id)||!row||typeof row!=='object')return fail('invalid-tracked-task');
   if(row.status==='CLOSED_DECISION_FRANCHISE'){
     if(typeof row.taskHash!=='string'||!/^[a-f0-9]{64}$/.test(row.taskHash)||
        !validId(row.franchiseId)||typeof row.franchiseHash!=='string'||
        !/^[a-f0-9]{64}$/.test(row.franchiseHash)||
        row.decision===undefined)
       return fail('malformed-certified-completion');
     closed.set(id,row);
   }
   if(row.status==='PAGE_FAULT')pageFaults.add(id);
 }
 for(const row of runtimeState.receipts){
   if(row?.kind!=='DECISION_FRANCHISE_HIT')continue;
   if(!validId(row.taskId)||typeof row.franchiseHash!=='string'||
      row.providerCallsPerformed!==0||row.executionClass!=='E3'||
      row.executionShell!=='GHOST_AGENT'||receipted.has(row.taskId))
     return fail('invalid-duplicate-or-nonzero-provider-franchise-receipt');
   receipted.set(row.taskId,row);
 }
 let certified=0;
 const terminalProofs=[];
 for(const [id,row] of closed){
   const receipt=receipted.get(id);
   if(!receipt||receipt.franchiseId!==row.franchiseId||
      receipt.franchiseHash!==row.franchiseHash)return fail('certified-completion-lacks-matching-receipt');
   certified++;
 }
 // A receipt not corresponding to a currently closed native task is not a
 // materialized current output; expose the inconsistency, never count it.
 for(const id of receipted.keys())if(!closed.has(id))
   return fail('orphan-franchise-hit-receipt');
 for(const e of runtimeState.proofLedger.executions){
   if(!validId(e?.taskId)||!validId(e?.executionId)||
      proofs.has(e.executionId)||!e.completedAt||
      (period!==null&&String(e.completedAt).slice(0,7)!==period))
      return fail('invalid-mixed-period-or-replayed-proof-ledger');
   proofs.add(e.executionId);
   if(e.proofVerified!==true||!e.referenceContractHash||
      !['E0','E1','E2','E3','E4'].includes(e.equivalenceClass))
     return fail('invalid-proof-ledger-evidence');
   terminalProofs.push(e);
 }
 const ledgerMonth=runtimeState.proofLedger.period??null;
 if(period!==null&&ledgerMonth!==period)return fail('proof-ledger-month-mismatch');
 const receiptHash=hash({
   taskIds:[...closed.keys()].sort(),
   receiptIds:[...receipted.keys()].sort(),
   proofIds:[...proofs].sort(),
   ledgerMonth
 });
 return {ok:true,schemaVersion:UBERMIND_REAL_WORK_COUNTER_SCHEMA,
   status:'TRUSTED_NATIVE_EXECUTION_COUNTS_RECONCILED',
   period:ledgerMonth,
   certifiedPolicyWorkCompleted:certified,
   uniqueCertifiedTaskIdentities:certified,
   independentlyAuditedFrontierQualityWorkCompleted:0,
   proofLedgerExecutionCount:terminalProofs.length,
   unresolvedPageFaultCount:pageFaults.size,
   availableSemanticStateCount:null,
   independentFrontierHoldoutsAdmitted:0,
   independentlyAuditedEconomicMultiplier:null,global33333xConfirmed:false,
   semanticAuthority:'EXISTING_CERTIFIED_BOUNDED_POLICY_ONLY',
   providerInferenceCallsPerformed:0,externalEffectAuthority:'NONE',
   counterReceiptHash:receiptHash,
   truthBoundary:'This reads protected native task/receipt/proof state. Counts are actual stored bounded-policy completions and stored proof entries, not independent novel frontier tasks, real external demand, new provider bills, or a matched cost multiplier. No economic target moves without independently authenticated evidence.'
 };
}
