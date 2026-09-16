import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OBSERVER_CLASSES,
  declareObservable,
  forecastObservable,
  admitObservation,
  closeRealityLoop,
  realityCalibrationVerdict,
  voidLoop
} from '../src/nullstar-omega-reality-connection.mjs';

const CUTOFF = '2026-09-14T00:00:00.000Z';
const FORECAST_AT = '2026-09-14T00:00:01.000Z';
const OBSERVED_AT = '2026-09-14T01:00:00.000Z';

const observable = (overrides = {}) => declareObservable({
  id: 'obs-mutation-kill',
  question: 'Will the new guard kill its mutation?',
  observerClass: OBSERVER_CLASSES.EXECUTED_PROCEDURE,
  procedure: 'node scripts/mutation-war.mjs --anchor GUARD-01',
  outcomeSpace: ['KILLED', 'SURVIVED'],
  decidedBy: 'scripts/mutation-war.mjs exit report',
  ...overrides
}).observable;

test('a declared observable names what decides the outcome', () => {
  const declared = declareObservable({
    id: 'obs-1',
    question: 'Will the suite stay green?',
    observerClass: OBSERVER_CLASSES.EXECUTED_PROCEDURE,
    procedure: 'npm run test:deterministic',
    outcomeSpace: ['GREEN', 'RED'],
    decidedBy: 'node --test exit code'
  });
  assert.equal(declared.ok, true);
  assert.equal(declared.observable.independent, true);
});

test('an observable without a decider is refused', () => {
  const declared = declareObservable({
    id: 'obs-1',
    question: 'Will the suite stay green?',
    observerClass: OBSERVER_CLASSES.EXECUTED_PROCEDURE,
    procedure: 'npm run test:deterministic',
    outcomeSpace: ['GREEN', 'RED']
  });
  assert.equal(declared.ok, false);
  assert.ok(declared.reasonCodes.includes('observable-must-name-what-decides-the-outcome'));
});

test('an executed procedure with no command is refused', () => {
  const declared = declareObservable({
    id: 'obs-1',
    question: 'Will it pass?',
    observerClass: OBSERVER_CLASSES.EXECUTED_PROCEDURE,
    outcomeSpace: ['YES', 'NO'],
    decidedBy: 'the runner'
  });
  assert.equal(declared.ok, false);
  assert.ok(declared.reasonCodes.includes('executed-procedure-requires-a-runnable-command'));
});

test('a single-outcome space is refused because it cannot be wrong', () => {
  const declared = declareObservable({
    id: 'obs-1',
    question: 'Will it pass?',
    observerClass: OBSERVER_CLASSES.EXECUTED_PROCEDURE,
    procedure: 'npm test',
    outcomeSpace: ['YES'],
    decidedBy: 'the runner'
  });
  assert.equal(declared.ok, false);
  assert.ok(declared.reasonCodes.includes('outcome-space-needs-at-least-two-distinguishable-outcomes'));
});

test('a forecast narrowing the declared outcome space is refused', () => {
  const recorded = forecastObservable({
    observable: observable(),
    probabilities: { KILLED: 1 },
    evidenceCutoff: CUTOFF,
    at: FORECAST_AT
  });
  assert.equal(recorded.ok, false);
  assert.ok(recorded.reasonCodes.includes('forecast-must-cover-exactly-the-declared-outcome-space'));
});

test('a forecast covering the declared space is sealed', () => {
  const recorded = forecastObservable({
    observable: observable(),
    probabilities: { KILLED: 0.8, SURVIVED: 0.2 },
    evidenceCutoff: CUTOFF,
    method: 'prior from two anchors that survived earlier in this session',
    at: FORECAST_AT
  });
  assert.equal(recorded.ok, true);
  assert.ok(recorded.forecast.seal);
  assert.equal(recorded.observableId, 'obs-mutation-kill');
});

test('a forecaster-reported outcome can never be scored', () => {
  const selfReported = observable({
    observerClass: OBSERVER_CLASSES.REPORTED_BY_FORECASTER,
    procedure: null,
    decidedBy: 'the model writing this'
  });
  const admitted = admitObservation({
    observable: selfReported,
    outcome: 'KILLED',
    rawEvidence: 'KILLED',
    observedAt: OBSERVED_AT
  });
  assert.equal(admitted.ok, false);
  assert.ok(admitted.reasonCodes.includes('forecaster-reported-outcomes-cannot-be-scored'));
});

test('an outcome outside the declared space is refused rather than remapped', () => {
  const admitted = admitObservation({
    observable: observable(),
    outcome: 'ERRORED',
    rawEvidence: 'anchor GUARD-01 ERRORED before the mutation applied',
    observedAt: OBSERVED_AT
  });
  assert.equal(admitted.ok, false);
  assert.ok(admitted.reasonCodes.includes('observed-outcome-was-outside-the-declared-outcome-space'));
});

test('an outcome absent from the observer output is refused', () => {
  const admitted = admitObservation({
    observable: observable(),
    outcome: 'KILLED',
    rawEvidence: 'anchor GUARD-01 completed',
    observedAt: OBSERVED_AT
  });
  assert.equal(admitted.ok, false);
  assert.ok(admitted.reasonCodes.includes('claimed-outcome-does-not-appear-in-the-observer-output'));
});

test('observation without raw evidence is refused', () => {
  const admitted = admitObservation({
    observable: observable(),
    outcome: 'KILLED',
    observedAt: OBSERVED_AT
  });
  assert.equal(admitted.ok, false);
  assert.ok(admitted.reasonCodes.includes('raw-evidence-from-the-observer-required'));
});

test('a closed loop scores the sealed forecast against the admitted outcome', () => {
  const recorded = forecastObservable({
    observable: observable(),
    probabilities: { KILLED: 0.7, SURVIVED: 0.3 },
    evidenceCutoff: CUTOFF,
    at: FORECAST_AT
  });
  const admitted = admitObservation({
    observable: observable(),
    outcome: 'SURVIVED',
    rawEvidence: 'anchor GUARD-01 SURVIVED the mutation',
    observedAt: OBSERVED_AT
  });
  const loop = closeRealityLoop({ forecast: recorded.forecast, observation: admitted });
  assert.equal(loop.ok, true);
  assert.equal(loop.observed, 'SURVIVED');
  assert.equal(loop.assignedProbability, 0.3);
  assert.equal(loop.surprised, true);
  assert.ok(loop.brierScore > 0.5);
});

test('an observation predating the evidence cutoff is refused by the ledger', () => {
  const recorded = forecastObservable({
    observable: observable(),
    probabilities: { KILLED: 0.7, SURVIVED: 0.3 },
    evidenceCutoff: '2026-09-14T02:00:00.000Z',
    at: '2026-09-14T02:00:01.000Z'
  });
  const admitted = admitObservation({
    observable: observable(),
    outcome: 'KILLED',
    rawEvidence: 'anchor GUARD-01 KILLED',
    observedAt: '2026-09-14T01:00:00.000Z'
  });
  const loop = closeRealityLoop({ forecast: recorded.forecast, observation: admitted });
  assert.equal(loop.ok, false);
  assert.ok(loop.reasonCodes.includes('outcome-predates-evidence-cutoff'));
});

test('an edited forecast cannot be scored', () => {
  const recorded = forecastObservable({
    observable: observable(),
    probabilities: { KILLED: 0.7, SURVIVED: 0.3 },
    evidenceCutoff: CUTOFF,
    at: FORECAST_AT
  });
  const tampered = { ...recorded.forecast, probabilities: { KILLED: 0.99, SURVIVED: 0.01 } };
  const admitted = admitObservation({
    observable: observable(),
    outcome: 'KILLED',
    rawEvidence: 'anchor GUARD-01 KILLED',
    observedAt: OBSERVED_AT
  });
  const loop = closeRealityLoop({ forecast: tampered, observation: admitted });
  assert.equal(loop.ok, false);
  assert.equal(loop.status, 'FORECAST_TAMPERED');
});

test('no closed loops is not reality calibrated', () => {
  const verdict = realityCalibrationVerdict([]);
  assert.equal(verdict.status, 'NOT_REALITY_CALIBRATED');
  assert.equal(verdict.closedLoops, 0);
});

test('only near-certain correct forecasts do not establish calibration', () => {
  const loops = ['A', 'B', 'C'].map(id => {
    const obs = observable({ id: `obs-${id}` });
    const recorded = forecastObservable({
      observable: obs,
      probabilities: { KILLED: 0.95, SURVIVED: 0.05 },
      evidenceCutoff: CUTOFF,
      at: FORECAST_AT
    });
    const admitted = admitObservation({
      observable: obs,
      outcome: 'KILLED',
      rawEvidence: 'anchor KILLED',
      observedAt: OBSERVED_AT
    });
    return closeRealityLoop({ forecast: recorded.forecast, observation: admitted });
  });
  const verdict = realityCalibrationVerdict(loops);
  assert.equal(verdict.status, 'CALIBRATION_UNTESTED__ONLY_EASY_QUESTIONS_ASKED');
  assert.equal(verdict.surprises, 0);
});

test('a surprise makes the calibration verdict real and carries a ledger summary', () => {
  const obs = observable();
  const recorded = forecastObservable({
    observable: obs,
    probabilities: { KILLED: 0.9, SURVIVED: 0.1 },
    evidenceCutoff: CUTOFF,
    at: FORECAST_AT
  });
  const admitted = admitObservation({
    observable: obs,
    outcome: 'SURVIVED',
    rawEvidence: 'anchor SURVIVED',
    observedAt: OBSERVED_AT
  });
  const verdict = realityCalibrationVerdict([closeRealityLoop({ forecast: recorded.forecast, observation: admitted })]);
  assert.equal(verdict.status, 'REALITY_CALIBRATED');
  assert.equal(verdict.surprises, 1);
  // The summary must come from real scored rows, not a reconstructed lookalike.
  assert.equal(verdict.calibrationSummary.status, 'CALIBRATION_SUMMARY');
  assert.equal(verdict.calibrationSummary.scored, 1);
  assert.ok(Number.isFinite(verdict.meanBrier));
});

const derived = (overrides = {}) => declareObservable({
  id: 'obs-triage-count',
  question: 'How many of the ten NEEDS_TRIAGE modules reach a production entrypoint?',
  observerClass: OBSERVER_CLASSES.EXECUTED_PROCEDURE,
  procedure: 'node scripts/reachability-report.mjs',
  outcomeSpace: ['NONE', 'ONE_TO_THREE', 'FOUR_TO_SIX', 'SEVEN_OR_MORE'],
  decidedBy: 'the import graph computed by scripts/reachability-report.mjs',
  derivation: {
    ruleId: 'triage-count-bucket-v1',
    description: 'Count the declared modules listed as reachableFromProduction, then bucket 0 / 1-3 / 4-6 / 7+.'
  },
  ...overrides
}).observable;

test('a derivation without a rule id is refused', () => {
  const declared = declareObservable({
    id: 'obs-1',
    question: 'How many?',
    observerClass: OBSERVER_CLASSES.EXECUTED_PROCEDURE,
    procedure: 'node scripts/reachability-report.mjs',
    outcomeSpace: ['NONE', 'SOME'],
    decidedBy: 'the import graph',
    derivation: { description: 'count them' }
  });
  assert.equal(declared.ok, false);
  assert.ok(declared.reasonCodes.includes('derivation-requires-a-rule-id'));
});

test('a derived outcome need not appear literally in the observer output', () => {
  const admitted = admitObservation({
    observable: derived(),
    outcome: 'FOUR_TO_SIX',
    rawEvidence: '{"reachableFromProduction":213,"noEntryPointAtAll":141}',
    observedAt: OBSERVED_AT,
    derivationRuleId: 'triage-count-bucket-v1'
  });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.derivationRuleId, 'triage-count-bucket-v1');
});

test('a derived observation naming a different rule is refused', () => {
  const admitted = admitObservation({
    observable: derived(),
    outcome: 'FOUR_TO_SIX',
    rawEvidence: '{"reachableFromProduction":213}',
    observedAt: OBSERVED_AT,
    derivationRuleId: 'triage-count-bucket-v2'
  });
  assert.equal(admitted.ok, false);
  assert.ok(admitted.reasonCodes.includes('derived-observation-must-name-the-rule-declared-with-the-observable'));
});

test('the derivation rule is sealed inside the forecast', () => {
  const recorded = forecastObservable({
    observable: derived(),
    probabilities: { NONE: 0.1, ONE_TO_THREE: 0.3, FOUR_TO_SIX: 0.4, SEVEN_OR_MORE: 0.2 },
    evidenceCutoff: CUTOFF,
    at: FORECAST_AT
  });
  assert.equal(recorded.ok, true);
  assert.ok(recorded.forecast.assumptions.includes('outcome-derivation-rule:triage-count-bucket-v1'));

  // Swapping the rule after the fact must break the seal, not rescue the forecast.
  const swapped = {
    ...recorded.forecast,
    assumptions: ['outcome-derivation-rule:whatever-makes-this-right']
  };
  const admitted = admitObservation({
    observable: derived(),
    outcome: 'FOUR_TO_SIX',
    rawEvidence: '{"reachableFromProduction":213}',
    observedAt: OBSERVED_AT,
    derivationRuleId: 'triage-count-bucket-v1'
  });
  const loop = closeRealityLoop({ forecast: swapped, observation: admitted });
  assert.equal(loop.ok, false);
  assert.equal(loop.status, 'FORECAST_TAMPERED');
});

const closedLoop = (observedOutcome, probabilities = { KILLED: 0.78, SURVIVED: 0.22 }) => {
  const obs = observable();
  const recorded = forecastObservable({
    observable: obs, probabilities, evidenceCutoff: CUTOFF, at: FORECAST_AT
  });
  const admitted = admitObservation({
    observable: obs,
    outcome: observedOutcome,
    rawEvidence: `anchor GUARD-01 ${observedOutcome}`,
    observedAt: OBSERVED_AT
  });
  return closeRealityLoop({ forecast: recorded.forecast, observation: admitted });
};

test('a loop voided for a defective rule is not a rescore', () => {
  const voided = voidLoop({
    loop: closedLoop('SURVIVED'),
    defect: 'The rule matched the word "survived" inside guard descriptions rather than a survivor count.',
    correctedOutcome: 'KILLED'
  });
  assert.equal(voided.status, 'REALITY_LOOP_VOID');
  assert.equal(voided.ok, false);
  assert.equal(voided.ruleMisreadTheObserver, true);
  assert.equal(voided.recordedOutcome, 'SURVIVED');
  assert.equal(voided.correctedOutcome, 'KILLED');
  assert.ok(voided.rescoreRefused);
});

test('voiding requires naming the defect and the corrected outcome', () => {
  const noDefect = voidLoop({ loop: closedLoop('SURVIVED'), correctedOutcome: 'KILLED' });
  assert.equal(noDefect.ok, false);
  assert.ok(noDefect.reasonCodes.includes('void-requires-a-statement-of-the-defect'));

  const noCorrection = voidLoop({ loop: closedLoop('SURVIVED'), defect: 'rule read prose' });
  assert.ok(noCorrection.reasonCodes.includes('void-requires-the-outcome-the-defective-rule-should-have-produced'));
});

test('a voided loop is excluded from calibration but stays counted', () => {
  const good = closedLoop('SURVIVED', { KILLED: 0.9, SURVIVED: 0.1 });
  const bad = voidLoop({
    loop: closedLoop('SURVIVED'),
    defect: 'rule read guard prose as a result',
    correctedOutcome: 'KILLED'
  });
  const verdict = realityCalibrationVerdict([good, bad]);
  assert.equal(verdict.closedLoops, 1);
  assert.equal(verdict.voidedLoops, 1);
  assert.equal(verdict.calibrationSummary.scored, 1);
});

test('when every loop is voided the dimension is not calibrated', () => {
  const bad = voidLoop({
    loop: closedLoop('SURVIVED'),
    defect: 'rule read guard prose as a result',
    correctedOutcome: 'KILLED'
  });
  const verdict = realityCalibrationVerdict([bad]);
  assert.equal(verdict.status, 'NOT_REALITY_CALIBRATED');
  assert.equal(verdict.reason, 'every-loop-was-voided-for-a-defective-derivation-rule');
  assert.equal(verdict.voidedLoops, 1);
});
