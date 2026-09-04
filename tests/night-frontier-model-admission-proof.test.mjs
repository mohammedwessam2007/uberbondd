import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyFrontierModelAdmission } from '../src/frontier-model-admission-proof.mjs';

const now = new Date('2026-09-03T04:00:00.000Z');

function validAdmission(overrides = {}) {
  return {
    modelId: 'example/model',
    revision: 'abc123',
    // The fixture had no provider and the module requires one, so the happy-path
    // test could never pass -- it arrived red and stayed red. The requirement is
    // right and is the half worth keeping: a model admission that cannot name
    // who served it is exactly the shape the routing law exists to refuse, since
    // fallback must preserve the actual provider identity in receipts.
    provider: 'self-hosted-vllm',
    provenanceRef: 'registry:huggingface:example/model@abc123',
    licenseId: 'apache-2.0',
    licenseClass: 'PERMISSIVE',
    permissionEligible: true,
    securityClean: true,
    securityEvidenceRef: 'security:scan-1',
    runtimeCompatible: true,
    runtimeEvidenceRef: 'runtime:vllm-1',
    hardwareFit: true,
    hardwareEvidenceRef: 'hardware:a10-1',
    runtimeCostKnown: true,
    totalCostUsd: 1.2,
    taskClass: 'CODE_REPAIR',
    benchmarkEvidenceRef: 'benchmark:code-repair-1',
    attempts: 10,
    successfulAttempts: 6,
    successRate: 0.6,
    costPerSuccessfulResultUsd: 0.2,
    observedAt: '2026-09-03T03:00:00.000Z',
    ...overrides
  };
}

test('complete model admission proof is integration-review eligible but grants no promotion authority', () => {
  const result = verifyFrontierModelAdmission(validAdmission(), { now });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'MODEL_ADMISSION_EVIDENCED');
  assert.equal(result.workerCompilationAuthority, 'ELIGIBLE_FOR_INTEGRATION_REVIEW');
  assert.equal(result.promotionAuthority, 'NONE');
  assert.equal(result.economics.costPerSuccessfulResultUsd, 0.2);
});

test('unknown revision fails closed', () => {
  const result = verifyFrontierModelAdmission(validAdmission({ revision: 'UNOBSERVED_REVISION' }), { now });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('exact-model-revision-required'));
});

test('license text without classified license decision fails closed', () => {
  const result = verifyFrontierModelAdmission(validAdmission({ licenseClass: 'UNKNOWN_OR_CUSTOM_REVIEW' }), { now });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('license-decision-required'));
});

test('security evidence cannot be omitted behind a boolean', () => {
  const result = verifyFrontierModelAdmission(validAdmission({ securityEvidenceRef: '' }), { now });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('security-clean-evidence-required'));
});

test('benchmark success rate must agree with exact attempt counts', () => {
  const result = verifyFrontierModelAdmission(validAdmission({ attempts: 10, successfulAttempts: 6, successRate: 0.9 }), { now });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('consistent-success-rate-required'));
});

test('token-cheap model cannot pass with inconsistent cost per successful result', () => {
  const result = verifyFrontierModelAdmission(validAdmission({ totalCostUsd: 1.2, successfulAttempts: 6, costPerSuccessfulResultUsd: 0.01 }), { now });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('cost-per-successful-result-required'));
});

test('zero successful attempts cannot manufacture finite economic fitness', () => {
  const result = verifyFrontierModelAdmission(validAdmission({ successfulAttempts: 0, successRate: 0, costPerSuccessfulResultUsd: 0 }), { now });
  assert.equal(result.ok, false);
  assert.ok(result.reasons.includes('cost-per-successful-result-required'));
});

test('stale or future evidence cannot be admitted', () => {
  const stale = verifyFrontierModelAdmission(validAdmission({ observedAt: '2026-07-01T00:00:00.000Z' }), { now });
  assert.equal(stale.ok, false);
  assert.ok(stale.reasons.includes('stale-evidence-rejected'));

  const future = verifyFrontierModelAdmission(validAdmission({ observedAt: '2026-09-04T00:00:00.000Z' }), { now });
  assert.equal(future.ok, false);
  assert.ok(future.reasons.includes('future-evidence-rejected'));
});

test('an admission that cannot name who served the model fails closed', () => {
  // The gap the happy path was hiding. Named as its own case so the requirement
  // is held up by a test that asserts it rather than by a fixture that happened
  // to omit it.
  for (const provider of [undefined, '', '   ', null]) {
    const result = verifyFrontierModelAdmission(validAdmission({ provider }), { now });
    assert.equal(result.ok, false, `provider=${JSON.stringify(provider)} was admitted`);
    assert.ok(result.reasons.includes('provider-identity-required'));
    assert.equal(result.identity, null, 'a refused admission must not still publish an identity');
    assert.equal(result.workerCompilationAuthority, 'NONE');
    assert.equal(result.promotionAuthority, 'NONE');
  }
});
