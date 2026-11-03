import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compileUberCiPlan, executeUberCi, extractTapEvidence, resolveJobs, verifySha } from '../scripts/uberci-runner.mjs';

const sha='a'.repeat(40);
const good = {status: 'PASSED_WITH_TAP_EVIDENCE', evidence: { tests:1,pass:1,fail:0,skipped:0,footerSegments:1,nonVacuous:true }};
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uberci-test-'));
  t.after(() => fs.rm(dir,{recursive:true,force:true}));
  return dir;
}
function opts(dir, more={}) {
  return {cwd:dir, expectedSha:sha, outDir:path.join(dir,'receipts'), inspectGit:async (_exe,args)=>args.includes('HEAD')?sha:'',captureCommand:async(_exe,args)=>args[0]==='ci'?{status:'DEPENDENCIES_INSTALLED'}:{...good}, ...more};
}
test('requires exact SHA and rejects ambiguous / duplicate job selections',()=>{
  assert.equal(verifySha(sha),true);
  assert.equal(verifySha('abc'),false);
  assert.throws(()=>compileUberCiPlan({expectedSha:'HEAD'}),/full-40/);
  assert.throws(()=>resolveJobs('browser,browser'),/unknown-or-duplicate/);
  assert.throws(()=>resolveJobs('deploy'),/unknown-or-duplicate/);
  assert.deepEqual(resolveJobs(),['deterministic','browser','postgres']);
});
test('dry-run plan never claims executed tests or deployment authority',()=>{
  const p=compileUberCiPlan({expectedSha:sha});
  assert.equal(p.executionStatus,'NOT_EXECUTED');
  assert.equal(p.productionWriteAuthority,false);
  assert.equal(p.githubStatusWriteAuthority,false);
  assert.equal(p.commands.length,3);
  assert.deepEqual(p.prerequisite.args,['ci','--ignore-scripts']);
});
test('TAP evidence must include actual passing tests, not just success-shaped output',()=>{
  assert.equal(extractTapEvidence('success').nonVacuous,false);
  assert.equal(extractTapEvidence('# tests 3\n# pass 0\n# fail 0\n# skipped 3').nonVacuous,false);
  assert.equal(extractTapEvidence('# tests 3\n# pass 2\n# fail 1\n# skipped 0').nonVacuous,false);
  assert.equal(extractTapEvidence('# tests 3\n# pass 3\n# fail 0\n# skipped 0').nonVacuous,true);
});
test('wrong source SHA refuses before starting any command',async(t)=>{
  const dir=await fixture(t);let calls=0;
  await assert.rejects(executeUberCi(opts(dir,{inspectGit:async()=> 'b'.repeat(40),captureCommand:async()=>{calls++;return good}})),/sha-mismatch/);
  assert.equal(calls,0);
});
test('dirty worktree refuses before running dependencies',async(t)=>{
  const dir=await fixture(t);let calls=0;
  await assert.rejects(executeUberCi(opts(dir,{inspectGit:async(_,args)=>args.includes('HEAD')?sha:' M server.mjs',captureCommand:async()=>{calls++;return good}})),/source-worktree-must-be-clean/);
  assert.equal(calls,0);
});
test('complete source-matched clean run writes fail-closed receipt with no effect permissions',async(t)=>{
  const dir=await fixture(t);let calls=0;
  let secretObserved=false;
  const r=await executeUberCi(opts(dir,{env:{PATH:process.env.PATH,HOME:dir,PRODUCTION_API_KEY:'PRIVATE',DATABASE_URL:'postgres://production/real'},captureCommand:async(_exe,args,{env})=>{
    calls++;
    secretObserved||=('PRODUCTION_API_KEY' in env)||('DATABASE_URL' in env);
    return args[0]==='ci'?{status:'DEPENDENCIES_INSTALLED'}:{...good};
  }}));
  assert.equal(r.status,'INDEPENDENT_TEST_GATES_PASS_SOURCE_BOUND');
  assert.equal(calls,4);
  assert.equal(secretObserved,false);
  assert.equal(r.githubStatusWriteAuthority,false);
  assert.equal(r.deploymentAuthority,false);
  const saved=JSON.parse(await fs.readFile(path.join(dir,'receipts','receipt.json'),'utf8'));
  assert.equal(saved.sourceSha,sha);
});
test('subset jobs never certify all three release gates',async(t)=>{
  const dir=await fixture(t);
  const r=await executeUberCi(opts(dir,{jobs:'deterministic'}));
  assert.equal(r.status,'INCOMPLETE_OR_FAILED_VERIFICATION');
});
test('any failed gate remains red and is not silently retried or skipped',async(t)=>{
  const dir=await fixture(t);let count=0;
  const r=await executeUberCi(opts(dir,{captureCommand:async(_exe,args)=>{
    count++;
    return args[0]==='ci'?{status:'DEPENDENCIES_INSTALLED'}:(args.at(-1)==='test:browser'?{status:'FAILED'}:{...good});
  }}));
  assert.equal(r.status,'INCOMPLETE_OR_FAILED_VERIFICATION');
  assert.equal(count,4);
  assert.equal(r.jobs.browser.status,'FAILED');
  assert.equal(r.jobs.postgres.status,'PASSED_WITH_TAP_EVIDENCE');
});
test('failed dependency install runs no test jobs and persists failure state',async(t)=>{
  const dir=await fixture(t);let count=0;
  const r=await executeUberCi(opts(dir,{captureCommand:async()=>{count++;return {status:'FAILED',exitCode:1}}}));
  assert.equal(count,1);
  assert.equal(r.status,'DEPENDENCY_FAILURE');
  assert.equal(r.claimedTestsRun,false);
});
test('postgres skip results stay red', async t => {
  const dir = await fixture(t);
  const captureCommand = async (_exe,args) => args[0] === 'ci'
    ? {status:'DEPENDENCIES_INSTALLED'}
    : args.at(-1) === 'test:postgres-real'
      ? {status:'PASSED_WITH_TAP_EVIDENCE', evidence: {...good.evidence, skipped:1}}
      : {...good};
  const result = await executeUberCi(opts(dir, {captureCommand}));
  assert.equal(result.jobs.postgres.status,'INCOMPLETE_POSTGRES_SKIPPED_TESTS');
  assert.equal(result.status,'INCOMPLETE_OR_FAILED_VERIFICATION');
});
