import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileEnergyInterval,
  compileVerifiedSavings,
  compileEnergyEquivalentCompute,
  compileMeasuredLocalInference,
  compileContinuousPowerBudget,
  compileComparableBaseline,
  compileEnergyBackedLocalComputeOffer,
  compileMaxSafeTokenPlan,
  evaluateMaxSafeTokenRuntime
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


test('MAX SAFE TOKENS refuses to invent electrical or thermal ceilings', () => {
  const energyEquivalent = compileEnergyEquivalentCompute({
    savedKwh: 10,
    evidenceRef: 'ledger:measured-baseline-delta'
  });
  const benchmark = compileMeasuredLocalInference({
    model: 'tiny-open-model',
    revision: 'sha256:tiny',
    outputTokens: 1_000_000,
    energyKwh: 0.5,
    durationSeconds: 7200,
    peakWallWatts: 300,
    peakHardwareTempC: 70,
    sourceRef: 'receipt:bench-tiny'
  });

  const plan = compileMaxSafeTokenPlan({
    energyEquivalent,
    candidates: [{
      benchmark,
      quality: 0.7,
      reliability: 0.9,
      taskClasses: ['general'],
      contextTokens: 8192,
      verifiedAt: '2026-09-21T17:00:00Z'
    }]
  });

  assert.equal(plan.ok, false);
  assert.equal(plan.status, 'UBERWATT_MAX_SAFE_TOKENS_BLOCKED');
  assert.ok(plan.reasonCodes.includes('sourced-power-ceiling-required'));
  assert.ok(plan.reasonCodes.includes('sourced-thermal-stop-required'));
});

test('MAX SAFE TOKENS selects the highest measured token capacity inside sourced safety limits', () => {
  const energyEquivalent = compileEnergyEquivalentCompute({
    savedKwh: 10,
    evidenceRef: 'ledger:measured-baseline-delta'
  });
  const efficient = compileMeasuredLocalInference({
    model: 'efficient-open-model',
    revision: 'sha256:efficient',
    outputTokens: 2_000_000,
    energyKwh: 0.5,
    durationSeconds: 7200,
    peakWallWatts: 300,
    peakHardwareTempC: 70,
    sourceRef: 'receipt:bench-efficient'
  });
  const wasteful = compileMeasuredLocalInference({
    model: 'wasteful-open-model',
    revision: 'sha256:wasteful',
    outputTokens: 2_000_000,
    energyKwh: 1,
    durationSeconds: 7200,
    peakWallWatts: 600,
    peakHardwareTempC: 72,
    sourceRef: 'receipt:bench-wasteful'
  });

  const plan = compileMaxSafeTokenPlan({
    energyEquivalent,
    windowHours: 720,
    energyReserveFraction: 0.20,
    candidates: [
      {
        benchmark: wasteful,
        quality: 0.8,
        reliability: 0.9,
        taskClasses: ['general'],
        contextTokens: 8192,
        verifiedAt: '2026-09-21T17:00:00Z'
      },
      {
        benchmark: efficient,
        quality: 0.8,
        reliability: 0.9,
        taskClasses: ['general'],
        contextTokens: 8192,
        verifiedAt: '2026-09-21T17:00:00Z'
      }
    ],
    safetyProfile: {
      powerCeilingWatts: 500,
      thermalStopC: 85,
      powerEvidenceRef: 'manufacturer+power-meter:node-a',
      thermalEvidenceRef: 'manufacturer-thermal-limit:node-a'
    }
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.status, 'UBERWATT_MAX_SAFE_TOKENS_PLAN_READY');
  assert.equal(plan.spendableEnergyKwh, 8);
  assert.equal(plan.selected.model, 'efficient-open-model');
  assert.equal(plan.selected.plannedOutputTokens, 32_000_000);
  assert.ok(plan.evaluatedCandidates.some(candidate =>
    candidate.model === 'wasteful-open-model'
    && candidate.reasonCodes?.includes('candidate-exceeds-power-ceiling')));
  assert.equal(plan.automaticMainsControl, false);
});

test('MAX SAFE TOKENS runtime gate fails closed on stale telemetry, power, heat, or exhausted budget', () => {
  const energyEquivalent = compileEnergyEquivalentCompute({
    savedKwh: 10,
    evidenceRef: 'ledger:measured-baseline-delta'
  });
  const benchmark = compileMeasuredLocalInference({
    model: 'efficient-open-model',
    revision: 'sha256:efficient',
    outputTokens: 2_000_000,
    energyKwh: 0.5,
    durationSeconds: 7200,
    peakWallWatts: 300,
    peakHardwareTempC: 70,
    sourceRef: 'receipt:bench-efficient'
  });
  const plan = compileMaxSafeTokenPlan({
    energyEquivalent,
    candidates: [{
      benchmark,
      quality: 0.8,
      reliability: 0.9,
      taskClasses: ['general'],
      contextTokens: 8192,
      verifiedAt: '2026-09-21T17:00:00Z'
    }],
    safetyProfile: {
      powerCeilingWatts: 500,
      thermalStopC: 85,
      powerEvidenceRef: 'manufacturer+power-meter:node-a',
      thermalEvidenceRef: 'manufacturer-thermal-limit:node-a'
    }
  });

  const run = evaluateMaxSafeTokenRuntime({
    plan,
    observedWallWatts: 320,
    observedHardwareTempC: 72,
    spentEnergyKwh: 1,
    telemetryAt: '2026-09-21T18:00:00Z',
    nowAt: '2026-09-21T18:00:30Z'
  });
  assert.equal(run.action, 'RUN_WITHIN_PLAN');

  const hot = evaluateMaxSafeTokenRuntime({
    plan,
    observedWallWatts: 320,
    observedHardwareTempC: 85,
    spentEnergyKwh: 1,
    telemetryAt: '2026-09-21T18:00:00Z',
    nowAt: '2026-09-21T18:00:30Z'
  });
  assert.equal(hot.action, 'STOP_COMPUTE');
  assert.ok(hot.reasonCodes.includes('thermal-stop-reached'));

  const stale = evaluateMaxSafeTokenRuntime({
    plan,
    observedWallWatts: 320,
    observedHardwareTempC: 72,
    spentEnergyKwh: 1,
    telemetryAt: '2026-09-21T17:00:00Z',
    nowAt: '2026-09-21T18:00:30Z'
  });
  assert.equal(stale.action, 'STOP_COMPUTE');
  assert.ok(stale.reasonCodes.includes('telemetry-stale'));
});
