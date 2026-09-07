import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// The doctor exists so the four life organs have a caller an operator can run.
// A module reachable only from tests is not reachable, and this repository has
// paid for that lesson three times. These tests check the composition holds and
// that running it stays free of effects.

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (args = []) => JSON.parse(execFileSync('node', ['scripts/personal-civilization-doctor.mjs', ...args], {
  cwd: repoRoot, encoding: 'utf8', timeout: 60000
}));

test('the doctor runs the whole loop on the synthetic fixture', () => {
  const report = run();
  assert.equal(report.ok, true);
  assert.equal(report.status, 'PERSONAL_CIVILIZATION_DOCTOR_COMPLETE');
  assert.equal(report.situationSource, 'SYNTHETIC_FIXTURE');
  // Each organ actually contributed rather than returning an empty shape.
  assert.ok(report.possibility.branchesAccepted > 0);
  assert.ok(report.compression.state);
  assert.ok(Array.isArray(report.world.surfaced));
  assert.ok(report.genesis.generated > 0);
});

test('an economically high-scoring signal is still dropped as novelty', () => {
  // The fixture carries a model release with economicScore 94 and no life
  // dimension. If a market score ever leaks into life relevance, it surfaces here.
  const report = run();
  assert.deepEqual(report.world.droppedAsNovelty, ['a cheaper frontier model shipped']);
  assert.ok(!report.world.surfaced.some(row => row.title === 'a cheaper frontier model shipped'));
});

test('a third-party report does not ground a claim about personal reach', () => {
  const report = run();
  for (const outcome of report.world.groundingOutcomes) {
    assert.equal(outcome.state, 'HYPOTHESIS');
    assert.equal(outcome.status, 'GROUNDING_INSUFFICIENT');
  }
});

test('a deliberate closure is reported as a purchase, not a loss', () => {
  const report = run();
  const decision = report.possibility.decision;
  assert.deepEqual(decision.unnecessarilyClosed, ['a year of unstructured travel']);
  assert.equal(decision.deliberatelyClosed[0].inExchangeFor, 'depth in one craft');
  assert.equal(decision.authorityBoundary, 'RECOMMENDATION__MOHAMED_CHOOSES');
});

test('a requirement crossing dimensions surfaces; one inside a dimension does not', () => {
  const report = run();
  const requirements = report.possibility.crossFutureRequirements.map(row => row.requirement);
  assert.ok(requirements.includes('conversational German'));
  // "medical licence" appears twice, both inside CAREER, so it is a fact about
  // that dimension rather than about the life.
  assert.ok(!requirements.includes('medical licence'));
});

test('the fixture batch is not a cage and names its departure', () => {
  const report = run();
  assert.equal(report.genesis.caged, false);
  assert.deepEqual(report.genesis.departures, ['a season of physical work in another country']);
  assert.deepEqual(report.genesis.probeReady, ['a season of physical work in another country']);
});

test('an unreadable situation file falls back to the fixture and says so', () => {
  const report = run(['--situation', 'does/not/exist.json']);
  assert.equal(report.situationSource, 'SITUATION_FILE_UNREADABLE__FIXTURE_USED');
  assert.equal(report.ok, true);
});

test('a supplied situation is used and is reported as supplied', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pc-doctor-'));
  const file = join(dir, 'situation.json');
  try {
    writeFileSync(file, JSON.stringify({
      branches: [{ name: 'one thing', dimension: 'CREATIVE', reachability: 'REACHABLE_NOW', valued: true }],
      paths: [{ name: 'more of the same', identityDistance: 'CONTINUATION', dimensions: ['CREATIVE'] }]
    }));
    const report = run(['--situation', file]);
    assert.equal(report.situationSource, 'SUPPLIED_FILE');
    assert.equal(report.possibility.branchesAccepted, 1);
    // One continuation and nothing else is the cage the generator must report.
    assert.equal(report.genesis.caged, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the report carries its truth, authority and privacy boundaries', () => {
  const report = run();
  assert.match(report.truthBoundary, /NOT_EVIDENCE_ABOUT_A_LIFE_AND_NOT_A_RECOMMENDATION/);
  assert.equal(report.authorityBoundary, 'RECOMMENDATION_AT_MOST__MOHAMED_CHOOSES');
  assert.match(report.privacyBoundary, /NOT_WRITTEN_TO_REPOSITORY_ARTIFACTS/);
  assert.equal(report.businessEffectAuthority, 'NONE');
});

test('running the doctor produces no external effect', () => {
  const report = run();
  assert.deepEqual(report.externalEffects, {
    messages: 0, providerCalls: 0, spendCents: 0, deployments: 0, writes: 0
  });
});

test('the doctor source imports every organ it claims to compose', () => {
  // Reachability is the whole reason this script exists. If an import is
  // dropped, the organ silently goes back to being shelfware and the ratchet
  // would only notice on the next classification sweep.
  const source = readFileSync(join(repoRoot, 'scripts/personal-civilization-doctor.mjs'), 'utf8');
  for (const organ of [
    'life-possibility-engine.mjs', 'life-compression-engine.mjs',
    'gamechanger-for-life.mjs', 'genesis-for-life.mjs'
  ]) {
    assert.ok(source.includes(organ), `doctor must import ${organ}`);
  }
});
