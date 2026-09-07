import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diagnose, proposeFoundations, distinguishingObservation, QUESTION_STATES
} from '../src/assumption-escape.mjs';

// Ask "is this career worth it" inside a set where worth means lifetime
// earnings, and the arithmetic runs correctly to a conclusion the assumptions
// chose. More reasoning inside a closed set produces confidence, not information.

test('a question with no stated assumption set cannot be shown to be trapped', () => {
  const bare = diagnose({ question: 'is this worth it' });
  assert.equal(bare.ok, false);
  assert.deepEqual(bare.reasonCodes, ['assumption-set-required']);
});

test('a question whose answer survives dropping every assumption is answerable', () => {
  const open = diagnose({
    question: 'did revenue rise last quarter',
    assumptions: ['the ledger is accurate']
  });
  assert.equal(open.state, 'ANSWERABLE_WITHIN_ASSUMPTIONS');
  assert.equal(open.escapeWarranted, false);
});

test('a question whose answer flips when an assumption drops is assumption-determined', () => {
  const trapped = diagnose({
    question: 'is this career worth it',
    assumptions: ['worth means lifetime earnings', 'the ledger is accurate'],
    answerChangesIfDropped: ['worth means lifetime earnings']
  });
  assert.equal(trapped.state, 'DETERMINED_BY_ASSUMPTIONS');
  assert.equal(trapped.escapeWarranted, true);
  assert.deepEqual(trapped.loadBearing, ['worth means lifetime earnings']);
  assert.match(trapped.law, /CONFIDENCE_NOT_INFORMATION/);
});

test('a load-bearing assumption outside the stated set means the set is incomplete', () => {
  const incomplete = diagnose({
    question: 'x', assumptions: ['a'], answerChangesIfDropped: ['b']
  });
  assert.equal(incomplete.ok, false);
  assert.deepEqual(incomplete.reasonCodes, ['load-bearing-assumption-not-in-set']);
  assert.deepEqual(incomplete.unknownAssumptions, ['b']);
});

test('a foundation predicting nothing observable is refused', () => {
  const empty = proposeFoundations({ current: { name: 'earnings maximisation' } });
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.reasonCodes, ['current-foundation-predictions-required']);
  assert.match(empty.note, /cannot be distinguished from any other/);
});

test('an alternative that predicts identically is a notation change', () => {
  const proposed = proposeFoundations({
    current: { name: 'earnings maximisation', predicts: { 'ten-year income': 'higher', 'reported satisfaction': 'unchanged' } },
    candidates: [
      { name: 'utility maximisation', predicts: { 'ten-year income': 'higher', 'reported satisfaction': 'unchanged' } }
    ]
  });
  assert.deepEqual(proposed.alternatives, []);
  assert.equal(proposed.status, 'NO_GENUINE_ALTERNATIVE');
  assert.equal(proposed.notationalVariants[0].name, 'utility maximisation');
  assert.match(proposed.law, /ONE_FOUNDATION_DESCRIBED_TWICE/);
});

test('an alternative that disagrees somewhere observable is genuine', () => {
  const proposed = proposeFoundations({
    current: { name: 'earnings maximisation', predicts: { 'ten-year income': 'higher', 'reported satisfaction': 'unchanged' } },
    candidates: [
      { name: 'capability accumulation', predicts: { 'ten-year income': 'lower', 'reported satisfaction': 'higher' } }
    ]
  });
  assert.equal(proposed.alternatives.length, 1);
  assert.deepEqual(proposed.alternatives[0].disagreesOn, ['reported satisfaction', 'ten-year income']);
});

test('an observation every foundation expects distinguishes nothing', () => {
  const attempted = distinguishingObservation({
    foundations: [
      { name: 'A', predicts: { 'income': 'higher' } },
      { name: 'B', predicts: { 'income': 'higher' } }
    ],
    availableObservables: ['income']
  });
  assert.equal(attempted.status, 'UNDECIDABLE');
  assert.deepEqual(attempted.discriminating, []);
});

test('when nothing separates them the answer is undecidable, not a preference', () => {
  const undecidable = distinguishingObservation({
    foundations: [
      { name: 'A', predicts: { 'income': 'higher', 'satisfaction': 'up' } },
      { name: 'B', predicts: { 'income': 'higher', 'satisfaction': 'down' } }
    ],
    availableObservables: ['income']   // satisfaction is not measurable here
  });
  assert.equal(undecidable.state, 'UNDECIDABLE_WITHIN_AVAILABLE_EVIDENCE');
  assert.equal(undecidable.wouldDiscriminateIfObservable.length, 1);
  assert.equal(undecidable.wouldDiscriminateIfObservable[0].observable, 'satisfaction');
  assert.match(undecidable.law, /REPLACES_ONE_ASSUMPTION_SET_WITH_ANOTHER/);
});

test('no plausibility ranking is emitted when the evidence runs out', () => {
  const undecidable = distinguishingObservation({
    foundations: [
      { name: 'A', predicts: { 'x': 'up' } },
      { name: 'B', predicts: { 'x': 'down' } }
    ],
    availableObservables: []
  });
  for (const key of ['ranked', 'ranking', 'mostPlausible', 'best', 'recommended']) {
    assert.equal(undecidable[key], undefined, `must not emit ${key}`);
  }
  assert.match(undecidable.rankingWithheld, /VOTING_ON_ITS_OWN_REPLACEMENT/);
});

test('a reachable disagreement is returned with what each foundation expects', () => {
  const found = distinguishingObservation({
    foundations: [
      { name: 'earnings', predicts: { 'ten-year income': 'higher' } },
      { name: 'capability', predicts: { 'ten-year income': 'lower' } }
    ],
    availableObservables: ['ten-year income']
  });
  assert.equal(found.status, 'DISTINGUISHING_OBSERVATION_FOUND');
  assert.equal(found.discriminating[0].observable, 'ten-year income');
  assert.equal(found.discriminating[0].splits.length, 2);
});

test('distinguishing needs at least two foundations', () => {
  const alone = distinguishingObservation({ foundations: [{ name: 'A', predicts: { x: 'up' } }] });
  assert.equal(alone.ok, false);
  assert.deepEqual(alone.reasonCodes, ['at-least-two-foundations-required']);
});

test('vocabularies are closed and nothing carries effect authority', () => {
  assert.equal(Object.isFrozen(QUESTION_STATES), true);
  assert.ok(QUESTION_STATES.includes('UNDECIDABLE_WITHIN_AVAILABLE_EVIDENCE'));
  assert.equal(diagnose({ question: 'x', assumptions: ['a'] }).businessEffectAuthority, 'NONE');
  assert.equal(proposeFoundations({ current: { name: 'a', predicts: { x: 'y' } } }).businessEffectAuthority, 'NONE');
});
