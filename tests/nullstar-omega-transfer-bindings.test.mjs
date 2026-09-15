import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FOUNDER_DECIDER_CLASSES,
  ECONOMIC_DECIDER_CLASSES,
  REFUSED_ECONOMIC_DECIDERS,
  bindFounderDecisionForecast,
  bindEconomicOutcomeForecast
} from '../src/nullstar-omega-transfer-bindings.mjs';

const CUTOFF = '2026-09-14T00:00:00.000Z';
const AT = '2026-09-14T00:00:01.000Z';

const founder = (overrides = {}) => bindFounderDecisionForecast({
  id: 'founder-decision-1',
  question: 'Will the deferred decision still be open in thirty days?',
  deciderClass: 'ELAPSED_TIME',
  decidedBy: 'the decision register entry and the calendar',
  outcomeSpace: ['STILL_OPEN', 'DECIDED', 'EXPIRED'],
  probabilities: { STILL_OPEN: 0.5, DECIDED: 0.3, EXPIRED: 0.2 },
  evidenceCutoff: CUTOFF,
  at: AT,
  ...overrides
});

const economic = (overrides = {}) => bindEconomicOutcomeForecast({
  id: 'economic-outcome-1',
  question: 'Will this offer produce a cleared payment within fourteen days?',
  deciderClass: 'PROVIDER_ORIGIN_RECEIPT',
  decidedBy: 'the reconciled provider settlement record',
  outcomeSpace: ['CLEARED', 'NOT_CLEARED'],
  probabilities: { CLEARED: 0.15, NOT_CLEARED: 0.85 },
  evidenceCutoff: CUTOFF,
  at: AT,
  ...overrides
});

test('a founder forecast binds when something outside the founder decides it', () => {
  const bound = founder();
  assert.equal(bound.ok, true);
  assert.equal(bound.status, 'FOUNDER_FORECAST_BOUND');
  assert.equal(bound.observable.independent, true);
  assert.ok(bound.forecast.seal);
});

test('binding a founder forecast creates no recommendation or authority', () => {
  const bound = founder();
  assert.equal(bound.sovereignty.createsRecommendation, false);
  assert.equal(bound.sovereignty.createsCommitment, false);
  assert.equal(bound.sovereignty.createsAuthority, false);
});

test('a founder forecast the founder would settle themselves is refused', () => {
  const bound = founder({ deciderClass: 'FOUNDER_SELF_REPORT' });
  assert.equal(bound.ok, false);
  assert.ok(bound.reasonCodes.includes('decider-class-must-be-one-that-the-forecaster-does-not-control'));
  assert.deepEqual(bound.allowedDeciders, FOUNDER_DECIDER_CLASSES);
});

test('a forecast that names no settling record is refused', () => {
  const bound = founder({ decidedBy: null });
  assert.equal(bound.ok, false);
  assert.ok(bound.reasonCodes.includes('forecast-must-name-the-specific-record-that-will-decide-it'));
});

test('an economic forecast binds against a provider-origin receipt', () => {
  const bound = economic();
  assert.equal(bound.ok, true);
  assert.equal(bound.deciderClass, 'PROVIDER_ORIGIN_RECEIPT');
  assert.match(bound.truthBoundary, /NOT A PAYMENT/);
});

test('CRM state may not decide an economic forecast', () => {
  const bound = economic({ deciderClass: 'CRM_STATE' });
  assert.equal(bound.ok, false);
  assert.equal(bound.status, 'ECONOMIC_FORECAST_REFUSED');
  assert.ok(bound.reasonCodes.some(code => code.includes('crm_state')));
});

test('every refused economic decider is actually refused', () => {
  for (const deciderClass of REFUSED_ECONOMIC_DECIDERS) {
    const bound = economic({ deciderClass });
    assert.equal(bound.ok, false, `${deciderClass} should be refused`);
    assert.equal(bound.status, 'ECONOMIC_FORECAST_REFUSED');
  }
});

test('every allowed economic decider actually binds', () => {
  for (const deciderClass of ECONOMIC_DECIDER_CLASSES) {
    const bound = economic({ deciderClass });
    assert.equal(bound.ok, true, `${deciderClass} should bind`);
  }
});

test('an invoice status is refused even though it looks like a provider fact', () => {
  const bound = economic({ deciderClass: 'INVOICE_STATUS' });
  assert.equal(bound.ok, false);
  assert.match(bound.note, /edited by the same party/);
});

test('a founder decider class is not accepted on the economic path', () => {
  const bound = economic({ deciderClass: 'ELAPSED_TIME' });
  assert.equal(bound.ok, false);
  assert.ok(bound.reasonCodes.includes('decider-class-must-be-one-that-the-forecaster-does-not-control'));
});

test('a bound forecast still refuses a probability set that does not cover the space', () => {
  const bound = economic({ probabilities: { CLEARED: 1 } });
  assert.equal(bound.ok, false);
  assert.ok(bound.reasonCodes.includes('forecast-must-cover-exactly-the-declared-outcome-space'));
});

test('a single-outcome economic forecast is refused because it cannot be wrong', () => {
  const bound = economic({ outcomeSpace: ['CLEARED'], probabilities: { CLEARED: 1 } });
  assert.equal(bound.ok, false);
  assert.ok(bound.reasonCodes.includes('outcome-space-needs-at-least-two-distinguishable-outcomes'));
});
