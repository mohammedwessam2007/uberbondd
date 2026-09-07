import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessReflexivity,
  compileReflexiveScenarios,
  forecastReflexivityGate
} from '../src/reflexivity-engine.mjs';

test('no declared active feedback remains inert without pretending feedback is impossible', () => {
  const out = assessReflexivity({ subject: 'synthetic weather-like system' });
  assert.equal(out.ok, true);
  assert.equal(out.reflexivityClass, 'INERT_OR_NO_DECLARED_FEEDBACK');
  assert.equal(out.recomputationRequired, false);
  assert.match(out.truthBoundary, /DOES_NOT_QUANTIFY_THE_EFFECT/);
});

test('publishing an amplifying forecast can be classified self-fulfilling', () => {
  const out = assessReflexivity({
    subject: 'synthetic coordination system',
    forecastPublished: true,
    feedbackEdges: [{
      id: 'f1', source: 'forecast', target: 'actor behavior',
      mechanism: 'actors increase the behavior because they expect others to do so',
      direction: 'AMPLIFIES', evidenceRef: 'fixture:mechanism-1'
    }]
  });
  assert.equal(out.reflexivityClass, 'SELF_FULFILLING');
  assert.equal(out.recomputationRequired, true);
});

test('adaptive actors force strategic-adaptation classification even when direction seems simple', () => {
  const out = assessReflexivity({
    subject: 'synthetic competitor response',
    plannedActionDisclosed: true,
    feedbackEdges: [{
      id: 'f1', source: 'disclosed plan', target: 'competitor action',
      mechanism: 'competitor can change its policy after seeing the plan',
      direction: 'DAMPENS', evidenceRef: 'fixture:mechanism-2', actorCanAdapt: true
    }]
  });
  assert.equal(out.reflexivityClass, 'STRATEGIC_ADAPTATION');
});

test('awareness-dependent feedback stays inactive while the forecast remains private', () => {
  const out = assessReflexivity({
    subject: 'synthetic market',
    forecastPublished: false,
    feedbackEdges: [{
      id: 'f1', source: 'forecast', target: 'market action',
      mechanism: 'actors react only if they see the forecast',
      direction: 'AMPLIFIES', evidenceRef: 'fixture:mechanism-3', requiresAwareness: true
    }]
  });
  assert.equal(out.activeFeedbackEdges.length, 0);
  assert.equal(out.inactiveAwarenessDependentEdges.length, 1);
  assert.equal(out.reflexivityClass, 'INERT_OR_NO_DECLARED_FEEDBACK');
});

test('scenario compiler exposes feedback paths but assigns no fake probabilities', () => {
  const assessment = assessReflexivity({
    subject: 'synthetic system', observationPublic: true,
    feedbackEdges: [{
      id: 'f1', source: 'observation', target: 'behavior',
      mechanism: 'observation changes behavior', direction: 'CHANGES_UNKNOWN_DIRECTION',
      evidenceRef: 'fixture:mechanism-4'
    }]
  });
  const scenarios = compileReflexiveScenarios({ assessment });
  assert.equal(scenarios.ok, true);
  assert.equal(scenarios.probabilityClaimed, false);
  assert.ok(scenarios.scenarios.every(row => row.probability === null));
});

test('information-environment change with active feedback invalidates reuse of sealed forecast', () => {
  const assessment = assessReflexivity({
    subject: 'synthetic coordination system', forecastPublished: true,
    feedbackEdges: [{
      id: 'f1', source: 'forecast', target: 'behavior',
      mechanism: 'public forecast changes behavior', direction: 'AMPLIFIES',
      evidenceRef: 'fixture:mechanism-5'
    }]
  });
  const gate = forecastReflexivityGate({
    assessment,
    forecastInformationState: 'PRIVATE',
    currentInformationState: 'PUBLIC'
  });
  assert.equal(gate.ok, true);
  assert.equal(gate.status, 'FORECAST_REQUIRES_REFLEXIVE_RECOMPUTATION');
  assert.equal(gate.highestRung, 'RECOMMENDATION');
  assert.equal(gate.businessEffectAuthority, 'NONE');
});

test('incomplete feedback edges fail closed instead of becoming vague influence claims', () => {
  const out = assessReflexivity({
    subject: 'synthetic system', forecastPublished: true,
    feedbackEdges: [{ id: 'f1', source: 'forecast', target: 'behavior', direction: 'AMPLIFIES' }]
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('incomplete-feedback-edge:f1'));
});
