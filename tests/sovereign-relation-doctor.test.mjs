import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The three organs fail as a set: authority drifts by accumulation, the loop
// turns while the chooser stays flat, and a claim from a previous decade gets
// spoken in the present tense. Each step defensible, the sum not.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args = []) => JSON.parse(execFileSync('node', ['scripts/sovereign-relation-doctor.mjs', ...args], {
  cwd: repoRoot, encoding: 'utf8', timeout: 60000
}));

test('the doctor runs all three organs on the fixture', () => {
  const report = run();
  assert.equal(report.status, 'SOVEREIGN_RELATION_DOCTOR_COMPLETE');
  assert.ok(report.authority);
  assert.ok(report.amplification);
  assert.ok(report.time);
});

test('present choice wins against a well-evidenced prediction', () => {
  const report = run();
  assert.equal(report.authority.decidedBy, 'PRESENT_CONSCIOUS_CHOICE');
  assert.equal(report.authority.decision, 'stay and finish the training');
  assert.ok(report.authority.overriddenRungs.includes('UBERBOND_PREDICTION'));
  assert.ok(report.authority.overriddenRungs.includes('ECONOMIC_OPTIMIZATION'));
  assert.equal(report.authority.sovereigntyFunctioning, true);
});

test('winning today does not hide a history of deferrals', () => {
  // Both facts are true at once, and reporting only the first is how the drift
  // stays invisible.
  const report = run();
  assert.equal(report.authority.drifting, true);
  assert.equal(report.authority.deferredTo.UBERBOND_PREDICTION, 2);
  assert.equal(report.authority.driftBoundary, 'OBSERVATION_RETURNED_TO_MOHAMED__NOT_A_CORRECTION_APPLIED');
});

test('a cycle that added options and no understanding is counted as noise', () => {
  const report = run();
  assert.equal(report.amplification.noise, 1);
  assert.equal(report.amplification.amplifying, 1);
  assert.equal(report.amplification.ungroundedOrIncomplete, 1);
});

test('option gain and resolution gain are reported separately', () => {
  const report = run();
  assert.equal(report.amplification.totalOptionGain, 17);
  assert.equal(report.amplification.totalResolutionGain, 4);
});

test('a single-era observation is refused the present tense', () => {
  const report = run();
  const stale = report.time.appliedToPresent.find(row => row.statement === 'dislikes large groups');
  assert.equal(stale.tense, 'STALE_UNTESTED');
  assert.equal(stale.status, 'CLAIM_IS_ABOUT_THAT_ERA');
});

test('a claim persisting across eras earns the present tense', () => {
  const report = run();
  const persists = report.time.appliedToPresent.find(row => row.statement === 'drawn to how things are built');
  assert.equal(persists.tense, 'PERSISTS_ACROSS_ERAS');
  assert.equal(persists.status, 'MAY_BE_APPLIED_TO_PRESENT');
});

test('a theme across sixteen years surfaces and a single-era one does not', () => {
  const report = run();
  assert.deepEqual(report.time.recurringThemes.map(row => row.theme), ['mechanism']);
  assert.equal(report.time.recurringThemes[0].span, 16);
  assert.deepEqual(report.time.singleEraThemes, ['social energy']);
  assert.match(report.time.interpretationBoundary, /NOT_EVIDENCE_OF_A_FIXED_TRAIT_OR_A_DESTINY/);
});

test('an unexplained transformation stays unexplained', () => {
  const report = run();
  assert.ok(report.time.transformations.some(row => row.kind === 'UNEXPLAINED'));
});

test('the report carries its boundaries and produces no external effect', () => {
  const report = run();
  assert.equal(report.authorityBoundary, 'RECOMMENDATION_AT_MOST__MOHAMED_CHOOSES');
  assert.match(report.privacyBoundary, /NOT_WRITTEN_TO_REPOSITORY_ARTIFACTS/);
  assert.deepEqual(report.externalEffects, { messages: 0, providerCalls: 0, spendCents: 0, deployments: 0, writes: 0 });
  assert.equal(report.businessEffectAuthority, 'NONE');
});

test('an unreadable situation file falls back to the fixture and says so', () => {
  const report = run(['--situation', 'nope/missing.json']);
  assert.equal(report.situationSource, 'SITUATION_FILE_UNREADABLE__FIXTURE_USED');
});

test('the doctor imports every organ it claims to compose', () => {
  const source = readFileSync(join(repoRoot, 'scripts/sovereign-relation-doctor.mjs'), 'utf8');
  for (const organ of ['present-free-will.mjs', 'free-will-amplification.mjs', 'temporal-civilization.mjs']) {
    assert.ok(source.includes(organ), `doctor must import ${organ}`);
  }
});
