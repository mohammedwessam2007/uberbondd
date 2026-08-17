import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreOpportunity } from '../src/opportunity-registry.mjs';
import { compileExperiment, EXPERIMENT_COMPILER_POLICY_VERSION } from '../src/experiment-compiler.mjs';
import { compileOfferPacket } from '../src/offer-compiler.mjs';

const monday = new Date('2026-07-13T10:00:00.000Z');

function scored(overrides = {}) {
  return scoreOpportunity({ candidate: { id: 'opp-1', name: 'Test Opportunity', ...overrides }, date: monday });
}

test('malformed input is rejected cleanly', () => {
  const result = compileExperiment({ scoredOpportunity: null, date: monday });
  assert.equal(result.ok, false);
});

test('a failed scoreOpportunity result cannot be compiled into an experiment', () => {
  const failed = scoreOpportunity({ candidate: null, date: monday });
  const result = compileExperiment({ scoredOpportunity: failed, date: monday });
  assert.equal(result.ok, false);
});

test('maxBudgetUsd defaults to zero -- no real spend is ever authorized by default', () => {
  const result = compileExperiment({ scoredOpportunity: scored(), date: monday });
  assert.equal(result.maxBudgetUsd, 0);
});

test('a negative or malformed maxBudgetUsd is clamped to zero, never negative', () => {
  const result = compileExperiment({ scoredOpportunity: scored(), date: monday, maxBudgetUsd: -50 });
  assert.equal(result.maxBudgetUsd, 0);
});

test('without a matching offerPacket, the smallest sellable product is honestly generic, never fabricated', () => {
  const result = compileExperiment({ scoredOpportunity: scored(), date: monday });
  assert.equal(result.smallestSellableProduct.source, 'generic');
  assert.equal(result.smallestSellableProduct.priceUsd, null);
  assert.equal(result.priceHypothesis.status, 'NOT_CONFIGURED');
});

test('a real offerPacket composes directly into the experiment\'s smallest sellable product', () => {
  const offerPacket = compileOfferPacket({
    prospect: { id: 'p1', issue: { title: 't', evidenceUrl: 'https://x', evidenceExcerpt: 'x', confidence: 0.9, safeForOutreach: true } },
    campaign: { approved: true },
    cfg: { revenue: { fullAuditPrice: 49, fullAuditCheckoutUrl: 'https://shop.test/buy' } },
    product: 'full', date: monday
  });
  const result = compileExperiment({ scoredOpportunity: scored(), offerPacket, date: monday });
  assert.equal(result.smallestSellableProduct.source, 'offer-compiler');
  assert.equal(result.priceHypothesis.amountUsd, 49);
});

test('proofRequired reflects the real missing criteria from the scored opportunity', () => {
  const result = compileExperiment({ scoredOpportunity: scored(), date: monday });
  assert.match(result.proofRequired, /Evidence for:/);
  assert.ok(result.evidenceRequirements.length > 0);
});

test('distributionRoute is always unassigned at compile time -- the allocator decides it separately', () => {
  const result = compileExperiment({ scoredOpportunity: scored(), date: monday });
  assert.match(result.distributionRoute, /UNASSIGNED/);
});

test('authorityRequirements always references the V9 consequence boundary, never claims its own authority', () => {
  const result = compileExperiment({ scoredOpportunity: scored(), date: monday });
  assert.ok(result.authorityRequirements.some(req => req.includes('consequence-boundary')));
});

test('the experimentId is deterministic for the same opportunity id', () => {
  const a = compileExperiment({ scoredOpportunity: scored(), date: monday });
  const b = compileExperiment({ scoredOpportunity: scored(), date: monday });
  assert.equal(a.experimentId, b.experimentId);
});

test('expectedFounderMinutes is never fabricated', () => {
  const result = compileExperiment({ scoredOpportunity: scored(), date: monday });
  assert.equal(result.expectedFounderMinutes, null);
});

test('policyVersion is stable', () => {
  const result = compileExperiment({ scoredOpportunity: scored(), date: monday });
  assert.equal(result.policyVersion, EXPERIMENT_COMPILER_POLICY_VERSION);
});
