import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function loadAt(dir){
  process.env.UBERBOND_CONTROL_DIR=dir;
  process.env.UBERBOND_SOURCE_ROOT='/definitely/not/a/repo';
  return import(`../scripts/compile-founder-outcome-mission.mjs?${Math.random()}`);
}
async function writeIntent(root,id,intent,createdAt){
  const dir=path.join(root,'founder-intents');
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,`intent-${id}.json`),JSON.stringify({id,intent,createdAt}));
}
const a='aaaaaaaaaaaaaaaaaaaaaaaa';
const b='bbbbbbbbbbbbbbbbbbbbbbbb';

test('same unresolved intent is idempotent even after deadline',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ub-founder-'));
  await writeIntent(root,a,'Make revenue by 12 PM on September 11, 2026','2026-09-10T23:30:00Z');
  const mod=await loadAt(root);
  const first=await mod.compileLatestFounderOutcomeMission({now:new Date('2026-09-11T00:00:00Z')});
  assert.equal(first.missionCreated,true);
  const second=await mod.compileLatestFounderOutcomeMission({now:new Date('2026-09-11T10:00:00Z')});
  assert.equal(second.status,'FOUNDER_OUTCOME_MISSION_ALREADY_ACTIVE');
  assert.equal(second.missionId,first.missionId);
});

test('different outcome cannot overwrite an unresolved mission',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ub-founder-'));
  await writeIntent(root,a,'Make revenue by 12 PM on September 11, 2026','2026-09-10T23:30:00Z');
  let mod=await loadAt(root);
  const first=await mod.compileLatestFounderOutcomeMission({now:new Date('2026-09-11T00:00:00Z')});
  const activePath=path.join(root,'founder-missions','active.json');
  const before=JSON.parse(await fs.readFile(activePath,'utf8'));
  await writeIntent(root,b,'Make as much money as possible by 1 PM on September 11, 2026','2026-09-11T00:05:00Z');
  mod=await loadAt(root);
  const conflict=await mod.compileLatestFounderOutcomeMission({now:new Date('2026-09-11T00:06:00Z')});
  assert.equal(conflict.status,'FOUNDER_OUTCOME_MISSION_CONFLICT_REQUIRES_FOUNDER_CHOICE');
  const after=JSON.parse(await fs.readFile(activePath,'utf8'));
  assert.equal(after.missionId,before.missionId);
  assert.equal(conflict.activeMissionId,first.missionId);
  assert.ok(conflict.candidatePath);
});

test('delayed compiler uses original intent time and preserves named deadline',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ub-founder-'));
  await writeIntent(root,a,'Make revenue by 12 PM on September 11, 2026','2026-09-10T23:30:00Z');
  const mod=await loadAt(root);
  const out=await mod.compileLatestFounderOutcomeMission({now:new Date('2026-09-11T08:00:00Z')});
  assert.equal(out.deadlineAt,'2026-09-11T09:00:00.000Z');
});
