import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDomainObservation } from '../src/domain-purpose-plan.mjs';

test('generated DNS expectations cannot verify themselves', () => {
  const result = evaluateDomainObservation({
    planRow: { purpose: 'APP_PRODUCT', host: 'uberbond.agency', state: 'CONFIGURED', blockedRecordCount: 0 },
    observation: {
      observedAt: '2026-09-01T23:00:00.000Z',
      status: 'GREEN',
      tlsVerified: true,
      provenance: 'OBSERVED_DNS',
      generatedExpectedRecords: true
    },
    now: '2026-09-02T00:00:00.000Z'
  });
  assert.notEqual(result.state, 'VERIFIED');
  assert.ok(result.reasonCodes.includes('generated-expectations-are-not-observed-proof'));
});
