import test from 'node:test';
import assert from 'node:assert/strict';
import { compileMoonshotAdversarialTribunal } from '../src/moonshot-adversarial-tribunal.mjs';

const base={
  claimId:'c1',claim:'A bounded mechanism preserves exactness.',falsifier:'Any held-out exactness failure.',
  builderInstanceRef:'builder-1',
  reviewer:{executionInstanceRef:'reviewer-1',contextRef:'isolated-review',contextIsolation:true,canWidenAuthority:false}
};

test('independent tribunal can preserve a survived review without granting promotion',()=>{
  const r=compileMoonshotAdversarialTribunal({...base,challenges:[
    {id:'heldout',attack:'Run held-out counterexamples.',verdict:'SURVIVED',evidenceRefs:['test:heldout']}
  ]});
  assert.equal(r.status,'ADVERSARIAL_REVIEW_SURVIVED');
  assert.equal(r.promotionAuthority,'NONE');
  assert.equal(r.externalEffectAuthority,'NONE');
});

test('contradictory challenge remains a falsification',()=>{
  const r=compileMoonshotAdversarialTribunal({...base,challenges:[
    {id:'counterexample',attack:'Find one exact counterexample.',verdict:'FALSIFIED',evidenceRefs:['test:counterexample']}
  ]});
  assert.equal(r.status,'ADVERSARIAL_CLAIM_FALSIFIED');
  assert.deepEqual(r.falsifiedChallengeIds,['counterexample']);
});

test('same execution instance cannot review its own build',()=>{
  const r=compileMoonshotAdversarialTribunal({...base,reviewer:{executionInstanceRef:'builder-1',contextRef:'same',contextIsolation:true},challenges:[
    {id:'x',attack:'x',verdict:'SURVIVED'}
  ]});
  assert.equal(r.ok,false);
  assert.ok(r.reasonCodes.includes('reviewer-must-be-distinct-execution-instance'));
});

test('unresolved evidence is not silently converted into a pass',()=>{
  const r=compileMoonshotAdversarialTribunal({...base,challenges:[
    {id:'unknown',attack:'External replication unavailable.',verdict:'UNRESOLVED'}
  ]});
  assert.equal(r.status,'ADVERSARIAL_REVIEW_UNRESOLVED');
});
