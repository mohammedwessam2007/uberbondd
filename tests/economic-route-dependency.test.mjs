import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileEconomicRouteDependencyReceipt,
  validateEconomicRouteDependencyReceipt,
  buildEconomicDependencyComponents
} from '../src/economic-route-dependency.mjs';

function receipt(routeId,overrides={}){
  const factors={
    demandSource:`demand-${routeId}`,
    buyerPool:`buyers-${routeId}`,
    distributionRail:`distribution-${routeId}`,
    paymentRail:`payment-${routeId}`,
    fulfillmentRail:`fulfillment-${routeId}`,
    platformDependency:`platform-${routeId}`,
    providerDependency:`provider-${routeId}`,
    ...overrides
  };
  const factorEvidence=Object.fromEntries(Object.keys(factors).map(k=>[k,[`e:${routeId}:${k}`]]));
  return compileEconomicRouteDependencyReceipt({routeId,factors,factorEvidence,observedAt:new Date('2026-09-14T12:00:00Z')});
}

test('missing factor evidence is refused',()=>{
  const factors={demandSource:'x',buyerPool:'y',distributionRail:'z',paymentRail:'p',fulfillmentRail:'f',platformDependency:'q',providerDependency:'r'};
  const factorEvidence=Object.fromEntries(Object.keys(factors).map(k=>[k,[`e:${k}`]]));
  delete factorEvidence.paymentRail;
  const result=compileEconomicRouteDependencyReceipt({routeId:'r1',factors,factorEvidence});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('factor-evidence-required:paymentRail'));
});

test('tampered receipt digest is rejected',()=>{
  const compiled=receipt('r1');
  const tampered=structuredClone(compiled.receipt);
  tampered.factors.paymentRail='tampered';
  const result=validateEconomicRouteDependencyReceipt(tampered,'r1');
  assert.equal(result.ok,false);
  assert.deepEqual(result.reasonCodes,['dependency-receipt-digest-mismatch']);
});

test('shared payment rail creates one dependency component',()=>{
  const a=receipt('a',{paymentRail:'paypal'}).receipt;
  const b=receipt('b',{paymentRail:'paypal'}).receipt;
  const graph=buildEconomicDependencyComponents([{routeId:'a',dependencyReceipt:a},{routeId:'b',dependencyReceipt:b}]);
  assert.equal(graph.components.length,1);
  assert.equal(graph.sharedEdges[0].factor,'paymentRail');
});

test('transitive hidden correlation collapses A B C into one component',()=>{
  const a=receipt('a',{paymentRail:'paypal'}).receipt;
  const b=receipt('b',{paymentRail:'paypal',buyerPool:'shared-buyers'}).receipt;
  const c=receipt('c',{buyerPool:'shared-buyers'}).receipt;
  const graph=buildEconomicDependencyComponents([{routeId:'a',dependencyReceipt:a},{routeId:'b',dependencyReceipt:b},{routeId:'c',dependencyReceipt:c}]);
  assert.equal(graph.components.length,1);
  assert.equal(graph.components[0].length,3);
});

test('fully disjoint dependency fingerprints remain separate',()=>{
  const graph=buildEconomicDependencyComponents(['a','b','c'].map(id=>({routeId:id,dependencyReceipt:receipt(id).receipt})));
  assert.equal(graph.components.length,3);
  assert.equal(graph.sharedEdges.length,0);
});
