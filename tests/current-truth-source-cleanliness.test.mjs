import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCurrentTruthRegeneration } from '../src/current-truth-regeneration.mjs';
import { truthInputDirtyPaths } from '../scripts/current-truth-regeneration.mjs';

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

test('provider workspace dirt cannot replace the scoped truth-input cleanliness proof',()=>{
  const withoutProof=verifyCurrentTruthRegeneration(base());
  assert.ok(withoutProof.reasonCodes.includes('readiness-must-be-measured-from-clean-source-checkout'));

  const withProof=verifyCurrentTruthRegeneration({...base(),truthInputCheckoutCleanBeforeRegeneration:true});
  assert.equal(withProof.reasonCodes.includes('readiness-must-be-measured-from-clean-source-checkout'),false);
  assert.equal(withProof.sourceCleanliness.truthInputCheckoutCleanBeforeRegeneration,true);
  assert.equal(withProof.sourceCleanliness.wholeWorkspaceCleanWhenReadinessMeasured,false);
});

test('scoped precheck rejects truth inputs while ignoring unrelated provider/runtime workspace metadata',()=>{
  assert.deepEqual(
    truthInputDirtyPaths(['.vercel/project.json','node_modules/x','src/changed.mjs','docs/CURRENT_SYSTEM_STATE.md','package.json']),
    ['docs/CURRENT_SYSTEM_STATE.md','package.json','src/changed.mjs']
  );
});
