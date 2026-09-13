import test from 'node:test';
import assert from 'node:assert/strict';
import { compileEconomicReliabilityPreparationJobs } from '../src/economic-reliability-autoprep.mjs';

function receipt(actions){return {nextActions:actions};}

test('safe commercial reliability actions map to existing local preparation handler',()=>{
  const result=compileEconomicReliabilityPreparationJobs({reliabilityReceipt:receipt([
    {type:'BUILD_EVIDENCED_DEPENDENCY_FINGERPRINT',routeId:'commercial:paid-media-revenue-assurance',reasonCodes:['x']},
    {type:'RESOLVE_POLICY_CLEARANCE',routeId:'commercial:ai-automation-reliability',reasonCodes:['y']},
    {type:'CLOSE_EXECUTION_DEPENDENCIES',routeId:'commercial:conversational-funnel-reliability',reasonCodes:['z']}
  ]),maxJobs:8,date:'2026-09-14'});
  assert.equal(result.jobs.length,3);
  for(const job of result.jobs){
    assert.equal(job.type,'prometheus.commercial.opportunity.prepare');
    assert.equal(job.consequenceClass,'LOCAL_PREPARATION');
  }
  assert.equal(result.externalEffectAuthority,'NONE');
  assert.equal(result.moneyAuthority,'NONE');
});

test('trial collection and execution actions are never translated into local prep jobs',()=>{
  const result=compileEconomicReliabilityPreparationJobs({reliabilityReceipt:receipt([
    {type:'COLLECT_FRESH_PROVIDER_READBACK_TRIALS',routeId:'commercial:a'},
    {type:'EXECUTE_CALIBRATED_ROUTE_CANARY',routeId:'commercial:b'},
    {type:'ACTIVATE_SELECTED_ORTHOGONAL_ROUTE',routeId:'commercial:c'}
  ])});
  assert.equal(result.jobs.length,0);
  assert.equal(result.skipped.length,3);
});

test('non-commercial routes are refused',()=>{
  const result=compileEconomicReliabilityPreparationJobs({reliabilityReceipt:receipt([
    {type:'BUILD_EVIDENCED_DEPENDENCY_FINGERPRINT',routeId:'custom:secret-route'}
  ])});
  assert.equal(result.jobs.length,0);
  assert.equal(result.skipped[0].reason,'commercial-route-required');
});

test('autoprep is bounded and preserves action lineage',()=>{
  const actions=Array.from({length:20},(_,i)=>({type:'BUILD_EVIDENCED_DEPENDENCY_FINGERPRINT',routeId:`commercial:r${i}`,reasonCodes:['dependency']}));
  const result=compileEconomicReliabilityPreparationJobs({reliabilityReceipt:receipt(actions),maxJobs:8});
  assert.equal(result.jobs.length,8);
  assert.equal(result.jobs[0].sourceAction.routeId,'commercial:r0');
  assert.equal(result.jobs[7].sourceAction.routeId,'commercial:r7');
});
