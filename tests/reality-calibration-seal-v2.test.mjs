import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recordForecast,
  scoreForecast,
  decisionQuality,
  sealForecast,
  FORECAST_SEAL_VERSION
} from '../src/reality-calibration-ledger.mjs';

const recorded = (probabilities, extra = {}) => {
  const result = recordForecast({
    claim: 'the move increases income within a year',
    probabilities,
    evidenceCutoff: '2026-01-01T00:00:00.000Z',
    at: '2026-01-01T00:00:00.000Z',
    ...extra
  });
  assert.equal(result.ok, true, JSON.stringify(result.reasonCodes));
  return result.forecast;
};

test('v2 seal covers every field later used to score or judge decision quality', () => {
  const forecast = recorded({ yes: 0.5, no: 0.5 }, { method: 'panel', assumptions: ['income panel'] });
  for (const edit of [
    { claim: 'something else' },
    { probabilities: { yes: 0.6, no: 0.4 } },
    { evidenceCutoff: '2026-05-01T00:00:00.000Z' },
    { forecastAt: '2026-01-02T00:00:00.000Z' },
    { method: 'hindsight' },
    { assumptions: ['everything was considered'] }
  ]) {
    assert.notEqual(sealForecast({ ...forecast, ...edit }), forecast.seal,
      `${Object.keys(edit)[0]} must be inside the seal`);
  }
});

test('old or missing seal version cannot silently enter current scoring', () => {
  const forecast = recorded({ yes: 0.5, no: 0.5 });
  const legacy = { ...forecast };
  delete legacy.sealVersion;
  legacy.seal = sealForecast(legacy);
  const scored = scoreForecast({ forecast: legacy, outcome: 'yes', observedAt: '2026-06-01T00:00:00.000Z' });
  assert.equal(scored.status, 'FORECAST_TAMPERED');
  assert.ok(scored.reasonCodes.includes('current-forecast-seal-version-required'));
});

test('forecast identity is bound to the exact sealed payload', () => {
  const forecast = recorded({ yes: 0.5, no: 0.5 });
  const scored = scoreForecast({ forecast: { ...forecast, id: 'fc_forged' }, outcome: 'yes', observedAt: '2026-06-01T00:00:00.000Z' });
  assert.equal(scored.status, 'FORECAST_TAMPERED');
  assert.ok(scored.reasonCodes.includes('forecast-id-integrity-mismatch'));
});

test('assumptions cannot be rewritten after scoring to improve decision quality', () => {
  const forecast = recorded({ yes: 0.9, no: 0.1 }, { assumptions: ['gut feel'] });
  const score = scoreForecast({ forecast, outcome: 'yes', observedAt: '2026-06-01T00:00:00.000Z' });
  assert.equal(score.ok, true);
  const doctored = { ...forecast, assumptions: ['income-panel considered', 'two prior relocations considered'] };
  const quality = decisionQuality({
    forecast: doctored,
    score,
    availableAtTime: ['income-panel considered', 'two prior relocations considered'],
    consideredAlternatives: ['move', 'stay']
  });
  assert.equal(quality.ok, false);
  assert.ok(quality.reasonCodes.includes('sealed-forecast-integrity-required'));
});

test('a score from one forecast cannot assess another forecast decision quality', () => {
  const first = recorded({ yes: 0.6, no: 0.4 }, { assumptions: ['same evidence'] });
  const second = recorded({ yes: 0.7, no: 0.3 }, { assumptions: ['same evidence'] });
  const score = scoreForecast({ forecast: first, outcome: 'yes', observedAt: '2026-06-01T00:00:00.000Z' });
  const quality = decisionQuality({ forecast: second, score, availableAtTime: ['same evidence'], consideredAlternatives: ['move', 'stay'] });
  assert.equal(quality.ok, false);
  assert.ok(quality.reasonCodes.includes('score-forecast-identity-mismatch'));
});

test('unchanged v2 forecast still scores and supports separated decision-quality assessment', () => {
  const forecast = recorded({ yes: 0.7, no: 0.3 }, { assumptions: ['income panel considered', 'prior relocation considered'] });
  assert.equal(forecast.sealVersion, FORECAST_SEAL_VERSION);
  const score = scoreForecast({ forecast, outcome: 'no', observedAt: '2026-06-01T00:00:00.000Z' });
  assert.equal(score.ok, true);
  const quality = decisionQuality({
    forecast,
    score,
    availableAtTime: ['income panel considered', 'prior relocation considered'],
    consideredAlternatives: ['move', 'stay', 'trial']
  });
  assert.equal(quality.ok, true);
  assert.equal(quality.quality, 'WELL_MADE');
  assert.match(quality.separation, /NOT_ON_THE_OUTCOME/);
});
