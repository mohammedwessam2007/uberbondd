import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTaskBoundContextProjection, verifyTaskBoundContextProjection } from '../src/context-task-binding.mjs';

function projection(){
  return {schemaVersion:'uberbond.context-projection.v1',audience:'isolated-worker',sourceCommit:'a'.repeat(40),brainstateId:'b'.repeat(64),contextMountId:'c'.repeat(64),missionContextId:'d'.repeat(64),terminalObjective:'objective',economicNorthStar:'profit/founder minute',mission:'mission',activeMission:'active',frontier:{blockers:[],nextActions:[]},relevantInitiatives:[],cognitiveHistory:[],laws:{zeroRetelling:'yes',staleContext:'refuse',capabilityNeverCreatesAuthority:true},consequenceAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};
}

async function signedProjection(){
  const crypto=await import('node:crypto');
  const p=projection();
  const canonical=value=>Array.isArray(value)?value.map(canonical):(!value||typeof value!=='object'?value:Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])));
  p.projectionId=crypto.createHash('sha256').update(JSON.stringify(canonical(p))).digest('hex');
  return p;
}

test('task binding fixes projection to exact task and objective',async()=>{
  const p=await signedProjection();
  const compiled=compileTaskBoundContextProjection({projection:p,taskId:'task-1',taskClass:'FINITE_COMPLETION',objective:'repair exact seam'});
  assert.equal(compiled.ok,true);
  assert.equal(verifyTaskBoundContextProjection(compiled.boundProjection,{taskId:'task-1',taskClass:'FINITE_COMPLETION',objective:'repair exact seam',audience:'isolated-worker',sourceCommit:'a'.repeat(40)}).ok,true);
});

test('valid projection cannot be replayed beside another task',async()=>{
  const compiled=compileTaskBoundContextProjection({projection:await signedProjection(),taskId:'task-1',objective:'repair exact seam'});
  assert.equal(verifyTaskBoundContextProjection(compiled.boundProjection,{taskId:'task-2'}).ok,false);
  assert.equal(verifyTaskBoundContextProjection(compiled.boundProjection,{taskId:'task-1',objective:'different objective'}).ok,false);
});

test('binding and nested projection tampering fail closed',async()=>{
  const compiled=compileTaskBoundContextProjection({projection:await signedProjection(),taskId:'task-1'});
  const bindingTamper=structuredClone(compiled.boundProjection);bindingTamper.taskBinding.taskId='task-9';
  assert.equal(verifyTaskBoundContextProjection(bindingTamper).ok,false);
  const projectionTamper=structuredClone(compiled.boundProjection);projectionTamper.projection.mission='poisoned';
  assert.equal(verifyTaskBoundContextProjection(projectionTamper).ok,false);
});
