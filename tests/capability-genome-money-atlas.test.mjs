import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MONEY_CAPABILITY_TARGETS,
  buildMoneyCapabilitySearchAtlas,
  scoreMoneyRepositoryCandidate,
  selectMoneyCapabilityTournament
} from '../src/capability-genome-money-atlas.mjs';

test('money capability atlas is broad, unique and targets million-scale discovery without claiming approval', () => {
  const atlas = buildMoneyCapabilitySearchAtlas();
  assert.ok(atlas.length >= 90);
  assert.equal(new Set(atlas.map(entry => entry.query)).size, atlas.length);
  assert.equal(MONEY_CAPABILITY_TARGETS.discoveryCandidates, 1_000_000);
  assert.equal(MONEY_CAPABILITY_TARGETS.tournamentEntrants, 50_000);
  assert.ok(new Set(atlas.map(entry => entry.family)).size >= 15);
});

test('money relevance prior favors fresh economically useful repositories and remains a prior', () => {
  const now = new Date('2026-09-14T00:00:00Z');
  const useful = scoreMoneyRepositoryCandidate({
    name: 'revenue-automation',
    description: 'Sales lead enrichment CRM outreach payment billing conversion analytics automation',
    stargazers_count: 5000,
    forks_count: 500,
    pushed_at: '2026-09-10T00:00:00Z'
  }, { now });
  const stale = scoreMoneyRepositoryCandidate({
    name: 'toy',
    description: 'unrelated archived demo',
    archived: true,
    pushed_at: '2018-01-01T00:00:00Z'
  }, { now });
  assert.ok(useful.score > stale.score);
  assert.equal(useful.truth, 'DISCOVERY_PRIOR_NOT_REVENUE');
});

test('tournament dedupes identity, ranks, and grants no authority', () => {
  const now = new Date('2026-09-14T00:00:00Z');
  const result = selectMoneyCapabilityTournament([
    { id: 1, name: 'payments', description: 'payment billing subscription revenue automation', pushed_at: '2026-09-13T00:00:00Z', stars: 1000 },
    { id: 1, name: 'duplicate', description: 'payment billing', pushed_at: '2026-09-12T00:00:00Z', stars: 10 },
    { id: 2, name: 'old-toy', description: 'demo', archived: true, pushed_at: '2015-01-01T00:00:00Z' }
  ], { limit: 1, now });
  assert.equal(result.observed, 3);
  assert.equal(result.unique, 2);
  assert.equal(result.selected, 1);
  assert.equal(result.promotionAuthority, 'NONE');
  assert.equal(result.moneyMovementAuthority, 'NONE');
  assert.equal(result.truth, 'DISCOVERY_RANKING_ONLY_NOT_APPROVAL_NOT_REVENUE');
});
