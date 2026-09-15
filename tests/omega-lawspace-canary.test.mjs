import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileCognitiveLawFamily,
  instantiateCognitiveLaw,
  crystallizeLawTopology,
  verifyLawAssignment,
  solveWithCrystallizedDynamics,
  solveColdGenericDynamics,
  solveColdEnumeration,
  compileExactFailureRepeller,
  benchmarkStructuralCrystallization
} from '../src/omega-lawspace-canary.mjs';

const zero = receipt => {
  assert.equal(receipt.businessEffectAuthority, 'NONE');
  assert.equal(receipt.externalEffectAuthority, 'NONE');
  assert.deepEqual(receipt.externalEffectLedger, {
    providerCalls: 0,
    messages: 0,
    purchases: 0,
    deployments: 0,
    credentialChanges: 0,
    dnsChanges: 0,
    productionMutations: 0,
    spendCents: 0
  });
};

function latin3Family() {
  const variables = [];
  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) variables.push({ id: `r${r}c${c}`, domain: [1, 2, 3] });
  const constraints = [];
  for (let r = 0; r < 3; r += 1) constraints.push({ type: 'allDifferent', vars: [0, 1, 2].map(c => `r${r}c${c}`) });
  for (let c = 0; c < 3; c += 1) constraints.push({ type: 'allDifferent', vars: [0, 1, 2].map(r => `r${r}c${c}`) });
  const receipt = compileCognitiveLawFamily({ name: 'latin-square-3', variables, constraints });
  assert.equal(receipt.ok, true);
  return receipt.family;
}

function instance(family, instanceId, givens) {
  const receipt = instantiateCognitiveLaw({ family, instanceId, givens });
  assert.equal(receipt.ok, true);
  return receipt.instance;
}

test('law family and crystal separate reusable topology from instance data', () => {
  const family = latin3Family();
  const a = instance(family, 'a', { r0c0: 1, r1c1: 3, r2c2: 2 });
  const b = instance(family, 'b', { r0c0: 2, r1c1: 1, r2c2: 3 });
  assert.equal(a.familyHash, b.familyHash);
  assert.notDeepEqual(a.givens, b.givens);

  const crystalReceipt = crystallizeLawTopology({ family });
  assert.equal(crystalReceipt.ok, true);
  zero(crystalReceipt);
  assert.equal(crystalReceipt.crystal.containsInstanceData, false);
  assert.equal(crystalReceipt.crystal.containsAnswers, false);
  assert.equal(JSON.stringify(crystalReceipt.crystal).includes('givens'), false);
});

test('crystallized dynamics solves held-out related instances with independent verification', () => {
  const family = latin3Family();
  const crystal = crystallizeLawTopology({ family }).crystal;
  const heldout = instance(family, 'heldout', { r0c0: 2, r1c1: 1, r2c2: 3 });
  const solved = solveWithCrystallizedDynamics({ instance: heldout, crystal });
  assert.equal(solved.ok, true);
  assert.equal(solved.verifier.valid, true);
  assert.equal(verifyLawAssignment({ instance: heldout, assignment: solved.assignment }).valid, true);
  assert.ok(solved.metrics.constraintEvaluations > 0);
  zero(solved);
});

test('structural crystallization benchmark separates naive enumeration from fresh and reused dynamics', () => {
  const family = latin3Family();
  const instances = [
    instance(family, 'heldout-1', { r0c0: 1, r1c1: 3, r2c2: 2 }),
    instance(family, 'heldout-2', { r0c0: 2, r1c1: 1, r2c2: 3 }),
    instance(family, 'heldout-3', { r0c0: 3, r1c1: 2, r2c2: 1 })
  ];
  const benchmark = benchmarkStructuralCrystallization({ family, instances });
  assert.equal(benchmark.ok, true);
  assert.ok(benchmark.summary.enumerationWork > benchmark.summary.reusedCrystalWork);
  assert.ok(benchmark.summary.branchReductionVsNaiveEnumeration > 1);
  assert.equal(benchmark.summary.freshTopologyCompilations, instances.length);
  assert.equal(benchmark.summary.reusedTopologyCompilations, 1);
  assert.equal(benchmark.summary.avoidedRepeatedTopologyCompilations, instances.length - 1);
  assert.equal(benchmark.summary.learnedTransferClaim, false);
  for (const row of benchmark.rows) assert.equal(row.freshDynamicsBranches, row.reusedCrystalBranches);
  assert.match(benchmark.summary.truthBoundary, /not a strong domain-solver baseline/i);
  zero(benchmark);
});

test('cold generic dynamics recompiles topology and remains independently valid', () => {
  const family = latin3Family();
  const heldout = instance(family, 'fresh-dynamics', { r0c0: 1, r1c1: 3, r2c2: 2 });
  const cold = solveColdGenericDynamics({ instance: heldout });
  assert.equal(cold.ok, true);
  assert.equal(cold.verifier.valid, true);
  assert.equal(cold.metrics.topologyCompilations, 1);
});

test('cold enumeration remains independently valid rather than serving as a fake straw verifier', () => {
  const family = latin3Family();
  const heldout = instance(family, 'cold', { r0c0: 1, r1c1: 3, r2c2: 2 });
  const cold = solveColdEnumeration({ instance: heldout });
  assert.equal(cold.ok, true);
  assert.equal(cold.verifier.valid, true);
  assert.ok(cold.metrics.candidatesEvaluated >= 1);
});

test('ordered constraints preserve orientation during canonicalization', () => {
  const receipt = compileCognitiveLawFamily({
    name: 'ordered-pair',
    variables: [{ id: 'x', domain: [1, 2, 3] }, { id: 'y', domain: [1, 2, 3] }],
    constraints: [{ type: 'lt', vars: ['y', 'x'] }]
  });
  assert.equal(receipt.ok, true);
  const lt = receipt.family.constraints.find(constraint => constraint.type === 'lt');
  assert.deepEqual(lt.vars, ['y', 'x']);
  const validInstance = instance(receipt.family, 'ordered', { y: 2, x: 3 });
  assert.equal(verifyLawAssignment({ instance: validInstance, assignment: { x: 3, y: 2 } }).valid, true);
  assert.equal(verifyLawAssignment({ instance: validInstance, assignment: { x: 2, y: 3 } }).valid, false);
});

test('general primitive domains allow strings but numeric-only constraints refuse them', () => {
  const symbolic = compileCognitiveLawFamily({
    name: 'symbolic-neq',
    variables: [{ id: 'a', domain: ['red', 'blue'] }, { id: 'b', domain: ['red', 'blue'] }],
    constraints: [{ type: 'neq', vars: ['a', 'b'] }]
  });
  assert.equal(symbolic.ok, true);
  const symbolicInstance = instance(symbolic.family, 'symbols', { a: 'red' });
  const solved = solveWithCrystallizedDynamics({ instance: symbolicInstance, crystal: crystallizeLawTopology({ family: symbolic.family }).crystal });
  assert.equal(solved.ok, true);
  assert.equal(solved.assignment.b, 'blue');

  const illegalNumeric = compileCognitiveLawFamily({
    name: 'illegal-lt',
    variables: [{ id: 'a', domain: ['red', 'blue'] }, { id: 'b', domain: ['red', 'blue'] }],
    constraints: [{ type: 'lt', vars: ['a', 'b'] }]
  });
  assert.equal(illegalNumeric.ok, false);
  assert.ok(illegalNumeric.reasonCodes.includes('invalid-constraints'));
});

test('independent verifier rejects assignments with undeclared extra state', () => {
  const family = latin3Family();
  const heldout = instance(family, 'strict', { r0c0: 1, r1c1: 3, r2c2: 2 });
  const solved = solveWithCrystallizedDynamics({ instance: heldout, crystal: crystallizeLawTopology({ family }).crystal });
  assert.equal(solved.ok, true);
  const polluted = { ...solved.assignment, secretExtra: 42 };
  const verdict = verifyLawAssignment({ instance: heldout, assignment: polluted });
  assert.equal(verdict.valid, false);
  assert.equal(verdict.checks.exactKeys, false);
});

test('crystal cannot cross an incompatible topology boundary', () => {
  const latin = latin3Family();
  const crystal = crystallizeLawTopology({ family: latin }).crystal;
  const otherReceipt = compileCognitiveLawFamily({
    name: 'two-variable-order',
    variables: [{ id: 'x', domain: [1, 2, 3] }, { id: 'y', domain: [1, 2, 3] }],
    constraints: [{ type: 'lt', vars: ['x', 'y'] }]
  });
  assert.equal(otherReceipt.ok, true);
  const other = instantiateCognitiveLaw({ family: otherReceipt.family, givens: { x: 1 } }).instance;
  const refused = solveWithCrystallizedDynamics({ instance: other, crystal });
  assert.equal(refused.ok, false);
  assert.ok(refused.reasonCodes.includes('crystal-family-mismatch'));
});

test('failure geometry is exact, evidence-bound, and cannot mark a valid solution as failure', () => {
  const family = latin3Family();
  const heldout = instance(family, 'repeller', { r0c0: 1 });
  const invalid = Object.fromEntries(family.variables.map(variable => [variable.id, 1]));
  const repeller = compileExactFailureRepeller({ instance: heldout, failedAssignment: invalid, evidenceRef: 'test:observed-invalid-assignment' });
  assert.equal(repeller.ok, true);
  assert.equal(repeller.repeller.scope, 'EXACT_ASSIGNMENT_ONLY');
  assert.equal(repeller.repeller.evidenceRef, 'test:observed-invalid-assignment');

  const extraState = compileExactFailureRepeller({ instance: heldout, failedAssignment: { ...invalid, surprise: 9 } });
  assert.equal(extraState.ok, false);
  assert.ok(extraState.reasonCodes.includes('complete-failed-assignment-required'));

  const crystal = crystallizeLawTopology({ family }).crystal;
  const solved = solveWithCrystallizedDynamics({ instance: heldout, crystal, failureGeometry: [repeller.repeller] });
  assert.equal(solved.ok, true);
  assert.equal(solved.verifier.valid, true);

  const validRepeller = compileExactFailureRepeller({ instance: heldout, failedAssignment: solved.assignment });
  assert.equal(validRepeller.ok, false);
  assert.ok(validRepeller.reasonCodes.includes('valid-solution-cannot-be-repeller'));
});
