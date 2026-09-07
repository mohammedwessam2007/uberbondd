#!/usr/bin/env node
import {
  assessReflexivity,
  compileReflexiveScenarios,
  forecastReflexivityGate
} from '../src/reflexivity-engine.mjs';

const assessment = assessReflexivity({
  subject: 'synthetic strategic system',
  forecastRef: 'fixture:forecast',
  forecastPublished: true,
  feedbackEdges: [{
    id: 'fixture-feedback',
    source: 'published forecast',
    target: 'synthetic actor behavior',
    mechanism: 'synthetic actors can adapt after observing the forecast',
    direction: 'CHANGES_UNKNOWN_DIRECTION',
    evidenceRef: 'fixture:feedback-evidence',
    actorCanAdapt: true
  }]
});
const scenarios = compileReflexiveScenarios({ assessment });
const gate = forecastReflexivityGate({
  assessment,
  forecastInformationState: 'PRIVATE',
  currentInformationState: 'PUBLIC'
});
const ok = assessment.ok && scenarios.ok && gate.ok
  && assessment.reflexivityClass === 'STRATEGIC_ADAPTATION'
  && gate.status === 'FORECAST_REQUIRES_REFLEXIVE_RECOMPUTATION'
  && scenarios.probabilityClaimed === false
  && gate.businessEffectAuthority === 'NONE';

process.stdout.write(`${JSON.stringify({
  ok,
  status: ok ? 'REFLEXIVITY_DOCTOR_GREEN' : 'REFLEXIVITY_DOCTOR_FAILED',
  reflexivityClass: assessment.reflexivityClass,
  scenarioCount: scenarios.scenarios?.length || 0,
  probabilityClaimed: scenarios.probabilityClaimed,
  forecastGate: gate.status,
  privateFounderDataLoaded: false,
  businessEffectAuthority: 'NONE'
}, null, 2)}\n`);
if (!ok) process.exitCode = 2;
