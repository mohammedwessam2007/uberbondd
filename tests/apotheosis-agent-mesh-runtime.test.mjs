import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileApotheosisNativeDispatch,
  runApotheosisWorkerMission,
  compileApotheosisNativeContinuation,
  reconcileApotheosisWorkerResume
} from '../src/apotheosis-agent-mesh-runtime.mjs';

const SHA40='a'.repeat(40), SHA256='b'.repeat(64);
const modelExecutor=async()=>({ok:true});
const worker={workerId:'cheap-1',id:'cheap-1',provider:'test',model:'cheap',budgetId:'budget-1',targetAgent:'chatgpt',modelExecutor};
const binding={ok:true,status:'CONTEXT_TASK_BINDING_VERIFIED',sourceCommit:SHA40,bindingId:SHA256};
const packetContract={packetId:'p44',parentMissionId:'apotheosis',objective:'bounded task',currentTruth:'verified truth',dependencies:[],sourcePointers:['src/a'],fileOwnership:['src/a'],inputRefs:['receipt:1'],outputContract:'return receipt',interfaceContract:'none',invariants:['no authority'],forbiddenChanges:['constitution'],acceptanceCriteria:['pass'],hostileTests:['wrong source fails'],returnFields:['changedFiles'],escalationTriggers:['unknown failure'],rollbackRequirement:'revert'};
const candidate={id:'cheap-1',tier:'M2',quality:.9,reliability:.95,totalCostUsd:.1,latencyMs:100,availableBudgetUsd:1,callable:true,permitted:true,evidenceBacked:true};

function dispatch(){return compileApotheosisNativeDispatch({sourceCommit:SHA40,taskBindingVerification:binding,task:{id:'task-1',taskClass:'coding',stakes:.4,uncertainty:.3,failureCost:.3},candidateEvidence:[candidate],workers:[worker],packetContract});}

test('native composition binds verified context, scarce allocation and authorized worker packet',()=>{
 const d=dispatch(); assert.equal(d.ok,true); assert.equal(d.status,'APOTHEOSIS_NATIVE_DISPATCH_READY'); assert.equal(d.worker.workerId,'cheap-1'); assert.equal(d.packet.workerClass,'M2'); assert.equal(d.providerCalls,0);
});

test('frontier selection returns escalation instead of turning Astra into implementation worker',()=>{
 const frontier={id:'astra',tier:'A5',quality:.99,reliability:.99,totalCostUsd:.1,latencyMs:50,availableBudgetUsd:2,callable:true,permitted:true,evidenceBacked:true};
 const r=compileApotheosisNativeDispatch({sourceCommit:SHA40,taskBindingVerification:binding,task:{id:'critical',taskClass:'strategy',stakes:1,uncertainty:1,failureCost:1},candidateEvidence:[frontier],workers:[{...worker,id:'astra',workerId:'astra'}],packetContract});
 assert.equal(r.ok,true); assert.equal(r.status,'APOTHEOSIS_FRONTIER_ESCALATION_REQUIRED'); assert.equal(r.dispatchPerformed,false);
});

test('worker mission drives the existing mesh contract through an injected exact runner',async()=>{
 const d=dispatch();
 const seen=[];
 const result=await runApotheosisWorkerMission({dispatch:d,meshOptions:{schedulerOccurrenceKey:'occ-1',store:{},adapterFactory:()=>{},compileRelayTask:()=>{}},runMesh:async input=>{seen.push(input);return{ok:true,status:'ADVANCED',cycleId:'cycle-1',workers:[{workerId:'cheap-1',status:'COMPLETED'}]};}});
 assert.equal(result.ok,true); assert.equal(result.status,'APOTHEOSIS_WORKER_MISSION_EXECUTED_PENDING_INDEPENDENT_VERIFICATION'); assert.equal(seen.length,1); assert.equal(seen[0].workers.length,1); assert.equal(seen[0].sourceCommit,SHA40); assert.equal(result.independentOutcomeVerificationRequired,true);
});

test('mesh failure stays blocked and cannot become observed completion',async()=>{
 const r=await runApotheosisWorkerMission({dispatch:dispatch(),meshOptions:{schedulerOccurrenceKey:'occ-2'},runMesh:async()=>({ok:false,status:'BLOCKED',reasonCodes:['provider-down']})});
 assert.equal(r.ok,false); assert.ok(r.reasonCodes.includes('provider-down'));
});

test('native continuation consumes existing execution-leaf checkpoint and preserves three evidence levels',()=>{
 const nativeCheckpoint={ok:true,status:'EXECUTION_LEAF_CONTINUATION_CHECKPOINT_READY',checkpoint:{sourceCommit:SHA40,graphDigest:SHA256,stateDigest:'c'.repeat(64)}};
 const c=compileApotheosisNativeContinuation({nativeCheckpoint,missionGraphRef:'mission:g',packets:['p44'],workerRouting:['cheap-1'],fileOwnership:['src/a'],testRequirements:['node --test'],integrationOrder:['p44'],rollbackRequirements:['revert'],nextWakeTrigger:'blocked'});
 assert.equal(c.ok,true); assert.equal(c.evidenceLevel,'HANDOFF_SAVED');
 const saved=reconcileApotheosisWorkerResume({nativeContinuation:c,currentSourceCommit:SHA40}); assert.equal(saved.evidenceLevel,'HANDOFF_SAVED');
 const workerReceipt={ok:true,observed:true,evidenceRef:'worker:1',verifierRef:'reviewer',independentVerifier:true,handoffDigest:c.handoff.handoffDigest,frontierModelUsed:false};
 const resumed=reconcileApotheosisWorkerResume({nativeContinuation:c,currentSourceCommit:SHA40,workerReceipt}); assert.equal(resumed.evidenceLevel,'FLEET_RESUMED');
});
