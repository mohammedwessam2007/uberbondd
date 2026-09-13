import test from 'node:test';
import assert from 'node:assert/strict';
import { frontierMechanismSeeds, frontierMechanismExperimentBacklog, frontierMechanismCoverage } from '../src/frontier-mechanism-catalog.mjs';

test('frontier catalog ships evidence-backed hypotheses without pretending they are benchmarked winners', () => {
  const coverage = frontierMechanismCoverage();
  assert.equal(coverage.seedCount, 10);
  assert.ok(coverage.familyCount >= 8);
  assert.equal(coverage.status, 'SEED_HYPOTHESES_NOT_BENCHMARKED');
  assert.match(coverage.truthBoundary, /NOT CLAIMS THAT UBERBOND ALREADY OUTPERFORMS/i);
});

test('every frontier seed is inert evidence until the canonical genome admits a reproduced implementation', () => {
  const seeds = frontierMechanismSeeds();
  assert.equal(seeds.length, 10);
  for (const seed of seeds) {
    assert.equal(seed.executionAuthority, 'NONE');
    assert.equal(seed.consequenceAuthority, 'NONE');
    assert.equal(seed.promotionState, 'OBSERVED');
    assert.ok(seed.sourceUrl.startsWith('https://'));
  }
});

test('every seed has a three-way baseline donor reconstruction UberBond mutation experiment', () => {
  const backlog = frontierMechanismExperimentBacklog();
  assert.equal(backlog.length, 10);
  for (const experiment of backlog) {
    assert.deepEqual(experiment.variants.map(v => v.id), ['A','B','C']);
    assert.equal(experiment.executionAuthority, 'NONE');
    assert.match(experiment.promotionRule, /SEALED_HOLDOUTS/);
  }
});
