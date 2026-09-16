import test from 'node:test';
import assert from 'node:assert/strict';
import {generateTask,commitHoldout,verifyHoldoutReveal,runPrivateEvidenceExperiment} from '../src/omega-private-evidence-lab.mjs';

test('holdout commitments reject mutation',()=>{
  const tasks=[generateTask({seed:'x',family:'CONFLICT',domain:'A'})];
  const salt='0123456789abcdef0123456789abcdef';
  const seal=commitHoldout({tasks,salt});
  assert.equal(verifyHoldoutReveal({commitment:seal.commitment,tasks,salt}),true);
  const changed=structuredClone(tasks); changed[0].domain='B';
  assert.equal(verifyHoldoutReveal({commitment:seal.commitment,tasks:changed,salt}),false);
});

test('replicated fixture amortizes discovery',()=>{
  for(let i=0;i<2;i++){
    const out=runPrivateEvidenceExperiment({sourceSeed:`src-${i}`,targetSeed:`dst-${i}`,targetSalt:`0123456789abcdef-${i}`,perFamilySource:8,perFamilyTarget:16});
    assert.equal(out.receipt.allVerified,true);
    assert.equal(out.receipt.amortizedAdvantage,true);
  }
});
