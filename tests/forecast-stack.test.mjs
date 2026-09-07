import test from 'node:test';
import assert from 'node:assert/strict';
import {
  forecastMethod, buildForecast, strengthProfile, predictionHalfLife,
  decisionShelfLife, valueOfInformation, regretGeometry, adversarialFutureSelves,
  FORECAST_METHODS, STRENGTH_DIMENSIONS
} from '../src/forecast-stack.mjs';

// The strongest calibrated prediction and the strongest-sounding one point in
// different directions, and the gap is where forecasting systems go wrong: a
// method never checked against a known outcome feels exactly as authoritative
// as one that has.

const validated = method => forecastMethod({ method, hindcastRuns: 12, hindcastAccuracy: 0.7 });
const unproven = method => forecastMethod({ method });

test('a method never hindcast is unproven, which is not the same as wrong', () => {
  const fresh = unproven('CAUSAL_MODEL');
  assert.equal(fresh.validated, false);
  assert.match(fresh.note, /not the same as wrong/);
  assert.equal(validated('CAUSAL_MODEL').validated, true);
});

test('a stack of unproven methods refuses to produce an estimate', () => {
  // Averaging things nobody has checked produces confidence, not accuracy.
  const stack = buildForecast({
    claim: 'the move raises income',
    methods: [unproven('CAUSAL_MODEL'), unproven('SCENARIO_TREE'), unproven('ADVERSARIAL')],
    estimate: 0.7
  });
  assert.equal(stack.status, 'STACK_UNVALIDATED');
  assert.equal(stack.estimate, null, 'the requested estimate must not survive');
  assert.match(stack.why, /produces confidence, not accuracy/);
});

test('one validated method is enough to build on, and is named', () => {
  const stack = buildForecast({
    claim: 'x', methods: [validated('REFERENCE_CLASS'), unproven('SCENARIO_TREE')], estimate: 0.6
  });
  assert.equal(stack.status, 'FORECAST_BUILT');
  assert.deepEqual(stack.validatedMethods, ['REFERENCE_CLASS']);
  assert.equal(stack.weighting, 'BY_MEASURED_HINDCAST_ACCURACY');
});

test('a forecast with no method at all is refused', () => {
  assert.equal(buildForecast({ claim: 'x', methods: [] }).ok, false);
  assert.ok(FORECAST_METHODS.includes('HINDCAST'));
});

test('strength is a profile, and the weakest dimension is the finding', () => {
  // A single confidence percentage hides which dimension is weak, and the
  // weak dimension is the whole point.
  const profile = strengthProfile({
    reference_class_quality: 0.9, freshness: 0.2, historical_calibration: 0.8
  });
  assert.equal(profile.weakestDimension, 'freshness');
  assert.equal(Object.hasOwn(profile, 'confidence'), false);
  assert.equal(Object.hasOwn(profile, 'overallScore'), false);
  assert.match(profile.boundary, /IT WOULD HIDE THE WEAK DIMENSION/);
});

test('unassessed dimensions are listed rather than scored as zero', () => {
  const profile = strengthProfile({ freshness: 0.5 });
  assert.deepEqual(profile.assessed, ['freshness']);
  assert.equal(profile.unassessed.length, STRENGTH_DIMENSIONS.length - 1);
});

test('a forecast nothing could invalidate is refused', () => {
  // It cannot be noticed going stale, and a stale forecast still being acted
  // on is the quiet failure.
  const eternal = predictionHalfLife({ forecast: 'this will work out', assumptions: ['things stay the same'] });
  assert.equal(eternal.ok, false);
  assert.deepEqual(eternal.reasonCodes, ['invalidation-triggers-required']);
});

test('a forecast with triggers records its own expiry', () => {
  const bounded = predictionHalfLife({
    forecast: 'x', invalidationTriggers: ['if he changes field', 'if the market regime shifts'],
    expectedHalfLife: '18 months'
  });
  assert.equal(bounded.ok, true);
  assert.equal(bounded.invalidationTriggers.length, 2);
});

test('urgency and importance are separate fields', () => {
  const expiring = decisionShelfLife({ option: 'the visa route', availability: 'EXPIRING', expiresAround: 'March' });
  assert.equal(expiring.urgent, true);
  assert.match(expiring.distinction, /THEY ARE DIFFERENT FIELDS/);

  const later = decisionShelfLife({ option: 'x', availability: 'AVAILABLE_LATER' });
  assert.equal(later.urgent, false);
});

test('information that cannot change the choice is not worth acquiring', () => {
  const pointless = valueOfInformation({ decision: 'which flat', wouldChangeChoice: false, acquisitionCost: 1 });
  assert.equal(pointless.status, 'INFORMATION_NOT_WORTH_ACQUIRING');
  assert.match(pointless.why, /procrastination with a reading list/);
});

test('information that could flip the decision is worth its cost', () => {
  const useful = valueOfInformation({ decision: 'x', wouldChangeChoice: true, acquisitionCost: 3, delayCost: 2 });
  assert.equal(useful.status, 'INFORMATION_WORTH_ACQUIRING');
  assert.equal(useful.totalCost, 5);
});

test('expected value and the tail stay separate numbers', () => {
  // A combined figure is exactly how a catastrophic tail gets erased by a
  // good average.
  const shape = regretGeometry({
    option: 'put everything in',
    expectedValue: 0.8,
    worstCase: 'insolvency with no runway',
    recoveryTime: 'years'
  });
  assert.equal(shape.combinedScore, null);
  assert.equal(shape.expectedValue, 0.8);
  assert.ok(shape.worstCase.length > 0);
  assert.match(shape.law, /A_COMBINED_FIGURE_IS_HOW_IT_GETS_ERASED/);
});

test('adversarial futures return what survived attack, not what a majority preferred', () => {
  const attacked = adversarialFutureSelves({
    decision: 'take the job',
    attacks: [
      { from: 'FREEDOM_SEEKING', attacks: 'it locks in a city', survived: true },
      { from: 'PROFESSIONAL', attacks: 'the field is shrinking', survived: false }
    ]
  });
  assert.deepEqual(attacked.invariants, ['it locks in a city']);
  assert.equal(Object.hasOwn(attacked, 'majority'), false);
  assert.match(attacked.boundary, /NOT WHAT A MAJORITY OF FUTURE SELVES PREFERRED/);
});

test('running no attacks is reported as such, not as having survived', () => {
  const none = adversarialFutureSelves({ decision: 'x' });
  assert.equal(none.status, 'NO_ATTACKS_RUN');
  assert.deepEqual(none.invariants, []);
});
