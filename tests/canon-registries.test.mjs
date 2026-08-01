import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadOfferPortfolio, loadExperimentRegistry, loadGateRegistry, loadMessageVariantRegistry,
  loadAttributionContract, loadRevalidationQueue, loadResearchSeedCorpus, isPendingRevalidation
} from '../src/canon-registries.mjs';

test('every versioned registry loads and matches its recorded manifest hash', () => {
  assert.ok(Array.isArray(loadOfferPortfolio()) && loadOfferPortfolio().length > 0);
  assert.ok(loadExperimentRegistry().experiments);
  assert.ok(Array.isArray(loadGateRegistry()) && loadGateRegistry().length > 0);
  assert.ok(Array.isArray(loadMessageVariantRegistry()) && loadMessageVariantRegistry().length > 0);
  assert.ok(loadAttributionContract().required_chain);
  assert.ok(Array.isArray(loadRevalidationQueue()) && loadRevalidationQueue().length > 0);
  assert.ok(Array.isArray(loadResearchSeedCorpus().opportunities) && loadResearchSeedCorpus().opportunities.length > 0);
});

test('every revalidation-queue company is recorded as not send-eligible pending live revalidation', () => {
  for (const row of loadRevalidationQueue()) {
    assert.equal(row.send_eligible, false, row.company_key);
  }
});

test('isPendingRevalidation finds a known company_key', () => {
  const [first] = loadRevalidationQueue();
  assert.equal(isPendingRevalidation(first.company_key), true);
  assert.equal(isPendingRevalidation('definitely-not-in-the-queue.example'), false);
});
