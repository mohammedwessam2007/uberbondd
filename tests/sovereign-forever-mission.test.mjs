import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { renewSovereignForeverMission, SOVEREIGN_FOREVER_INTENT } from '../scripts/sovereign-forever-mission-renewer.mjs';
import { classifyFounderOutcomeIntent, compileFounderOutcomeMission } from '../src/founder-outcome-mission.mjs';

async function tempRoot(){return fs.mkdtemp(path.join(os.tmpdir(),'uberbond-forever-'));}
async function read(file){return JSON.parse(await fs.readFile(file,'utf8'));}
async function writeJson(file,value){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,`${JSON.stringify(value,null,2)}\n`);}
const fixedBytes=n=>Buffer.alloc(n,7);


test('canonical forever intent is recognized as bounded zero-spend economic outcome mission',()=>{
  const c=classifyFounderOutcomeIntent(SOVEREIGN_FOREVER_INTENT);
  assert.equal(c.recognized,true);
  assert.equal(c.objectiveClass,'MAXIMIZE_CLEARED_CONTRIBUTION_PROFIT');
  const now=new Date('2026-09-13T14:00:00Z');
  const mission=compileFounderOutcomeMission({founderIntent:SOVEREIGN_FOREVER_INTENT,now});
  assert.equal(mission.ok,true);
  assert.equal(mission.spendCeilingCents,0);
  assert.equal(mission.authority.newSpendAuthorized,false);
  assert.equal(new Date(mission.deadlineAt).getTime()-now.getTime(),168*60*60*1000);
});

test('first resident pulse seeds exactly one founder intent and second pulse does not duplicate',async()=>{
  const root=await tempRoot();
  const now=new Date('2026-09-13T14:00:00Z');
  const first=await renewSovereignForeverMission({controlDir:root,now,randomBytes:fixedBytes});
  assert.equal(first.status,'SOVEREIGN_FOREVER_MISSION_SEEDED');
  const second=await renewSovereignForeverMission({controlDir:root,now:new Date(now.getTime()+60_000),randomBytes:fixedBytes});
  assert.equal(second.status,'SOVEREIGN_FOREVER_MISSION_RENEWAL_PENDING');
  const names=await fs.readdir(path.join(root,'founder-intents'));
  assert.equal(names.filter(n=>n.endsWith('.json')).length,1);
});

test('active or reconciliation-required mission blocks renewal',async()=>{
  for(const state of ['ACTIVE','RECONCILIATION_REQUIRED']){
    const root=await tempRoot();
    await writeJson(path.join(root,'founder-missions','active.json'),{ok:true,state,missionId:`mission-${state}`,deadlineAt:'2026-09-20T14:00:00.000Z'});
    const r=await renewSovereignForeverMission({controlDir:root,now:new Date('2026-09-13T14:00:00Z'),randomBytes:fixedBytes});
    assert.equal(r.status,'SOVEREIGN_FOREVER_MISSION_LEASE_ACTIVE');
    await assert.rejects(fs.readdir(path.join(root,'founder-intents')));
  }
});

test('terminal mission seeds one successor lease and then waits for compiler',async()=>{
  const root=await tempRoot();
  await writeJson(path.join(root,'founder-missions','active.json'),{ok:true,state:'TERMINAL',missionId:'mission-old'});
  const first=await renewSovereignForeverMission({controlDir:root,now:new Date('2026-09-13T14:00:00Z'),randomBytes:fixedBytes});
  assert.equal(first.status,'SOVEREIGN_FOREVER_MISSION_SEEDED');
  const marker=await read(path.join(root,'founder-missions','forever-lease.json'));
  assert.equal(marker.lastTerminalMissionId,'mission-old');
  const second=await renewSovereignForeverMission({controlDir:root,now:new Date('2026-09-13T14:01:00Z'),randomBytes:fixedBytes});
  assert.equal(second.status,'SOVEREIGN_FOREVER_MISSION_RENEWAL_PENDING');
  const names=await fs.readdir(path.join(root,'founder-intents'));
  assert.equal(names.filter(n=>n.endsWith('.json')).length,1);
});

test('resident continuum performs forever mission renewal and economic pulse before authoring wake',async()=>{
  const continuum=await fs.readFile(new URL('../ops/sovereign/uberbond-authoring-continuum',import.meta.url),'utf8');
  const renew=continuum.indexOf('pulse FOREVER_MISSION');
  const compile=continuum.indexOf('pulse FOUNDER_OUTCOME_COMPILE');
  const economic=continuum.indexOf('pulse FOUNDER_ECONOMIC');
  const authoring=continuum.indexOf('pulse AUTHORING');
  assert.ok(renew>=0&&compile>renew&&economic>compile&&authoring>economic);
  assert.match(continuum,/INTERVAL_SEC=\"\$\{UBERBOND_AUTHORING_INTERVAL_SEC:-60\}\"/);
});
