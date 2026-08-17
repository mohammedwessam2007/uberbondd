import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveLearningRecord, aggregateLearning, OUTCOME_HIERARCHY } from '../src/revenue-weighted-learning.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');

test('an unknown outcome type is rejected cleanly', () => {
  const result = deriveLearningRecord({ outcomeType: 'VIBES', date: monday });
  assert.equal(result.ok, false);
});

test('the hierarchy is ordered highest to lowest: cleared money always outranks engagement', () => {
  assert.equal(OUTCOME_HIERARCHY[0], 'CLEARED_RECURRING_CONTRIBUTION_MARGIN');
  assert.equal(OUTCOME_HIERARCHY[OUTCOME_HIERARCHY.length - 1], 'CLICK_OPEN');
  const cleared = deriveLearningRecord({ outcomeType: 'CLEARED_PAYMENT', date: monday });
  const click = deriveLearningRecord({ outcomeType: 'CLICK_OPEN', date: monday });
  assert.ok(cleared.weight > click.weight, 'a cleared payment must always outweigh a click/open');
});

test('every step down the hierarchy has strictly lower weight than the step above it', () => {
  const weights = OUTCOME_HIERARCHY.map(outcomeType => deriveLearningRecord({ outcomeType, date: monday }).weight);
  for (let i = 1; i < weights.length; i += 1) assert.ok(weights[i] < weights[i - 1], `${OUTCOME_HIERARCHY[i]} must weigh less than ${OUTCOME_HIERARCHY[i - 1]}`);
});

test('magnitude scales weight but a negative magnitude is clamped to zero, never inverted', () => {
  const negative = deriveLearningRecord({ outcomeType: 'CLEARED_PAYMENT', magnitude: -5, date: monday });
  assert.equal(negative.weight, 0);
});

test('a synthetic record is explicitly tagged and never silently looks real', () => {
  const record = deriveLearningRecord({ outcomeType: 'CLEARED_PAYMENT', isSynthetic: true, date: monday });
  assert.equal(record.truthClass, 'SYNTHETIC_TEST_FIXTURE');
  assert.equal(record.isSynthetic, true);
});

test('aggregateLearning keeps real and synthetic totals structurally separate -- never blended', () => {
  const records = [
    deriveLearningRecord({ outcomeType: 'CLEARED_PAYMENT', isSynthetic: false, date: monday }),
    deriveLearningRecord({ outcomeType: 'CLEARED_PAYMENT', isSynthetic: true, date: monday }),
    deriveLearningRecord({ outcomeType: 'CLEARED_PAYMENT', isSynthetic: true, date: monday })
  ];
  const aggregate = aggregateLearning(records);
  assert.equal(aggregate.real.count, 1);
  assert.equal(aggregate.synthetic.count, 2);
  assert.notEqual(aggregate.real.totalWeight, aggregate.synthetic.totalWeight + aggregate.real.totalWeight);
});

test('a synthetic-only record set never contributes to the real aggregate, no matter how many accumulate', () => {
  const records = Array.from({ length: 1000 }, () => deriveLearningRecord({ outcomeType: 'CLEARED_RECURRING_CONTRIBUTION_MARGIN', isSynthetic: true, date: monday }));
  const aggregate = aggregateLearning(records);
  assert.equal(aggregate.real.totalWeight, 0);
  assert.equal(aggregate.real.count, 0);
  assert.ok(aggregate.synthetic.totalWeight > 0);
});

test('malformed records in the list are ignored rather than crashing the aggregate', () => {
  const aggregate = aggregateLearning([{ ok: false }, null, undefined, deriveLearningRecord({ outcomeType: 'CLICK_OPEN', date: monday })]);
  assert.equal(aggregate.real.count, 1);
});

test('an empty record list produces a zeroed, well-formed aggregate', () => {
  const aggregate = aggregateLearning([]);
  assert.deepEqual(aggregate.real, { totalWeight: 0, count: 0 });
  assert.deepEqual(aggregate.synthetic, { totalWeight: 0, count: 0 });
});
