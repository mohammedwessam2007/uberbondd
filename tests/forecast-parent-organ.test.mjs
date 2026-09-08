// What this suite is actually protecting.
//
// The organ's value is entirely in what it refuses. A forecast compiler that
// always returns a range is a slower route to manufactured precision, so most
// of these tests assert a refusal or a degradation rather than a happy path,
// and each one names the specific failure that would reappear if the guard
// were deleted.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  FORECAST_PARENT_ORGAN_VERSION, REFERENCE_CLASS_BIASES, MEASURABILITY_CLASSES,
  MIN_REFERENCE_CASES, INVALIDATION_KINDS,
  referenceClass, scenarioDistribution, hindcastRecord,
  calibrationLedgerEntry, scoreLedgerEntry, reviseLedgerForecast, forecastUpdateTriggers,
  compileCalibratedForecast, recordForecast, scoreForecast, calibrationSummary
} from '../src/forecast-parent-organ.mjs';

const casesFrom = (sources, hits) => sources.map((source, i) => ({
  id: `case-${i}`, source, hit: i < hits
}));

const allBiasesCorrected = REFERENCE_CLASS_BIASES.map(bias => ({ bias, applied: true }));

/** A reference class that clears both floors, for tests about something else. */
const soundReferenceClass = {
  comparabilityCriteria: ['same-market', 'same-stage'],
  cases: casesFrom(['a', 'b', 'c', 'd', 'e', 'f'], 3),
  biasCorrections: allBiasesCorrected
};

const soundDistribution = {
  measurability: 'MEASURABLE',
  timeToFeedback: '90 days',
  percentiles: { p10: 10, p50: 20, p90: 40 },
  bestPlausible: 'clears 40',
  worstPlausible: 'stalls near 10'
};

const soundHindcast = {
  method: 'REFERENCE_CLASS',
  trials: Array.from({ length: 6 }, (_, i) => ({
    caseId: `t${i}`, predicted: 'hit', actual: 'hit', correct: i < 5
  }))
};

describe('reference class and base rates', () => {
  test('states a base rate when cases and sources both clear the floor', () => {
    const result = referenceClass({ question: 'will it convert?', ...soundReferenceClass });
    assert.equal(result.ok, true);
    assert.equal(result.status, 'REFERENCE_CLASS_BUILT');
    assert.equal(result.baseRate, 0.5);
    assert.equal(result.sourceIndependence, 'INDEPENDENT');
  });

  // LOAD-BEARING. Independence counted over sources, not rows. Delete that and
  // twenty citations of one study read as a large independent sample.
  test('many cases from a single source are not an independent sample', () => {
    const result = referenceClass({
      question: 'will it convert?',
      comparabilityCriteria: ['same-market'],
      cases: casesFrom(Array(20).fill('one-analyst-report'), 18),
      biasCorrections: allBiasesCorrected
    });
    assert.equal(result.status, 'REFERENCE_CLASS_UNDERPOWERED');
    assert.equal(result.baseRate, null, 'a correlated sample must never be promoted to a base rate');
    assert.equal(result.independentSources, 1);
    assert.equal(result.sampleSize, 20, 'the sample is large; that is exactly why the guard matters');
    assert.ok(result.degradedBecause.includes('all cases trace to a single source'));
  });

  test('the raw fraction is still shown when the class is underpowered', () => {
    const result = referenceClass({
      question: 'q',
      comparabilityCriteria: ['c'],
      cases: casesFrom(['a', 'b'], 1)
    });
    assert.equal(result.baseRate, null);
    assert.equal(result.rawHitFraction, 0.5, 'hiding the arithmetic would be its own dishonesty');
  });

  test('cases called comparable without stated criteria are refused', () => {
    const result = referenceClass({ question: 'q', cases: casesFrom(['a', 'b', 'c', 'd', 'e'], 2) });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('comparability-criteria-required'));
  });

  test('uncorrected biases are named rather than silently ignored', () => {
    const result = referenceClass({
      question: 'q',
      comparabilityCriteria: ['c'],
      cases: casesFrom(['a', 'b', 'c', 'd', 'e', 'f'], 3),
      biasCorrections: [{ bias: 'SURVIVORSHIP', applied: true }]
    });
    assert.equal(result.status, 'REFERENCE_CLASS_BUILT');
    assert.equal(result.qualified, true);
    assert.deepEqual(result.uncorrectedBiases, ['SELECTION', 'PUBLICATION', 'AVAILABILITY']);
  });

  test(`fewer than ${MIN_REFERENCE_CASES} cases cannot support a rate`, () => {
    const result = referenceClass({
      question: 'q', comparabilityCriteria: ['c'], cases: casesFrom(['a', 'b', 'c'], 2)
    });
    assert.equal(result.status, 'REFERENCE_CLASS_UNDERPOWERED');
    assert.equal(result.baseRate, null);
  });
});

describe('scenario distribution', () => {
  test('produces a band, never a bare point estimate', () => {
    const result = scenarioDistribution({ question: 'q', ...soundDistribution });
    assert.equal(result.status, 'DISTRIBUTION_BUILT');
    assert.deepEqual(result.percentiles, { p10: 10, p50: 20, p90: 40 });
  });

  // LOAD-BEARING. An unmeasurable outcome has no P50, and attaching one is
  // invention rather than caution.
  test('an inherently unmeasurable outcome gets no percentiles', () => {
    const result = scenarioDistribution({
      question: 'will this life feel worthwhile?',
      measurability: 'INHERENTLY_UNMEASURABLE',
      timeToFeedback: 'decades',
      percentiles: { p10: 1, p50: 5, p90: 9 }
    });
    assert.equal(result.status, 'DISTRIBUTION_UNQUANTIFIED');
    assert.equal(result.percentiles, null, 'percentiles offered for an unmeasurable outcome must be dropped, not honoured');
  });

  // LOAD-BEARING. Refused rather than rounded: rounding would conceal that
  // false precision was offered at all.
  test('a probability quoted past two decimals is refused, not rounded', () => {
    const result = scenarioDistribution({
      question: 'q', measurability: 'MEASURABLE', timeToFeedback: '30 days',
      percentiles: { p10: 1, p50: 2, p90: 3 },
      probabilityOfNoMeaningfulEffect: 0.3721
    });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('fake-decimal-precision-refused'));
  });

  test('scenario probabilities may not exceed one', () => {
    const result = scenarioDistribution({
      question: 'q', measurability: 'MEASURABLE', timeToFeedback: '30 days',
      percentiles: { p10: 1, p50: 2, p90: 3 },
      scenarios: [{ label: 'a', probability: 0.7 }, { label: 'b', probability: 0.6 }]
    });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('scenario-probabilities-exceed-one'));
  });

  test('out-of-order percentiles are refused', () => {
    const result = scenarioDistribution({
      question: 'q', measurability: 'MEASURABLE', timeToFeedback: '30 days',
      percentiles: { p10: 9, p50: 5, p90: 1 }
    });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('percentiles-must-be-ordered'));
  });

  test('a measurable outcome with no band is refused', () => {
    const result = scenarioDistribution({ question: 'q', measurability: 'MEASURABLE', timeToFeedback: '1 day' });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('p10-p50-p90-required-for-measurable-outcomes'));
  });

  test('an unrecognised measurability class is refused', () => {
    const result = scenarioDistribution({ question: 'q', measurability: 'SORT_OF', timeToFeedback: '1 day' });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('valid-measurability-required'));
    assert.deepEqual(result.classes, MEASURABILITY_CLASSES);
  });
});

describe('hindcast records', () => {
  test('scores a method against outcomes already known', () => {
    const result = hindcastRecord(soundHindcast);
    assert.equal(result.status, 'HINDCAST_SCORED');
    assert.equal(result.scoredTrials, 6);
    assert.ok(Math.abs(result.accuracy - 5 / 6) < 1e-9);
    assert.equal(result.trustedWeight, true);
  });

  // LOAD-BEARING. Trials with no known outcome cannot score anything; counting
  // them lets a method build a record without ever having been checked.
  test('trials with no known outcome cannot score a method', () => {
    const result = hindcastRecord({
      method: 'CAUSAL_MODEL',
      trials: [{ caseId: 't1', predicted: 'up' }, { caseId: 't2', predicted: 'down' }]
    });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('hindcast-requires-trials-with-known-outcomes'));
    assert.equal(result.unresolvedTrials, 2);
  });

  test('too few scored trials leaves a method untrusted rather than trusted', () => {
    const result = hindcastRecord({
      method: 'CAUSAL_MODEL',
      trials: [{ caseId: 't1', predicted: 'up', actual: 'up', correct: true }]
    });
    assert.equal(result.status, 'HINDCAST_SCORED');
    assert.equal(result.trustedWeight, false, 'one checked trial is not a track record');
  });

  test('an unknown method name is refused', () => {
    const result = hindcastRecord({ method: 'VIBES', trials: [] });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('valid-forecast-method-required'));
  });
});

describe('calibration ledger', () => {
  const entryInput = {
    question: 'how many will convert?',
    timestamp: '2026-09-08T00:00:00.000Z',
    informationAvailable: ['pipeline as of 2026-09-07'],
    predictedUpdateTriggers: ['pricing changes'],
    causalAssumptions: ['demand holds'],
    ranges: { p10: 10, p50: 20, p90: 40 }
  };

  test('records an entry with the forecast half sealed', () => {
    const entry = calibrationLedgerEntry(entryInput);
    assert.equal(entry.status, 'LEDGER_ENTRY_RECORDED');
    assert.equal(entry.scored, false);
    assert.match(entry.seal, /^[0-9a-f]{64}$/);
  });

  test('an entry with no record of what was knowable then is refused', () => {
    const entry = calibrationLedgerEntry({ ...entryInput, informationAvailable: [] });
    assert.equal(entry.ok, false);
    assert.ok(entry.reasonCodes.includes('information-available-at-forecast-time-required'));
  });

  test('an entry with no declared update triggers is refused', () => {
    const entry = calibrationLedgerEntry({ ...entryInput, predictedUpdateTriggers: [] });
    assert.equal(entry.ok, false);
    assert.ok(entry.reasonCodes.includes('predicted-update-triggers-required'));
  });

  // LOAD-BEARING. The seal is content-derived, so an edit is detectable
  // without trusting any field inside the record to confess it. A boolean flag
  // here would be reset by the same code that wanted to edit.
  test('an entry edited after recording cannot be scored', () => {
    const entry = calibrationLedgerEntry(entryInput);
    const tampered = { ...entry, forecast: { ...entry.forecast, ranges: { p10: 19, p50: 20, p90: 21 } } };
    const scored = scoreLedgerEntry({ entry: tampered, observedOutcome: '20 converted', observedValue: 20 });
    assert.equal(scored.ok, false);
    assert.equal(scored.status, 'FORECAST_TAMPERED');
    assert.ok(scored.reasonCodes.includes('forecast-edited-after-recording'));
  });

  test('scoring before reality has answered is refused', () => {
    const entry = calibrationLedgerEntry(entryInput);
    const scored = scoreLedgerEntry({ entry });
    assert.equal(scored.ok, false);
    assert.ok(scored.reasonCodes.includes('observed-outcome-required'));
  });

  test('scores against a real outcome and preserves the original forecast', () => {
    const entry = calibrationLedgerEntry(entryInput);
    const scored = scoreLedgerEntry({ entry, observedOutcome: '25 converted', observedValue: 25 });
    assert.equal(scored.status, 'LEDGER_ENTRY_SCORED');
    assert.equal(scored.calibrationError, 5);
    assert.equal(scored.withinForecastBand, true);
    assert.deepEqual(scored.forecast.ranges, { p10: 10, p50: 20, p90: 40 });
  });

  test('a narrative outcome scores as unscorable rather than as a number', () => {
    const entry = calibrationLedgerEntry({ ...entryInput, ranges: null });
    const scored = scoreLedgerEntry({ entry, observedOutcome: 'the team disbanded' });
    assert.equal(scored.calibrationError, null);
    assert.equal(scored.calibrationNote, 'NOT_NUMERICALLY_SCORABLE__NARRATIVE_OUTCOME_ONLY');
  });

  // LOAD-BEARING. This is the edit nobody reading the ledger later could
  // distinguish from having forecast well.
  test('a forecast cannot be revised once its outcome is known', () => {
    const entry = calibrationLedgerEntry(entryInput);
    const scored = scoreLedgerEntry({ entry, observedOutcome: '25 converted', observedValue: 25 });
    const revised = reviseLedgerForecast({ entry: scored, reason: 'looks better this way', ranges: { p10: 24, p50: 25, p90: 26 } });
    assert.equal(revised.ok, false);
    assert.equal(revised.status, 'LEDGER_REVISION_REFUSED');
    assert.ok(revised.reasonCodes.includes('forecast-frozen-after-outcome-observed'));
  });

  test('revision before the outcome is allowed, reasoned, re-sealed and keeps the prior', () => {
    const entry = calibrationLedgerEntry(entryInput);
    const revised = reviseLedgerForecast({ entry, reason: 'competitor cut price', ranges: { p10: 5, p50: 12, p90: 30 } });
    assert.equal(revised.status, 'LEDGER_ENTRY_RECORDED');
    assert.equal(revised.revisionReason, 'competitor cut price');
    assert.deepEqual(revised.supersededForecasts[0].ranges, { p10: 10, p50: 20, p90: 40 });
    assert.notEqual(revised.seal, entry.seal, 'a revision must re-seal or the chain stops being checkable');
    const scored = scoreLedgerEntry({ entry: revised, observedOutcome: '12', observedValue: 12 });
    assert.equal(scored.ok, true, 'a properly re-sealed revision must remain scorable');
  });

  test('revision without a stated reason is refused', () => {
    const entry = calibrationLedgerEntry(entryInput);
    const revised = reviseLedgerForecast({ entry, ranges: { p10: 1, p50: 2, p90: 3 } });
    assert.equal(revised.ok, false);
    assert.ok(revised.reasonCodes.includes('revision-reason-required'));
  });

  test('the categorical ledger is re-exported rather than reimplemented', () => {
    assert.equal(typeof recordForecast, 'function');
    assert.equal(typeof scoreForecast, 'function');
    assert.equal(typeof calibrationSummary, 'function');
    const recorded = recordForecast({
      claim: 'ships this quarter', probabilities: { yes: 0.7, no: 0.3 },
      evidenceCutoff: '2026-09-01T00:00:00.000Z', method: 'REFERENCE_CLASS'
    });
    assert.equal(recorded.ok, true, 'the existing sealed ledger stays the ledger for categorical questions');
  });
});

describe('update triggers before the outcome exists', () => {
  const entry = calibrationLedgerEntry({
    question: 'how many will convert?',
    timestamp: '2026-09-08T00:00:00.000Z',
    informationAvailable: ['pipeline as of 2026-09-07'],
    predictedUpdateTriggers: ['pricing changes', 'a competitor enters'],
    causalAssumptions: ['demand holds'],
    ranges: { p10: 10, p50: 20, p90: 40 }
  });

  test('a forecast with nothing fired is still current', () => {
    const verdict = forecastUpdateTriggers({ entry, observations: [] });
    assert.equal(verdict.status, 'FORECAST_STILL_CURRENT');
    assert.equal(verdict.severity, 'NONE');
  });

  // The gap this closes: scoring is retrospective, so without it a forecast
  // whose causal story collapsed months ago stays unflagged until the question
  // finally resolves.
  test('a falsified recorded assumption withdraws support before any outcome exists', () => {
    const verdict = forecastUpdateTriggers({
      entry, observations: [{ kind: 'ASSUMPTION_FALSIFIED', detail: 'demand holds' }]
    });
    assert.equal(verdict.status, 'FORECAST_REVALIDATION_REQUIRED');
    assert.equal(verdict.severity, 'FORECAST_NO_LONGER_SUPPORTED');
  });

  // LOAD-BEARING. Otherwise any inconvenient fact could be relabelled a
  // falsified assumption and used to justify a rewrite.
  test('only assumptions actually recorded at forecast time can be falsified', () => {
    const verdict = forecastUpdateTriggers({
      entry, observations: [{ kind: 'ASSUMPTION_FALSIFIED', detail: 'something never assumed' }]
    });
    assert.equal(verdict.status, 'FORECAST_STILL_CURRENT');
    assert.deepEqual(verdict.firedTriggers, []);
  });

  test('staleness asks for a refresh rather than withdrawing support', () => {
    const verdict = forecastUpdateTriggers({
      entry, observations: [{ kind: 'EVIDENCE_STALE_PAST_HALF_LIFE', detail: 'pipeline snapshot is 6 months old' }]
    });
    assert.equal(verdict.severity, 'FORECAST_NEEDS_REFRESH');
  });

  test('an unrecognised trigger kind is ignored rather than honoured', () => {
    const verdict = forecastUpdateTriggers({ entry, observations: [{ kind: 'BAD_FEELING', detail: 'x' }] });
    assert.deepEqual(verdict.firedTriggers, []);
    assert.ok(INVALIDATION_KINDS.length > 0);
  });

  test('the verdict never edits the forecast it judges', () => {
    const verdict = forecastUpdateTriggers({
      entry, observations: [{ kind: 'REGIME_CHANGE', detail: 'market structure shifted' }]
    });
    assert.equal(verdict.revisionPerformed, false);
    assert.deepEqual(entry.forecast.ranges, { p10: 10, p50: 20, p90: 40 });
  });
});

describe('the parent compiler', () => {
  const sound = {
    question: 'how many will convert?',
    timestamp: '2026-09-08T00:00:00.000Z',
    informationAvailable: ['pipeline as of 2026-09-07'],
    updateTriggers: ['pricing changes'],
    causalAssumptions: ['demand holds'],
    expectedHalfLife: '90 days',
    referenceClass: soundReferenceClass,
    distribution: soundDistribution,
    hindcasts: [soundHindcast]
  };

  test('compiles a band when every input clears its floor', () => {
    const result = compileCalibratedForecast(sound);
    assert.equal(result.status, 'FORECAST_COMPILED');
    assert.deepEqual(result.percentiles, { p10: 10, p50: 20, p90: 40 });
    assert.deepEqual(result.blockers, []);
    assert.equal(result.pointEstimate, null, 'the organ never emits a bare point estimate');
  });

  test('one weak input widens the band and says which', () => {
    const result = compileCalibratedForecast({
      ...sound,
      referenceClass: { comparabilityCriteria: ['c'], cases: casesFrom(['a', 'b'], 1), biasCorrections: allBiasesCorrected }
    });
    assert.equal(result.status, 'FORECAST_WIDENED');
    assert.ok(result.blockers.includes('REFERENCE_CLASS_UNDERPOWERED'));
    assert.ok(result.percentiles.p90 > 40, 'widening must actually widen');
    assert.ok(result.percentiles.p10 < 10);
  });

  // LOAD-BEARING. This is the whole justification for the organ: a compiler
  // that always returned a range would be a slower way of manufacturing
  // precision, and the slowness would make it more convincing, not less.
  test('an unmeasurable outcome compiles to UNKNOWN rather than a widened invention', () => {
    const result = compileCalibratedForecast({
      ...sound,
      distribution: {
        measurability: 'INHERENTLY_UNMEASURABLE', timeToFeedback: 'decades',
        bestPlausible: 'it mattered', worstPlausible: 'it did not'
      }
    });
    assert.equal(result.status, 'FORECAST_UNKNOWN');
    assert.equal(result.percentiles, null);
    assert.ok(result.blockers.includes('OUTCOME_NOT_MEASURABLE'));
  });

  test('two weak inputs compile to UNKNOWN rather than a very wide guess', () => {
    const result = compileCalibratedForecast({
      ...sound,
      referenceClass: { comparabilityCriteria: ['c'], cases: casesFrom(['a', 'b'], 1), biasCorrections: allBiasesCorrected },
      hindcasts: [{ method: 'CAUSAL_MODEL', trials: [{ caseId: 't1', predicted: 'up', actual: 'up', correct: true }] }]
    });
    assert.equal(result.status, 'FORECAST_UNKNOWN');
    assert.ok(result.blockers.includes('NO_METHOD_HAS_A_TRACK_RECORD'));
  });

  // Weighting by argument instead of by track record is the failure the whole
  // organ exists to prevent.
  test('a compile with no scored hindcast at all is refused outright', () => {
    const result = compileCalibratedForecast({ ...sound, hindcasts: [] });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('at-least-one-scored-hindcast-required'));
  });

  test('a compile with no declared update triggers is refused', () => {
    const result = compileCalibratedForecast({ ...sound, updateTriggers: [] });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.includes('update-triggers-required'));
  });

  test('the compiled forecast claims no authority over the chooser', () => {
    const result = compileCalibratedForecast(sound);
    assert.equal(result.businessEffectAuthority, 'NONE');
    assert.equal(result.law, 'PREDICTION_NEVER_CREATES_AUTHORITY__THE_CHOOSER_REMAINS_THE_CHOOSER');
  });

  test('every refusal path also carries no authority', () => {
    for (const result of [
      referenceClass({}), scenarioDistribution({}), hindcastRecord({}),
      calibrationLedgerEntry({}), scoreLedgerEntry({}), reviseLedgerForecast({}),
      forecastUpdateTriggers({}), compileCalibratedForecast({})
    ]) {
      assert.equal(result.ok, false);
      assert.equal(result.businessEffectAuthority, 'NONE');
      assert.ok(Array.isArray(result.reasonCodes) && result.reasonCodes.length > 0);
    }
  });

  test('the organ is versioned', () => {
    assert.equal(FORECAST_PARENT_ORGAN_VERSION, 'uberbond.forecast-parent-organ.v1');
  });
});
