#!/usr/bin/env node
// G3. The first generation whose instrument is not reading its own answers.
//
// G0 scored 1.0 on everything and the bottleneck engine said why: each corpus
// task was a direct read of a value the repository already computes, so
// passing required no capability. G1 answered by widening coverage, which kept
// the ceiling. G2 said the remaining gap was the provider and stopped.
//
// Three measurements now exist that the repository cannot compute for itself,
// because each depends on how something turned out rather than on what a file
// says:
//
//   calibration   - forecasts were sealed, procedures were run, Brier followed
//   selfDiagnosis - named symptoms either resolved or came back
//   crossDomain   - a mechanism was applied to new families and mostly broke
//
// None of the three needs a model provider. If the instrument separates here,
// the G0 diagnosis was right and the G1 response was the wrong fix.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { recordGeneration, compareGenerations } from '../src/nullstar-omega-generation.mjs';

const GEN_DIR = 'artifacts/nullstar-omega/generations';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const reality = read('artifacts/nullstar-omega/reality-connection.json');
const meta = read('artifacts/nullstar-omega/meta-improvement.json');
const generalization = read('artifacts/nullstar-omega/generalization.json');
const g2 = read(`${GEN_DIR}/G2.json`);

// Brier over a small multi-outcome space runs 0..2. Mapping it to a 0-1 score
// as 1 - brier/2 keeps the direction honest and keeps a bad forecaster off the
// ceiling. A forecaster who assigned everything correctly would score 1; this
// one does not.
const meanBrier = reality.verdict?.meanBrier;
const calibration = Number.isFinite(meanBrier)
  ? Math.max(0, Math.min(1, 1 - (meanBrier / 2)))
  : null;

// Resolved symptoms over completed episodes.
//
// Only episodes that closed before G3 existed may score G3. The G2->G3 episode
// is about this generation, so letting it in would mean G3's selfDiagnosis
// score depended on G3's own result -- the score would rise simply because the
// generation happened. Zero is a real score here, not a missing measurement.
const episodes = (meta.episodes || [])
  .filter(row => row.status !== 'SYMPTOM_UNTESTED')
  .filter(row => row.successorGeneration !== 'G3');
const selfDiagnosis = episodes.length
  ? episodes.filter(row => row.status === 'SYMPTOM_RESOLVED').length / episodes.length
  : null;

// First-attempt correctness across the families the mechanism was carried to.
const crossDomain = Number.isFinite(generalization.transferRate) ? generalization.transferRate : null;

// Everything G2 measured stays measured. Only the three dimensions that now
// have a real observation behind them are replaced -- the rest keep their prior
// readings so the comparison is not quietly restricted to the dimensions that
// happen to have moved.
const vector = { ...g2.vector, calibration, selfDiagnosis, crossDomain };

const corpusDigest = `sha256:${createHash('sha256').update(JSON.stringify({
  reality: reality.records?.map(record => record.evidenceDigest ?? record.status),
  meta: meta.episodes?.map(row => `${row.bottleneckId}:${row.status}`),
  generalization: generalization.families?.map(family => `${family.familyId}:${family.firstAttemptCorrect}`)
})).digest('hex')}`;

const generation = recordGeneration({
  generationId: 'G3',
  sourceCommit: commit,
  suiteVersion: 'omega-outcome-measured-suite-1.0.0',
  corpusDigest,
  vector,
  baselines: g2.declaredBaselines ?? g2.baselines ?? {},
  cost: { providerCalls: 0, spendCents: 0 },
  environment: {
    judgementCapability: 'NONE',
    note: 'No model provider and no admitted weights. These three dimensions are scored from observed outcomes, which is why they do not need one.'
  },
  failures: []
});

if (!generation.ok) {
  console.error('GENERATION_INVALID', generation.reasonCodes ?? generation);
  process.exit(1);
}

mkdirSync(GEN_DIR, { recursive: true });
writeFileSync(`${GEN_DIR}/G3.json`, `${JSON.stringify(generation, null, 2)}\n`);

const comparison = compareGenerations(g2, generation);
writeFileSync('artifacts/nullstar-omega/G2-to-G3.json', `${JSON.stringify(comparison, null, 2)}\n`);

const measured = Object.entries(generation.vector).filter(([, score]) => Number.isFinite(score));
const scores = measured.map(([, score]) => score);
const spread = Number((Math.max(...scores) - Math.min(...scores)).toFixed(4));

console.log(`G3 @ ${commit.slice(0, 8)}`);
console.log(`  calibration   ${calibration}  (mean Brier ${meanBrier} over ${reality.verdict?.closedLoops} closed loops)`);
console.log(`  selfDiagnosis ${selfDiagnosis}  (${episodes.filter(r => r.status === 'SYMPTOM_RESOLVED').length}/${episodes.length} named symptoms resolved)`);
console.log(`  crossDomain   ${crossDomain}  (${generalization.firstAttemptCorrect}/${generalization.familiesTried} families correct on first attempt)`);
console.log(`  coverage ${measured.length} dimensions, spread ${spread}, mean ${generation.meanMeasuredScore}`);
console.log(spread > 0
  ? `\nINSTRUMENT_SEPARATED. The G0 diagnosis was right: the corpus was reading values the repository already computed. Widening coverage at G1 was the wrong fix.`
  : `\nSTILL_SATURATED at spread ${spread}.`);
