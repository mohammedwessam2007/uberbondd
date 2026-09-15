import test from 'node:test';
import assert from 'node:assert/strict';
import { compileIrreducibleWorkFloor, adjudicateWorkReductionClaim } from '../src/omega-irreducible-work-ledger.mjs';

const floor = () => compileIrreducibleWorkFloor({
  taskClass: 'identify-one-of-256-equally-possible-hidden-states',
  observedWork: 20,
  certifiedLowerBound: 8,
  unit: 'binary-queries',
  boundClass: 'INFORMATION_QUERY',
  evidenceRefs: ['theorem:decision-tree-information-bound']
});

test('work floor exposes remaining headroom without claiming the excess is achievable', () => {
  const out = floor();
  assert.equal(out.ok, true);
  assert.equal(out.floor.excessAboveFloor, 12);
  assert.equal(out.floor.maximumTheoreticalReductionFraction, 0.6);
  assert.equal(out.floor.distanceToFloorRatio, 2.5);
  assert.match(out.truthBoundary, /does not derive or validate/i);
  assert.equal(out.externalEffectAuthority, 'NONE');
});

test('claim below certified floor fails epistemically rather than being celebrated as a wormhole', () => {
  const out = floor();
  const impossible = adjudicateWorkReductionClaim({ floor: out.floor, claimedWork: 7 });
  assert.equal(impossible.ok, true);
  assert.equal(impossible.admissibleUnderCurrentBound, false);
  assert.equal(impossible.status, 'OMEGA_WORK_CLAIM_CONTRADICTS_CERTIFIED_FLOOR');
  assert.match(impossible.evidenceRequiredToGoLower, /SUPERSEDE_OR_INVALIDATE/);
});

test('claim above floor is only not-contradicted, not proven', () => {
  const out = floor();
  const candidate = adjudicateWorkReductionClaim({ floor: out.floor, claimedWork: 10 });
  assert.equal(candidate.admissibleUnderCurrentBound, true);
  assert.equal(candidate.improvesObserved, true);
  assert.match(candidate.truthBoundary, /not thereby proven achievable/i);
});

test('unsupported or self-contradictory floors fail closed', () => {
  const missingEvidence = compileIrreducibleWorkFloor({ taskClass: 'x', observedWork: 10, certifiedLowerBound: 3, unit: 'ops', boundClass: 'DECISION_TREE', evidenceRefs: [] });
  assert.equal(missingEvidence.ok, false);
  assert.ok(missingEvidence.reasonCodes.includes('lower-bound-evidence-required'));

  const contradictory = compileIrreducibleWorkFloor({ taskClass: 'x', observedWork: 3, certifiedLowerBound: 4, unit: 'ops', boundClass: 'FORMAL_COMPLEXITY', evidenceRefs: ['proof:x'] });
  assert.equal(contradictory.ok, false);
  assert.ok(contradictory.reasonCodes.includes('lower-bound-exceeds-observed-work'));
});
