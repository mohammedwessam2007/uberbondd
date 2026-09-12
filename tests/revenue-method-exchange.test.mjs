import test from 'node:test';
import assert from 'node:assert/strict';
import {REVENUE_METHOD_SEEDS,compileRevenueMethodExchange,recordRevenueMethodOutcome,reallocateRevenueMethods,spawnRevenueDerivatives,validateRevenueMethod} from '../src/revenue-method-exchange.mjs';

const method=(id,extra={})=>({id,buyer:'buyer',model:'subscription',asset:'asset',capabilityRefs:['cap:1'],evidenceRefs:['evidence:1'],authority:true,stopConditions:['stop if no cleared cash'],expectedClearedContribution:1000,founderMinutes:10,probability:.5,downside:20,reversibility:.9,evidenceQuality:.8,evidenceRevision:1,...extra});

test('catalog contains the ten public-recipe monetization surfaces',()=>{
  assert.equal(REVENUE_METHOD_SEEDS.length,10);
  assert.ok(REVENUE_METHOD_SEEDS.some(x=>x.id==='productized-saas'));
});

test('method gate refuses hype without evidence or authority',()=>{
  const r=validateRevenueMethod({id:'x',buyer:'b',model:'m',asset:'a',capabilityRefs:['c'],stopConditions:['s']});
  assert.equal(r.ok,false);
  assert.ok(r.reasons.includes('evidence-refs-required'));
  assert.ok(r.reasons.includes('authority-required'));
});

test('exchange bounds concurrency and ranks by revenue-decision economics',()=>{
  const r=compileRevenueMethodExchange({methods:[method('a',{expectedClearedContribution:200}),method('b',{expectedClearedContribution:2000}),method('c',{expectedClearedContribution:800}),method('d',{expectedClearedContribution:-1})],maxLive:2});
  assert.deepEqual(r.selected,['b','c']);
  assert.equal(r.ranked.find(x=>x.id==='a').decision,'PARKED');
});

test('vanity activity cannot promote without cleared payment and accepted delivery',()=>{
  const vanity=recordRevenueMethodOutcome({methodId:'x',attempts:100,acceptedDeliveries:0,clearedRevenue:0,founderMinutes:50});
  assert.equal(vanity.promotable,false);
  const paid=recordRevenueMethodOutcome({methodId:'x',attempts:3,acceptedDeliveries:1,clearedRevenue:500,cashCost:100,founderMinutes:10});
  assert.equal(paid.promotable,true);
  assert.equal(paid.contributionPerFounderMinute,40);
});

test('allocator kills zero-cash methods and routes capacity toward observed contribution density',()=>{
  const methods=[{id:'a'},{id:'b'},{id:'c'}];
  const outcomes=[recordRevenueMethodOutcome({methodId:'a',attempts:25,founderMinutes:10}),recordRevenueMethodOutcome({methodId:'b',attempts:3,acceptedDeliveries:1,clearedRevenue:300,cashCost:50,founderMinutes:5}),recordRevenueMethodOutcome({methodId:'c',attempts:3,acceptedDeliveries:1,clearedRevenue:500,cashCost:50,founderMinutes:30})];
  const r=reallocateRevenueMethods({methods,outcomes,maxLive:2,zeroSignalKillAttempts:20});
  assert.deepEqual(r.retired,['a']);
  assert.deepEqual(r.live,['b','c']);
});

test('proven delivery can spawn adjacent monetization surfaces but unproven work cannot',()=>{
  const no=spawnRevenueDerivatives({methodId:'voice-receptionist',outcome:recordRevenueMethodOutcome({methodId:'voice-receptionist'})});
  assert.equal(no.ok,false);
  const yes=spawnRevenueDerivatives({methodId:'voice-receptionist',outcome:recordRevenueMethodOutcome({methodId:'voice-receptionist',acceptedDeliveries:1,clearedRevenue:250,cashCost:20,founderMinutes:5})});
  assert.equal(yes.ok,true);
  assert.ok(yes.spawn.includes('workflow-template'));
  assert.ok(yes.spawn.includes('productized-saas'));
});
