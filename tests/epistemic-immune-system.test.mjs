import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapClaim, classifyUncertainty, causalClaim, attackConclusion, modelEcology,
  realityVeto, abstractionDebt, reflexivity, surpriseLedger, computationalIrreducibility,
  isKnowledge, KNOWLEDGE_STATES, CAUSAL_RUNGS, BIAS_ATTACKS
} from '../src/epistemic-immune-system.mjs';

// The dangerous output is not a wrong answer. It is a confident answer whose
// confidence came from model agreement, a compression that dropped the decisive
// exception, or a correlation nobody tested against an intervention -- each
// shaped exactly like a good answer.

test('an unstated knowledge state resolves to UNKNOWN, never upward', () => {
  const mapped = mapClaim({ claim: 'this will work' });
  assert.equal(mapped.state, 'UNKNOWN');
  assert.equal(mapped.isKnowledge, false);
});

test('searched-and-found-nothing is distinguishable from nobody having looked', () => {
  assert.equal(mapClaim({ claim: 'x', searchedFor: true }).searchedFor, true);
  assert.equal(mapClaim({ claim: 'x' }).searchedFor, false);
});

test('everything below supported inference is not knowledge', () => {
  for (const state of ['UNKNOWN', 'STALE', 'SIMULATED', 'HYPOTHETICAL', 'WEAK_SIGNAL', 'CONTESTED']) {
    assert.equal(isKnowledge(state), false, `${state} must not count as knowledge`);
  }
  for (const state of ['SUPPORTED_INFERENCE', 'REPLICATED', 'DIRECTLY_OBSERVED']) {
    assert.equal(isKnowledge(state), true);
  }
  assert.equal(KNOWLEDGE_STATES[0], 'UNKNOWABLE_FROM_AVAILABLE_EVIDENCE');
});

test('unknown variables make it ignorance, not risk', () => {
  // Treating deep uncertainty as risk licenses optimization over a state space
  // nobody established, which is the most expensive common error here.
  assert.equal(classifyUncertainty({ probabilitiesEstimable: true, stateSpaceKnown: true, variablesKnown: false }).uncertaintyClass, 'IGNORANCE');
  assert.equal(classifyUncertainty({ probabilitiesEstimable: true, variablesKnown: true }).uncertaintyClass, 'DEEP_UNCERTAINTY');
  assert.equal(classifyUncertainty({ stateSpaceKnown: true, variablesKnown: true }).uncertaintyClass, 'UNCERTAINTY');
  assert.equal(classifyUncertainty({ probabilitiesEstimable: true, stateSpaceKnown: true, variablesKnown: true }).uncertaintyClass, 'RISK');
});

test('an intervention claim cannot be made from an observational rung', () => {
  // "Doing X causes Y" from correlation is the most consequential silent
  // upgrade in applied reasoning.
  const refused = causalClaim({ claim: 'moving caused the income rise', rung: 'CORRELATION', interventionClaimed: true });
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.reasonCodes, ['intervention-claim-requires-an-intervention-rung']);
  assert.match(refused.note, /Only an intervention says what happens when you change it/);
});

test('an intervention rung supports the claim', () => {
  const allowed = causalClaim({ claim: 'x', rung: 'CONTROLLED_INTERVENTION', interventionClaimed: true });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.supportsIntervention, true);
  assert.ok(CAUSAL_RUNGS.indexOf('PERSONAL_REPLICATION') > CAUSAL_RUNGS.indexOf('CORRELATION'));
});

test('an unattacked conclusion is reported as unchallenged, not as passing', () => {
  const untested = attackConclusion({ conclusion: 'the move was right' });
  assert.equal(untested.status, 'UNCHALLENGED');
  assert.match(untested.boundary, /NOT THE SAME AS IT HAVING HELD UP/);
  assert.equal(untested.notRun.length, BIAS_ATTACKS.length);
});

test('surviving the attacks that ran says nothing about the ones that did not', () => {
  const attacked = attackConclusion({
    conclusion: 'x', attacksRun: ['CONFIRMATION', 'SURVIVORSHIP'], survived: ['CONFIRMATION']
  });
  assert.deepEqual(attacked.failed, ['SURVIVORSHIP']);
  assert.ok(attacked.notRun.includes('SELECTION'));
  assert.match(attacked.boundary, /SAYS NOTHING ABOUT THE ONES THAT WERE NOT/);
});

test('many models sharing a method are one epistemic position', () => {
  const mono = modelEcology([
    { name: 'a', method: 'REGRESSION' }, { name: 'b', method: 'REGRESSION' }, { name: 'c', method: 'REGRESSION' }
  ]);
  assert.equal(mono.monoculture, true);
  assert.equal(mono.distinctMethods, 1);
  assert.match(mono.law, /ONE_EPISTEMIC_POSITION_REPEATED/);

  const diverse = modelEcology([
    { name: 'a', method: 'REGRESSION' }, { name: 'b', method: 'CAUSAL_MODEL' }, { name: 'c', method: 'HUMAN_TESTIMONY' }
  ]);
  assert.equal(diverse.monoculture, false);
});

test('internal support never offsets an observation', () => {
  const contradicted = realityVeto({
    claim: 'the plan works',
    // Three internal supports against a single observation -- the realistic
    // shape of this failure, and the one where a "weigh them up" reading would
    // come out in favour of the model.
    internalSupport: ['every model agrees', 'the reasoning is elegant', 'high confidence'],
    contradictedByObservation: 1
  });
  assert.equal(contradicted.status, 'MODEL_MUST_BE_REVISED');
  assert.equal(contradicted.internalSupportOffsetsObservation, false);
  assert.match(contradicted.verdict, /MODEL < REALITY/);
});

test('no contradiction yet is not confirmation', () => {
  const clean = realityVeto({ claim: 'x', internalSupport: ['a'] });
  assert.match(clean.verdict, /NOT CONFIRMATION/);
});

test('a compression that dropped what the decision turns on sends you back to the original', () => {
  const debt = abstractionDebt({
    compressed: 'the quarterly summary',
    dropped: ['the two weeks he was ill', 'the one client who left'],
    decisionDependsOn: ['the one client who left']
  });
  assert.equal(debt.status, 'RETURN_TO_RAW_EVIDENCE');
  assert.deepEqual(debt.decisiveOmissions, ['the one client who left']);
});

test('nothing decisive dropped is reported with its own caveat', () => {
  const debt = abstractionDebt({ compressed: 'x', dropped: ['minor detail'], decisionDependsOn: ['something else'] });
  assert.equal(debt.status, 'COMPRESSION_ACCEPTABLE_FOR_THIS_DECISION');
  assert.match(debt.why, /as far as anyone recorded/,
    'the caveat must survive: nothing decisive was dropped that anybody wrote down');
});

test('a forecast that changes what it forecasts is flagged as reflexive', () => {
  const reflexive = reflexivity({
    forecast: 'he has a 30% chance of finishing', revealedTo: ['him'], couldChangeBehaviour: true
  });
  assert.equal(reflexive.status, 'FORECAST_IS_REFLEXIVE');
  assert.match(reflexive.note, /not separable/);
});

test('repeated surprise in one area is a broken model rather than noise', () => {
  const ledger = surpriseLedger([
    { area: 'energy after travel', expected: 'fine', observed: 'flattened' },
    { area: 'energy after travel', expected: 'fine', observed: 'flattened' },
    { area: 'energy after travel', expected: 'fine', observed: 'flattened' },
    { area: 'market timing', expected: 'a', observed: 'b' }
  ]);
  assert.deepEqual(ledger.persistent.map(row => row.area), ['energy after travel']);
  assert.match(ledger.meaning, /not noise/);
});

test('with no shortcut and no validated simulation, reality must compute it', () => {
  const irreducible = computationalIrreducibility({ question: 'how will this market behave' });
  assert.equal(irreducible.status, 'REALITY_MUST_COMPUTE_THIS__OBSERVE_OR_EXPERIMENT');
  assert.match(irreducible.why, /would be invented/);
  assert.equal(computationalIrreducibility({ question: 'x', shortcutKnown: true }).status, 'SHORTCUT_AVAILABLE');
});
