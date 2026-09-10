#!/usr/bin/env node
import { fuseLifeState, measureSensoriumCoverage, reconstructLifeTimeline } from '../src/life-sensorium.mjs';
import { routeSalience } from '../src/sovereign-salience-router.mjs';

const authorization = { subject: 'FOUNDER', grant: 'PRIVATE_LIFE_STATE', issuedAt: '2026-09-10T00:00:00Z' };
const signal = (kind, tags, observedAt, sourceConfidence = 1) => ({ kind, tags, observedAt, sourceConfidence, sourceRef: `synthetic://${kind.toLowerCase()}` });
const signals = [
  signal('LOCATION', ['campus'], '2026-09-10T08:02:00Z'),
  signal('CALENDAR', ['class-calendar'], '2026-09-10T08:03:00Z'),
  signal('DEVICE_ACTIVITY', ['study-app', 'document-reading', 'low-app-switching'], '2026-09-10T08:07:00Z'),
  signal('MOTION', ['commute-motion', 'location-change'], '2026-09-10T09:31:00Z')
];
const frame = fuseLifeState({ signals: signals.slice(0, 3), authorization });
const timeline = reconstructLifeTimeline({ signals, authorization, bucketMinutes: 15 });
const coverage = measureSensoriumCoverage({ signals, authorization, desiredKinds: ['LOCATION', 'DEVICE_ACTIVITY', 'HEALTH', 'MOTION', 'CALENDAR'] });
const salience = routeSalience({
  item: 'synthetic class context is available',
  urgency: 0.2,
  importance: 0.6,
  confidence: frame.candidateStates?.[0]?.heuristicConfidence ?? 0,
  attentionCost: 0.7,
  delayReversibility: 0.9,
  founderRule: 'NORMAL',
  founderBusy: true,
  directExperienceValue: 0.4,
  consequenceIfMissed: 0.1
});
const ok = frame.ok && timeline.ok && coverage.ok && salience.ok && frame.repositoryPersistenceAllowed === false && timeline.repositoryPersistenceAllowed === false;
const report = {
  ok,
  status: ok ? 'LIFE_SENSORIUM_DOCTOR_COMPLETE' : 'LIFE_SENSORIUM_DOCTOR_INVALID',
  version: 'uberbond.life-sensorium-doctor-1.1.0',
  source: 'SYNTHETIC_FIXTURE',
  frame: { status: frame.status, topCandidate: frame.candidateStates?.[0]?.label || null, ambiguity: frame.ambiguity },
  timeline: { status: timeline.status, bucketCount: timeline.bucketCount },
  coverage: { status: coverage.status, sourceCoverageRatio: coverage.sourceCoverageRatio, missingKinds: coverage.missingKinds },
  salience: { status: salience.status, mode: salience.mode, rationale: salience.rationale },
  privacyBoundary: 'SYNTHETIC_FIXTURE_ONLY__REAL_LIFE_INPUT_BELONGS_TO_FOUNDER_PRIVATE_RUNTIME_AND_MUST_NOT_BE_WRITTEN_TO_REPOSITORY',
  truthBoundary: 'DOCTOR_PROVES_DETERMINISTIC_SOURCE_COMPOSITION_ONLY__NOT_REAL_LIFE_OBSERVABILITY_INFERENCE_ACCURACY_OR_INTERVENTION_VALUE',
  authorityBoundary: 'INFERENCE_AND_ATTENTION_ROUTING_DO_NOT_CREATE_CHOICE_OR_EXTERNAL_ACTION_AUTHORITY',
  businessEffectAuthority: 'NONE',
  externalEffectAuthority: 'NONE'
};
console.log(JSON.stringify(report, null, 2));
if (!ok) process.exitCode = 1;
