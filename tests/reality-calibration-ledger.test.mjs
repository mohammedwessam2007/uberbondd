import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordForecast, scoreForecast, decisionQuality, calibrationSummary, sealForecast
} from '../src/reality-calibration-ledger.mjs';

// Without a ledger a forecasting system is a generator of confident sentences.
// The ledger only works if three things are impossible: editing a forecast after
// the outcome, scoring against evidence it already had, and reading an outcome
// as proof the decision was good.

const recorded = (probabilities, extra = {}) => {
  const built = recordForecast({
    claim: 'the move increases income within a year',
    probabilities,
    evidenceCutoff: '2026-01-01T00:00:00.000Z',
    at: '2026-01-01T00:00:00.000Z',
    ...extra
  });
  assert.equal(built.ok, true, JSON.stringify(built.reasonCodes));
  return built.forecast;
};

test('a forecast edited after recording cannot be scored', () => {
  // Retroactive accuracy is the easiest lie in the building and leaves no trace
  // without this.
  const forecast = recorded({ yes: 0.3, no: 0.7 });
  const doctored = { ...forecast, probabilities: { yes: 0.9, no: 0.1 } };
  const scored = scoreForecast({ forecast: doctored, outcome: 'yes', observedAt: '2026-06-01T00:00:00.000Z' });
  assert.equal(scored.ok, false);
  assert.equal(scored.status, 'FORECAST_TAMPERED');
});

test('the seal covers the claim, the probabilities and the cutoff', () => {
  const forecast = recorded({ yes: 0.5, no: 0.5 });
  for (const edit of [
    { claim: 'something else' },
    { probabilities: { yes: 0.6, no: 0.4 } },
    { evidenceCutoff: '2026-05-01T00:00:00.000Z' }
  ]) {
    assert.notEqual(sealForecast({ ...forecast, ...edit }), forecast.seal,
      `${Object.keys(edit)[0]} must be inside the seal`);
  }
});

test('an outcome already known at forecast time measures memory, not prediction', () => {
  const forecast = recorded({ yes: 0.9, no: 0.1 });
  const scored = scoreForecast({ forecast, outcome: 'yes', observedAt: '2025-12-01T00:00:00.000Z' });
  assert.equal(scored.ok, false);
  assert.deepEqual(scored.reasonCodes, ['outcome-predates-evidence-cutoff']);
});

test('an outcome outside the forecast state space is recorded as the stronger finding', () => {
  // Being wrong about which outcomes were possible says more than being wrong
  // about their probabilities, so it must not be discarded as unscorable noise.
  const forecast = recorded({ yes: 0.5, no: 0.5 });
  const scored = scoreForecast({ forecast, outcome: 'the company folded', observedAt: '2026-06-01T00:00:00.000Z' });
  assert.equal(scored.ok, false);
  assert.deepEqual(scored.reasonCodes, ['observed-outcome-was-not-among-the-forecast-outcomes']);
  assert.match(scored.note, /state space was wrong/);
});

test('probabilities that do not sum to one are refused', () => {
  // The slack is where an unstated "something else" outcome hides, which is
  // exactly the state-space error above, uncaught.
  const built = recordForecast({
    claim: 'x', probabilities: { yes: 0.3, no: 0.3 },
    evidenceCutoff: '2026-01-01T00:00:00.000Z', at: '2026-01-01T00:00:00.000Z'
  });
  assert.equal(built.ok, false);
  assert.ok(built.reasonCodes.includes('probabilities-must-sum-to-one'));
});

test('the score is proper, so overstating confidence cannot improve it', () => {
  const honest = scoreForecast({
    forecast: recorded({ yes: 0.7, no: 0.3 }), outcome: 'no', observedAt: '2026-06-01T00:00:00.000Z'
  });
  const overconfident = scoreForecast({
    forecast: recorded({ yes: 0.99, no: 0.01 }), outcome: 'no', observedAt: '2026-06-01T00:00:00.000Z'
  });
  assert.ok(overconfident.brierScore > honest.brierScore,
    'a proper score must punish confidence that was not held honestly');
});

test('decision quality is judged on what was knowable, never on the outcome', () => {
  // Otherwise a lucky bad decision becomes doctrine and an unlucky good one
  // gets abandoned -- the ledger teaching the wrong lesson twice.
  const forecast = recorded({ yes: 0.5, no: 0.5 }, { assumptions: ['income-panel considered', 'two alternatives weighed'] });
  const score = scoreForecast({ forecast, outcome: 'yes', observedAt: '2026-06-01T00:00:00.000Z' });

  const sloppy = decisionQuality({
    forecast, score,
    availableAtTime: ['income-panel considered', 'cost-of-living data ignored'],
    consideredAlternatives: ['move']
  });
  assert.equal(sloppy.quality, 'IMPROVABLE');
  assert.deepEqual(sloppy.ignoredAvailableEvidence, ['cost-of-living data ignored']);
  assert.equal(sloppy.outcomeWas, 'yes', 'the good outcome does not make the decision good');
  assert.match(sloppy.separation, /NOT_ON_THE_OUTCOME/);
});

test('a lucky bad decision does not become doctrine', () => {
  // The case the separation exists for. The forecast put 0.9 on what happened,
  // so every outcome-based measure calls this excellent -- while the reasoning
  // ignored evidence that was sitting there and weighed exactly one option.
  const forecast = recorded({ yes: 0.9, no: 0.1 }, { assumptions: ['gut feel'] });
  const score = scoreForecast({ forecast, outcome: 'yes', observedAt: '2026-06-01T00:00:00.000Z' });
  assert.ok(score.brierScore < 0.05, 'the outcome makes this look like a triumph');

  const quality = decisionQuality({
    forecast, score,
    availableAtTime: ['income-panel ignored', 'two prior relocations ignored'],
    consideredAlternatives: ['move']
  });
  assert.equal(quality.quality, 'IMPROVABLE',
    'being right is not the same as having reasoned well, and conflating them teaches the wrong lesson');
  assert.equal(quality.ignoredAvailableEvidence.length, 2);
});

test('an unlucky good decision is not mislearned as a mistake', () => {
  // The mirror case, and the more costly one: abandoning a sound method
  // because reality rolled against it once.
  const forecast = recorded(
    { yes: 0.7, no: 0.3 },
    { assumptions: ['income-panel considered', 'two prior relocations considered'] }
  );
  const score = scoreForecast({ forecast, outcome: 'no', observedAt: '2026-06-01T00:00:00.000Z' });
  assert.ok(score.brierScore > 0.5, 'the outcome makes this look like a failure');

  const quality = decisionQuality({
    forecast, score,
    availableAtTime: ['income-panel considered', 'two prior relocations considered'],
    consideredAlternatives: ['move', 'stay', 'three-month trial']
  });
  assert.equal(quality.quality, 'WELL_MADE');
  assert.deepEqual(quality.ignoredAvailableEvidence, []);
});

test('an unscored forecast cannot be assessed for decision quality', () => {
  assert.equal(decisionQuality({ forecast: recorded({ yes: 1 }), score: null }).ok, false);
});

test('no scored forecasts means calibration is unknown, not good', () => {
  const summary = calibrationSummary([]);
  assert.equal(summary.status, 'CALIBRATION_UNKNOWN');
  assert.match(summary.why, /unknown, not good/);
});

test('calibration is reported per band, because a good mean hides a bad band', () => {
  const scores = [
    scoreForecast({ forecast: recorded({ yes: 0.9, no: 0.1 }), outcome: 'no', observedAt: '2026-06-01T00:00:00.000Z' }),
    scoreForecast({ forecast: recorded({ yes: 0.5, no: 0.5 }), outcome: 'yes', observedAt: '2026-06-01T00:00:00.000Z' })
  ];
  const summary = calibrationSummary(scores);
  assert.equal(summary.scored, 2);
  assert.ok(summary.bands.length >= 2, 'bands must be separated or systematic overconfidence averages away');
  assert.match(summary.truthBoundary, /A GOOD MEAN DOES NOT PROVE A CALIBRATED BAND/);
});
