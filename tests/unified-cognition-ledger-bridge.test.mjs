import test from 'node:test';
import assert from 'node:assert/strict';
import { createCognitionLedger,reserveCognitionCall,markCognitionDispatched,settleCognitionCall,releaseUndispatchedCognition } from '../src/cognition-ledger.mjs';
import { deriveUnifiedCognitionMonth,deriveUnifiedCognitionHistory } from '../src/unified-cognition-ledger-bridge.mjs';

const request=(id,task)=>({callId:id,taskId:task,model:'anthropic/claude-opus-5.5',provider:'openrouter',qualityClass:'Q',role:'CROWN',cacheState:'MISS',ceilingMicrousd:200000});
function ledger(){
 let l=createCognitionLedger({month:'2026-10',monthlyCapMicrousd:20000000});
 l=reserveCognitionCall(l,request('call-1','task-1'),'2026-10-07').ledger;
 l=markCognitionDispatched(l,'call-1','2026-10-07');
 l=settleCognitionCall(l,{callId:'call-1',actualMicrousd:12345,receiptRef:'gen:1',observedModel:'anthropic/claude-opus-5.5',observedProvider:'openrouter'},'2026-10-07').ledger;
 l=reserveCognitionCall(l,request('call-2','task-2'),'2026-10-07').ledger;
 l=reserveCognitionCall(l,request('call-3','task-3'),'2026-10-07').ledger;
 l=releaseUndispatchedCognition(l,'call-3','2026-10-07');
 return l;
}
test('one-way bridge derives settled provider cost and preserves uncertainty without mutating source',()=>{
 const source=ledger(),before=structuredClone(source);
 const out=deriveUnifiedCognitionMonth({ledger:source,authorizationRef:'owner:october-runtime'});
 assert.equal(out.summary.providerCashUsd,.012345);
 assert.equal(out.unifiedLedger.events.length,1);
 assert.equal(out.unifiedLedger.events[0].call_id,'call-1');
 assert.equal(out.unifiedLedger.events[0].source_receipt_ref,'gen:1');
 assert.deepEqual(out.unresolvedCalls,[{callId:'call-2',status:'RESERVED',ceilingMicrousd:200000}]);
 assert.deepEqual(out.releasedCallIds,['call-3']);
 assert.equal(out.summary.actualAllInUsdClaimAllowed,false);
 assert.equal(out.mutationAuthority,'NONE');
 assert.deepEqual(source,before);
});
test('history refuses cross-month call reuse and never double counts settled calls',()=>{
 const current=ledger();
 let old=createCognitionLedger({month:'2026-09',monthlyCapMicrousd:20000000});
 old=reserveCognitionCall(old,request('old-1','old-task'),'2026-09-30').ledger;
 old=settleCognitionCall(old,{callId:'old-1',actualMicrousd:1000,receiptRef:'gen:old',observedModel:'anthropic/claude-opus-5.5',observedProvider:'openrouter'},'2026-09-30').ledger;
 const out=deriveUnifiedCognitionHistory({currentLedger:current,archivedLedgers:{'2026-09':old},authorizationRef:'owner:october-runtime'});
 assert.equal(out.providerCashUsd,.013345);
 assert.equal(out.months.length,2);
 old.calls[0].callId='call-1';
 assert.throws(()=>deriveUnifiedCognitionHistory({currentLedger:current,archivedLedgers:{'2026-09':old},authorizationRef:'owner:october-runtime'}),/cross-month-call-id-collision/);
});
