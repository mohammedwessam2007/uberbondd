import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGoalContract, planWorkerLanes, evaluateGoalEvidence, buildMissionCheckpoint } from '../src/frontier-operator.mjs';

const goal={id:'mission-a',outcome:'prove bounded behavior',reason:'terminal verification',constraints:['no external effects'],proof:[{id:'proof-a',description:'deterministic receipt'}],permittedEffects:['NONE'],maxSpendUsd:0,maxTurns:5,maxDurationMinutes:30,failurePolicy:'STOP_WITH_EVIDENCE'};

test('Frontier Operator refuses a goal without a nonempty proof contract',()=>{
  const out=normalizeGoalContract({...goal,proof:[]});assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('nonempty-bounded-proof-contract-required'));
});

test('Frontier Operator refuses unsafe parallel ownership by requiring serialization',()=>{
  const out=planWorkerLanes({missionId:'m1',lanes:[{id:'a',role:'WORKER',objective:'a',ownedResources:['repo:x'],dependsOn:[]},{id:'b',role:'VERIFIER',objective:'b',ownedResources:['repo:x'],dependsOn:[]}]});
  assert.equal(out.ok,true);assert.equal(out.status,'SERIALIZATION_REQUIRED');assert.equal(out.parallelExecutionAuthorized,false);assert.equal(out.ownershipConflicts.length,1);
});

test('Frontier Operator never treats missing evidence as a proven goal',()=>{
  const out=evaluateGoalEvidence({goal,receipts:[]});assert.equal(out.ok,true);assert.equal(out.status,'GOAL_NOT_PROVEN');assert.deepEqual(out.missing,['proof-a']);
});

test('Frontier Operator recovery checkpoint preserves failed strategies and next actions without execution authority',()=>{
  const out=buildMissionCheckpoint({missionId:'m1',observedAt:'2026-09-11T12:00:00Z',sourceRevision:'abc123',completedStages:['research'],failedStrategies:['route-a'],falsifiedAssumptions:['assumption-a'],blockers:['blocker-a'],nextActions:['route-b']});
  assert.equal(out.ok,true);assert.equal(out.status,'CHECKPOINT_RECORDED');assert.deepEqual(out.checkpoint.failedStrategies,['route-a']);assert.equal(out.businessEffectAuthority,'NONE');
});
