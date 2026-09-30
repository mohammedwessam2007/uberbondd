import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { executeSequentialDecisionFranchiseFanout, modelFanoutReferenceEconomics } from '../src/decision-franchise-batch.mjs';
import { semanticHash } from '../src/semantic-closure-kernel.mjs';
const h=x=>crypto.createHash('sha256').update(String(x)).digest('hex');
function fx(){
 const spec={schemaVersion:'uberbond.decision-franchise.spec.v1',taskClass:'T',qualityContractHash:h('q'),sideEffectClass:'NONE',relevantKeys:['x'],policy:{domain:[{x:0},{x:1}],rows:[{input:{x:0},output:{y:0}},{input:{x:1},output:{y:1}}]}};
 const record={kind:'DECISION_FRANCHISE',status:'ACTIVE',id:'df:'+semanticHash(spec),spec,crownRevision:'c',sourceDependencies:{s:h('s')},invalidators:{d:false},closureArtifactHash:h('a'),closureContextHash:h('ctx'),proofClass:'E3',evidenceRef:'proof://x',expiresAt:'2099-01-01T00:00:00Z',mintedAt:'2026-09-30T00:00:00Z'};
 return {record,trustPin:semanticHash(record),currentContext:{crownRevision:'c',sourceHashes:{s:h('s')},invalidators:{d:false}},spec};
}
test('streamed sequential fanout executes distinct tasks without model calls',()=>{const f=fx();const r=executeSequentialDecisionFranchiseFanout({...f,count:10000,taskIdPrefix:'t-',taskFactory:i=>({taskId:'t-'+i,taskClass:'T',qualityContractHash:f.spec.qualityContractHash,sideEffectClass:'NONE',payload:{x:i%2,nonce:i}})});assert.equal(r.ok,true);assert.equal(r.executedCount,10000);assert.equal(r.providerCallsPerformed,0);assert.equal(r.uniqueTaskIdsByConstruction,10000);});
test('economic layer stays explicitly modeled',()=>{const f=fx();const r=executeSequentialDecisionFranchiseFanout({...f,count:100,taskIdPrefix:'t-',taskFactory:i=>({taskId:'t-'+i,taskClass:'T',qualityContractHash:f.spec.qualityContractHash,sideEffectClass:'NONE',payload:{x:i%2}})});const e=modelFanoutReferenceEconomics({executionReceipt:r,directOpusUnitUsd:.85,actualAllInEnvelopeUsd:30});assert.equal(e.status,'EXECUTED_FANOUT_PLUS_MODELED_COUNTERFACTUAL');assert.equal(e.directReferenceUsd,85);});
test('non-sequential task IDs are refused so distinctness is by construction',()=>{const f=fx();assert.throws(()=>executeSequentialDecisionFranchiseFanout({...f,count:2,taskIdPrefix:'t-',taskFactory:i=>({taskId:'same',taskClass:'T',qualityContractHash:f.spec.qualityContractHash,sideEffectClass:'NONE',payload:{x:i}})}),/sequential-distinct-task-id/);});
