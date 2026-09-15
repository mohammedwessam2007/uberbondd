import test from 'node:test';
import assert from 'node:assert/strict';
import { learnStructuralPolicy, evaluateStructuralPolicyTransfer, verifyStructuralAssignment } from '../src/omega-structural-transfer-canary-v2.mjs';

const source = [
  {
    id:'map-1', domain:'MAP_COLORING', variables:['a','b','c','d','e','z'], labels:['0','1','2'],
    conflicts:[['a','b'],['c','z'],['d','z'],['a','z'],['b','z'],['a','d'],['c','e'],['a','c']], givens:{c:'2',e:'0'}
  },
  {
    id:'map-2', domain:'MAP_COLORING', variables:['a','b','c','d','e','z'], labels:['0','1','2'],
    conflicts:[['e','z'],['d','z'],['d','e'],['a','z'],['a','e'],['a','b'],['c','e']], givens:{a:'2',z:'1'}
  }
];

const target = [{
  id:'radio-heldout-1', domain:'RADIO_CHANNEL_ASSIGNMENT', variables:['antenna','backup','core','dock','edge','zone'], labels:['0','1','2'],
  conflicts:[['backup','zone'],['antenna','dock'],['antenna','zone'],['dock','edge'],['core','dock'],['antenna','edge'],['backup','core'],['core','edge'],['edge','zone'],['backup','dock']], givens:{edge:'1'}
}];

test('source performance selects high-degree structural policy without target access',()=>{
  const learned=learnStructuralPolicy({sourceProblems:source});
  assert.equal(learned.ok,true);
  assert.equal(learned.crystal.selectedPolicy,'HIGH_DEGREE_FIRST');
  assert.equal(learned.crystal.containsTargetProblems,false);
  assert.equal(learned.crystal.containsAnswers,false);
  assert.deepEqual(learned.crystal.sourceDomains,['MAP_COLORING']);
  assert.ok(learned.sourceEvidence.totals.HIGH_DEGREE_FIRST < learned.sourceEvidence.totals.LEXICAL);
  assert.ok(learned.sourceEvidence.totals.HIGH_DEGREE_FIRST < learned.sourceEvidence.totals.LOW_DEGREE_FIRST);
});

test('learned policy reduces independently verified work in a sealed differently named domain',()=>{
  const learned=learnStructuralPolicy({sourceProblems:source});
  const evaluated=evaluateStructuralPolicyTransfer({crystal:learned.crystal,targetProblems:target});
  assert.equal(evaluated.ok,true);
  assert.equal(evaluated.receipt.domainNovel,true);
  assert.deepEqual(evaluated.receipt.targetDomains,['RADIO_CHANNEL_ASSIGNMENT']);
  assert.equal(evaluated.receipt.passedNarrowTransferCanary,true);
  assert.ok(evaluated.receipt.transferredWork < evaluated.receipt.coldWork);
  assert.ok(evaluated.receipt.verifiedReductionFraction > 0);
  assert.match(evaluated.truthBoundary,/narrow evidence/i);
});

test('independent verifier rejects an invalid target assignment',()=>{
  const bad={antenna:'0',backup:'2',core:'2',dock:'2',edge:'1',zone:'0'};
  const verdict=verifyStructuralAssignment({problem:target[0],assignment:bad});
  assert.equal(verdict.ok,true);
  assert.equal(verdict.valid,false);
  assert.equal(verdict.checks.conflicts,false);
});
