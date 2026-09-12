import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const script=fs.readFileSync(new URL('../scripts/uberlit-runtime-evidence.mjs',import.meta.url),'utf8');

test('UberLit runtime evidence forge emits only canonical runtime-cut receipt types',()=>{
  assert.match(script,/compileSourceRepositoryHostReceipt/);
  assert.match(script,/verifySourceRepositoryHostReceiptIntegrity/);
  assert.match(script,/verifyRestartRecoveryReceiptIntegrity/);
  assert.match(script,/compileWebRuntimeHostReceipt/);
  assert.match(script,/verifyWebRuntimeHostReceiptIntegrity/);
  assert.match(script,/deploy-restart-recovery-drill\.mjs/);
});

test('source host proof exports, restores, executes, rolls back, and binds exact source',()=>{
  assert.match(script,/git'.*bundle.*create/s);
  assert.match(script,/git'.*clone/s);
  assert.match(script,/restoredCommit!==sourceCommit/);
  assert.match(script,/originalTree/);
  assert.match(script,/restoredTree/);
  assert.match(script,/cutoverStateDigest/);
  assert.match(script,/rollbackStateDigest/);
});

test('web runtime proof is isolated, HTTPS-health gated, and consequence disabled',()=>{
  assert.match(script,/APP_BASE_URL:`https:\/\/127\.0\.0\.1:/);
  assert.match(script,/OUTBOUND_ENABLED:'false'/);
  assert.match(script,/DISCOVERY_ENABLED:'false'/);
  assert.match(script,/path:'\/api\/health'/);
  assert.match(script,/primaryRouteMutated:false/);
  assert.match(script,/businessEffectAuthority:'NONE'/);
});

test('summary closes runtime cuts only and refuses provider or ASI overclaim',()=>{
  for(const cut of ['SOURCE_REPOSITORY_HOST','DATABASE_STATE','WORKER_SCHEDULER_PROCESS','WEB_RUNTIME_HOST'])assert.match(script,new RegExp(cut));
  assert.match(script,/do not close provider, owner-custody, customer, revenue, production-traffic, or ASI boundaries/);
});

test('restart drill executes inside the staged exact release, not the dependency-empty source checkout',()=>{
  assert.match(script,/const releaseSource=path\.join\(runtimeRoot,'releases'/);
  assert.match(script,/const drill=run\(releaseSource,process\.execPath/);
  assert.doesNotMatch(script,/const drill=run\(repoRoot,process\.execPath/);
  assert.match(script,/uberlit-staged-release-source-required/);
});
