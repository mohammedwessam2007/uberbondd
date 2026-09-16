#!/usr/bin/env node
// G6. Report the mean over what this suite actually measured.
//
// G3 switched the suite to the outcome-based instrument and carried six
// readings forward from the saturated one it replaced. Every mean reported
// from G3 onward averaged the two instruments together, and the carried
// readings were all at the ceiling, so the error ran one way.
//
// G6 re-records against G2 -- the last generation on the old suite -- so the
// detector sees the change and excludes what was carried.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { recordGeneration, compareGenerations } from '../src/nullstar-omega-generation.mjs';

const GEN_DIR = 'artifacts/nullstar-omega/generations';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const g2 = read(`${GEN_DIR}/G2.json`);
const g5 = read(`${GEN_DIR}/G5.json`);
const declaration = read('artifacts/nullstar-omega/G5-prospective-declaration.json');

const generation = recordGeneration({
  generationId: 'G6',
  sourceCommit: head,
  suiteVersion: g5.suiteVersion,
  corpusDigest: g5.corpusDigest,
  vector: g5.vector,
  // G2 is the last generation recorded on the probe suite. Passing it lets the
  // detector find every value that has not moved since, which is what a
  // carried reading looks like from here.
  previousGeneration: g2,
  baselines: g5.declaredBaselines ?? g5.baselines ?? {},
  cost: { providerCalls: 0, spendCents: 0 },
  environment: {
    judgementCapability: 'NONE',
    note: 'Same readings as G5. The difference is which of them are allowed into the headline mean.'
  },
  failures: []
});

if (!generation.ok) {
  console.error('GENERATION_INVALID', generation.reasonCodes ?? generation);
  process.exit(1);
}

mkdirSync(GEN_DIR, { recursive: true });
writeFileSync(`${GEN_DIR}/G6.json`, `${JSON.stringify(generation, null, 2)}\n`);
writeFileSync('artifacts/nullstar-omega/G5-to-G6.json', `${JSON.stringify(compareGenerations(g5, generation), null, 2)}\n`);

const predicted = 0.53;
const honest = generation.meanMeasuredScore;
const inflated = generation.meanIncludingCarriedReadings;

writeFileSync('artifacts/nullstar-omega/G6-discriminating-test.json', `${JSON.stringify({
  schemaVersion: 'uberbond-nullstar-omega-discriminating-test-1.1.0',
  diagnosis: declaration.bottleneckId,
  symptom: declaration.symptom,
  declaredCriterion: declaration.resolutionCriterion,
  predictionUnderTest: declaration.prediction,
  carriedDimensions: generation.coverage.carriedDimensions,
  measuredUnderThisSuite: generation.coverage.measuredUnderThisSuite,
  meanOverFreshReadingsOnly: honest,
  meanIncludingCarriedReadings: inflated,
  previouslyReportedMean: g5.meanMeasuredScore,
  predictionHeld: honest !== null && honest < g5.meanMeasuredScore,
  predictionAccuracy: honest === null ? null : Number(Math.abs(honest - predicted).toFixed(4)),
  criterionMet: generation.coverage.carriedFromAnotherSuite > 0 && honest !== null && honest < inflated,
  finding: `Six of ten readings came from the suite that was replaced for being saturated. The mean over what this instrument actually measured is ${honest}, not ${g5.meanMeasuredScore}.`,
  whatThisDoesNotChange: 'The four genuinely measured dimensions are unchanged, and the instrument really did separate at G3. What changes is the headline number, which was averaging two instruments and reporting the flattering half as if it were current.',
  businessEffectAuthority: 'NONE'
}, null, 2)}\n`);

console.log(`G6 @ ${head.slice(0, 8)}`);
console.log(`  carried from the probe suite: ${generation.coverage.carriedDimensions.join(', ')}`);
console.log(`  measured under this suite:    ${generation.coverage.measuredUnderThisSuite} of ${generation.coverage.measured}`);
console.log(`  mean over fresh readings:     ${honest}`);
console.log(`  mean including carried:       ${inflated}   <- what G5 reported as ${g5.meanMeasuredScore}`);
console.log(`  predicted near ${predicted}, actual ${honest} (off by ${Math.abs(honest - predicted).toFixed(4)})`);
console.log(honest < g5.meanMeasuredScore ? '\nPREDICTION_HELD__HEADLINE_WAS_INFLATED' : '\nPREDICTION_FAILED');
