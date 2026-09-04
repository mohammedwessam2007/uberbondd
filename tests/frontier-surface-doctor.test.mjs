import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectFrontierSurface } from '../scripts/frontier-surface-doctor.mjs';

test('frontier surface doctor exposes only operator-eligible planning surfaces with zero authority', () => {
  const result = inspectFrontierSurface();
  assert.equal(result.ok, true, JSON.stringify(result.invalid));
  assert.equal(result.surfaceCount, 6);
  assert.equal(result.surfaces.length, 6);
  assert.ok(result.surfaces.every(surface => surface.exports.length > 0));
  assert.ok(result.surfaces.every(surface => surface.functions.length > 0));
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.equal(result.externalEffectAuthority, 'NONE');
  assert.deepEqual(result.externalEffectLedger, {
    providerCalls: 0,
    messages: 0,
    purchases: 0,
    deployments: 0,
    credentialChanges: 0,
    dnsChanges: 0,
    productionMutations: 0,
    spendCents: 0
  });
  assert.match(result.truthBoundary, /ACTIVATION_GATED_FRONTIER_GENOME_AND_OPEN_MODEL_MODULES_REMAIN_GATED/);
  assert.match(result.truthBoundary, /NOT_ACTIVATION/);
});
