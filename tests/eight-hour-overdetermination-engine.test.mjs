import test from 'node:test';
import assert from 'node:assert/strict';
import { compileEightHourOverdetermination, compileMoneyAttempt, MONEY_ROUTE_AXES } from '../src/eight-hour-overdetermination-engine.mjs';

const readyStages = (suffix='x') => Object.fromEntries(['OPPORTUNITY','OFFER','DISTRIBUTION','PAYMENT','FULFILLMENT','ACCEPTANCE','RENEWAL','RECONCILIATION'].map(stage => [stage,{status:'READY',railId:`${stage.toLowerCase()}-${suffix}`,evidenceRefs:['obs:1']} ]));
const attempt = (i, extra={}) => ({
  id:`a${i}`,
  mechanismFamily:`family-${i}`,
  buyerPool:`buyer-${i}`,
  acquisitionChannel:`channel-${i}`,
  offerType:`offer-${i}`,
  paymentRail:`pay-${i}`,
  fulfillmentMode:`fulfill-${i}`,
  geography:`geo-${i}`,
  pricingModel:`price-${i}`,
  stages:readyStages(i),
  observedTrials:20,
  observedSuccesses:10,
  successProbability:.5,
  evidenceQuality:1,
  minutesToLaunch:30,
  capitalAtRisk:0,
  expectedNetContribution:100,
  ...extra
});

test('route lattice is very large but explicitly archetypal',()=>{
  const product=Object.values(MONEY_ROUTE_AXES).reduce((p,v)=>p*v.length,1);
  const out=compileEightHourOverdetermination({attempts:[]});
  assert.equal(out.internalRouteArchetypeCount,product);
  assert.ok(product>100_000_000);
  assert.match(out.truthBoundary,/COMBINATORIAL_ARCHETYPES/);
});

test('authority blockers never enter repair queue',()=>{
  const x=attempt(1,{stages:{...readyStages(1),PAYMENT:{status:'BLOCKED_AUTHORITY',railId:'pay-1'}}});
  const out=compileEightHourOverdetermination({attempts:[x]});
  assert.equal(out.repairQueue.length,0);
  assert.equal(out.ownerOnlyBlockers.length,1);
});

test('prohibited paths are killed and never repaired',()=>{
  const x=attempt(1,{stages:{...readyStages(1),DISTRIBUTION:{status:'PROHIBITED'}}});
  const out=compileEightHourOverdetermination({attempts:[x]});
  assert.equal(out.killedAttemptCount,1);
  assert.equal(out.repairQueue.length,0);
});

test('provider blockers spawn substitute intents',()=>{
  const x=attempt(1,{stages:{...readyStages(1),PAYMENT:{status:'BLOCKED_EXTERNAL',railId:'p1',substituteRailIds:['p2','p3']}}});
  const out=compileEightHourOverdetermination({attempts:[x]});
  assert.equal(out.repairQueue[0].action,'spawn-independent-rail-variants');
  assert.deepEqual(out.repairQueue[0].substituteRailIds,['p2','p3']);
});

test('model-only paths are severely capped before observed trials',()=>{
  const x=compileMoneyAttempt(attempt(1,{observedTrials:0,observedSuccesses:0,successProbability:.9,evidenceQuality:1}));
  assert.equal(x.evidenceWeightedAttemptProbability,.05);
});

test('shared payment rail is detected as a single point of failure',()=>{
  const attempts=Array.from({length:8},(_,i)=>attempt(i+1,{paymentRail:'same-pay',stages:{...readyStages(i+1),PAYMENT:{status:'READY',railId:'same-pay'}}}));
  const out=compileEightHourOverdetermination({attempts,minimumOperationallyIndependentAttempts:8});
  assert.equal(out.singlePointFailures.paymentRail,'same-pay');
  assert.notEqual(out.status,'ECONOMIC_INEVITABILITY_TARGET_READY');
});

test('diverse evidence-backed portfolio can reach the overdetermination target model',()=>{
  const attempts=Array.from({length:12},(_,i)=>attempt(i+1,{
    buyerPool:`buyer-${i%6}`,
    acquisitionChannel:`channel-${i%6}`,
    paymentRail:`pay-${i%4}`,
    fulfillmentMode:`fulfill-${i%5}`,
    geography:`geo-${i%5}`,
    mechanismFamily:`family-${i%8}`,
    observedTrials:100,
    observedSuccesses:70,
    successProbability:.7,
    evidenceQuality:1
  }));
  const out=compileEightHourOverdetermination({attempts,minimumOperationallyIndependentAttempts:8,targetBoundedClearanceModel:.95,maxParallelCanaries:12});
  assert.ok(out.operationallyIndependentSelectedCount>=8);
  assert.ok(out.boundedNightClearanceModel>=.95);
  assert.equal(out.status,'ECONOMIC_INEVITABILITY_TARGET_READY');
});

test('observed cleared payment without accepted delivery is not a realized money loop',()=>{
  const attempts=Array.from({length:8},(_,i)=>attempt(i+1,{observedClearedPayments:1,acceptedDeliveries:0}));
  const out=compileEightHourOverdetermination({attempts,minimumOperationallyIndependentAttempts:8,targetBoundedClearanceModel:.5});
  assert.equal(out.realizedSelectedAttemptCount,0);
});
