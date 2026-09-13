import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileNeuralAtlasPlan, buildNeuralRepositoryTournament, scoreNeuralRepository,
  NEURAL_REPOSITORY_TARGET, NEURAL_FINAL_CAPABILITY_TARGET, NEURAL_ACTIVE_CORTEX_MAX, neuralAtlasCoverage
} from '../src/neural-repository-atlas.mjs';

test('neural atlas spans the broad exocortex and fixes final target at one million', () => {
  const plan = compileNeuralAtlasPlan();
  assert.equal(plan.ok, true);
  assert.equal(plan.target, 1_000_000);
  assert.equal(NEURAL_FINAL_CAPABILITY_TARGET, 1_000_000);
  assert.ok(plan.familyCount >= 60);
  assert.ok(plan.queryCount >= 3_000);
  assert.match(plan.law, /1000000/);
  assert.match(plan.law, /NEVER_COMPRESS_THE_FINAL_LIBRARY_TO_50000/);
  assert.equal(NEURAL_ACTIVE_CORTEX_MAX <= 64, true);
  const families = new Set(neuralAtlasCoverage().map(x => x.family));
  for (const family of ['reasoning','memory','metacognition','planning','causal','theorem','science','personal','bci','provenance','calibration']) assert.equal(families.has(family), true, `missing ${family}`);
});

test('default star bands remain non-overlapping within a seed', () => {
  const plan = compileNeuralAtlasPlan();
  const rows = plan.queries.filter(q => q.family === 'models' && q.seed === 'topic:llm');
  assert.deepEqual(rows.map(q => q.starBand), [[0,2],[3,9],[10,49],[50,199],[200,999],[1000,4999],[5000,null]]);
  assert.equal(new Set(rows.map(q => q.query)).size, 7);
});

test('repository tournament dedupes identities and remains discovery only', () => {
  const out = buildNeuralRepositoryTournament({ repositories: [
    { full_name: 'x/a', html_url: 'https://github.com/x/a', stargazers_count: 10, family: 'reasoning' },
    { full_name: 'X/A', html_url: 'https://github.com/X/A', stargazers_count: 100, family: 'reasoning' }
  ], target: NEURAL_REPOSITORY_TARGET });
  assert.equal(out.manifest.distinctCandidates, 1);
  assert.equal(out.selected[0].stars, 100);
  assert.equal(out.selected[0].promotionAuthority, 'NONE');
  assert.match(out.manifest.truthBoundary, /REPOSITORY_DISCOVERY_ONLY/);
});

test('private and archived candidates do not get promoted by popularity', () => {
  const out = buildNeuralRepositoryTournament({ repositories: [{ full_name: 'x/private', private: true, stargazers_count: 1_000_000 }], target: 1 });
  assert.equal(out.selected.length, 0);
  const live = scoreNeuralRepository({ repositoryFullName: 'x/live', description: 'reasoning agent', stargazersCount: 1000, archived: false }, { family: 'reasoning' });
  const dead = scoreNeuralRepository({ repositoryFullName: 'x/dead', description: 'reasoning agent', stargazersCount: 1000, archived: true }, { family: 'reasoning' });
  assert.ok(live > dead);
});
