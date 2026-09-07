import test from 'node:test';
import assert from 'node:assert/strict';
import {
  composeInstitution, substrateIndependence, proposeConcept, ontologicalCrisis,
  compressReality, scaleBridge, classifyBoundary, selfAlienatingChallenger,
  thresholdDynamics, SUBSTRATES, BOUNDARY_KINDS, PERMANENT_BOUNDARIES
} from '../src/world-intelligence.mjs';

// A system that can only get better at answering will keep answering questions
// its concepts cannot express, fluently and wrongly. So half of this is routing
// and half is the willingness to conclude the vocabulary is the problem.

test('a consequential question needs someone whose job is to be wrong about it', () => {
  const refused = composeInstitution({
    question: 'should he sell the flat',
    substrates: ['NEURAL_MODEL', 'STATISTICS'],
    roles: ['GENERATOR', 'SYNTHESIZER'],
    consequential: true
  });
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.reasonCodes, ['a-consequential-question-requires-a-falsifying-role']);
  assert.match(refused.note, /nothing standing against it/);
});

test('a falsifying role satisfies it, and agent count is named as not a measure', () => {
  const composed = composeInstitution({
    question: 'x', substrates: ['STATISTICS'], roles: ['GENERATOR', 'FALSIFIER'], consequential: true
  });
  assert.equal(composed.ok, true);
  assert.deepEqual(composed.adversarialRoles, ['FALSIFIER']);
  assert.match(composed.boundary, /AGENT COUNT IS NOT A MEASURE OF ANYTHING/);
});

test('always routing to one substrate is reported as having become it', () => {
  const mono = substrateIndependence(['NEURAL_MODEL', 'NEURAL_MODEL', 'NEURAL_MODEL', 'NEURAL_MODEL']);
  assert.equal(mono.status, 'SUBSTRATE_MONOCULTURE');
  assert.match(mono.law, /WILL_STOP_NOTICING_WHAT_IT_IS_BAD_AT/);
  assert.ok(SUBSTRATES.includes('REAL_EXPERIMENT'));
});

test('a concept needs repeated explanatory failure, not novelty', () => {
  // Inventing a primitive because the vocabulary is inelegant produces jargon.
  const jargon = proposeConcept({
    name: 'Cognitive Verve', explanatoryFailures: ['it felt clunky'], wouldBeFalsifiedBy: 'x'
  });
  assert.equal(jargon.ok, false);
  assert.deepEqual(jargon.reasonCodes, ['repeated-explanatory-failure-required']);
});

test('a concept nothing could falsify is refused', () => {
  const unfalsifiable = proposeConcept({
    name: 'x', explanatoryFailures: ['a fails', 'b fails']
  });
  assert.equal(unfalsifiable.ok, false);
  assert.match(unfalsifiable.note, /explains everything and constrains nothing/);
});

test('a proposed concept is a candidate, never adopted by proposing it', () => {
  const candidate = proposeConcept({
    name: 'x', explanatoryFailures: ['a', 'b'], wouldBeFalsifiedBy: 'observing c'
  });
  assert.equal(candidate.adopted, false);
  assert.match(candidate.boundary, /PROPOSING A CONCEPT IS NOT ADOPTING ONE/);
});

test('a broken concept invalidates everything derived from it', () => {
  // The expensive half is not noticing the break, it is the conclusions that
  // quietly keep their standing afterwards.
  const crisis = ontologicalCrisis({
    brokenConcept: 'career as a linear ladder',
    derivedBeliefs: ['seniority equals progress'],
    derivedForecasts: ['five years to director'],
    derivedDecisions: ['declined the sideways move']
  });
  assert.equal(crisis.invalidatedCount, 3);
  assert.match(crisis.action, /DOES NOT KEEP ITS STANDING BECAUSE IT STILL SOUNDS RIGHT/);
});

test('a theory carrying unexplained exceptions is incomplete, not elegant', () => {
  const incomplete = compressReality({
    theory: 'he works best in mornings',
    observations: ['a', 'b', 'c'],
    unexplainedExceptions: ['the two years he did not']
  });
  assert.equal(incomplete.status, 'THEORY_INCOMPLETE');
  assert.match(incomplete.law, /SHORTER_WAY_OF_BEING_WRONG/);
});

test('an effect that changes sign across scales is flagged', () => {
  // Good for a day and bad for a decade. A single-scale verdict misses it by
  // construction.
  const flipped = scaleBridge({
    effect: 'taking every opportunity',
    byScale: { WEEK: 'POSITIVE', DECADE: 'NEGATIVE' }
  });
  assert.equal(flipped.signChanges, true);
  assert.match(flipped.note, /misses this by construction/);
});

test('consistent across supplied scales is not consistent across all scales', () => {
  const consistent = scaleBridge({ effect: 'x', byScale: { WEEK: 'POSITIVE', MONTH: 'POSITIVE' } });
  assert.match(consistent.note, /not the same as none existing/);
});

test('no mechanism found yet is not impossible', () => {
  // Conflating them closes off futures nobody established were closed.
  const open = classifyBoundary({ goal: 'learn perfect pitch at forty', kind: 'NO_MECHANISM_FOUND_YET' });
  assert.equal(open.canMove, true);
  assert.match(open.distinction, /not the same as there being none/);

  const shut = classifyBoundary({ goal: 'travel faster than light', kind: 'PHYSICALLY_IMPOSSIBLE' });
  assert.equal(shut.canMove, false);
  assert.deepEqual([...PERMANENT_BOUNDARIES].sort(), ['LOGICALLY_INCONSISTENT', 'PHYSICALLY_IMPOSSIBLE']);
  assert.ok(BOUNDARY_KINDS.includes('SOCIALLY_CONVENTIONAL'));
});

test('a challenger sharing every assumption is not a challenger', () => {
  const notAlien = selfAlienatingChallenger({
    currentAssumptions: ['a', 'b'], challengerAssumptions: ['a', 'b']
  });
  assert.equal(notAlien.ok, false);
  assert.match(notAlien.note, /same blind spot from a different chair/);
});

test('a genuinely divergent challenger is constructed', () => {
  const alien = selfAlienatingChallenger({
    currentAssumptions: ['progress is linear'], challengerAssumptions: ['progress is threshold-shaped']
  });
  assert.equal(alien.ok, true);
  assert.deepEqual(alien.divergentAssumptions, ['progress is threshold-shaped']);
});

test('no visible progress in a threshold system is not failure', () => {
  // Assuming linear returns is how someone concludes they cannot learn a
  // language six weeks before they could.
  const below = thresholdDynamics({ effortApplied: 100, visibleProgress: 0, knownThresholdSystem: true });
  assert.equal(below.status, 'BELOW_THRESHOLD_NOT_FAILING');
  assert.match(below.note, /not what failure looks like/);
});

test('linear returns are flagged as an assumption when nobody said otherwise', () => {
  const assumed = thresholdDynamics({ effortApplied: 10, visibleProgress: 2 });
  assert.match(assumed.caution, /that assumption is wrong/);
});
