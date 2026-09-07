import test from 'node:test';
import assert from 'node:assert/strict';
import {
  segmentSeries, claimStrength, importPrior,
  DESIGNS, REGIME_CAUSES
} from '../src/n-of-1-personal-science.mjs';

// The tempting move is to treat a personal history as a dataset. It fails for a
// reason unrelated to sample size: the subject changed. Rows from before and
// after a move describe two different people, and pooling them measures neither.

const series = (dates) => dates.map((at, i) => ({ at, value: i + 1 }));

test('a series with no regime change is poolable', () => {
  const segmented = segmentSeries({ observations: series(['2026-01-01', '2026-02-01', '2026-03-01']) });
  assert.equal(segmented.poolable, true);
  assert.equal(segmented.status, 'SERIES_SINGLE_REGIME');
  assert.equal(segmented.segments.length, 1);
});

test('a series crossing a regime change is split, not pooled', () => {
  const segmented = segmentSeries({
    observations: series(['2026-01-01', '2026-02-01', '2026-06-01', '2026-07-01']),
    regimeChanges: [{ at: '2026-05-01', cause: 'RELOCATION' }]
  });
  assert.equal(segmented.poolable, false);
  assert.equal(segmented.status, 'SERIES_SPLIT_BY_REGIME');
  assert.equal(segmented.segments.length, 2);
  assert.equal(segmented.segments[0].n, 2);
  assert.equal(segmented.segments[1].n, 2);
  assert.equal(segmented.segments[1].cause, 'RELOCATION');
  assert.match(segmented.law, /DESCRIBES_MORE_THAN_ONE_SUBJECT_AND_IS_NOT_POOLED/);
});

test('an instrument change is a regime change like any other', () => {
  // Switching tracker mid-series is a change of subject as far as the numbers
  // are concerned, and is the one people forget.
  const segmented = segmentSeries({
    observations: series(['2026-01-01', '2026-06-01']),
    regimeChanges: [{ at: '2026-03-01', cause: 'INSTRUMENT_CHANGE' }]
  });
  assert.equal(segmented.poolable, false);
  assert.ok(REGIME_CAUSES.includes('INSTRUMENT_CHANGE'));
});

test('an invented regime cause is refused', () => {
  const invented = segmentSeries({
    observations: series(['2026-01-01']),
    regimeChanges: [{ at: '2026-01-05', cause: 'VIBE_SHIFT' }]
  });
  assert.equal(invented.ok, false);
  assert.deepEqual(invented.reasonCodes, ['known-regime-cause-required']);
});

test('length does not promote a design', () => {
  // Two hundred observations of a before-and-after is a long before-and-after.
  const long = claimStrength({ design: 'BEFORE_AFTER', observations: 200 });
  assert.equal(long.permittedClaim, 'DESCRIPTIVE_ONLY__NO_CAUSAL_CLAIM');
  assert.match(long.law, /A_LONG_BEFORE_AFTER_IS_A_LONG_BEFORE_AFTER/);
});

test('an anecdote stays an anecdote', () => {
  const once = claimStrength({ design: 'ANECDOTE', observations: 1 });
  assert.equal(once.status, 'CLAIM_IS_DESCRIPTIVE');
});

test('a design that named no confounders has not looked for any', () => {
  const unlooked = claimStrength({ design: 'REPEATED_REVERSAL', observations: 30 });
  assert.equal(unlooked.status, 'CLAIM_BLOCKED');
  assert.equal(unlooked.permittedClaim, 'NO_CAUSAL_CLAIM__NO_CONFOUNDERS_WERE_NAMED');
  assert.match(unlooked.law, /HAS_NOT_LOOKED_FOR_ANY/);
});

test('a named but uncontrolled confounder blocks the causal claim', () => {
  const blocked = claimStrength({
    design: 'REPEATED_REVERSAL', observations: 30,
    confoundersNamed: ['season', 'workload'], confoundersControlled: ['season']
  });
  assert.equal(blocked.status, 'CLAIM_BLOCKED');
  assert.deepEqual(blocked.uncontrolledConfounders, ['workload']);
});

test('a controlled reversal design earns a within-person claim, bounded to this person', () => {
  const permitted = claimStrength({
    design: 'REPEATED_REVERSAL', observations: 30,
    confoundersNamed: ['season'], confoundersControlled: ['season'], instrumentError: 0.4
  });
  assert.equal(permitted.status, 'CLAIM_PERMITTED');
  assert.equal(permitted.permittedClaim, 'WITHIN_PERSON_CAUSAL_CLAIM_FOR_THIS_PERSON_IN_THIS_REGIME');
  assert.match(permitted.generalisationBoundary, /NOT_A_POPULATION_CLAIM/);
  assert.equal(permitted.effectFloor, 0.4);
});

test('an unstated instrument error is unknown, not zero', () => {
  const permitted = claimStrength({
    design: 'NATURAL_EXPERIMENT', observations: 10,
    confoundersNamed: ['season'], confoundersControlled: ['season']
  });
  assert.equal(permitted.effectFloor, 'UNKNOWN__INSTRUMENT_ERROR_NOT_STATED');
});

test('a population result with no transfer assumption is a wish', () => {
  const wished = importPrior({ finding: 'X raises Y by 12%', population: 'a cohort of 4000' });
  assert.equal(wished.ok, false);
  assert.deepEqual(wished.reasonCodes, ['transfer-assumption-required']);
  assert.match(wished.note, /is a wish, not a prior/);
});

test('an imported prior stays a prior and never substitutes for personal evidence', () => {
  const prior = importPrior({
    finding: 'X raises Y by 12%', population: 'a cohort of 4000',
    transferAssumption: 'the mechanism runs through sleep debt, which applies here'
  });
  assert.equal(prior.role, 'PRIOR_ONLY__NEVER_A_SUBSTITUTE_FOR_PERSONAL_EVIDENCE');
  assert.match(prior.law, /NOT_AN_OBSERVATION_OF_THEM/);
});

test('stated differences from the population weaken the prior visibly', () => {
  const prior = importPrior({
    finding: 'X raises Y', population: 'adults over 50',
    transferAssumption: 'the mechanism is age-independent',
    personDiffersIn: ['age', 'baseline fitness']
  });
  assert.equal(prior.status, 'PRIOR_WEAKENED_BY_DIFFERENCE');
  assert.deepEqual(prior.personDiffersIn, ['age', 'baseline fitness']);
});

test('vocabularies are closed and nothing carries effect authority', () => {
  assert.equal(Object.isFrozen(DESIGNS), true);
  assert.equal(Object.isFrozen(REGIME_CAUSES), true);
  assert.equal(segmentSeries({ observations: series(['2026-01-01']) }).businessEffectAuthority, 'NONE');
  assert.equal(claimStrength({ design: 'ANECDOTE', observations: 1 }).businessEffectAuthority, 'NONE');
});

test('absence never becomes a number anywhere it is parsed', () => {
  // Number(null) is 0 and Number('') is 0. A bare Number.isFinite check turned
  // an unstated instrument error into a claimed zero-error instrument, which is
  // precision fabricated from a missing field.
  for (const missing of [null, undefined, '']) {
    const permitted = claimStrength({
      design: 'REPEATED_REVERSAL', observations: 5,
      confoundersNamed: ['a'], confoundersControlled: ['a'], instrumentError: missing
    });
    assert.equal(permitted.effectFloor, 'UNKNOWN__INSTRUMENT_ERROR_NOT_STATED',
      `instrumentError ${String(missing)} must not become a number`);
  }
  // A real zero is still a real zero.
  const stated = claimStrength({
    design: 'REPEATED_REVERSAL', observations: 5,
    confoundersNamed: ['a'], confoundersControlled: ['a'], instrumentError: 0
  });
  assert.equal(stated.effectFloor, 0);
});

test('an observation with a missing value is dropped, not read as zero', () => {
  const segmented = segmentSeries({
    observations: [{ at: '2026-01-01', value: 5 }, { at: '2026-02-01', value: null }]
  });
  assert.equal(segmented.pooledCount, 1);
});
