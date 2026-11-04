import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
test('all-Omega read-only integration doctor uses original W40/W41 and exact original 52',()=>{
  const command=resolve(root,'scripts/ubermind-all-omega-doctor.mjs');
  // Doctor must inspect the real checked-out repo and never invoke model/provider tools.
  const run=spawnSync(process.execPath,[command],{cwd:root,encoding:'utf8',timeout:20000,
    env:{...process.env,ANTHROPIC_API_KEY:'LOCAL_FAIL_CLOSED_SENTINEL'}});
  assert.equal(run.status,0,`doctor exit ${run.status}: ${run.stderr?.slice(0,900)}`);
  const doc=JSON.parse(run.stdout);
  assert.equal(doc.success,true);
  assert.equal(doc._52Registry.coverage,52);
  assert.equal(doc._52Registry.allApplied,false);
  assert.equal(doc.original890.exists,true);
  assert.ok(doc.omegaCounts.filesDetected>20);
  assert.ok(doc.capabilityReferences.every(x=>x.present));
  assert.equal(doc.existingRouters.W40.advisoryCallSucceeded,true);
  assert.equal(doc.existingRouters.W41.advisoryCallSucceeded,true);
  assert.equal(doc.exampleRoute.crown.model,'opus');
  assert.equal(doc.exampleRoute.actualModelCalls,0);
  assert.equal(doc.subscription.allowed,false);
  assert.ok(!run.stdout.includes('LOCAL_FAIL_CLOSED_SENTINEL'));
});