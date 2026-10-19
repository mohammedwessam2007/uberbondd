import test from 'node:test';
import assert from 'node:assert/strict';
import {runPhoenixCosCommand} from '../scripts/phoenix-cos-operator.mjs';

test('Wave 9 unsupported-action boundary returns MISSING_CAPABILITY, not a fabricated execution',()=>{
  const denied=runPhoenixCosCommand(['invoke','customer.outreach.send',JSON.stringify({recipient:'not-used'})]);
  assert.equal(denied.ok,false);
  assert.equal(denied.status,'PHOENIX_COS_REFUSED');
  assert.equal(denied.capabilityState,'MISSING_CAPABILITY');
  assert.equal(denied.sourceProposalLink,'phoenix-wave9-0001');
  assert.equal(denied.externalEffectLedger.providerCalls,0);
  assert.equal(denied.externalEffectLedger.messages,0);
  assert.equal(denied.externalEffectLedger.productionMutations,0);
});

test('missing known-alias or unregistered supplier never silently routes to closest available native executor',()=>{
  const denied=runPhoenixCosCommand(['invoke','phoenix-wave10-0001','{}']);
  assert.equal(denied.ok,false);
  assert.equal(denied.capabilityState,'MISSING_CAPABILITY');
  assert.equal(denied.externalEffectAuthority,'NONE');
  assert.equal(denied.businessEffectAuthority,'NONE');
});
