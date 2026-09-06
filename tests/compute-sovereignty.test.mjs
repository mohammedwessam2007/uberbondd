import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeComputeOffer,
  compileComputeReusePlan,
  allocateSovereignCompute
} from '../src/compute-sovereignty.mjs';

const base = {
  provider: 'local',
  model: 'open-model-a',
  revision: 'sha256:abc',
  rightsClass: 'LOCAL_OWNED',
  acquisitionMode: 'LOCAL_OWNED',
  sourceRef: 'receipt:local-runtime',
  verifiedAt: '2026-09-05T18:00:00Z',
  contextTokens: 128000,
  usableTokens: 5_000_000,
  costCents: 0,
  quality: 0.75,
  reliability: 0.9,
  latencyScore: 0.8,
  taskClasses: ['general', 'research']
};

test('trial cycling and quota evasion never become admissible compute supply', () => {
  for (const acquisitionMode of ['TRIAL_CYCLING', 'IDENTITY_FARMING', 'QUOTA_EVASION', 'LEAKED_CREDENTIAL', 'BILLING_BYPASS']) {
    const result = normalizeComputeOffer({ ...base, acquisitionMode });
    assert.equal(result.ok, false);
    assert.ok(result.reasonCodes.some(code => code.includes('forbidden-compute-acquisition')));
  }
});

test('allocator prefers lawful zero-cost capacity before paid supply', () => {
  const result = allocateSovereignCompute({
    taskClass: 'research',
    requiredTokens: 3_000_000,
    minimumQuality: 0.7,
    minimumReliability: 0.8,
    offers: [
      { ...base },
      {
        ...base,
        provider: 'frontier-api',
        model: 'frontier-b',
        revision: '2026-09-05',
        rightsClass: 'PAID_API',
        acquisitionMode: 'PAID_API',
        sourceRef: 'official:provider-pricing',
        usableTokens: 10_000_000,
        costCents: 5000,
        quality: 0.99,
        reliability: 0.99,
        latencyScore: 0.95
      }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'COMPUTE_CAPACITY_ALLOCATED');
  assert.equal(result.totalCostCents, 0);
  assert.equal(result.zeroCostAllocatedTokens, 3_000_000);
  assert.equal(result.allocations[0].provider, 'local');
});

test('reuse plan reduces fresh inference demand without claiming new quota', () => {
  const result = compileComputeReusePlan({
    rawInputTokens: 1_000_000,
    cacheHitTokens: 300_000,
    reusableContextTokens: 200_000,
    compressibleTokens: 400_000,
    compressionRatio: 0.25
  });
  assert.equal(result.ok, true);
  assert.equal(result.reusedTokens, 500_000);
  assert.equal(result.estimatedFreshInputTokens, 200_000);
  assert.equal(result.effectiveAvoidedTokens, 800_000);
  assert.match(result.truthBoundary, /DO NOT CREATE PROVIDER QUOTA|DO NOT CREATE/i);
});

test('free capacity claims still require provenance, revision and rights', () => {
  const result = normalizeComputeOffer({ ...base, sourceRef: '', verifiedAt: '', revision: '' });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('provider-model-revision-required'));
  assert.ok(result.reasonCodes.includes('provenance-and-verification-time-required'));
});
