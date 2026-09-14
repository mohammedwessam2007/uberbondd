#!/usr/bin/env node
// G4. Execute the test the G3 bottleneck named.
//
// BN-EVAL-COVERAGE said 8 of 17 dimensions are unmeasured and offered two
// hypotheses: those dimensions need a provider, or nobody wrote a task for
// them. The discriminating test is to attempt one from local evidence.
//
// `software` is attempted, scored from git rather than from any file's
// contents: of the src modules introduced on this branch, how many were never
// edited afterwards. The repository cannot flatter itself on that.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { recordGeneration, compareGenerations } from '../src/nullstar-omega-generation.mjs';
import { scoreSoftwareOutcome } from '../src/nullstar-omega-software-outcome.mjs';

const GEN_DIR = 'artifacts/nullstar-omega/generations';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

const head = git('rev-parse', 'HEAD');
const base = git('merge-base', 'HEAD', 'origin/main');
const g3 = read(`${GEN_DIR}/G3.json`);
const declaration = read('artifacts/nullstar-omega/G3-prospective-declaration.json');

// Every src module added on this branch. The set comes from git, so it cannot
// be narrowed to the ones that happen to look good.
const added = git('diff', '--name-status', `${base}`, head, '--', 'src/')
  .split('\n')
  .filter(line => line.startsWith('A\t'))
  .map(line => line.slice(2).trim())
  .filter(Boolean);

const introduced = added.map(path => {
  const commits = git('log', '--format=%H', `${base}..${head}`, '--', path).split('\n').filter(Boolean);
  // git log is newest-first, so the last entry introduced the file.
  const introducedIn = commits[commits.length - 1];
  return { path, introducedIn, touchedByLater: commits.slice(0, -1) };
});

const software = scoreSoftwareOutcome({ introduced, branchBase: base, head });

// G4 recomputes selfDiagnosis rather than inheriting G3's, under the same
// cutoff: episodes that had closed when G4 was built. G2->G3 now counts and
// G3->G4 does not, so the dimension moves without G4 scoring itself.
const meta = read('artifacts/nullstar-omega/meta-improvement.json');
const GENERATION_NUMBER = 4;
const closedBefore = (meta.episodes || [])
  .filter(row => row.status !== 'SYMPTOM_UNTESTED')
  .filter(row => Number(String(row.successorGeneration).slice(1)) < GENERATION_NUMBER);
const selfDiagnosis = closedBefore.length
  ? Number((closedBefore.filter(row => row.status === 'SYMPTOM_RESOLVED').length / closedBefore.length).toFixed(4))
  : null;

const resolvedByLocalEvidence = software.ok;
const vector = { ...g3.vector, software: resolvedByLocalEvidence ? software.score : null, selfDiagnosis };

const corpusDigest = `sha256:${createHash('sha256')
  .update(JSON.stringify({
    g3: g3.corpusDigest,
    software: software.ok ? software.touchedModules : software.reasonCodes,
    selfDiagnosisEpisodes: closedBefore.map(row => `${row.generation}->${row.successorGeneration}:${row.status}`)
  }))
  .digest('hex')}`;

const generation = recordGeneration({
  generationId: 'G4',
  sourceCommit: head,
  // Same instrument family as G3: every dimension is scored from an observed
  // outcome. A new suite version here would make G3 and G4 incomparable and
  // would hide whether coverage actually rose.
  suiteVersion: g3.suiteVersion,
  corpusDigest,
  vector,
  baselines: g3.declaredBaselines ?? g3.baselines ?? {},
  cost: { providerCalls: 0, spendCents: 0 },
  environment: {
    judgementCapability: 'NONE',
    note: 'software is scored from git history. No provider was contacted.'
  },
  failures: []
});

if (!generation.ok) {
  console.error('GENERATION_INVALID', generation.reasonCodes ?? generation);
  process.exit(1);
}

mkdirSync(GEN_DIR, { recursive: true });
writeFileSync(`${GEN_DIR}/G4.json`, `${JSON.stringify(generation, null, 2)}\n`);

const comparison = compareGenerations(g3, generation);
writeFileSync('artifacts/nullstar-omega/G3-to-G4.json', `${JSON.stringify(comparison, null, 2)}\n`);

const beforeCoverage = Object.values(g3.vector).filter(Number.isFinite).length;
const afterCoverage = Object.values(generation.vector).filter(Number.isFinite).length;
const criterionMet = afterCoverage > beforeCoverage;

writeFileSync('artifacts/nullstar-omega/G4-discriminating-test.json', `${JSON.stringify({
  schemaVersion: 'uberbond-nullstar-omega-discriminating-test-1.1.0',
  diagnosis: declaration.bottleneckId,
  discriminatingTest: declaration.discriminatingTest,
  attemptedDimension: 'software',
  verdict: resolvedByLocalEvidence
    ? 'AUTHORSHIP_GAP__DIMENSION_SCORED_WITHOUT_A_PROVIDER'
    : 'NOT_SCORABLE_LOCALLY',
  softwareScore: software.ok ? software.score : null,
  softwareDetail: software,
  declaredCriterion: declaration.resolutionCriterion,
  coverageBefore: beforeCoverage,
  coverageAfter: afterCoverage,
  criterionMet,
  consequence: resolvedByLocalEvidence
    ? 'The first hypothesis was wrong for at least one dimension. Those dimensions were not provider-gated; no task had been written for them. The remaining seven are still unattempted, so this refutes the hypothesis rather than closing the gap.'
    : 'The provider hypothesis survives for this dimension.',
  businessEffectAuthority: 'NONE'
}, null, 2)}\n`);

console.log(`G4 @ ${head.slice(0, 8)}`);
console.log(`  software ${software.ok ? software.score : 'NOT_SCORABLE'} (${software.untouchedAfterIntroduction ?? '?'}/${software.modules ?? introduced.length} modules never edited after introduction)`);
if (software.ok && software.touchedModules.length) {
  for (const row of software.touchedModules) console.log(`    touched later: ${row.path} (${row.laterCommits} commit(s))`);
}
console.log(`  selfDiagnosis ${selfDiagnosis} (${closedBefore.filter(r => r.status === 'SYMPTOM_RESOLVED').length}/${closedBefore.length} episodes closed before G4)`);
console.log(`  coverage ${beforeCoverage} -> ${afterCoverage}`);
console.log(`  declared criterion: measured count must rise above ${beforeCoverage}`);
console.log(criterionMet ? '\nCRITERION_MET' : '\nCRITERION_NOT_MET');
