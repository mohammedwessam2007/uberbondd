import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateRailwayFreeFloor as estimate } from '../src/railway-free-cost-floor.mjs';
const month=30*86400;
const base=()=>({billingPeriodSeconds:month,services:[
  {role:'web',memoryGb:0.125,averageCpuVcpu:0,runningSeconds:month/4},
  {role:'worker',memoryGb:0.125,averageCpuVcpu:0,runningSeconds:month/4}],
  volumeGb:0,volumeSeconds:0,egressGb:0,remainingFreeCreditUsd:1,
  freePlanAuthenticated:true,providerZeroOverageVerified:true,
  requiresRailwayCron:false,requiresCustomDomain:false});
test('quarter-duty scenario is not sustainable if full-duty baseline exceeds credit',()=>{
  const r=estimate(base());
  assert.equal(r.status,'HOLD');
  assert.ok(r.reasons.includes('FULL_DUTY_SCENARIO_EXCEEDS_CREDIT'));
  assert.ok(r.fullDutyCostUsd>2.5);
  assert.equal(r.deploymentPermitted,false);
});
test('one-second billing window cannot masquerade as a monthly sustainable plan',()=>{
  const x=base();x.billingPeriodSeconds=1;x.services.forEach(s=>s.runningSeconds=1);
  const r=estimate(x);
  assert.equal(r.status,'HOLD');
  assert.ok(r.reasons.includes('INSUFFICIENT_BILLING_HORIZON'));
});
test('two stopped services are not a verified running web-worker runtime',()=>{
  const x=base();x.services.forEach(s=>s.runningSeconds=0);
  const r=estimate(x);
  assert.equal(r.status,'HOLD');
  assert.ok(r.reasons.includes('NO_RUNNING_RUNTIME'));
});
test('nonzero runtime with zero modeled RAM is not a credible Node service',()=>{
  const x=base();x.services[0].memoryGb=0;
  assert.equal(estimate(x).status,'HOLD');
});
test('tiny fully modeled services may remain plausible but never authorized',()=>{
  const x=base();x.services.forEach(s=>{s.memoryGb=0.01;s.runningSeconds=month/4;});
  const r=estimate(x);
  assert.equal(r.status,'BUDGET_PLAUSIBLE_UNVERIFIED');
  assert.ok(r.fullDutyCostUsd<1);
  assert.equal(r.spendingPermitted,false);
});
