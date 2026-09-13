import test from 'node:test';
import assert from 'node:assert/strict';
import { FRONTIER_FINAL_RETAINED_TARGET } from '../src/frontier-intelligence-foundry.mjs';
import { FRONTIER_CANARY_RECORDS, buildFrontier1000CanaryInputs, runFrontier1000Canary } from '../scripts/frontier-intelligence-1000-canary.mjs';

test('frontier canary processes exactly 1000 distinct records end to end', () => {
  const result = runFrontier1000Canary();
  assert.equal(result.ok, true);
  assert.equal(result.status, 'FRONTIER_1000_CANARY_PASSED');
  assert.equal(result.receipt.syntheticFixture, true);
  assert.equal(result.receipt.requestedRecords, 1000);
  assert.equal(result.receipt.normalizedRecords, 1000);
  assert.equal(result.receipt.distinctRecords, 1000);
  assert.equal(result.receipt.retainedRecords, 1000);
  assert.equal(result.receipt.atomizedRecords, 1000);
  assert.equal(result.receipt.compiledExperiments, 1000);
  assert.equal(result.receipt.exactCount, true);
  assert.equal(result.receipt.allNoAuthority, true);
  assert.equal(result.receipt.realCorpusCompletionClaimed, false);
  assert.equal(result.receipt.immutableRealCorpusTarget, FRONTIER_FINAL_RETAINED_TARGET);
  assert.equal(FRONTIER_CANARY_RECORDS, 1000);
});

test('canary fixtures are all uniquely identifiable and cannot be mistaken for live harvested evidence', () => {
  const inputs = buildFrontier1000CanaryInputs();
  assert.equal(inputs.length, 1000);
  assert.equal(new Set(inputs.map(row => row.sourceUrl)).size, 1000);
  assert.equal(inputs.every(row => row.generatingOrAssistingModel === 'SYNTHETIC_TEST_FIXTURE'), true);
  assert.equal(inputs.every(row => row.tags.includes('synthetic-fixture')), true);
  assert.equal(inputs.every(row => row.publicSource === true), true);
});

test('the 1000-record canary never changes the real final-million completion law', () => {
  const result = runFrontier1000Canary();
  assert.equal(result.receipt.immutableRealCorpusTarget, 1_000_000);
  assert.equal(result.receipt.realCorpusCompletionClaimed, false);
  assert.equal(result.tournamentStatus, 'FRONTIER_FINAL_MILLION_INCOMPLETE');
});
