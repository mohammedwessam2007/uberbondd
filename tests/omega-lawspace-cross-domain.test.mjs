import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCognitiveLawFamily, instantiateCognitiveLaw, crystallizeLawTopology, solveWithCrystallizedDynamics, verifyLawAssignment } from '../src/omega-lawspace-canary.mjs';

function compileAndSolve({ name, variables, constraints, givens = {} }) {
  const familyReceipt = compileCognitiveLawFamily({ name, variables, constraints });
  assert.equal(familyReceipt.ok, true);
  const instanceReceipt = instantiateCognitiveLaw({ family: familyReceipt.family, instanceId: `${name}-heldout`, givens });
  assert.equal(instanceReceipt.ok, true);
  const crystalReceipt = crystallizeLawTopology({ family: familyReceipt.family });
  assert.equal(crystalReceipt.ok, true);
  const solved = solveWithCrystallizedDynamics({ instance: instanceReceipt.instance, crystal: crystalReceipt.crystal });
  assert.equal(solved.ok, true);
  assert.equal(solved.verifier.valid, true);
  assert.equal(verifyLawAssignment({ instance: instanceReceipt.instance, assignment: solved.assignment }).valid, true);
  return { family: familyReceipt.family, instance: instanceReceipt.instance, solved };
}

test('one Law IR backend solves graph coloring without puzzle-specific solver code', () => {
  const out = compileAndSolve({
    name: 'triangle-coloring',
    variables: ['a', 'b', 'c'].map(id => ({ id, domain: ['red', 'green', 'blue'] })),
    constraints: [
      { type: 'neq', vars: ['a', 'b'] },
      { type: 'neq', vars: ['b', 'c'] },
      { type: 'neq', vars: ['a', 'c'] }
    ],
    givens: { a: 'red' }
  });
  assert.notEqual(out.solved.assignment.b, 'red');
  assert.notEqual(out.solved.assignment.c, 'red');
  assert.notEqual(out.solved.assignment.b, out.solved.assignment.c);
});

test('the same backend preserves directed ordering semantics for a scheduling-like problem', () => {
  const out = compileAndSolve({
    name: 'precedence-schedule',
    variables: ['design', 'build', 'verify'].map(id => ({ id, domain: [0, 1, 2, 3, 4] })),
    constraints: [
      { type: 'lt', vars: ['design', 'build'] },
      { type: 'lt', vars: ['build', 'verify'] }
    ],
    givens: { design: 0 }
  });
  assert.ok(out.solved.assignment.design < out.solved.assignment.build);
  assert.ok(out.solved.assignment.build < out.solved.assignment.verify);
});

test('the same backend handles numeric conservation-like sum constraints', () => {
  const out = compileAndSolve({
    name: 'bounded-allocation',
    variables: ['x', 'y', 'z'].map(id => ({ id, domain: [0, 1, 2, 3, 4] })),
    constraints: [
      { type: 'sumEq', vars: ['x', 'y', 'z'], target: 6 },
      { type: 'neq', vars: ['x', 'y'] }
    ],
    givens: { x: 1 }
  });
  assert.equal(out.solved.assignment.x + out.solved.assignment.y + out.solved.assignment.z, 6);
  assert.notEqual(out.solved.assignment.x, out.solved.assignment.y);
});

test('cross-family success is not mislabeled as automatic semantic compilation or learned transfer', () => {
  const result = compileAndSolve({
    name: 'boolean-separation',
    variables: [{ id: 'p', domain: [true, false] }, { id: 'q', domain: [true, false] }],
    constraints: [{ type: 'neq', vars: ['p', 'q'] }],
    givens: { p: true }
  });
  assert.equal(result.solved.assignment.q, false);
  const truthBoundary = 'These tests manually express several domains in the same typed Law IR. They test execution generality only; they do not demonstrate natural-language-to-IR compilation, learned cross-domain transfer, or frontier intelligence.';
  assert.match(truthBoundary, /do not demonstrate.*learned cross-domain transfer/i);
});
