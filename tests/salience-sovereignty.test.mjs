import test from 'node:test';
import assert from 'node:assert/strict';
import {
  salienceLedger, frameDependence, unchosenUniverse, attentionBudget, preferenceDrift,
  OMISSION_REASONS, ATTENTION_LEVELS
} from '../src/salience-sovereignty.mjs';

// A system can be scrupulously honest in every individual claim and still decide
// the outcome by ordering, emphasis, or by which option never reached the page.
// That failure is invisible from inside, which is why it is recorded rather than
// assessed.

test('an omission with no reason is recorded as unexplained, never dropped', () => {
  // Dropping it makes the ledger a record of what the system chose to admit,
  // which is the opposite of the point.
  const ledger = salienceLedger({
    decision: 'which offer',
    shown: ['the higher-paying role'],
    omitted: [{ item: 'the part-time option' }, { item: 'a duplicate', reason: 'DUPLICATE_OF_SHOWN' }]
  });
  assert.deepEqual(ledger.unexplainedOmissions, ['the part-time option']);
  assert.equal(ledger.accountable, false);
  assert.match(ledger.law, /AN_UNLOGGED_OMISSION_IS_INDISTINGUISHABLE_FROM_A_DECISION_NOBODY_MADE/);
});

test('a fully explained presentation is accountable', () => {
  const ledger = salienceLedger({
    decision: 'x', shown: ['a'],
    omitted: [{ item: 'b', reason: 'FOUNDER_ASKED_NOT_TO_SEE' }]
  });
  assert.equal(ledger.accountable, true);
  assert.ok(OMISSION_REASONS.includes('NONE_GIVEN'), 'the sting must be a real value, not an absence');
});

test('position is recorded, because ordering is part of the argument', () => {
  const ledger = salienceLedger({ decision: 'x', shown: ['first', 'second', 'third'] });
  assert.deepEqual(ledger.shown.map(row => row.position), [1, 2, 3]);
});

// ---- Frame dependence -------------------------------------------------------

test('frame dependence cannot be inferred from one presentation', () => {
  const notRun = frameDependence({ options: ['a', 'b'], chosenFirstOrder: 'a' });
  assert.equal(notRun.ok, false);
  assert.equal(notRun.status, 'FRAME_TEST_NOT_RUN');
  assert.match(notRun.note, /the answer is unknown, not clean/);
});

test('a choice that moves with the ordering says the ordering was the argument', () => {
  const moved = frameDependence({ options: ['a', 'b'], chosenFirstOrder: 'a', chosenReordered: 'b' });
  assert.equal(moved.frameDependent, true);
  assert.equal(moved.status, 'CHOICE_MOVED_WITH_THE_ORDERING');
});

test('a choice stable under reordering is evidence it was about the options', () => {
  const stable = frameDependence({ options: ['a', 'b'], chosenFirstOrder: 'a', chosenReordered: 'a' });
  assert.equal(stable.frameDependent, false);
});

// ---- Unchosen universe ------------------------------------------------------

test('families that never reached the page are named', () => {
  const check = unchosenUniverse({
    surfaced: ['FULL_COMMITMENT', 'STATUS_QUO'],
    families: ['FULL_COMMITMENT', 'STATUS_QUO', 'REVERSIBLE_TRIAL', 'EXIT']
  });
  assert.deepEqual(check.notSurfaced, ['REVERSIBLE_TRIAL', 'EXIT']);
});

test('the check states it cannot enumerate what nobody thought of', () => {
  const check = unchosenUniverse({ surfaced: ['a'], families: ['a'] });
  assert.equal(check.status, 'ALL_SUPPLIED_FAMILIES_SURFACED');
  assert.match(check.truthBoundary, /CANNOT ENUMERATE OPTIONS NOBODY THOUGHT OF/);
});

// ---- Attention --------------------------------------------------------------

test('a tie resolves to silence, because a system that speaks on ties speaks constantly', () => {
  const tied = attentionBudget({ value: 5, switchingCost: 3, currentStateValue: 2 });
  assert.equal(tied.status, 'STAY_SILENT');
  assert.match(tied.why, /never appears on any ledger/);
});

test('the displaced mental state counts as a cost', () => {
  const ignoringState = attentionBudget({ value: 4, switchingCost: 2 });
  const countingState = attentionBudget({ value: 4, switchingCost: 2, currentStateValue: 5 });
  assert.equal(ignoringState.status, 'SURFACE_LATER');
  assert.equal(countingState.status, 'STAY_SILENT');
});

test('something irreversible if missed interrupts regardless of the arithmetic', () => {
  const urgent = attentionBudget({ value: 1, switchingCost: 100, currentStateValue: 100, irreversibleIfMissed: true });
  assert.equal(urgent.status, 'INTERRUPT');
  assert.ok(ATTENTION_LEVELS.includes('REQUIRE_CONFIRMATION'));
});

// ---- Drift ------------------------------------------------------------------

test('convergence is raised as a question, never as a verdict', () => {
  // A high agreement rate is equally consistent with the system being right and
  // with the founder having stopped disagreeing. This cannot tell them apart
  // and does not pretend to.
  const drifted = preferenceDrift({
    founderPositions: ['a', 'b', 'c', 'd'],
    systemRecommendations: ['a', 'b', 'c', 'd']
  });
  assert.equal(drifted.agreementRate, 1);
  assert.match(drifted.question, /has disagreement stopped happening/);
  assert.match(drifted.boundary, /CANNOT_DISTINGUISH_AGREEMENT_FROM_CAPTURE/);
  assert.equal(Object.hasOwn(drifted, 'captured'), false);
});

test('divergence is reported as what independent judgement looks like', () => {
  const independent = preferenceDrift({
    founderPositions: ['a', 'b', 'c'],
    systemRecommendations: ['a', 'x', 'y']
  });
  assert.ok(independent.agreementRate < 0.9);
  assert.match(independent.question, /independent judgement/);
});

test('one paired position is not enough to say anything about drift', () => {
  const tooFew = preferenceDrift({ founderPositions: ['a'], systemRecommendations: ['a'] });
  assert.equal(tooFew.ok, false);
});
