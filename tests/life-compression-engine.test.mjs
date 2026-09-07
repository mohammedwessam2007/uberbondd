import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fact, compress, compressionDebt,
  PRINCIPLE_STATES, COUNTEREXAMPLE_VERDICTS
} from '../src/life-compression-engine.mjs';

// A principle explaining ninety cases looks stronger than one explaining
// twenty until you ask what happened to the cases it could not explain. If
// nobody looked, the ratio measured the search. If somebody looked and folded
// them in as "special cases", the principle is now unfalsifiable.

const f = (statement, ref, domain = null) => fact({ statement, ref, domain }).fact;

test('a fact with no pointer back to its source is refused', () => {
  const orphan = fact({ statement: 'mornings are more productive' });
  assert.equal(orphan.ok, false);
  assert.deepEqual(orphan.reasonCodes, ['fact-source-ref-required']);
  assert.match(orphan.note, /the only surviving copy/);
});

test('a principle explaining nothing addressable is refused', () => {
  const empty = compress({ principle: 'everything is incentives' });
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.reasonCodes, ['principle-must-explain-addressable-facts']);
});

test('a principle nobody attacked is unfalsified, never compressed', () => {
  const attempted = compress({
    principle: 'energy predicts output better than hours do',
    explains: [f('a', 'log/2026-01'), f('b', 'log/2026-02'), f('c', 'log/2026-03')]
  });
  assert.equal(attempted.ok, true);
  assert.equal(attempted.state, 'UNFALSIFIED_NOT_PROVEN');
  assert.equal(attempted.status, 'COMPRESSION_UNFALSIFIED');
  assert.match(attempted.law, /WHICH_IS_NONE/);
  // Explaining three facts did not buy it a stronger state.
  assert.equal(attempted.explainsCount, 3);
});

test('a decisive counterexample breaks the principle regardless of reach', () => {
  const explains = Array.from({ length: 90 }, (_, i) => f(`case ${i}`, `log/${i}`));
  const broken = compress({
    principle: 'energy predicts output better than hours do',
    explains,
    counterexamplesExamined: [
      { statement: 'the thesis month: low energy, highest output', ref: 'log/thesis', verdict: 'DECISIVE' }
    ]
  });
  assert.equal(broken.state, 'BROKEN_BY_COUNTEREXAMPLE');
  assert.equal(broken.explainsCount, 90);
  assert.equal(broken.decisiveCounterexamples.length, 1);
  assert.match(broken.law, /EXPLANATORY_REACH_NEVER_OUTRANKS_A_DECISIVE_COUNTEREXAMPLE/);
});

test('a bounded exception with no declared boundary is refused', () => {
  const laundered = compress({
    principle: 'energy predicts output',
    explains: [f('a', 'log/1')],
    counterexamplesExamined: [
      { statement: 'the thesis month', ref: 'log/thesis', verdict: 'BOUNDED_EXCEPTION' }
    ]
  });
  assert.equal(laundered.ok, false);
  assert.deepEqual(laundered.reasonCodes, ['bounded-exception-requires-declared-boundary']);
  assert.match(laundered.note, /how a decisive counterexample gets absorbed/);
});

test('a boundary invented to fit one counterexample is not a boundary condition', () => {
  const excuse = compress({
    principle: 'energy predicts output',
    explains: [f('a', 'log/1')],
    boundaryConditions: ['does not apply under illness'],
    counterexamplesExamined: [
      { statement: 'the thesis month', ref: 'log/thesis', verdict: 'BOUNDED_EXCEPTION', boundary: 'does not apply in the month of a thesis' }
    ]
  });
  assert.equal(excuse.ok, false);
  assert.deepEqual(excuse.reasonCodes, ['bounded-exception-boundary-not-declared']);
  assert.match(excuse.note, /it is an excuse/);
  assert.deepEqual(excuse.declaredBoundaries, ['does not apply under illness']);
});

test('an exception inside a previously declared boundary is accepted and kept visible', () => {
  const accepted = compress({
    principle: 'energy predicts output',
    explains: [f('a', 'log/1'), f('b', 'log/2')],
    boundaryConditions: ['does not apply under a hard external deadline'],
    counterexamplesExamined: [
      { statement: 'the thesis month', ref: 'log/thesis', verdict: 'BOUNDED_EXCEPTION', boundary: 'does not apply under a hard external deadline' }
    ]
  });
  assert.equal(accepted.state, 'COMPRESSED_WITH_EXCEPTIONS');
  assert.equal(accepted.exceptions.length, 1);
  // The exception survives into the output rather than being smoothed away.
  assert.equal(accepted.exceptions[0].statement, 'the thesis month');
});

test('a principle survives only when the attacks it survived are recorded', () => {
  const compressed = compress({
    principle: 'energy predicts output',
    explains: [f('a', 'log/1')],
    counterexamplesExamined: [
      { statement: 'the sprint week', ref: 'log/sprint', verdict: 'EXPLAINED' }
    ]
  });
  assert.equal(compressed.state, 'COMPRESSED');
  assert.equal(compressed.counterexamplesExamined.length, 1);
  assert.deepEqual(compressed.factRefs, ['log/1']);
});

test('a counterexample without a verdict cannot be filed', () => {
  const vague = compress({
    principle: 'p',
    explains: [f('a', 'log/1')],
    counterexamplesExamined: [{ statement: 'awkward case', ref: 'log/x' }]
  });
  assert.equal(vague.ok, false);
  assert.deepEqual(vague.reasonCodes, ['counterexample-verdict-required']);
});

test('a counterexample with no source ref cannot be filed either', () => {
  const unsourced = compress({
    principle: 'p',
    explains: [f('a', 'log/1')],
    counterexamplesExamined: [{ statement: 'awkward case', verdict: 'EXPLAINED' }]
  });
  assert.equal(unsourced.ok, false);
  assert.deepEqual(unsourced.reasonCodes, ['counterexample-requires-statement-and-ref']);
});

test('dropping something the decision needs blocks use of the compression', () => {
  const debt = compressionDebt({
    compressed: 'training was worth it',
    dropped: ['the two years of no income', 'the weather'],
    decisionDependsOn: ['the two years of no income']
  });
  assert.equal(debt.status, 'COMPRESSION_DEBT_BLOCKING');
  assert.deepEqual(debt.loadBearingLoss, ['the two years of no income']);
  assert.equal(debt.requiredAction, 'RETURN_TO_RAW_EVIDENCE_BEFORE_DECIDING');
});

test('the compression ratio is reported and disclaimed in the same object', () => {
  const debt = compressionDebt({
    compressed: 'x',
    dropped: ['a', 'b', 'c'],
    decisionDependsOn: ['d']
  });
  assert.equal(debt.droppedCount, 3);
  assert.equal(debt.status, 'COMPRESSION_DEBT_ACCEPTABLE');
  // The disclaimer cannot be separated from the number it is about.
  assert.match(debt.ratioBoundary, /ONLY_BETTER_WHEN_NOTHING_DROPPED_WAS_LOAD_BEARING/);
});

test('vocabularies are closed and frozen', () => {
  assert.equal(Object.isFrozen(PRINCIPLE_STATES), true);
  assert.equal(Object.isFrozen(COUNTEREXAMPLE_VERDICTS), true);
  assert.ok(PRINCIPLE_STATES.includes('UNFALSIFIED_NOT_PROVEN'));
});

test('nothing here carries business effect authority', () => {
  assert.equal(compress({ principle: 'p', explains: [f('a', 'r')] }).businessEffectAuthority, 'NONE');
  assert.equal(compressionDebt({ compressed: 'x' }).businessEffectAuthority, 'NONE');
  assert.equal(fact({ statement: 'a', ref: 'r' }).businessEffectAuthority, 'NONE');
});
