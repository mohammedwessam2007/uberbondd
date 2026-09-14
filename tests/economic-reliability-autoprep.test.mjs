import test from 'node:test';
import assert from 'node:assert/strict';
import { compileEconomicReliabilityPreparationJobs } from '../src/economic-reliability-autoprep.mjs';

function receipt(actions){return {nextActions:actions};}
function safe(routeId,failureDomain,type='BUILD_EVIDENCED_DEPENDENCY_FINGERPRINT'){
  return {type,routeId,failureDomain,reasonCodes:['dependency']};
}

test('safe commercial reliability actions map to existing local preparation handler',()=>{
  const result=compileEconomicReliabilityPreparationJobs({reliabilityReceipt:receipt([
    safe('commercial:paid-media-revenue-assurance','paid-media'),
    safe('commercial:ai-automation-reliability','ai-automation','RESOLVE_POLICY_CLEARANCE'),
    safe('commercial:conversational-funnel-reliability','conversational','CLOSE_EXECUTION_DEPENDENCIES')
  ]),maxJobs:8,date:'2026-09-14'});
  assert.equal(result.jobs.length,3);
  for(const job of result.jobs){
    assert.equal(job.type,'prometheus.commercial.opportunity.prepare');
    assert.equal(job.consequenceClass,'LOCAL_PREPARATION');
  }
  assert.equal(result.externalEffectAuthority,'NONE');
  assert.equal(result.moneyAuthority,'NONE');
  assert.equal(result.independenceClaimed,false);
});

test('trial collection and execution actions are never translated into local prep jobs',()=>{
  const result=compileEconomicReliabilityPreparationJobs({reliabilityReceipt:receipt([
    {type:'COLLECT_FRESH_PROVIDER_READBACK_TRIALS',routeId:'commercial:a',failureDomain:'a'},
    {type:'EXECUTE_CALIBRATED_ROUTE_CANARY',routeId:'commercial:b',failureDomain:'b'},
    {type:'ACTIVATE_SELECTED_ORTHOGONAL_ROUTE',routeId:'commercial:c',failureDomain:'c'}
  ])});
  assert.equal(result.jobs.length,0);
  assert.equal(result.skipped.length,3);
});

test('non-commercial routes are refused',()=>{
  const result=compileEconomicReliabilityPreparationJobs({reliabilityReceipt:receipt([
    safe('custom:secret-route','custom')
  ])});
  assert.equal(result.jobs.length,0);
  assert.equal(result.skipped[0].reason,'commercial-route-required');
});

test('autoprep is bounded and preserves action lineage',()=>{
  const actions=Array.from({length:20},(_,i)=>safe(`commercial:r${i}`,`d${i}`));
  const result=compileEconomicReliabilityPreparationJobs({reliabilityReceipt:receipt(actions),maxJobs:8});
  assert.equal(result.jobs.length,8);
  assert.equal(result.jobs[0].sourceAction.routeId,'commercial:r0');
  assert.equal(result.jobs[7].sourceAction.routeId,'commercial:r7');
});

test('distinct failure domains are prepared before repeated same-domain cousins',()=>{
  const actions=[
    ...Array.from({length:8},(_,i)=>safe(`commercial:cold-${i}`,'cold-outbound')),
    safe('commercial:marketplace','marketplace'),
    safe('commercial:bounty','bounty'),
    safe('commercial:referral','referral')
  ];
  const result=compileEconomicReliabilityPreparationJobs({reliabilityReceipt:receipt(actions),maxJobs:4});
  assert.deepEqual(result.jobs.map(x=>x.sourceAction.routeId),[
    'commercial:cold-0','commercial:marketplace','commercial:bounty','commercial:referral'
  ]);
  assert.deepEqual(result.selectedFailureDomains,['cold-outbound','marketplace','bounty','referral']);
});

test('same-domain work fills remaining capacity only after diversity pass',()=>{
  const actions=[
    safe('commercial:a1','a'),
    safe('commercial:a2','a'),
    safe('commercial:b1','b')
  ];
  const result=compileEconomicReliabilityPreparationJobs({reliabilityReceipt:receipt(actions),maxJobs:3});
  assert.deepEqual(result.jobs.map(x=>x.sourceAction.routeId),['commercial:a1','commercial:b1','commercial:a2']);
});

test('failure-domain diversity is only a scheduling heuristic and never an independence claim',()=>{
  const result=compileEconomicReliabilityPreparationJobs({reliabilityReceipt:receipt([
    safe('commercial:a','domain-a'),safe('commercial:b','domain-b')
  ]),maxJobs:2});
  assert.equal(result.independenceClaimed,false);
  assert.match(result.truthBoundary,/NEVER prove[s]? independence/);
  assert.equal(Object.hasOwn(result,'successProbability'),false);
  assert.equal(Object.hasOwn(result,'residualZeroProbability'),false);
});
