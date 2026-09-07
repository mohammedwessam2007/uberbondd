import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSovereignControlView } from '../api/sovereign-control.mjs';

test('sovereign control reaches decision information without widening authority', () => {
  const view = buildSovereignControlView({
    information: {
      voi: {
        expectedDecisionImprovement: 8,
        acquisitionCost: 1,
        delayCost: 1,
        optionDecay: 1,
        unit: 'bounded-decision-units',
        comparabilityBasis: 'All terms are supplied on one caller-owned scale.',
        information: 'one reversible experiment'
      },
      prediction: {
        initialEvidenceWeight: 1,
        observedAt: '2026-09-01T00:00:00.000Z',
        halfLifeMs: 24 * 60 * 60 * 1000
      },
      shelfLife: {
        validFrom: '2026-09-01T00:00:00.000Z',
        expiresAt: '2026-09-10T00:00:00.000Z'
      },
      minimumEvidenceWeight: 0.01
    },
    now: new Date('2026-09-03T00:00:00.000Z')
  });
  assert.equal(view.decisionInformation.ok, true, JSON.stringify(view.decisionInformation.reasonCodes));
  assert.equal(view.decisionInformation.recommendation, 'ACQUIRE_INFORMATION');
  assert.equal(view.decisionInformation.highestRung, 'RECOMMENDATION');
  assert.equal(view.decisionInformation.businessEffectAuthority, 'NONE');
  assert.equal(view.highestRung, 'RECOMMENDATION');
  assert.equal(view.businessEffectAuthority, 'NONE');
});

test('sovereign control refuses to scalarize incomparable information costs', () => {
  const view = buildSovereignControlView({
    information: {
      expectedDecisionImprovement: 8,
      acquisitionCost: 1,
      delayCost: 1,
      optionDecay: 1
    },
    now: new Date('2026-09-03T00:00:00.000Z')
  });
  assert.equal(view.decisionInformation.ok, false);
  assert.ok(view.decisionInformation.reasonCodes.includes('valid-value-of-information-required'));
  assert.equal(view.businessEffectAuthority, 'NONE');
});
