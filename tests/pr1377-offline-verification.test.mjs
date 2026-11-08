import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {discoverPR1377FocusedTests,runPR1377OfflineChecks}
  from '../scripts/pr1377-offline-verification.mjs';
test('offline no-tests holds instead of fabricating CI success',()=>{
 const root=mkdtempSync(join(tmpdir(),'uberbond-ci-'));
 try{const x=runPR1377OfflineChecks({root});
  assert.equal(x.verified,false);assert.equal(x.status,'NO_FOCUSED_TEST_FILES');
  assert.equal(x.externalEffects,0);assert.equal(x.providerCalls,0);
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('only PR1377-focused test names selected, sorted deterministically',()=>{
 const root=mkdtempSync(join(tmpdir(),'uberbond-ci-'));
 try{mkdirSync(join(root,'tests'));
  for(const name of ['prospect-evidence-freshness.test.mjs','gspot-owner.test.mjs',
   'random-campaign.test.mjs','prospect-source.txt','revenue-singularity-evidence-bridge.test.mjs']){
    writeFileSync(join(root,'tests',name),'');
  }
  const files=discoverPR1377FocusedTests({root});
  assert.deepEqual(files.map(x=>x.split('/').pop()),[
   'gspot-owner.test.mjs','prospect-evidence-freshness.test.mjs',
   'revenue-singularity-evidence-bridge.test.mjs']);
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('no missing test path silently produces historical 370/372 claimed green',()=>{
 const root=mkdtempSync(join(tmpdir(),'uberbond-ci-'));
 try{const x=runPR1377OfflineChecks({root});
  assert.equal(x.verified,false);assert.equal(x.passed,undefined);
 }finally{rmSync(root,{recursive:true,force:true})}
});
