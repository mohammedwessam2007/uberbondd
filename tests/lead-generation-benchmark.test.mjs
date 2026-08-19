import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLeadGenerationBenchmark, LEAD_GENERATION_BENCHMARK } from '../src/lead-generation-benchmark.mjs';

test('benchmark contains a broad aspect matrix with source-backed rows', () => {
  const benchmark = buildLeadGenerationBenchmark();
  assert.ok(benchmark.rowCount >= 35);
  assert.ok(benchmark.categories.includes('Discovery'));
  assert.ok(benchmark.categories.includes('Enrichment'));
  assert.equal(benchmark.providerCalls, 0);
  assert.equal(benchmark.externalEffects, 0);
  assert.equal(benchmark.rows.length, LEAD_GENERATION_BENCHMARK.length);
  assert.ok(benchmark.rows.every(row => row.aspect && row.winner && row.clone && row.sources?.length));
});

test('benchmark policy keeps vendor data inside an owner-controlled boundary', () => {
  const benchmark = buildLeadGenerationBenchmark();
  assert.match(benchmark.policy.localClone, /do not copy/i);
  assert.match(benchmark.policy.linkedin, /No scraping/i);
  assert.match(benchmark.policy.outbound, /V9/i);
});
