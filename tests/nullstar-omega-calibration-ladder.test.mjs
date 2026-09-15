import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CALIBRATION_STATES,
  STATE_REQUIREMENTS,
  placeCalibration
} from '../src/nullstar-omega-calibration-ladder.mjs';

const place = (overrides = {}) => placeCalibration({
  scoredForecasts: 2,
  taskFamilyCount: 2,
  domainCount: 1,
  timeHorizonCount: 1,
  externallySettledForecasts: 0,
  meanBrier: 0.7975,
  ...overrides
});

test('the live sample places at repository-local, not reality-calibrated', () => {
  const result = place();
  assert.equal(result.status, 'REPOSITORY_LOCAL_CALIBRATED');
  assert.ok(!CALIBRATION_STATES.slice(CALIBRATION_STATES.indexOf('DOMAIN_CALIBRATED')).includes(result.status));
  assert.equal(result.smallSample, true);
  assert.equal(result.confidenceInterval, null);
  assert.match(result.smallSampleWarning, /not a calibration curve/);
});

test('an omitted count is a refusal, not a generous assumption', () => {
  const result = placeCalibration({ scoredForecasts: 40, taskFamilyCount: 9 });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('domain-count-required'));
  assert.ok(result.reasonCodes.includes('time-horizon-count-required'));
  assert.ok(result.reasonCodes.includes('externally-settled-count-required'));
});

test('no scored forecasts is unmeasured, never a low score', () => {
  const result = place({ scoredForecasts: 0 });
  assert.equal(result.status, 'UNMEASURED');
  assert.equal(result.requirement, STATE_REQUIREMENTS.UNMEASURED);
});

test('a big repository-only sample still cannot reach external calibration', () => {
  const result = place({ scoredForecasts: 200, taskFamilyCount: 30, domainCount: 4, timeHorizonCount: 9 });
  assert.equal(result.status, 'MULTI_DOMAIN_CALIBRATED');
  assert.equal(result.nextState, 'EXTERNALLY_CALIBRATED');
  assert.ok(result.shortfallToNextState.some(s => /externally settled/.test(s)));
});

test('external settlement is what unlocks the external rung', () => {
  const result = place({ scoredForecasts: 25, taskFamilyCount: 6, domainCount: 1, timeHorizonCount: 1, externallySettledForecasts: 25 });
  assert.equal(result.status, 'EXTERNALLY_CALIBRATED');
  assert.equal(result.smallSample, false);
});

test('one lucky window is not longitudinal', () => {
  const oneWindow = place({ scoredForecasts: 25, taskFamilyCount: 6, domainCount: 1, timeHorizonCount: 1, externallySettledForecasts: 25 });
  assert.equal(oneWindow.status, 'EXTERNALLY_CALIBRATED');
  const sustained = place({ scoredForecasts: 25, taskFamilyCount: 6, domainCount: 1, timeHorizonCount: 3, externallySettledForecasts: 25 });
  assert.equal(sustained.status, 'LONGITUDINALLY_CALIBRATED');
});

test('more externally settled than scored is incoherent and refused', () => {
  const result = place({ scoredForecasts: 2, externallySettledForecasts: 5 });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('externally-settled-cannot-exceed-scored'));
});

test('a single forecast in one family cannot reach the repository rung', () => {
  const result = place({ scoredForecasts: 1, taskFamilyCount: 1 });
  assert.equal(result.status, 'INTERNAL_SIMULATED');
  assert.ok(result.shortfallToNextState.length > 0);
});

test('the shortfall names every missing dimension, not just the first', () => {
  const result = place({ scoredForecasts: 2, taskFamilyCount: 2, domainCount: 1 });
  assert.equal(result.nextState, 'DOMAIN_CALIBRATED');
  assert.ok(result.shortfallToNextState.some(s => /scored forecasts/.test(s)));
  assert.ok(result.shortfallToNextState.some(s => /task families/.test(s)));
});

test('voided forecasts are carried in the sample rather than quietly dropped', () => {
  const result = place({ voidedForecasts: 1 });
  assert.equal(result.sample.voidedForecasts, 1);
  assert.equal(result.sample.scoredForecasts, 2);
});
