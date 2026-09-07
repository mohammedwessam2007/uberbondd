import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// The three organs fail together in a specific way: a search that only surfaces
// what the vocabulary can express, run inside an assumption set that already
// fixed the answer, over a series pooled across a regime change. Every step of
// that looks like rigour on the way past.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args = []) => JSON.parse(execFileSync('node', ['scripts/reasoning-quality-doctor.mjs', ...args], {
  cwd: repoRoot, encoding: 'utf8', timeout: 60000
}));

test('the doctor runs all three organs on the fixture', () => {
  const report = run();
  assert.equal(report.ok, true);
  assert.equal(report.status, 'REASONING_QUALITY_DOCTOR_COMPLETE');
  assert.ok(report.search.questions.length > 0);
  assert.ok(report.assumptions.state);
  assert.ok(report.personalEvidence.permittedClaim);
});

test('a single-source anomaly is asked about the source, not about the world', () => {
  const report = run();
  const single = report.search.singleSourceOnly.find(row => row.domain === 'physiology');
  assert.equal(single.question, 'IS_THIS_SOURCE_MISREPORTING');
  assert.ok(!report.search.questions.some(row => row.domain === 'physiology'));
});

test('two independent sources on one domain become a mechanism question', () => {
  const report = run();
  const cross = report.search.questions.find(row => row.route === 'CROSS_SOURCE_STRUCTURE');
  assert.equal(cross.domain, 'work-rhythm');
});

test('domains no source covers are reported as limits of the search', () => {
  const report = run();
  assert.deepEqual(report.search.blindSpots, ['finances', 'relationships']);
  assert.match(report.search.blindSpotLaw, /NOT_A_FINDING_ABOUT_THE_WORLD/);
});

test('concept pressure hands off rather than changing the ontology', () => {
  const report = run();
  assert.equal(report.search.conceptPressure.handoff, 'ONTOGENESIS_CANDIDATE__NOT_AN_ONTOLOGY_CHANGE');
});

test('a question its assumptions already decided is flagged for escape', () => {
  const report = run();
  assert.equal(report.assumptions.state, 'DETERMINED_BY_ASSUMPTIONS');
  assert.equal(report.assumptions.escapeWarranted, true);
  assert.deepEqual(report.assumptions.loadBearing, ['worth means lifetime earnings']);
});

test('a foundation that predicts identically is reported as a notation change', () => {
  const report = run();
  assert.deepEqual(report.assumptions.genuineAlternatives, ['capability accumulation']);
  assert.deepEqual(report.assumptions.notationalVariants, ['utility maximisation']);
});

test('a series crossing a regime change is not poolable', () => {
  const report = run();
  assert.equal(report.personalEvidence.poolable, false);
  assert.equal(report.personalEvidence.segments, 2);
});

test('a before-and-after with an uncontrolled confounder claims nothing causal', () => {
  const report = run();
  assert.equal(report.personalEvidence.permittedClaim, 'DESCRIPTIVE_ONLY__NO_CAUSAL_CLAIM');
});

test('an imported population finding stays a prior', () => {
  const report = run();
  assert.equal(report.personalEvidence.priorRole, 'PRIOR_ONLY__NEVER_A_SUBSTITUTE_FOR_PERSONAL_EVIDENCE');
  assert.equal(report.personalEvidence.priorStatus, 'PRIOR_WEAKENED_BY_DIFFERENCE');
});

test('an undecidable question is reported as undecidable, not resolved', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rq-doctor-'));
  const file = join(dir, 'situation.json');
  try {
    writeFileSync(file, JSON.stringify({
      foundations: {
        current: { name: 'A', predicts: { 'inner state': 'up' } },
        candidates: [{ name: 'B', predicts: { 'inner state': 'down' } }]
      },
      availableObservables: []
    }));
    const report = run(['--situation', file]);
    assert.equal(report.situationSource, 'SUPPLIED_FILE');
    assert.equal(report.assumptions.decidability, 'UNDECIDABLE_WITHIN_AVAILABLE_EVIDENCE');
    assert.deepEqual(report.assumptions.wouldDiscriminateIfObservable, ['inner state']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the report carries its boundaries and produces no external effect', () => {
  const report = run();
  assert.match(report.truthBoundary, /NOT_FINDINGS_ABOUT_THE_WORLD/);
  assert.equal(report.authorityBoundary, 'RECOMMENDATION_AT_MOST__MOHAMED_CHOOSES');
  assert.match(report.privacyBoundary, /NOT_WRITTEN_TO_REPOSITORY_ARTIFACTS/);
  assert.deepEqual(report.externalEffects, { messages: 0, providerCalls: 0, spendCents: 0, deployments: 0, writes: 0 });
  assert.equal(report.businessEffectAuthority, 'NONE');
});

test('the doctor imports every organ it claims to compose', () => {
  const source = readFileSync(join(repoRoot, 'scripts/reasoning-quality-doctor.mjs'), 'utf8');
  for (const organ of ['unknown-unknown-mining.mjs', 'assumption-escape.mjs', 'n-of-1-personal-science.mjs']) {
    assert.ok(source.includes(organ), `doctor must import ${organ}`);
  }
});
