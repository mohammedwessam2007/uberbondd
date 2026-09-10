import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSensoriumCorrection, fuseLifeState, measureSensoriumCoverage, normalizeSensorSignal, reconstructLifeTimeline } from '../src/life-sensorium.mjs';
const auth={subject:'FOUNDER',grant:'PRIVATE_LIFE_STATE',issuedAt:'2026-09-10T18:00:00Z'};
const sig=(kind,tags,at='2026-09-10T10:02:00Z',confidence=1)=>({kind,tags,observedAt:at,sourceConfidence:confidence,sourceRef:`local://${kind.toLowerCase()}`});

test('sensor signals require bounded known kinds and provenance',()=>{
  assert.equal(normalizeSensorSignal(sig('MOTION',['high-motion'])).ok,true);
  assert.equal(normalizeSensorSignal({kind:'MAGIC',tags:['x'],observedAt:'2026-09-10',sourceConfidence:1,sourceRef:'x'}).ok,false);
  assert.equal(normalizeSensorSignal({kind:'MOTION',tags:['x'],observedAt:'2026-09-10',sourceConfidence:1}).ok,false);
});

test('life fusion refuses private inference without founder authority',()=>{
  const out=fuseLifeState({signals:[sig('MOTION',['high-motion'])]});
  assert.equal(out.ok,false); assert.equal(out.status,'LIFE_SENSORIUM_FOUNDER_AUTHORITY_REQUIRED');
});

test('multiple weak signals fuse into a private hypothesis without becoming fact',()=>{
  const out=fuseLifeState({authorization:auth,signals:[
    sig('LOCATION',['gym']),sig('HEALTH',['elevated-heart-rate']),sig('MOTION',['high-motion','exercise-motion-pattern']),sig('WEARABLE',['workout-session'])
  ]});
  assert.equal(out.ok,true); assert.equal(out.candidateStates[0].label,'WORKOUT');
  assert.ok(out.candidateStates[0].evidenceKindCount>=3);
  assert.match(out.confidenceBoundary,/NOT_A_CALIBRATED_PROBABILITY/);
  assert.match(out.inferenceBoundary,/NOT_A_FACT_ABOUT_THE_FOUNDER/);
  assert.equal(out.repositoryPersistenceAllowed,false);
  assert.equal(out.privacyClass,'PRIVATE_LIFE_DATA');
  assert.equal(out.businessEffectAuthority,'NONE');
  assert.equal(out.externalEffectAuthority,'NONE');
});

test('timeline groups signals into deterministic private buckets',()=>{
  const out=reconstructLifeTimeline({authorization:auth,bucketMinutes:15,signals:[
    sig('DEVICE_ACTIVITY',['study-app','document-reading','low-app-switching'],'2026-09-10T10:02:00Z'),
    sig('CALENDAR',['class-calendar'],'2026-09-10T10:07:00Z'),
    sig('MOTION',['commute-motion','location-change'],'2026-09-10T10:31:00Z')
  ]});
  assert.equal(out.ok,true); assert.equal(out.bucketCount,2);
  assert.match(out.truthBoundary,/MAY_BE_CORRECTED/);
  assert.equal(out.repositoryPersistenceAllowed,false);
});

test('correction becomes a private calibration example rather than a permanent trait',()=>{
  const inference=fuseLifeState({authorization:auth,signals:[sig('DEVICE_ACTIVITY',['streaming-media','entertainment-app'])]});
  const out=buildSensoriumCorrection({authorization:auth,inference,correctedLabel:'SOCIAL_TIME',correctedAt:'2026-09-10T20:00:00Z'});
  assert.equal(out.ok,true); assert.equal(out.correctedLabel,'SOCIAL_TIME');
  assert.match(out.principle,/REDUCE_FUTURE_MANUAL_LOGGING/);
  assert.equal(out.repositoryPersistenceAllowed,false);
});

test('coverage reports sensor-source blind spots without pretending to know percent of life',()=>{
  const out=measureSensoriumCoverage({authorization:auth,desiredKinds:['LOCATION','HEALTH','MOTION'],signals:[sig('LOCATION',['home']),sig('MOTION',['low-motion'])]});
  assert.equal(out.ok,true); assert.equal(out.sourceCoverageRatio,0.6667); assert.deepEqual(out.missingKinds,['HEALTH']);
  assert.match(out.coverageBoundary,/NOT_PERCENT_OF_LIFE_OBSERVED/);
});

test('public Life Sensorium source stays founder-generic and cannot persist private life data in repository',()=>{
  const source=readFileSync(new URL('../src/life-sensorium.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/Mohamed|Kasr|psychiatr|iPad|medical training/i);
  assert.match(source,/PRIVATE_LIFE_DATA/);
  assert.match(source,/repositoryPersistenceAllowed: false/);
  assert.match(source,/NOT_A_FACT_ABOUT_THE_FOUNDER/);
});
