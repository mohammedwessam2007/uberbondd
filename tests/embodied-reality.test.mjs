import test from 'node:test';
import assert from 'node:assert/strict';
import {
  embodiedState, phenomenology, untranslatable, errorBudget,
  environmentCompiler, cognitiveNutrition, existentialSandbox, soulArchive,
  EMBODIED_FACTORS, REPRESENTABILITY, ERROR_BUDGET_TIERS
} from '../src/embodied-reality.mjs';

// Every other module treats reasoning as though it happens in a person shaped
// like a decision procedure. Sleep, illness, light and noise move cognition
// more than most of what the rest of this system reasons about, and none of it
// appears anywhere unless something puts it there.

test('the physical state a decision was made in is recorded, not folded in', () => {
  // The useful later question is not "was this a good decision" but "was this
  // made on four hours of sleep" -- unanswerable if nobody captured it.
  const depleted = embodiedState({
    decision: 'accepted the offer',
    factors: { SLEEP: 0.2, ENERGY: 0.25, STRESS: 0.9 }
  });
  assert.equal(depleted.status, 'DECISION_MADE_IN_DEPLETED_STATE');
  assert.deepEqual(depleted.depleted.sort(), ['ENERGY', 'SLEEP']);
  assert.match(depleted.boundary, /DOES NOT INVALIDATE A DECISION/);
});

test('unrecorded factors are listed rather than assumed fine', () => {
  const partial = embodiedState({ decision: 'x', factors: { SLEEP: 0.8 } });
  assert.equal(partial.unrecorded.length, EMBODIED_FACTORS.length - 1);
  assert.ok(partial.unrecorded.includes('ILLNESS'));
});

test('a measurement never settles what an experience was like', () => {
  // The characteristic mistake of quantified-self systems.
  const disagreeing = phenomenology({
    experience: 'the trip',
    reported: 'the best two weeks in years',
    externalMeasurement: 'sleep and step counts both down'
  });
  assert.equal(disagreeing.status, 'REPORT_AND_MEASUREMENT_DISAGREE');
  assert.equal(disagreeing.measurementOverridesReport, false);
  assert.match(disagreeing.boundary, /NEITHER SETTLES THE OTHER/);
});

test('what language did not carry is marked rather than approximated', () => {
  // Storing an approximation is worse than losing it: the paraphrase reads as
  // the thing and every later inference treats it as the data.
  const lost = untranslatable({
    experience: 'the hour after his father died',
    representability: 'MEANINGFUL_BUT_NOT_FULLY_REPRESENTABLE',
    whatWasLost: 'most of it'
  });
  assert.equal(lost.safeToReasonOver, false);
  assert.match(lost.boundary, /REASONING OVER THE RECORD IS REASONING OVER A PARAPHRASE/);
  assert.ok(REPRESENTABILITY.includes('PARTIALLY_REPRESENTED'));
});

test('even a full representation is a claim about the record', () => {
  const full = untranslatable({ experience: 'the meeting', representability: 'FULLY_REPRESENTED' });
  assert.equal(full.safeToReasonOver, true);
  assert.match(full.boundary, /RATHER THAN THE EXPERIENCE/);
});

test('reasoning depth scales with what being wrong costs', () => {
  // Wrong in both directions is expensive: exhaustive analysis of a trivial
  // choice spends the attention an irreversible one needed.
  assert.equal(errorBudget({ decision: 'x', tier: 'TRIVIAL' }).maxReasoningDepth, 'SHALLOW');
  assert.equal(errorBudget({ decision: 'x', tier: 'IRREVERSIBLE' }).maxReasoningDepth, 'EXHAUSTIVE');
  assert.match(errorBudget({ decision: 'x', tier: 'TRIVIAL' }).law, /SPENDS_THE_ATTENTION_AN_IRREVERSIBLE_ONE_NEEDED/);
  assert.ok(Object.keys(ERROR_BUDGET_TIERS).includes('CONSEQUENTIAL'));
});

test('willpower-only is reported as such, because it has an expiry date', () => {
  const brittle = environmentCompiler({
    behaviour: 'reading in the evening',
    changes: [{ change: 'just try harder', kind: 'WILLPOWER' }]
  });
  assert.equal(brittle.status, 'ONLY_WILLPOWER_PROPOSED');
  assert.match(brittle.law, /HAS_AN_EXPIRY_DATE/);

  const structural = environmentCompiler({
    behaviour: 'x',
    changes: [{ change: 'phone charges in the kitchen', kind: 'FRICTION' }, { change: 'try harder', kind: 'WILLPOWER' }]
  });
  assert.equal(structural.status, 'STRUCTURAL_CHANGES_AVAILABLE');
  assert.equal(structural.structural.length, 1);
});

test('the information diet is described and never curated', () => {
  // Curating the inputs would be shaping him through the salience channel this
  // system elsewhere audits.
  const concentrated = cognitiveNutrition([
    { source: 'a', depth: 'SHALLOW', ideologicalCluster: 'one' },
    { source: 'b', depth: 'SHALLOW', ideologicalCluster: 'one' },
    { source: 'c', depth: 'SHALLOW', ideologicalCluster: 'one' },
    { source: 'd', depth: 'DEEP', ideologicalCluster: 'one' }
  ]);
  assert.equal(concentrated.concentrated, true);
  assert.equal(Object.hasOwn(concentrated, 'recommended'), false);
  assert.equal(Object.hasOwn(concentrated, 'blocked'), false);
  assert.match(concentrated.boundary, /NEVER DECIDES WHAT SHOULD BE/);
});

test('a simulation frequency is never a real-world probability', () => {
  // The moment it is read as one, the sandbox has become a forecast nobody
  // validated.
  const run = existentialSandbox({ path: 'the academic route', runs: 10000, observedFrequency: 0.62 });
  assert.equal(run.isRealWorldProbability, false);
  assert.equal(run.observedFrequency, 0.62, 'the frequency is kept, and kept labelled');
  assert.match(run.boundary, /SANDBOXES GENERATE QUESTIONS; REALITY GENERATES EVIDENCE/);
});

test('the soul archive is excluded from every optimization input', () => {
  const archived = soulArchive([
    { kind: 'VOICE', about: 'him telling the story about the ferry' },
    { kind: 'JOKE', about: 'the one nobody else finds funny' }
  ]);
  assert.equal(archived.excludedFromOptimization, true);
  assert.match(archived.purpose, /NOTHING HERE IS AN INPUT TO ANY SCORE/);
});
