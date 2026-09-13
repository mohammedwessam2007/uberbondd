import test from 'node:test';
import assert from 'node:assert/strict';
import { compileEconomicReliabilityInput } from '../src/economic-reliability-input-builder.mjs';
import { listCommercialOpportunityCatalog } from '../src/commercial-opportunity-catalog.mjs';

const NOW=new Date('2026-09-14T12:00:00Z');

test('commercial catalog breadth becomes reliability candidate breadth',()=>{
  const catalog=listCommercialOpportunityCatalog();
  const input=compileEconomicReliabilityInput({date:NOW});
  assert.equal(input.ok,true);
  assert.equal(input.catalogRouteCount,catalog.length);
  assert.equal(input.activeRouteCount,0);
  assert.equal(input.candidateRouteCount,catalog.length);
  assert.equal(input.candidateRoutes.length,catalog.length);
  assert.equal(new Set(input.candidateRoutes.map(x=>x.routeId)).size,catalog.length);
});

test('catalog existence never mints dependency, policy, execution, or probability truth',()=>{
  const input=compileEconomicReliabilityInput({date:NOW});
  for(const route of input.candidateRoutes){
    assert.equal(route.dependencyReceipt,null);
    assert.equal(route.policyCleared,false);
    assert.equal(route.executableNow,false);
    assert.equal(Object.hasOwn(route,'successProbabilityLowerBound'),false);
  }
  assert.equal(input.externalEffectAuthority,'NONE');
  assert.equal(input.moneyAuthority,'NONE');
});

test('observed route state can promote a catalog route into active input without creating probability',()=>{
  const first=listCommercialOpportunityCatalog()[0];
  const routeId=`commercial:${first.id}`;
  const input=compileEconomicReliabilityInput({
    date:NOW,
    routeStates:[{routeId,active:true,policyCleared:true,executableNow:true,regimeId:'live-regime'}]
  });
  assert.equal(input.activeRoutes.length,1);
  assert.equal(input.activeRoutes[0].routeId,routeId);
  assert.equal(input.activeRoutes[0].policyCleared,true);
  assert.equal(input.activeRoutes[0].executableNow,true);
  assert.equal(Object.hasOwn(input.activeRoutes[0],'successProbabilityLowerBound'),false);
});

test('trials are carried as evidence inputs rather than converted into claims by the builder',()=>{
  const trial={trialId:'t1',routeId:'commercial:x',providerOrigin:true,settlementState:'CLEARED'};
  const input=compileEconomicReliabilityInput({date:NOW,trials:[trial]});
  assert.deepEqual(input.trials,[trial]);
  assert.equal(input.trialCount,1);
});
