import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySignal, ground, windowVersusImportance, attentionBudget,
  LIFE_SIGNAL_STATES, GROUNDING_EVIDENCE, WINDOW_CAUSES
} from '../src/gamechanger-for-life.mjs';

// The economic mesh already scores world signals. The failure here is reading
// a market score as life relevance -- turning a stream of genuinely
// interesting world changes into a standing instruction to reorganise a life
// around whatever shipped this week.

const hypothesis = (title, dimensions, conditions = ['it works for me']) =>
  classifySignal({ title, observedAt: '2026-09-07', changesReachabilityOf: dimensions, wouldHaveToBeTrue: conditions });

test('a signal naming no dimension it moves is novelty, however interesting', () => {
  const released = classifySignal({ title: 'a much cheaper model shipped', observedAt: '2026-09-07' });
  assert.equal(released.state, 'NOVELTY_NOT_GEOMETRY_CHANGE');
  assert.deepEqual(released.changesReachabilityOf, []);
  assert.match(released.law, /A_MARKET_SCORE_IS_NOT_LIFE_RELEVANCE/);
});

test('a high economic score does not make a signal life-relevant', () => {
  // The score is accepted at the boundary and visibly ignored, so a caller
  // passing one cannot assume it counted.
  const scored = classifySignal({ title: 'a much cheaper model shipped', observedAt: '2026-09-07', economicScore: 97 });
  assert.equal(scored.state, 'NOVELTY_NOT_GEOMETRY_CHANGE');
  assert.equal(scored.economicScoreIgnored, true);
});

test('an invented dimension cannot smuggle a signal past the novelty test', () => {
  const invented = classifySignal({
    title: 'x', observedAt: '2026-09-07',
    changesReachabilityOf: ['VIBES'], wouldHaveToBeTrue: ['sure']
  });
  assert.equal(invented.state, 'NOVELTY_NOT_GEOMETRY_CHANGE');
});

test('a claimed geometry change stating no condition is refused', () => {
  const uncheckable = classifySignal({
    title: 'remote work makes anywhere possible', observedAt: '2026-09-07',
    changesReachabilityOf: ['GEOGRAPHIC_FREEDOM']
  });
  assert.equal(uncheckable.ok, false);
  assert.deepEqual(uncheckable.reasonCodes, ['grounding-conditions-required']);
  assert.match(uncheckable.note, /nobody can check or refute/);
});

test('a claimed change starts as a hypothesis, not a fact', () => {
  const claimed = hypothesis('a visa route opened', ['GEOGRAPHIC_FREEDOM', 'CAREER']);
  assert.equal(claimed.state, 'HYPOTHESIS');
  assert.deepEqual(claimed.changesReachabilityOf, ['CAREER', 'GEOGRAPHIC_FREEDOM']);
  assert.match(claimed.law, /UNTIL_PERSONAL_OBSERVATION_GROUNDS_IT/);
});

test('the world describing itself cannot settle whether this reach changed', () => {
  const claimed = hypothesis('a visa route opened', ['GEOGRAPHIC_FREEDOM']);
  for (const weak of ['VENDOR_CLAIM', 'THIRD_PARTY_REPORT', 'OBSERVED_BY_OTHERS']) {
    const attempted = ground({ signal: claimed, evidence: weak, conditionsMet: ['it works for me'] });
    assert.equal(attempted.state, 'HYPOTHESIS', `${weak} must not ground a personal reach claim`);
    assert.equal(attempted.status, 'GROUNDING_INSUFFICIENT');
    assert.match(attempted.law, /CANNOT_SETTLE_WHETHER_THIS_PERSONS_REACH_CHANGED/);
  }
});

test('personal testing with conditions outstanding does not ground either', () => {
  const claimed = hypothesis('a visa route opened', ['GEOGRAPHIC_FREEDOM'], ['I qualify', 'the employer sponsors']);
  const partial = ground({ signal: claimed, evidence: 'PERSONALLY_TESTED', conditionsMet: ['I qualify'] });
  assert.equal(partial.state, 'HYPOTHESIS');
  assert.deepEqual(partial.outstandingConditions, ['the employer sponsors']);
});

test('personal testing with every condition met grounds the change', () => {
  const claimed = hypothesis('a visa route opened', ['GEOGRAPHIC_FREEDOM'], ['I qualify']);
  const grounded = ground({ signal: claimed, evidence: 'PERSONALLY_TESTED', conditionsMet: ['I qualify'] });
  assert.equal(grounded.state, 'GROUNDED_BY_OBSERVATION');
  assert.equal(grounded.status, 'GROUNDED');
});

test('novelty has no claim to ground', () => {
  const novelty = classifySignal({ title: 'a thing shipped', observedAt: '2026-09-07' });
  const attempted = ground({ signal: novelty, evidence: 'PERSONALLY_TESTED' });
  assert.equal(attempted.ok, false);
  assert.deepEqual(attempted.reasonCodes, ['novelty-has-no-claim-to-ground']);
});

test('a closing window and a large effect are reported as two facts, not one priority', () => {
  const narrowButClosing = windowVersusImportance({
    signal: 'the exchange year', windowCause: 'AGE', closesAround: '2028', dimensionsMoved: ['EDUCATION']
  });
  assert.equal(narrowButClosing.urgent, true);
  assert.equal(narrowButClosing.important, false);
  assert.equal(narrowButClosing.reading, 'CLOSING_WINDOW_ON_A_NARROW_CHANGE');

  const broadButPatient = windowVersusImportance({
    signal: 'a new field opened', windowCause: 'NONE_KNOWN', dimensionsMoved: ['CAREER', 'KNOWLEDGE', 'WEALTH']
  });
  assert.equal(broadButPatient.urgent, false);
  assert.equal(broadButPatient.important, true);
  assert.equal(broadButPatient.reading, 'LARGE_CHANGE_THAT_CAN_WAIT');
  assert.match(broadButPatient.law, /ARE_NOT_BLENDED_INTO_ONE_PRIORITY/);
});

test('an unbounded attention budget is refused', () => {
  const unbounded = attentionBudget([], { maxSurfaced: 0 });
  assert.equal(unbounded.ok, false);
  assert.deepEqual(unbounded.reasonCodes, ['bounded-surfacing-cap-required']);
  assert.match(unbounded.note, /reorganise a life weekly/);
});

test('novelty is dropped before the budget is spent', () => {
  const applied = attentionBudget([
    classifySignal({ title: 'shiny thing', observedAt: '2026-09-07' }),
    classifySignal({ title: 'other shiny thing', observedAt: '2026-09-07' }),
    hypothesis('the visa route', ['GEOGRAPHIC_FREEDOM'])
  ], { maxSurfaced: 2 });
  assert.deepEqual(applied.droppedAsNovelty.sort(), ['other shiny thing', 'shiny thing']);
  assert.deepEqual(applied.surfaced.map(row => row.title), ['the visa route']);
});

test('what did not fit the budget is reported, not silently cut', () => {
  const many = Array.from({ length: 6 }, (_, i) => hypothesis(`signal ${i}`, ['CAREER']));
  const applied = attentionBudget(many, { maxSurfaced: 2 });
  assert.equal(applied.surfaced.length, 2);
  assert.equal(applied.deferredCount, 4);
  assert.equal(applied.deferred.length, 4);
  assert.match(applied.law, /STAYS_SMALL/);
});

test('a grounded signal outranks an ungrounded one for scarce attention', () => {
  const claimed = hypothesis('ungrounded but broad', ['CAREER', 'WEALTH', 'KNOWLEDGE']);
  const groundedHypothesis = hypothesis('grounded but narrow', ['CAREER']);
  const applied = attentionBudget([
    claimed,
    { ...groundedHypothesis, state: 'GROUNDED_BY_OBSERVATION' }
  ], { maxSurfaced: 1 });
  assert.deepEqual(applied.surfaced.map(row => row.title), ['grounded but narrow']);
});

test('vocabularies are closed and nothing carries effect authority', () => {
  assert.equal(Object.isFrozen(LIFE_SIGNAL_STATES), true);
  assert.equal(Object.isFrozen(GROUNDING_EVIDENCE), true);
  assert.equal(Object.isFrozen(WINDOW_CAUSES), true);
  assert.equal(hypothesis('a', ['CAREER']).businessEffectAuthority, 'NONE');
  assert.equal(attentionBudget([]).businessEffectAuthority, 'NONE');
});
