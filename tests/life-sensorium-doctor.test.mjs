import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('Life Sensorium doctor composes only synthetic private inference with canonical founder salience law',()=>{
  const out=spawnSync(process.execPath,[path.join(root,'scripts/life-sensorium-doctor.mjs')],{cwd:root,encoding:'utf8'});
  assert.equal(out.status,0,out.stderr||out.stdout);
  const report=JSON.parse(out.stdout);
  assert.equal(report.ok,true);
  assert.equal(report.status,'LIFE_SENSORIUM_DOCTOR_COMPLETE');
  assert.equal(report.source,'SYNTHETIC_FIXTURE_ONLY');
  assert.equal(report.salience.rightNotToKnow,'STAY_SILENT');
  assert.match(report.privacyBoundary,/REAL_LIFE_INPUT_BELONGS_TO_FOUNDER_PRIVATE_RUNTIME/);
  assert.match(report.attentionBoundary,/DOES_NOT_OVERRIDE_RIGHT_NOT_TO_KNOW/);
  assert.match(report.truthBoundary,/NOT_REAL_LIFE_OBSERVABILITY/);
  assert.equal(report.businessEffectAuthority,'NONE');
  assert.equal(report.externalEffectAuthority,'NONE');
});

test('doctor depends on canonical salience-sovereignty owner, never retired duplicate router',()=>{
  const source=readFileSync(path.join(root,'scripts/life-sensorium-doctor.mjs'),'utf8');
  assert.match(source,/from '\.\.\/src\/salience-sovereignty\.mjs'/);
  assert.doesNotMatch(source,/sovereign-salience-router/);
  assert.match(source,/founderRule:'RIGHT_NOT_TO_KNOW'/);
});
