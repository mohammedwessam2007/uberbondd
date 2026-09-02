import test from 'node:test';
import assert from 'node:assert/strict';
import { capabilityFitness } from '../src/capability-genome-runtime.mjs';

function valid(overrides = {}) {
  return {
    expectedContributionProfitCents: 10000,
    taskSuccess: 0.8,
    reliability: 0.9,
    repeatability: 0.8,
    founderMinuteReduction: 0.7,
    strategicLeverage: 0.6,
    portability: 0.9,
    reversibility: 0.9,
    securityDownside: 0.2,
    failureProbability: 0.1,
    monetaryCostCents: 25,
    maintenanceBurden: 0.1,
    contextBurden: 0.1,
    dependencyBurden: 0.1,
    providerLockIn: 0.1,
    licenseRisk: 0.1,
    blastRadius: 0.1,
    evidenceConfidence: 0.7,
    ...overrides
  };
}

test('economic fitness rejects probability/quality values outside [0,1]', () => {
  for (const [key, value] of [['taskSuccess', 1.01], ['reliability', -0.01], ['repeatability', 2], ['evidenceConfidence', 1.2]]) {
    const result = capabilityFitness(valid({ [key]: value }));
    assert.equal(result.ok, false, key);
    assert.equal(result.status, 'ECONOMIC_PRIOR_REJECTED', key);
    assert.equal(result.score, null, key);
    assert.ok(result.reasonCodes.some(code => code.startsWith(`${key}-`)), key);
  }
});

test('economic fitness rejects negative burdens and monetary cost', () => {
  for (const key of ['monetaryCostCents', 'maintenanceBurden', 'contextBurden', 'dependencyBurden']) {
    const result = capabilityFitness(valid({ [key]: -1 }));
    assert.equal(result.ok, false, key);
    assert.equal(result.status, 'ECONOMIC_PRIOR_REJECTED', key);
    assert.equal(result.score, null, key);
    assert.ok(result.reasonCodes.includes(`${key}-must-be-non-negative`), key);
  }
});

test('valid economic fitness remains an estimated prior, never revenue truth', () => {
  const result = capabilityFitness(valid());
  assert.equal(result.ok, true);
  assert.equal(result.status, 'ECONOMIC_PRIOR_ESTIMATED');
  assert.equal(result.evidenceClass, 'ESTIMATED_PRIOR_NOT_REVENUE');
  assert.ok(Number.isFinite(result.score));
  assert.ok(result.score >= 0);
});
