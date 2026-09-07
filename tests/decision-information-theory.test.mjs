import test from 'node:test';
import assert from 'node:assert/strict';
import {
  valueOfInformation,
  predictionHalfLife,
  decisionShelfLife,
  compileDecisionInformation
} from '../src/decision-information-theory.mjs';

test('VOI refuses scalar arithmetic without an explicit common unit and comparability basis', () => {
  const missing = valueOfInformation({
    expectedDecisionImprovement: 10,
    acquisitionCost: 2,
    delayCost: 1,
    optionDecay: 1
  });
  assert.equal(missing.ok, false);
  assert.ok(missing.reasonCodes.includes('common-comparable-unit-required'));
  assert.ok(missing.reasonCodes.includes('comparability-basis-required'));
  assert.equal(missing.businessEffectAuthority, 'NONE');
});

test('positive VOI recommends information but never creates action authority', () => {
  const out = valueOfInformation({
    expectedDecisionImprovement: 12,
    acquisitionCost: 2,
    delayCost: 3,
    optionDecay: 1,
    unit: 'usd-equivalent-opportunity-cost',
    comparabilityBasis: 'Caller supplied all terms in the same explicit opportunity-cost unit.',
    information: 'One reversible buyer interview'
  });
  assert.equal(out.ok, true);
  assert.equal(out.netValue, 6);
  assert.equal(out.recommendation, 'ACQUIRE_INFORMATION');
  assert.equal(out.highestRung, 'RECOMMENDATION');
  assert.equal(out.businessEffectAuthority, 'NONE');
});

test('non-positive VOI reaches ENOUGH instead of rewarding endless research', () => {
  const out = valueOfInformation({
    expectedDecisionImprovement: 4,
    acquisitionCost: 1,
    delayCost: 2,
    optionDecay: 2,
    unit: 'decision-quality-points',
    comparabilityBasis: 'Founder-declared single decision-quality scale for this bounded comparison.'
  });
  assert.equal(out.ok, true);
  assert.equal(out.recommendation, 'ENOUGH');
  assert.match(out.state, /^ENOUGH__/);
  assert.equal(out.netValue, -1);
});

test('prediction half-life decays evidence weight without pretending it changed probability', () => {
  const out = predictionHalfLife({
    initialEvidenceWeight: 0.8,
    observedAt: '2026-09-01T00:00:00.000Z',
    halfLifeMs: 24 * 60 * 60 * 1000,
    now: new Date('2026-09-03T00:00:00.000Z')
  });
  assert.equal(out.ok, true);
  assert.ok(Math.abs(out.remainingEvidenceWeight - 0.2) < 1e-12);
  assert.match(out.truthBoundary, /NOT_A_REVISED_FORECAST_PROBABILITY/);
});

test('prediction half-life refuses future observations and invalid half lives', () => {
  const out = predictionHalfLife({
    observedAt: '2026-09-04T00:00:00.000Z',
    halfLifeMs: 0,
    now: new Date('2026-09-03T00:00:00.000Z')
  });
  assert.equal(out.ok, false);
  assert.ok(out.reasonCodes.includes('positive-half-life-required'));
  assert.ok(out.reasonCodes.includes('now-cannot-precede-observation'));
});

test('decision shelf life distinguishes not-yet-valid, active and expired packets', () => {
  const base = { validFrom: '2026-09-02T00:00:00.000Z', expiresAt: '2026-09-04T00:00:00.000Z' };
  assert.equal(decisionShelfLife({ ...base, now: new Date('2026-09-01T00:00:00.000Z') }).freshness, 'NOT_YET_VALID');
  assert.equal(decisionShelfLife({ ...base, now: new Date('2026-09-03T00:00:00.000Z') }).freshness, 'ACTIVE');
  assert.equal(decisionShelfLife({ ...base, now: new Date('2026-09-04T00:00:00.000Z') }).freshness, 'EXPIRED');
});

test('expired decisions override positive VOI and require rebuild rather than more waiting', () => {
  const voi = valueOfInformation({
    expectedDecisionImprovement: 10,
    acquisitionCost: 1,
    delayCost: 1,
    optionDecay: 1,
    unit: 'bounded-decision-units',
    comparabilityBasis: 'All values supplied on one caller-owned scale.'
  });
  const shelfLife = decisionShelfLife({
    validFrom: '2026-09-01T00:00:00.000Z',
    expiresAt: '2026-09-02T00:00:00.000Z',
    now: new Date('2026-09-03T00:00:00.000Z')
  });
  const out = compileDecisionInformation({ voi, shelfLife });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'REBUILD_DECISION');
  assert.equal(out.highestRung, 'RECOMMENDATION');
  assert.equal(out.businessEffectAuthority, 'NONE');
});

test('caller-declared minimum evidence weight can force refresh without changing forecast probability', () => {
  const voi = valueOfInformation({
    expectedDecisionImprovement: 3,
    acquisitionCost: 1,
    delayCost: 0,
    optionDecay: 0,
    unit: 'bounded-decision-units',
    comparabilityBasis: 'All values supplied on one caller-owned scale.'
  });
  const prediction = predictionHalfLife({
    initialEvidenceWeight: 1,
    observedAt: '2026-09-01T00:00:00.000Z',
    halfLifeMs: 24 * 60 * 60 * 1000,
    now: new Date('2026-09-04T00:00:00.000Z')
  });
  const out = compileDecisionInformation({ voi, prediction, minimumEvidenceWeight: 0.25 });
  assert.equal(out.ok, true);
  assert.equal(out.status, 'REFRESH_EVIDENCE');
  assert.equal(out.recommendation, 'REFRESH_EVIDENCE_BEFORE_RELYING_ON_FORECAST');
  assert.equal(out.businessEffectAuthority, 'NONE');
});
