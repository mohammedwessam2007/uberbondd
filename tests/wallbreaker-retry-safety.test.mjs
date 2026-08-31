import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWallFailure, deriveCountermoves } from '../src/wallbreaker.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

test('classified uncertain provider failure cannot regain identical-retry eligibility inside countermoves', () => {
  const first = classifyWallFailure({
    providerUnavailable: true,
    failedSignature: 'provider-mechanism-1',
    outcomeUncertain: true,
    evidenceRefs: ['provider-timeout-after-request']
  });
  assert.equal(first.failureClass, 'PROVIDER_FAILURE');
  assert.equal(first.safeToRetrySameMechanism, false);

  const second = classifyWallFailure(first);
  assert.equal(second.safeToRetrySameMechanism, false);

  const counters = deriveCountermoves(first);
  assert.equal(counters.failure.safeToRetrySameMechanism, false);
  assert.ok(counters.forbidden.includes('blind-identical-retry'));
  assert.deepEqual(counters.externalEffectLedger, ZERO_EXTERNAL_EFFECTS);
});
