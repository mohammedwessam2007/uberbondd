import test from 'node:test';
import assert from 'node:assert/strict';
import { learnStructuralOrderingCrystal, evaluateStructuralTransfer, verifyConflictAssignment } from '../src/omega-structural-transfer-canary.mjs';

const source = [
  {
    id: 'map-1', domain: 'MAP_COLORING', variables: ['a','b','c','d','e','z'], labels: ['red','green','blue'],
    conflicts: [['b','e'],['a','e'],['d','e'],['a','b'],['a','z']], givens: { d: 'blue', z: 'red' }
  },
  {
    id: 'map-2', domain: 'MAP_COLORING', variables: ['a','b','c','d','e','z'], labels: ['red','green','blue'],
    conflicts: [['d','z'],['a','c'],['a','z'],['a','d'],['e','z'],['b','e'],['d','e'],['b','d'],['c','d']], givens: { e: 'green' }
  }
];

const target = [
  {
    id: 'radio-heldout-1', domain: 'RADIO_CHANNEL_ASSIGNMENT', variables: ['antenna','backup','core','dock','edge','zone'], labels: ['ch-7','ch-11','ch-19'],
    conflicts: [['antenna','edge'],['core','edge'],['antenna','zone'],['antenna','core'],['core','zone'],['backup','edge'],['core','dock'],['dock','edge'],['backup','zone']], givens: { backup: 'ch-19' }
  }
];

test('a policy learned in map coloring transfers by structure to a sealed radio-assignment domain', () => {
  const learned = learnStructuralOrderingCrystal({ sourceProblems: source });
  assert.equal(learned.ok, true);
  assert.equal(learned.crystal.containsTargetProblems, false);
  assert.equal(learned.crystal.containsAnswers, false);
  assert.equal(learned.crystal.selectedPolicy, 'HIGH_DEGREE_FIRST');
  assert.deepEqual(learned.crystal.sourceDomains, ['MAP_COLORING']);

  const evaluated = evaluateStructuralTransfer({ crystal: learned.crystal, targetProblems: target });
  assert.equal(evaluated.ok, true);
  assert.equal(evaluated.receipt.domainNovel, true);
  assert.equal(evaluated.receipt.passedNarrowTransferCanary, true);
  assert.ok(evaluated.receipt.transferredWork < evaluated.receipt.coldWork);
  assert.ok(evaluated.receipt.verifiedReductionFraction > 0);
  assert.match(evaluated.truthBoundary, /not broad cross-domain intelligence/i);
});

test('independent target verifier rejects a conflict even if a transferred policy exists', () => {
  const bad = { antenna: 'ch-7', backup: 'ch-19', core: 'ch-7', dock: 'ch-11', edge: 'ch-11', zone: 'ch-19' };
  const verdict = verifyConflictAssignment({ problem: target[0], assignment: bad });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.valid, false);
  assert.equal(verdict.checks.conflictsValid, false);
});

test('the transfer crystal cannot silently claim a target domain was part of training', () => {
  const learned = learnStructuralOrderingCrystal({ sourceProblems: source });
  assert.equal(learned.crystal.sourceDomains.includes('RADIO_CHANNEL_ASSIGNMENT'), false);
  const evaluated = evaluateStructuralTransfer({ crystal: learned.crystal, targetProblems: target });
  assert.deepEqual(evaluated.receipt.targetDomains, ['RADIO_CHANNEL_ASSIGNMENT']);
});
