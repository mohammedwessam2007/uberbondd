import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {
  evaluateBusinessModelFitness,
  compilePortfolioReview,
  logBusinessFitnessReceipt,
  BUSINESS_FITNESS_POLICY_VERSION
} from '../src/business-model-fitness.mjs';
import { createJobHandlers } from '../src/job-handlers.mjs';

const date = new Date('2026-08-18T12:00:00.000Z');

function summary(overrides = {}) {
  return { metrics: { clearedPaymentCount: 3, netCashImpactCents: 30000, knownContributionMarginCents: 24000, contributionProfitPerOwnerMinuteCents: 120, contributionMarginStatus: 'KNOWN_FOR_CLEARED_PAYMENTS', ...overrides } };
}

test('missing learning evidence stays not measured and never becomes a kill', () => {
  const result = evaluateBusinessModelFitness({ modelId: 'lane-a', date });
  assert.equal(result.status, 'NOT_MEASURED');
  assert.equal(result.decision, 'HOLD_FOR_EVIDENCE');
  assert.equal(result.kill.status, 'NOT_ELIGIBLE');
  assert.equal(result.capital, undefined);
});

test('small samples hold for evidence even when one outcome looks bad', () => {
  const result = evaluateBusinessModelFitness({ modelId: 'lane-a', sampleSizeMin: 3, learningSummary: summary({ clearedPaymentCount: 1, netCashImpactCents: -100 }), date });
  assert.equal(result.status, 'INSUFFICIENT_SAMPLE');
  assert.equal(result.decision, 'HOLD_FOR_EVIDENCE');
  assert.equal(result.kill.automatic, false);
});

test('measured positive economics produce expand review, not autonomous allocation', () => {
  const result = evaluateBusinessModelFitness({ modelId: 'lane-a', learningSummary: summary(), date });
  assert.equal(result.status, 'MEASURED_LOCAL_OUTCOMES');
  assert.equal(result.decision, 'EXPAND_REVIEW');
  assert.equal(result.capital.allocation, 'NOT_AUTHORIZED');
});

test('measured negative economics produce shrink-or-kill review with owner authority', () => {
  const result = evaluateBusinessModelFitness({ modelId: 'lane-a', learningSummary: summary({ netCashImpactCents: -100, knownContributionMarginCents: -20, contributionProfitPerOwnerMinuteCents: -1 }), thresholds: { minContributionProfitPerOwnerMinuteCents: 10 }, date });
  assert.equal(result.decision, 'SHRINK_OR_KILL_REVIEW');
  assert.equal(result.kill.status, 'KILL_CANDIDATE_REQUIRES_OWNER_REVIEW');
  assert.equal(result.kill.automatic, false);
});

test('unknown metrics do not create guessed failure or success', () => {
  const result = evaluateBusinessModelFitness({ modelId: 'lane-a', learningSummary: summary({ netCashImpactCents: null, knownContributionMarginCents: null, contributionProfitPerOwnerMinuteCents: null }), date });
  assert.equal(result.decision, 'EXPAND_REVIEW');
  assert.deepEqual(result.reasonCodes, ['no-measured-failure-flag']);
  assert.equal(result.metrics.netCashImpactCents, null);
});

test('portfolio review is bounded and has no automatic action', () => {
  const result = compilePortfolioReview({ fitnessResults: [evaluateBusinessModelFitness({ modelId: 'a', learningSummary: summary(), date }), evaluateBusinessModelFitness({ modelId: 'b', date })], date });
  assert.equal(result.status, 'REVIEW_READY');
  assert.equal(result.rows.length, 2);
  assert.ok(result.rows.every(row => row.automaticAction === 'NONE'));
  assert.equal(result.ownerAuthority, 'REQUIRED_FOR_EXPAND_SHRINK_KILL');
});

test('handlers and receipts reuse auditLog without claiming revenue or killing a model', async () => {
  const calls = [];
  const handlers = createJobHandlers({ store: { log: async (type, detail) => { calls.push({ type, detail }); return { id: type }; } }, cfg: {} });
  const result = await handlers['prometheus.fitness.evaluate']({ modelId: 'lane-a', learningSummary: summary(), date });
  assert.equal(result.ok, true);
  const portfolio = await handlers['prometheus.fitness.portfolio']({ fitnessResults: [result], date });
  assert.equal(portfolio.ok, true);
  assert.deepEqual(calls.map(call => call.type), ['business_model_fitness', 'business_model_portfolio_review']);
});

test('fitness receipts omit raw outcomes and module has no provider/I-O boundary', async () => {
  const calls = [];
  const result = evaluateBusinessModelFitness({ modelId: 'a', learningSummary: summary(), date });
  await logBusinessFitnessReceipt({ log: async (type, detail) => { calls.push({ type, detail }); return { id: 'x' }; } }, 'business_model_fitness', result);
  assert.equal(calls[0].detail.learningSummary, undefined);
  assert.equal(calls[0].detail.policyVersion, BUSINESS_FITNESS_POLICY_VERSION);
  const source = await fs.readFile(new URL('../src/business-model-fitness.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request|readFile\(|writeFile\(|spawn\(|exec\(|process\.env/);
});
