#!/usr/bin/env node
import { fuseLifeState, measureSensoriumCoverage, reconstructLifeTimeline } from '../src/life-sensorium.mjs';
import { attentionBudget } from '../src/salience-sovereignty.mjs';

const authorization={subject:'FOUNDER',grant:'PRIVATE_LIFE_STATE',issuedAt:'2026-09-10T00:00:00Z'};
const signal=(kind,tags,observedAt,sourceConfidence=1)=>({kind,tags,observedAt,sourceConfidence,sourceRef:`synthetic://${kind.toLowerCase()}`});
const signals=[
  signal('LOCATION',['campus'],'2026-09-10T08:02:00Z'),
  signal('CALENDAR',['class-calendar'],'2026-09-10T08:03:00Z'),
  signal('DEVICE_ACTIVITY',['study-app','document-reading','low-app-switching'],'2026-09-10T08:07:00Z'),
  signal('MOTION',['commute-motion','location-change'],'2026-09-10T09:31:00Z')
];

const frame=fuseLifeState({signals:signals.slice(0,3),authorization});
const timeline=reconstructLifeTimeline({signals,authorization,bucketMinutes:15});
const coverage=measureSensoriumCoverage({signals,authorization,desiredKinds:['LOCATION','DEVICE_ACTIVITY','HEALTH','MOTION','CALENDAR']});
const nonSurfacing=attentionBudget({value:1000,switchingCost:0,currentStateValue:0,irreversibleIfMissed:true,founderRule:'RIGHT_NOT_TO_KNOW'});
const normalAttention=attentionBudget({value:0.6,switchingCost:0.7,currentStateValue:0.2,irreversibleIfMissed:false,founderRule:'NORMAL'});

const ok=frame.ok===true
  && timeline.ok===true
  && coverage.ok===true
  && frame.repositoryPersistenceAllowed===false
  && timeline.repositoryPersistenceAllowed===false
  && nonSurfacing.ok===true
  && nonSurfacing.status==='STAY_SILENT'
  && normalAttention.ok===true;

const report={
  ok,
  status:ok?'LIFE_SENSORIUM_DOCTOR_COMPLETE':'LIFE_SENSORIUM_DOCTOR_INVALID',
  version:'uberbond.life-sensorium-doctor-2.0.0',
  source:'SYNTHETIC_FIXTURE_ONLY',
  frame:{status:frame.status,topCandidate:frame.candidateStates?.[0]?.label||null,ambiguity:frame.ambiguity},
  timeline:{status:timeline.status,bucketCount:timeline.bucketCount},
  coverage:{status:coverage.status,sourceCoverageRatio:coverage.sourceCoverageRatio,missingKinds:coverage.missingKinds},
  salience:{rightNotToKnow:nonSurfacing.status,normal:normalAttention.status},
  privacyBoundary:'SYNTHETIC_FIXTURE_ONLY__REAL_LIFE_INPUT_BELONGS_TO_FOUNDER_PRIVATE_RUNTIME_AND_MUST_NOT_BE_WRITTEN_TO_REPOSITORY',
  attentionBoundary:'SENSORIUM_CAPABILITY_DOES_NOT_OVERRIDE_RIGHT_NOT_TO_KNOW_OR_DO_NOT_SURFACE',
  truthBoundary:'DOCTOR_PROVES_DETERMINISTIC_SOURCE_COMPOSITION_ONLY__NOT_REAL_LIFE_OBSERVABILITY_INFERENCE_ACCURACY_OR_INTERVENTION_VALUE',
  authorityBoundary:'INFERENCE_AND_ATTENTION_ROUTING_DO_NOT_CREATE_CHOICE_OR_EXTERNAL_ACTION_AUTHORITY',
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE'
};
console.log(JSON.stringify(report,null,2));
if(!ok)process.exitCode=1;
