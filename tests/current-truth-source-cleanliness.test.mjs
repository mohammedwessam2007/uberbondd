import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCurrentTruthRegeneration, truthInputDirtyPaths } from '../src/current-truth-regeneration.mjs';

const HEAD='a'.repeat(40);
const base=()=>({
  headSha:HEAD,
  readiness:{
    generatedBy:'scripts/system-readiness.mjs',
    repository:{head:HEAD,workingTreeClean:false},
    measurements:{}
  },
  generatorResults:{readiness:{exitCode:0},coverage:{exitCode:0},leafGraph:{exitCode:0}}
});

test('observed non-truth provider workspace dirt may coexist with a clean source checkout',()=>{
  const withoutObservedDirt=verifyCurrentTruthRegeneration(base());
  assert.ok(withoutObservedDirt.reasonCodes.includes('readiness-must-be-measured-from-clean-source-checkout'));

  const withProviderDirt=verifyCurrentTruthRegeneration({...base(),preRegenerationDirtyPaths:['.vercel/project.json']});
  assert.equal(withProviderDirt.reasonCodes.includes('readiness-must-be-measured-from-clean-source-checkout'),false);
  assert.equal(withProviderDirt.sourceCleanliness.preRegenerationDirtyPathsObserved,true);
  assert.equal(withProviderDirt.sourceCleanliness.preRegenerationDirtyPathCount,1);
  assert.deepEqual(withProviderDirt.sourceCleanliness.preRegenerationTruthInputDirtyPaths,[]);
  assert.equal(withProviderDirt.sourceCleanliness.wholeWorkspaceCleanWhenReadinessMeasured,false);
});

test('truth-input dirt still fails closed even when a caller supplies the observed path list',()=>{
  const out=verifyCurrentTruthRegeneration({...base(),preRegenerationDirtyPaths:['src/changed.mjs','.vercel/project.json']});
  assert.ok(out.reasonCodes.includes('readiness-must-be-measured-from-clean-source-checkout'));
  assert.deepEqual(out.sourceCleanliness.preRegenerationTruthInputDirtyPaths,['src/changed.mjs']);
});

test('empty observed dirt cannot excuse a readiness measurement that says the workspace was dirty',()=>{
  const out=verifyCurrentTruthRegeneration({...base(),preRegenerationDirtyPaths:[]});
  assert.ok(out.reasonCodes.includes('readiness-must-be-measured-from-clean-source-checkout'));
});

test('scoped classifier rejects truth inputs while ignoring unrelated provider/runtime workspace metadata',()=>{
  assert.deepEqual(
    truthInputDirtyPaths(['.vercel/project.json','node_modules/x','src/changed.mjs','docs/CURRENT_SYSTEM_STATE.md','package.json']),
    ['docs/CURRENT_SYSTEM_STATE.md','package.json','src/changed.mjs']
  );
});
