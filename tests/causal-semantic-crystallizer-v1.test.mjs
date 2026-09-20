import test from 'node:test';
import assert from 'node:assert/strict';
import {
  crystallizeSemanticCausalOperators,
  describeCausalMotif,
  frozenTrainingMotifs,
  runCausalSemanticCrystallizerV1
} from '../src/causal-semantic-crystallizer-v1.mjs';

test('different XOR syntax crystallizes to one exact semantic signature',()=>{
  const result=crystallizeSemanticCausalOperators({motifs:frozenTrainingMotifs()});
  assert.equal(result.ok,true);
  assert.equal(result.crystalCount,3);
  assert.ok(result.crystals.every(c=>c.distinctSyntaxCount>=2));
});

test('a NAND negative control is not equivalent to AND',()=>{
  const model={nodes:[
    {id:'A',type:'INPUT',parents:[]},{id:'B',type:'INPUT',parents:[]},
    {id:'D',type:'AND',parents:['A','B']},{id:'M',type:'NOT',parents:['D']}
  ],exogenous:{A:0,B:0},controllableIds:['A','B']};
  const nand=describeCausalMotif({id:'nand',model,rootId:'M'});
  const crystals=crystallizeSemanticCausalOperators({motifs:frozenTrainingMotifs()});
  assert.equal(crystals.crystals.some(c=>c.semanticSignature===nand.motif.semanticSignature),false);
});

test('preregistered heldout benchmark preserves exact minima and reduces symbolic expansion',()=>{
  const result=runCausalSemanticCrystallizerV1();
  assert.equal(result.ok,true);
  assert.equal(result.exactMinimumAgreementRate,1);
  assert.equal(result.crystalMatchRate,1);
  assert.equal(result.negativeControlFalseMatchRate,0);
  assert.ok(result.heldOutCaseCount>=24);
  assert.ok(result.medianSymbolicExpansionReductionFraction>=0.30);
});

test('positive result never becomes causal discovery',()=>{
  const result=runCausalSemanticCrystallizerV1();
  if(!result.falsifierTriggered) assert.equal(result.promotionCandidate.authority,'REVIEW_REQUIRED__NO_SELF_PROMOTION');
  assert.match(result.claimBoundary,/FINITE_BOOLEAN/);
  assert.equal(result.externalEffectAuthority,'NONE');
});
