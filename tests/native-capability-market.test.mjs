import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectNativeCapabilityMarket, retrieveNativeCapabilities } from '../src/native-capability-market.mjs';

test('native market activates six zero-effect exact-source capabilities',()=>{
  const market=inspectNativeCapabilityMarket({sourceRevision:'TEST',observedAt:'2026-09-13T10:30:00Z'});
  assert.equal(market.ok,true,JSON.stringify(market.failures));
  assert.equal(market.status,'NATIVE_CAPABILITY_MARKET_ACTIVE');
  assert.equal(market.state.total,6);
  assert.equal(market.state.active,6);
  assert.equal(market.state.failed,0);
  assert.equal(new Set(market.capabilities.map(x=>x.sourceHash)).size,6);
  for(const cap of market.capabilities){
    assert.equal(cap.sourceType,'NATIVE');
    assert.equal(cap.licenseClass,'NATIVE_OWNED');
    assert.equal(cap.externalEffectAuthority,'NONE');
    assert.deepEqual(cap.permissions,[]);
    assert.deepEqual(cap.credentialRequirements,[]);
    assert.deepEqual(cap.networkRequirements,[]);
    assert.deepEqual(cap.sideEffects,['NONE']);
    assert.equal(cap.verification.static.passed,true);
    assert.equal(cap.verification.semantic.passed,true);
    assert.equal(cap.verification.sandbox.passed,true);
    assert.match(cap.sourceHash,/^[0-9a-f]{64}$/);
  }
});

test('native retrieval covers declared atoms and fails closed for unknown atoms',()=>{
  const market=inspectNativeCapabilityMarket({sourceRevision:'TEST',observedAt:'2026-09-13T10:30:00Z'});
  const proof=retrieveNativeCapabilities({mission:'compile proof lineage',requiredAtomIds:['proof.compile'],market});
  assert.equal(proof.ok,true);
  assert.equal(proof.results[0].capability.id,'native:proof-dag');
  const missing=retrieveNativeCapabilities({mission:'unknown',requiredAtomIds:['capability.does-not-exist'],market});
  assert.equal(missing.ok,false);
  assert.deepEqual(missing.missingAtomIds,['capability.does-not-exist']);
});

test('native market never grants business or external effect authority',()=>{
  const market=inspectNativeCapabilityMarket({sourceRevision:'TEST'});
  assert.equal(market.businessEffectAuthority,'NONE');
  assert.equal(market.externalEffectAuthority,'NONE');
  const route=retrieveNativeCapabilities({mission:'robust strategy',requiredAtomIds:['strategy.minimax-regret'],market});
  assert.equal(route.businessEffectAuthority,'NONE');
  assert.equal(route.externalEffectAuthority,'NONE');
});
