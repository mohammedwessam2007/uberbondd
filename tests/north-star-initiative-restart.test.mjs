import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../src/store.mjs';
import { seedInitiativeCycle, observeInitiativeDispatch } from '../src/north-star-initiative-dispatch.mjs';
import { loadLatestAutonomyRun, saveAutonomyRunSnapshot } from '../src/agent-autonomy-store.mjs';

const BASE='a'.repeat(40), PORTFOLIO='b'.repeat(64), REALITY='c'.repeat(64), GOAL='restart-proof-goal';
function cycle(){return{ok:true,status:'NORTH_STAR_INITIATIVE_CYCLE_READY',portfolio:{sourceCommit:BASE,portfolioId:PORTFOLIO,realityDigest:REALITY,selectedCandidateId:GOAL},goalContract:{id:GOAL},agentMeshMission:{missionKey:GOAL,objective:'Prove durable North-Star mission continuity across process restart.',acceptanceTests:['restart receipt exists'],evidenceRefs:['mission:restart-proof-goal'],constraints:['local-preparation-only'],targetAgent:'chatgpt',maxRounds:3,maxTasks:6,maxTotalTokens:60000,founderActionBudget:0,tokenBudget:60000}};}

test('dispatch identity and completed evidence survive Store close/reopen',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'initiative-restart-'));
  const firstStore=new Store(dir);await firstStore.init();
  const dispatch=await seedInitiativeCycle({store:firstStore,cycle:cycle(),date:new Date('2026-09-12T16:00:00Z')});
  assert.equal(dispatch.status,'NORTH_STAR_INITIATIVE_DISPATCHED');
  const runId=dispatch.runId;
  await firstStore.close();

  const secondStore=new Store(dir);await secondStore.init();
  const replay=await seedInitiativeCycle({store:secondStore,cycle:cycle(),date:new Date('2026-09-12T16:01:00Z')});
  assert.equal(replay.status,'NORTH_STAR_INITIATIVE_ALREADY_DISPATCHED');
  assert.equal(replay.runId,runId);
  const loaded=await loadLatestAutonomyRun(secondStore,runId);
  const completed=structuredClone(loaded.run);
  completed.sequence=Number(completed.sequence||0)+1;
  completed.status='COMPLETED';
  completed.session.status='COMPLETED';
  completed.session.history.push({event:'AGENT_RESULT',taskId:completed.currentIntent.taskId,agent:'chatgpt',action:'DONE',summary:'restart-safe completion',evidenceRefs:['receipt:restart-proof'],at:'2026-09-12T16:02:00Z'});
  await saveAutonomyRunSnapshot(secondStore,completed,{reason:'restart-test-complete',date:new Date('2026-09-12T16:02:00Z')});
  await secondStore.close();

  const thirdStore=new Store(dir);await thirdStore.init();
  const observed=await observeInitiativeDispatch({store:thirdStore,dispatch,date:new Date('2026-09-12T16:03:00Z')});
  assert.equal(observed.status,'NORTH_STAR_INITIATIVE_RUN_COMPLETED');
  assert.deepEqual(observed.missionReceipt.evidenceRefs,['receipt:restart-proof']);
  assert.equal(observed.missionReceipt.externalEffectAuthority,'NONE');
  await thirdStore.close();
});
