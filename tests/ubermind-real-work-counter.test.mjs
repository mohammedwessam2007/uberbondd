import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileUberMindRealWorkCounter} from '../src/ubermind-real-work-counter.mjs';

const digest='a'.repeat(64),digest2='b'.repeat(64),period='2026-10';
function state(){
 return {
  schemaVersion:'uberbond.infinite-opus.task.v1',
  tasks:{
   'real-task-1':{status:'CLOSED_DECISION_FRANCHISE',taskHash:digest,
     franchiseId:'franchise-A',franchiseHash:digest2,decision:{route:'DONE'}},
   'real-task-2':{status:'PAGE_FAULT',taskHash:digest2}
  },
  receipts:[{kind:'DECISION_FRANCHISE_HIT',taskId:'real-task-1',
    franchiseId:'franchise-A',franchiseHash:digest2,providerCallsPerformed:0,
    executionClass:'E3',executionShell:'GHOST_AGENT'}],
  proofLedger:{period,executions:[{executionId:'receipt-1',
    taskId:'real-task-1',completedAt:'2026-10-08T17:00:00Z',
    equivalenceClass:'E3',proofVerified:true,referenceContractHash:'sha256:'+digest}]}
 };
}
test('read-only counter observes one already-stored materialized E3 output, not invented novel work',()=>{
 const out=reconcileUberMindRealWorkCounter({runtimeState:state(),period});
 assert.equal(out.ok,true);
 assert.equal(out.certifiedPolicyWorkCompleted,1);
 assert.equal(out.proofLedgerExecutionCount,1);
 assert.equal(out.unresolvedPageFaultCount,1);
 assert.equal(out.independentFrontierHoldoutsAdmitted,0);
 assert.equal(out.independentlyAuditedEconomicMultiplier,null);
 assert.equal(out.global33333xConfirmed,false);
 assert.equal(out.providerInferenceCallsPerformed,0);
 assert.equal(out.externalEffectAuthority,'NONE');
 assert.match(out.counterReceiptHash,/^[a-f0-9]{64}$/);
});
test('missing runtime state does not fabricate demand',()=>{
 const out=reconcileUberMindRealWorkCounter();
 assert.equal(out.status,'NO_TRUSTED_RUNTIME_STATE_YET');
 assert.equal(out.certifiedPolicyWorkCompleted,0);
 assert.equal(out.independentlyAuditedEconomicMultiplier,null);
});
test('no receipt means no stored E3 work may be counted',()=>{
 const s=state();s.receipts=[];
 const out=reconcileUberMindRealWorkCounter({runtimeState:s});
 assert.equal(out.ok,false);
 assert.equal(out.reason,'certified-completion-lacks-matching-receipt');
});
test('orphan, repeated or provider-billed receipt fails closed',()=>{
 for(const mutation of [
  s=>s.receipts.push({...s.receipts[0],taskId:'orphan'}),
  s=>s.receipts.push({...s.receipts[0]}),
  s=>s.receipts[0].providerCallsPerformed=1
 ]){
  const s=state();mutation(s);
  const out=reconcileUberMindRealWorkCounter({runtimeState:s});
  assert.equal(out.ok,false);
 }
});
test('stale period and replayed proof IDs fail closed',()=>{
 const s=state();
 assert.equal(reconcileUberMindRealWorkCounter({runtimeState:s,period:'2026-09'}).ok,false);
 s.proofLedger.executions.push({...s.proofLedger.executions[0]});
 assert.equal(reconcileUberMindRealWorkCounter({runtimeState:s,period}).ok,false);
});
test('malformed task state is refused rather than counted as paid savings',()=>{
 const s=state();s.tasks['real-task-1'].taskHash='not-a-real-digest';
 const out=reconcileUberMindRealWorkCounter({runtimeState:s});
 assert.equal(out.ok,false);
 assert.equal(out.independentlyAuditedEconomicMultiplier,null);
});
