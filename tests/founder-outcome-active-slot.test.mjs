import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile);

test('a different unresolved founder mission cannot silently overwrite the active slot', async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'uberbond-founder-mission-'));
  const intents=path.join(root,'founder-intents'); await mkdir(intents,{recursive:true});
  const run=async()=>JSON.parse((await exec(process.execPath,['scripts/compile-founder-outcome-mission.mjs'],{cwd:process.cwd(),env:{...process.env,UBERBOND_CONTROL_DIR:root,UBERBOND_SOURCE_ROOT:process.cwd()}})).stdout);
  await writeFile(path.join(intents,'intent-aaaaaaaaaaaaaaaaaaaaaaaa.json'),JSON.stringify({id:'intent-a',intent:'Make as much money as possible legally in the next 8 hours',createdAt:'2026-09-11T00:00:00.000Z'}));
  const first=await run(); assert.equal(first.status,'FOUNDER_OUTCOME_MISSION_COMPILED');
  const activePath=path.join(root,'founder-missions','active.json'); const original=JSON.parse(await readFile(activePath,'utf8'));
  await writeFile(path.join(intents,'intent-bbbbbbbbbbbbbbbbbbbbbbbb.json'),JSON.stringify({id:'intent-b',intent:'Earn the maximum legal cash in the next 4 hours',createdAt:'2026-09-11T00:01:00.000Z'}));
  const second=await run(); assert.equal(second.status,'FOUNDER_OUTCOME_MISSION_CONFLICT_ACTIVE'); assert.equal(second.missionCreated,false);
  const after=JSON.parse(await readFile(activePath,'utf8')); assert.equal(after.missionId,original.missionId); assert.equal(after.founderIntent,original.founderIntent);
});
