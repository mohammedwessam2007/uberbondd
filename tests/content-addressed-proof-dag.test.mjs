import test from 'node:test';
import assert from 'node:assert/strict';
import {compileProofDag,inspectProofAncestry,assertObservedProof} from '../src/content-addressed-proof-dag.mjs';

const cleanProofs=()=>[
  {id:'raw-a',kind:'measurement',evidenceRef:'receipt:raw-a',parents:[],synthetic:false,sourceClass:'OBSERVED',observed:true,verifierRef:'verifier:a'},
  {id:'review-b',kind:'review',evidenceRef:'receipt:review-b',parents:['raw-a'],synthetic:false,sourceClass:'DERIVED',observed:true,verifierRef:'verifier:b'},
  {id:'decision-c',kind:'decision',evidenceRef:'receipt:decision-c',parents:['review-b'],synthetic:false,sourceClass:'DERIVED',observed:true,verifierRef:'verifier:c'}
];

test('proof nodes are content addressed through parent addresses',()=>{
  const a=compileProofDag({proofs:cleanProofs()});
  const b=compileProofDag({proofs:[...cleanProofs()].reverse()});
  assert.equal(a.ok,true);assert.equal(b.ok,true);
  assert.equal(a.dagDigest,b.dagDigest);
  assert.ok(a.nodes.every(node=>/^sha256:[0-9a-f]{64}$/.test(node.address)));
  const decision=a.nodes.find(node=>node.id==='decision-c');
  assert.equal(decision.parentAddresses.length,1);
});

test('missing parents and cycles fail closed',()=>{
  const missing=compileProofDag({proofs:[{id:'x',kind:'review',evidenceRef:'x',parents:['nope'],sourceClass:'DERIVED'}]});
  assert.equal(missing.ok,false);assert.ok(missing.reasonCodes.some(code=>code.startsWith('proof-parent-missing:')));
  const cycle=compileProofDag({proofs:[
    {id:'a',kind:'x',evidenceRef:'a',parents:['b'],sourceClass:'DERIVED'},
    {id:'b',kind:'x',evidenceRef:'b',parents:['a'],sourceClass:'DERIVED'}
  ]});
  assert.equal(cycle.ok,false);assert.ok(cycle.reasonCodes.some(code=>code.startsWith('proof-cycle:')));
});

test('synthetic ancestry can never disappear beneath later reviews',()=>{
  const dag=compileProofDag({proofs:[
    {id:'sim',kind:'simulation',evidenceRef:'receipt:sim',parents:[],synthetic:true,sourceClass:'SYNTHETIC',observed:false},
    {id:'review',kind:'review',evidenceRef:'receipt:review',parents:['sim'],synthetic:false,sourceClass:'DERIVED',observed:true},
    {id:'final',kind:'claim',evidenceRef:'receipt:final',parents:['review'],synthetic:false,sourceClass:'DERIVED',observed:true}
  ]});
  assert.equal(dag.ok,true);
  const ancestry=inspectProofAncestry({dag,proofId:'final'});
  assert.equal(ancestry.containsSyntheticAncestry,true);
  assert.deepEqual(ancestry.syntheticAncestorIds,['sim']);
  const admissible=assertObservedProof({dag,proofId:'final'});
  assert.equal(admissible.ok,false);
  assert.ok(admissible.reasonCodes.includes('synthetic-ancestry-visible-and-not-admissible-as-observed-proof'));
});

test('clean observed proof ancestry can be admitted without creating action authority',()=>{
  const dag=compileProofDag({proofs:cleanProofs()});
  const result=assertObservedProof({dag,proofId:'decision-c'});
  assert.equal(result.ok,true);
  assert.equal(result.externalEffectAuthority,'NONE');
  assert.equal(result.businessEffectAuthority,'NONE');
});
