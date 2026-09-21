import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileEnergyInterval,
  compileVerifiedSavings,
  compileEnergyEquivalentCompute,
  compileMeasuredLocalInference,
  compileContinuousPowerBudget,
  compileComparableBaseline,
  compileEnergyBackedLocalComputeOffer
} from '../src/uberwatt.mjs';

const interval = compileEnergyInterval({
  startKwh: 20000,
  endKwh: 20012,
  startAt: '2026-09-21T23:00:00+03:00',
  endAt: '2026-09-22T07:00:00+03:00',
  periodClass: 'sleep',
  occupants: 4,
  acSetpointsC: [24, 24, 25]
});

test('meter difference compiles an eight-hour interval without appliance fiction', () => {
  assert.equal(interval.ok, true);
  assert.equal(interval.consumedKwh, 12);
  assert.equal(interval.elapsedHours, 8);
  assert.equal(interval.averageKw, 1.5);
  assert.match(interval.truthBoundary, /APPLIANCE ATTRIBUTION REQUIRES SEPARATE EVIDENCE/);
});

test('baseline absence never becomes a savings claim', () => {
  const result = compileVerifiedSavings({ interval });
  assert.equal(result.ok, true);
  assert.equal(result.savedKwh, null);
  assert.equal(result.status, 'UBERWATT_BASELINE_NOT_ESTABLISHED');
});

test('verified savings translate only into an explicitly labeled energy-equivalent range', () => {
  const savings = compileVerifiedSavings({ interval, baselineKwh: 14, baselineRef: 'ledger:three-comparable-nights' });
  assert.equal(savings.savedKwh, 2);
  const eq = compileEnergyEquivalentCompute({ savedKwh: savings.savedKwh, evidenceRef: 'benchmark:inference-energy-v1' });
  assert.equal(eq.lowerOutputTokens, 18_000_000);
  assert.equal(eq.upperOutputTokens, 48_000_000);
  assert.equal(eq.actualLocalTokens, null);
  assert.equal(eq.providerCredits, null);
  assert.match(eq.truthBoundary, /NOT API CREDITS/);
});

test('meter rollback is rejected rather than hidden', () => {
  const result = compileEnergyInterval({
    startKwh: 100,
    endKwh: 99,
    startAt: '2026-09-21T23:00:00+03:00',
    endAt: '2026-09-22T07:00:00+03:00'
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('meter-reading-must-not-decrease'));
});

test('actual local inference requires measured runtime and energy receipts', () => {
  const bad = compileMeasuredLocalInference({
    model: 'open-model',
    revision: 'sha256:x',
    outputTokens: 1000,
    energyKwh: 0.01,
    durationSeconds: 60
  });
  assert.equal(bad.ok, false);

  const good = compileMeasuredLocalInference({
    model: 'open-model',
    revision: 'sha256:x',
    inputTokens: 500,
    outputTokens: 1000,
    energyKwh: 0.01,
    durationSeconds: 60,
    sourceRef: 'receipt:local-meter+runtime-counter'
  });
  assert.equal(good.ok, true);
  assert.equal(good.totalTokens, 1500);
  assert.equal(good.outputTokensPerSecond, 1000 / 60);
  assert.equal(good.averageWatts, 600);
});

test('saved monthly energy can be expressed as a continuous power budget without claiming tokens', () => {
  const result = compileContinuousPowerBudget({ savedKwh: 100, periodHours: 720 });
  assert.equal(result.ok, true);
  assert.ok(Math.abs(result.equivalentContinuousWatts - 138.8888888889) < 1e-9);
  assert.match(result.truthBoundary, /DOES NOT GUARANTEE/);
});


test('comparable baseline requires three matching observed intervals and uses the median', () => {
  const make = (startKwh, endKwh, day) => compileEnergyInterval({
    startKwh,
    endKwh,
    startAt: `2026-09-${day}T23:00:00+03:00`,
    endAt: `2026-09-${String(Number(day) + 1).padStart(2, '0')}T07:00:00+03:00`,
    sourceRef: `meter-photo:${day}`,
    periodClass: 'sleep',
    occupants: 4,
    acSetpointsC: [24, 24, 24]
  });

  const tooSmall = compileComparableBaseline({
    intervals: [make(100, 111, '10'), make(111, 123, '11')]
  });
  assert.equal(tooSmall.ok, false);
  assert.equal(tooSmall.status, 'UBERWATT_BASELINE_INSUFFICIENT');

  const baseline = compileComparableBaseline({
    intervals: [
      make(100, 111, '10'),
      make(111, 123, '11'),
      make(123, 136, '12')
    ]
  });
  assert.equal(baseline.ok, true);
  assert.equal(baseline.baselineKwh, 12);
  assert.equal(baseline.intervalCount, 3);
  assert.equal(baseline.periodClass, 'sleep');
  assert.equal(baseline.occupants, 4);
  assert.match(baseline.truthBoundary, /NOT CAUSAL PROOF/i);
});

test('measured local inference can become a LOCAL_OWNED compute offer only with an energy budget and verification time', () => {
  const energyEquivalent = compileEnergyEquivalentCompute({
    savedKwh: 2,
    evidenceRef: 'energy-model:two-kwh'
  });
  const benchmark = compileMeasuredLocalInference({
    model: 'open-model-a',
    revision: 'sha256:abc',
    inputTokens: 100_000,
    outputTokens: 1_000_000,
    energyKwh: 0.5,
    durationSeconds: 10_000,
    sourceRef: 'receipt:local-meter+runtime-counter'
  });

  const missingTime = compileEnergyBackedLocalComputeOffer({
    energyEquivalent,
    benchmark,
    taskClasses: ['general']
  });
  assert.equal(missingTime.ok, false);
  assert.ok(missingTime.reasonCodes.includes('benchmark-verification-time-required'));

  const offer = compileEnergyBackedLocalComputeOffer({
    energyEquivalent,
    benchmark,
    taskClasses: ['general', 'research'],
    contextTokens: 32768,
    quality: 0.7,
    reliability: 0.9,
    latencyScore: 0.8,
    verifiedAt: '2026-09-21T12:00:00Z'
  });
  assert.equal(offer.ok, true);
  assert.equal(offer.estimatedUsableTokens, 4_000_000);
  assert.equal(offer.computeOffer.rightsClass, 'LOCAL_OWNED');
  assert.equal(offer.computeOffer.usableTokens, 4_000_000);
  assert.equal(offer.computeOffer.costCents, 0);
  assert.match(offer.truthBoundary, /NOT PRE-GENERATED/i);
});
