import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runSovereignInitiativeHost } from '../scripts/sovereign-initiative-host.mjs';
import { loadLatestAutonomyRun, saveAutonomyRunSnapshot } from '../src/agent-autonomy-store.mjs';

const BASE='a'.repeat(40);
const P1='b'.repeat(64);
const R1='c'.repeat(64);
const P2='d'.repeat(64);
const R2='e'.repeat(64);
const ZERO_AUTH={businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};

function durableStore(){const auditLog=[];return{auditLog,async log(type,detail){const row={id:`a${auditLog.length+1}`,type,detail:structuredClone(detail),createdAt:detail.createdAt||new Date().toISOString()};auditLog.push(row);return row;},async list(_key,options={}){let rows=[...auditLog];if(options.filters?.type)rows=rows.filter(row=>row.type===options.filters.type);return structuredClone(rows.slice(0,options.limit||rows.length));}};}
function cycle({portfolioId=P1,realityDigest=R1,goal='goal-one'}={}){return{ok:true,status:'NORTH_STAR_INITIATIVE_CYCLE_READY',portfolio:{sourceCommit:BASE,portfolioId,realityDigest,selectedCandidateId:goal},goalContract:{id:goal},agentMeshMission:{missionKey:goal,objective:`Advance ${goal}`,acceptanceTests:['evidence receipt'],evidenceRefs:[`mission:${goal}`],constraints:['local-preparation-only'],targetAgent:'chatgpt',maxRounds:3,maxTasks:6,maxTotalTokens:60000,founderActionBudget:0,tokenBudget:60000}};}
async function writeJson(file,value){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,`${JSON.stringify(value,null,2)}\n`);}

test('resident host selects once, does not duplicate while pending, then advances from durable evidence without a new prompt',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'initiative-host-'));
  const controlDir=path.join(root,'control');
  const activeCyclePath=path.join(controlDir,'initiative','active-cycle.json');
  const missionResultPath=path.join(controlDir,'initiative','mission-result.json');
  const store=durableStore();
  let runtimeCalls=0;
  const runtimeRunner=async()=>{
    runtimeCalls+=1;
    if(runtimeCalls===1){await writeJson(activeCyclePath,cycle());return{ok:true,initiativeAdmitted:true,status:'NORTH_STAR_INITIATIVE_SELECTED',sourceCommit:BASE,executionReceipt:null,paths:{},...ZERO_AUTH};}
    const admitted=JSON.parse(await fs.readFile(missionResultPath,'utf8'));
    assert.equal(admitted.status,'PASS');
    assert.deepEqual(admitted.evidenceRefs,['receipt:host-proof']);
    await writeJson(activeCyclePath,cycle({portfolioId:P2,realityDigest:R2,goal:'goal-two'}));
    return{ok:true,initiativeAdmitted:true,status:'NORTH_STAR_INITIATIVE_ADVANCED_WITHOUT_NEW_PROMPT',sourceCommit:BASE,executionReceipt:{receiptId:'execution-proof'},paths:{},...ZERO_AUTH};
  };
  const meshPumpRunner=async()=>({ok:true,status:'TEST_PUMP_NO_PROVIDER_CALLS'});
  const env={UBERBOND_CONTROL_DIR:controlDir,UBERBOND_SOURCE_ROOT:root,AGENT_MESH_ENABLED:'false'};

  const first=await runSovereignInitiativeHost({env,store,runtimeRunner,meshPumpRunner,now:new Date('2026-09-12T15:00:00Z')});
  assert.equal(first.status,'NORTH_STAR_INITIATIVE_SELECTED_AND_DISPATCHED');
  assert.equal(first.externalEffectAuthority,'NONE');
  assert.equal(runtimeCalls,1);
  const firstRunId=first.dispatch.runId;

  const second=await runSovereignInitiativeHost({env,store,runtimeRunner,meshPumpRunner,now:new Date('2026-09-12T15:01:00Z')});
  assert.equal(second.status,'NORTH_STAR_INITIATIVE_HOST_ACTIVE');
  assert.equal(second.externalEffectAuthority,'NONE');
  assert.equal(runtimeCalls,1,'pending wake selected a duplicate mission');
  assert.equal(second.dispatch.runId,firstRunId);
  assert.equal(store.auditLog.filter(row=>row.type==='agent_autonomy_run_snapshot').length,1);

  const loaded=await loadLatestAutonomyRun(store,firstRunId);
  const completed=structuredClone(loaded.run);
  completed.sequence=Number(completed.sequence||0)+1;
  completed.status='COMPLETED';
  completed.session.status='COMPLETED';
  completed.session.history.push({event:'AGENT_RESULT',taskId:completed.currentIntent.taskId,agent:'chatgpt',action:'DONE',summary:'done',evidenceRefs:['receipt:host-proof'],at:'2026-09-12T15:02:00Z'});
  await saveAutonomyRunSnapshot(store,completed,{reason:'test-completion',date:new Date('2026-09-12T15:02:00Z')});

  const third=await runSovereignInitiativeHost({env,store,runtimeRunner,meshPumpRunner,now:new Date('2026-09-12T15:03:00Z')});
  assert.equal(third.status,'NORTH_STAR_INITIATIVE_ADVANCED_AND_DISPATCHED');
  assert.equal(runtimeCalls,2);
  assert.equal(third.dispatch.selectedCandidateId,'goal-two');
  assert.notEqual(third.dispatch.runId,firstRunId);
  assert.equal(third.externalEffectAuthority,'NONE');
});

test('found durable cycle without dispatch is repaired rather than reselected',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'initiative-host-repair-'));
  const controlDir=path.join(root,'control');
  await writeJson(path.join(controlDir,'initiative','active-cycle.json'),cycle());
  const store=durableStore();
  let runtimeCalls=0;
  const result=await runSovereignInitiativeHost({env:{UBERBOND_CONTROL_DIR:controlDir,UBERBOND_SOURCE_ROOT:root},store,runtimeRunner:async()=>{runtimeCalls+=1;return{ok:false};},meshPumpRunner:async()=>({ok:true,status:'TEST_PUMP_DISABLED'})});
  assert.equal(result.status,'NORTH_STAR_INITIATIVE_HOST_REPAIRED_DISPATCH');
  assert.equal(result.externalEffectAuthority,'NONE');
  assert.equal(runtimeCalls,0);
  assert.ok(result.dispatch.runId);
});