#!/usr/bin/env node
// G5. Try the remaining dimensions, with the reuse guard allowed to refuse them.
//
// The declaration committed before this file predicted the guard would refuse
// at least one dimension it would otherwise have scored. That prediction is
// tested here by actually declaring the evidence sets and letting the guard
// settle them, rather than by deciding in advance which ones to skip.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { recordGeneration, compareGenerations } from '../src/nullstar-omega-generation.mjs';
import { admitDimensionEvidence } from '../src/nullstar-omega-evidence-reuse.mjs';

const GEN_DIR = 'artifacts/nullstar-omega/generations';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const g4 = read(`${GEN_DIR}/G4.json`);
const reality = read('artifacts/nullstar-omega/reality-connection.json');
const meta = read('artifacts/nullstar-omega/meta-improvement.json');
const generalization = read('artifacts/nullstar-omega/generalization.json');
const g4test = read('artifacts/nullstar-omega/G4-discriminating-test.json');
const declaration = read('artifacts/nullstar-omega/G4-prospective-declaration.json');

// What each already-scored dimension at G4 is reading. Declared first so the
// incumbents hold their observations and a newcomer has to bring its own.
const loopKeys = reality.records.map(record => `loop:${record.observableId}`);
const episodeKeys = meta.episodes.map(row => `episode:${row.generation}->${row.successorGeneration}`);
const familyKeys = generalization.families.map(family => `family:${family.familyId}`);
const moduleKeys = (g4test.softwareDetail?.touchedModules ?? []).map(row => `git:${row.path}`)
  .concat(Array.from({ length: (g4test.softwareDetail?.untouchedAfterIntroduction ?? 0) }, (_, i) => `git:untouched-${i}`));

const claims = [
  { dimension: 'calibration', evidenceKeys: loopKeys, rationale: 'Brier over the closed reality loops.' },
  { dimension: 'selfDiagnosis', evidenceKeys: episodeKeys, rationale: 'Named symptoms that resolved.' },
  { dimension: 'crossDomain', evidenceKeys: familyKeys, rationale: 'First-attempt correctness across families.' },
  { dimension: 'software', evidenceKeys: moduleKeys, rationale: 'Modules never edited after introduction.' },
  // The newcomers. Both are scored from observations the incumbents already
  // hold, which is exactly what the declaration predicted.
  { dimension: 'forecasting', evidenceKeys: loopKeys, rationale: 'Share of forecasts whose top-probability outcome was correct.' },
  { dimension: 'causality', evidenceKeys: episodeKeys, rationale: 'Share of named causes that produced the predicted effect when acted on.' }
];

const admission = admitDimensionEvidence({ claims });
const newlyAdmitted = admission.admittedDimensions.filter(d => !Number.isFinite(g4.vector[d]));

// Same cutoff rule G3 and G4 use: episodes that had closed when this
// generation was built. G3->G4 counts here and G4->G5 does not.
const GENERATION_NUMBER = 5;
const closedBefore = meta.episodes
  .filter(row => row.status !== 'SYMPTOM_UNTESTED')
  .filter(row => Number(String(row.successorGeneration).slice(1)) < GENERATION_NUMBER);
const selfDiagnosis = closedBefore.length
  ? Number((closedBefore.filter(row => row.status === 'SYMPTOM_RESOLVED').length / closedBefore.length).toFixed(4))
  : null;

const vector = { ...g4.vector, selfDiagnosis };
for (const dimension of newlyAdmitted) {
  if (dimension === 'forecasting') {
    const scored = reality.records.filter(r => r.status === 'REALITY_LOOP_CLOSED');
    vector.forecasting = scored.length
      ? Number((scored.filter(r => r.assignedProbability >= 0.5).length / scored.length).toFixed(4))
      : null;
  }
  if (dimension === 'causality') {
    const closed = meta.episodes.filter(r => r.status !== 'SYMPTOM_UNTESTED');
    vector.causality = closed.length
      ? Number((closed.filter(r => r.status === 'SYMPTOM_RESOLVED').length / closed.length).toFixed(4))
      : null;
  }
}

const generation = recordGeneration({
  generationId: 'G5',
  sourceCommit: head,
  suiteVersion: g4.suiteVersion,
  corpusDigest: `sha256:${createHash('sha256').update(JSON.stringify({ g4: g4.corpusDigest, admission: admission.refusedDimensions })).digest('hex')}`,
  vector,
  baselines: g4.declaredBaselines ?? g4.baselines ?? {},
  cost: { providerCalls: 0, spendCents: 0 },
  environment: { judgementCapability: 'NONE', note: 'No provider contacted. Dimensions are gated by the evidence-reuse guard.' },
  failures: []
});

if (!generation.ok) {
  console.error('GENERATION_INVALID', generation.reasonCodes ?? generation);
  process.exit(1);
}

mkdirSync(GEN_DIR, { recursive: true });
writeFileSync(`${GEN_DIR}/G5.json`, `${JSON.stringify(generation, null, 2)}\n`);
writeFileSync('artifacts/nullstar-omega/G4-to-G5.json', `${JSON.stringify(compareGenerations(g4, generation), null, 2)}\n`);

const before = Object.values(g4.vector).filter(Number.isFinite).length;
const after = Object.values(generation.vector).filter(Number.isFinite).length;

writeFileSync('artifacts/nullstar-omega/G5-discriminating-test.json', `${JSON.stringify({
  schemaVersion: 'uberbond-nullstar-omega-discriminating-test-1.1.0',
  diagnosis: declaration.bottleneckId,
  attemptedDimensions: ['forecasting', 'causality'],
  predictionUnderTest: declaration.prediction.claim,
  admission,
  predictionHeld: admission.refusedDimensions.length > 0,
  declaredCriterion: declaration.resolutionCriterion,
  coverageBefore: before,
  coverageAfter: after,
  criterionMet: after > before,
  finding: admission.refusedDimensions.length
    ? `The guard refused ${admission.refusedDimensions.join(' and ')}. Both were cut from observations already scoring another dimension, so counting them would have raised coverage without observing anything new.`
    : 'The guard admitted every attempted dimension.',
  consequence: after > before
    ? 'Coverage rose on evidence that was not already spoken for.'
    : 'Coverage did not rise. This repository does not yet generate independent evidence for the remaining dimensions, and the answer is to make the system do something new rather than to measure the same thing again.',
  businessEffectAuthority: 'NONE'
}, null, 2)}\n`);

console.log(`G5 @ ${head.slice(0, 8)}`);
console.log(`  admitted: ${admission.admittedDimensions.join(', ')}`);
console.log(`  refused:  ${admission.refusedDimensions.join(', ') || 'none'}`);
for (const row of admission.refused) console.log(`    ${row.dimension}: ${row.why}`);
console.log(`  selfDiagnosis ${selfDiagnosis} (${closedBefore.filter(r => r.status === 'SYMPTOM_RESOLVED').length}/${closedBefore.length} episodes closed before G5)`);
console.log(`  coverage ${before} -> ${after} (criterion: must rise above ${before})`);
console.log(`  prediction "${declaration.prediction.claim}" -> ${admission.refusedDimensions.length ? 'HELD' : 'FAILED'}`);
console.log(after > before ? '\nCRITERION_MET' : '\nCRITERION_NOT_MET');
