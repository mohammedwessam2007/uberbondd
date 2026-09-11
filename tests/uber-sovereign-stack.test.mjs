import test from 'node:test';
import assert from 'node:assert/strict';
import { UBER_SOVEREIGN_LAYERS, compileUberSovereignStack } from '../src/uber-sovereign-stack.mjs';

const evidenceForAll=(overrides={})=>Object.fromEntries(UBER_SOVEREIGN_LAYERS.map(layer=>[layer.id,{
  sourceVerified:true,
  testsPassed:true,
  controlOwned:true,
  providerReplaceable:true,
  stateExportable:true,
  authorityRoot:'UBERBOND',
  runtimeObserved:false,
  evidenceRefs:[`test:${layer.id.toLowerCase()}`],
  ...overrides[layer.id]
}]));

test('Uber sovereign registry contains the first-party independence spine without duplicate identities',()=>{
  const ids=UBER_SOVEREIGN_LAYERS.map(layer=>layer.id);
  assert.equal(new Set(ids).size,ids.length);
  for(const required of ['UBERMESH','UBERCLOUD','UBERGRAPH','UBERMIND','UBERDNA','UBERMEMORY','UBERVAULT','UBERRUNTIME','UBERCONTROL','UBERAGENTS','UBERMODELS','UBERRESEARCH','UBERECONOMY','UBERPAY','UBERMAIL','UBERDELIVERY']){
    assert.ok(ids.includes(required),`${required} missing`);
  }
  assert.ok(UBER_SOVEREIGN_LAYERS.every(layer=>Array.isArray(layer.sourceRefs)&&layer.sourceRefs.length>0));
});

test('source evidence cannot impersonate live sovereign runtime',()=>{
  const result=compileUberSovereignStack({layerEvidence:evidenceForAll()});
  assert.equal(result.ok,true);
  assert.equal(result.status,'UBER_SOVEREIGN_STACK_INDEPENDENCE_READY');
  assert.ok(result.runtimeBlockers.length>0);
  assert.ok(result.layers.filter(layer=>layer.runtimeProof).every(layer=>layer.runtimeReady===false));
  assert.equal(result.externalEffectAuthority,'NONE');
});

test('Uber sovereign stack refuses any provider as the authority root',()=>{
  const evidence=evidenceForAll({UBERCLOUD:{authorityRoot:'VERCEL'}});
  const result=compileUberSovereignStack({layerEvidence:evidence});
  assert.equal(result.ok,true,'source can still be proven while independence is refused');
  assert.notEqual(result.status,'UBER_SOVEREIGN_STACK_INDEPENDENCE_READY');
  assert.ok(result.independenceBlockers.includes('UBERCLOUD'));
  const cloud=result.layers.find(layer=>layer.id==='UBERCLOUD');
  assert.ok(cloud.reasonCodes.includes('uberbond-authority-root-required'));
});

test('stateful Uber layers cannot claim independence without exportability',()=>{
  const evidence=evidenceForAll({UBERMEMORY:{stateExportable:false}});
  const result=compileUberSovereignStack({layerEvidence:evidence});
  assert.ok(result.independenceBlockers.includes('UBERMEMORY'));
  const memory=result.layers.find(layer=>layer.id==='UBERMEMORY');
  assert.ok(memory.reasonCodes.includes('state-exportability-required'));
});

test('runtime ready requires explicit runtime observation for every runtime-bearing Uber layer',()=>{
  const overrides=Object.fromEntries(UBER_SOVEREIGN_LAYERS.filter(layer=>layer.runtimeProof).map(layer=>[layer.id,{runtimeObserved:true}]));
  const result=compileUberSovereignStack({layerEvidence:evidenceForAll(overrides)});
  assert.equal(result.status,'UBER_SOVEREIGN_STACK_RUNTIME_READY');
  assert.equal(result.runtimeBlockers.length,0);
});
