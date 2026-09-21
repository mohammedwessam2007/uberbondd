import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileMeterInterval,
  compileComparableBaseline,
  compileEnergyBackedComputeBudget,
  compileEnergyBackedLocalComputeOffer,
  KWH_TO_JOULES
} from '../src/uberwatt-energy-ledger.mjs';

const interval = (startKWh, endKWh, day, outsideTempC = 30) => compileMeterInterval({
  start: { at: `2026-09-${day}T23:00:00+03:00`, cumulativeKWh: startKWh },
  end: { at: `2026-09-${String(Number(day) + 1).padStart(2, '0')}T07:00:00+03:00`, cumulativeKWh: endKWh },
  period: 'sleep',
  occupants: 4,
  acSetpointsC: [24, 24, 24],
  outsideTempC,
  evidenceRefs: [`meter-photo:${day}`]
});

test('meter interval converts cumulative meter readings into bounded household consumption', () => {
  const result = interval(1000, 1010, '10');
  assert.equal(result.ok, true);
  assert.equal(result.consumptionKWh, 10);
  assert.equal(result.hours, 8);
  assert.equal(result.averageWatts, 1250);
  assert.match(result.truthBoundary, /DOES_NOT_IDENTIFY_WHICH_APPLIANCE/i);
});

test('meter regression is refused rather than becoming negative energy', () => {
  const result = interval(1000, 999, '10');
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('meter-reading-regression-refused'));
});

test('baseline requires at least three comparable measured intervals', () => {
  const result = compileComparableBaseline({
    intervals: [interval(1000, 1010, '10'), interval(1010, 1021, '11')]
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'UBERWATT_BASELINE_INSUFFICIENT');
});

test('baseline uses median of comparable intervals', () => {
  const result = compileComparableBaseline({
    intervals: [
      interval(1000, 1011, '10'),
      interval(1011, 1023, '11'),
      interval(1023, 1036, '12')
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.baselineKWh, 12);
  assert.equal(result.intervalCount, 3);
});

test('energy budget reports baseline delta and never promotes it to API quota', () => {
  const baseline = compileComparableBaseline({
    intervals: [
      interval(1000, 1012, '10'),
      interval(1012, 1024, '11'),
      interval(1024, 1036, '12')
    ]
  });
  const observed = interval(1036, 1046, '13');
  const result = compileEnergyBackedComputeBudget({ interval: observed, baseline });
  assert.equal(result.ok, true);
  assert.equal(result.energyBudgetKWh, 2);
  assert.equal(result.energyBudgetJoules, 2 * KWH_TO_JOULES);
  assert.equal(result.tokenEnergyEquivalentLow, 18_000_000);
  assert.equal(result.tokenEnergyEquivalentHigh, 48_000_000);
  assert.equal(result.actualLocalInferenceTokens, 0);
  assert.match(result.truthBoundary, /NOT_API_CREDITS|NOT.*PROVIDER_QUOTA/i);
});

test('energy alone cannot become sovereign compute supply without a real local benchmark', () => {
  const baseline = compileComparableBaseline({
    intervals: [
      interval(1000, 1012, '10'),
      interval(1012, 1024, '11'),
      interval(1024, 1036, '12')
    ]
  });
  const budget = compileEnergyBackedComputeBudget({ interval: interval(1036, 1046, '13'), baseline });
  const result = compileEnergyBackedLocalComputeOffer({ budget, benchmark: {} });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'UBERWATT_LOCAL_COMPUTE_NOT_PROVEN');
});

test('measured local model throughput can convert the energy envelope into a zero-cost local compute offer', () => {
  const baseline = compileComparableBaseline({
    intervals: [
      interval(1000, 1012, '10'),
      interval(1012, 1024, '11'),
      interval(1024, 1036, '12')
    ]
  });
  const budget = compileEnergyBackedComputeBudget({ interval: interval(1036, 1046, '13'), baseline });
  const result = compileEnergyBackedLocalComputeOffer({
    budget,
    benchmark: {
      provider: 'local',
      model: 'open-model-a',
      revision: 'sha256:abc',
      measuredAt: '2026-09-21T12:00:00Z',
      sourceRef: 'receipt:local-power-benchmark',
      outputTokens: 1_000_000,
      energyKWh: 0.5
    },
    taskClasses: ['general', 'research'],
    contextTokens: 32768,
    quality: 0.7,
    reliability: 0.9,
    latencyScore: 0.8
  });
  assert.equal(result.ok, true);
  assert.equal(result.estimatedUsableTokens, 4_000_000);
  assert.equal(result.computeOffer.rightsClass, 'LOCAL_OWNED');
  assert.equal(result.computeOffer.costCents, 0);
  assert.equal(result.computeOffer.usableTokens, 4_000_000);
});
