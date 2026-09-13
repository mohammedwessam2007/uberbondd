import test from 'node:test';
import assert from 'node:assert/strict';
import {compileEconomicRepairProblem,runEconomicRepairJob} from '../src/economic-repair-job-handler.mjs';

const planner=({candidates})=>({status:'CANDIDATE_SELECTED',selected:{candidate:candidates[0]}});

test('authority blocker is refused before Wallbreaker',()=>{
  const out=compileEconomicRepairProblem({attemptId:'a1',stage:'PAYMENT',blockerClass:'AUTHORITY_REQUIRED'});
  assert.equal(out.ok,false);
});

test('prohibited blocker is refused before Wallbreaker',()=>{
  const out=compileEconomicRepairProblem({attemptId:'a1',stage:'DISTRIBUTION',blockerClass:'PROHIBITED_OR_IMPOSSIBLE'});
  assert.equal(out.ok,false);
});

test('internal blocker dispatches durable upgrade proposal',async()=>{
  const queued=[];
  const out=await runEconomicRepairJob({tasks:[{attemptId:'a1',stage:'FULFILLMENT',blockerClass:'INTERNAL_SOLVABLE',actions:['repair-fulfillment']}],wallbreakerPlanner:planner,enqueueJob:async(type,payload,options)=>{queued.push({type,payload,options});return{id:'j1'};}});
  assert.equal(out.ok,true);
  assert.equal(queued[0].type,'prometheus.upgrade.propose');
  assert.match(queued[0].options.idempotencyKey,/economic-repair:/);
});

test('provider blocker dispatches capability substitute search',async()=>{
  const queued=[];
  await runEconomicRepairJob({tasks:[{attemptId:'a1',stage:'PAYMENT',blockerClass:'PROVIDER_OR_RAIL',substituteRailIds:['p2']}],wallbreakerPlanner:planner,enqueueJob:async(type,payload,options)=>{queued.push({type,payload,options});return{id:'j1'};}});
  assert.equal(queued[0].type,'prometheus.capability_gap.recompute');
});

test('evidence blocker dispatches evidence task',async()=>{
  const queued=[];
  await runEconomicRepairJob({tasks:[{attemptId:'a1',stage:'OFFER',blockerClass:'EVIDENCE_REQUIRED'}],wallbreakerPlanner:planner,enqueueJob:async(type,payload,options)=>{queued.push({type,payload,options});return{id:'j1'};}});
  assert.equal(queued[0].type,'prometheus.agent.task');
  assert.match(queued[0].payload.objective,/smallest reversible observed evidence/i);
});

test('missing durable enqueue fails closed',async()=>{
  const out=await runEconomicRepairJob({tasks:[],wallbreakerPlanner:planner});
  assert.equal(out.ok,false);
  assert.deepEqual(out.reasonCodes,['durable-enqueue-required']);
});

test('mixed batch never dispatches authority tasks',async()=>{
  const queued=[];
  const out=await runEconomicRepairJob({tasks:[
    {attemptId:'a1',stage:'PAYMENT',blockerClass:'AUTHORITY_REQUIRED'},
    {attemptId:'a2',stage:'PAYMENT',blockerClass:'PROVIDER_OR_RAIL'}
  ],wallbreakerPlanner:planner,enqueueJob:async(type,payload,options)=>{queued.push({type,payload,options});return{id:'j'};}});
  assert.equal(out.refusedTaskCount,1);
  assert.equal(out.dispatchCount,1);
  assert.equal(queued.length,1);
});
