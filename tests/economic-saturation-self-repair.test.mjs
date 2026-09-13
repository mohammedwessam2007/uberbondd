import test from 'node:test';
import assert from 'node:assert/strict';
import {compileEconomicSaturationPlan,compileEconomicRepairQueuePlan} from '../src/economic-saturation-self-repair.mjs';

const readyPath=(id,cls=id,fam=id,rails={})=>({
 id,independenceClass:cls,mechanismFamily:fam,
 stages:{DISTRIBUTION:{railId:rails.d||`d-${id}`},PAYMENT:{railId:rails.p||`p-${id}`},FULFILLMENT:{railId:rails.f||`f-${id}`}}
});

function inevitability(extra={}){
 return {boundedNightClearanceModel:.4,executablePathCount:2,realizedPathCount:0,recurringPathCount:0,singlePointFailures:{distributionRail:null,paymentRail:null,fulfillmentRail:null},blockerCounts:{},autonomousResolutionTasks:[],ownerOnlyBlockers:[],...extra};
}

test('saturation requires more independent paths and raises replacement requests',()=>{
 const out=compileEconomicSaturationPlan({inevitability:inevitability(),executionPaths:[readyPath('a'),readyPath('b')],minimumIndependentPaths:4,minimumMechanismFamilies:3,targetNightClearanceProbability:.9});
 assert.equal(out.status,'SATURATION_REQUIRED');
 assert.ok(out.deficits.some(x=>x.type==='EXECUTABLE_PATH_DEFICIT'));
 assert.ok(out.replacementRequests.length>=2);
 assert.equal(out.externalEffectAuthority,'NONE');
});

test('shared payment rail becomes explicit saturation deficit',()=>{
 const paths=[readyPath('a','a','a',{p:'paypal'}),readyPath('b','b','b',{p:'paypal'})];
 const out=compileEconomicSaturationPlan({inevitability:inevitability({singlePointFailures:{distributionRail:null,paymentRail:'paypal',fulfillmentRail:null}}),executionPaths:paths,minimumIndependentPaths:2,minimumMechanismFamilies:2,targetNightClearanceProbability:.3});
 assert.ok(out.deficits.some(x=>x.type==='SINGLE_POINT_OF_FAILURE'&&x.stage==='paymentRail'));
 assert.ok(out.replacementRequests.some(x=>x.reason.includes('paymentRail')));
});

test('authority blockers never become repair missions',()=>{
 const out=compileEconomicSaturationPlan({inevitability:inevitability({autonomousResolutionTasks:[{pathId:'x',stage:'PAYMENT',class:'AUTHORITY_REQUIRED',actions:['circumvent']}],ownerOnlyBlockers:[{pathId:'x',stage:'PAYMENT',class:'AUTHORITY_REQUIRED'}]}),executionPaths:[]});
 assert.equal(out.repairMissions.length,0);
 assert.ok(out.hardStopCount>=1);
});

test('prohibited blockers never become repair missions',()=>{
 const out=compileEconomicSaturationPlan({inevitability:inevitability({autonomousResolutionTasks:[{pathId:'x',stage:'DISTRIBUTION',class:'PROHIBITED_OR_IMPOSSIBLE',actions:['revive']}]}),executionPaths:[]});
 assert.equal(out.repairMissions.length,0);
 assert.ok(out.hardStopCount>=1);
});

test('internal blocker compiles a zero-spend Wallbreaker-shaped mission',()=>{
 const out=compileEconomicSaturationPlan({inevitability:inevitability({autonomousResolutionTasks:[{pathId:'x',stage:'FULFILLMENT',class:'INTERNAL_SOLVABLE',actions:['repair-fulfillment']}]}),executionPaths:[]});
 assert.equal(out.repairMissions.length,1);
 const m=out.repairMissions[0];
 assert.equal(m.failureClass,'IMPLEMENTATION_DEFECT');
 assert.equal(m.problem.maxSpendCents,0);
 assert.equal(m.problem.maxFounderMinutes,0);
 assert.equal(m.externalEffectAuthority,'NONE');
});

test('provider blocker maps to provider failure and substitution countermoves',()=>{
 const out=compileEconomicSaturationPlan({inevitability:inevitability({autonomousResolutionTasks:[{pathId:'x',stage:'PAYMENT',class:'PROVIDER_OR_RAIL',actions:['discover-independent-payment-rail','verify-live-callability']}]}),executionPaths:[]});
 const m=out.repairMissions[0];
 assert.equal(m.failureClass,'PROVIDER_FAILURE');
 assert.equal(m.candidateCountermoves.length,2);
});

test('evidence blocker maps to missing evidence without money claim authority',()=>{
 const out=compileEconomicSaturationPlan({inevitability:inevitability({autonomousResolutionTasks:[{pathId:'x',stage:'ACCEPTANCE',class:'EVIDENCE_REQUIRED',actions:['run-smallest-reversible-canary']}]}),executionPaths:[]});
 const m=out.repairMissions[0];
 assert.equal(m.failureClass,'MISSING_EVIDENCE');
 assert.equal(m.failure.missingEvidence,true);
 assert.equal(out.capitalDeploymentAuthority,'NONE');
});

test('fully diversified high-clearance portfolio becomes overdetermined but unproven',()=>{
 const paths=Array.from({length:4},(_,i)=>readyPath(`p${i}`,`c${i}`,`f${i}`));
 const out=compileEconomicSaturationPlan({inevitability:inevitability({boundedNightClearanceModel:.995,executablePathCount:4}),executionPaths:paths,minimumIndependentPaths:4,minimumMechanismFamilies:4,targetNightClearanceProbability:.99});
 assert.equal(out.status,'OVERDETERMINED_UNPROVEN');
 assert.equal(out.structuralSaturation,true);
 assert.equal(out.probabilisticSaturation,true);
 assert.ok(out.truthBoundary.includes('NEVER_GUARANTEES_PROFIT'));
});

test('observed money upgrades overdetermined state but requires external evidence supplied upstream',()=>{
 const paths=Array.from({length:3},(_,i)=>readyPath(`p${i}`,`c${i}`,`f${i}`));
 const out=compileEconomicSaturationPlan({inevitability:inevitability({boundedNightClearanceModel:.999,executablePathCount:3,realizedPathCount:1}),executionPaths:paths,minimumIndependentPaths:3,minimumMechanismFamilies:3,targetNightClearanceProbability:.99});
 assert.equal(out.status,'OVERDETERMINED_MONEY_LOOP_OBSERVED');
});

test('queue planner emits only repairable and saturation jobs with dedupe keys',()=>{
 const sat=compileEconomicSaturationPlan({inevitability:inevitability({autonomousResolutionTasks:[{pathId:'x',stage:'OFFER',class:'INTERNAL_SOLVABLE',actions:['repair-offer']}]}),executionPaths:[],minimumIndependentPaths:3,maxReplacementRequests:2});
 const q=compileEconomicRepairQueuePlan({saturationPlan:sat,maxJobs:4});
 assert.ok(q.jobs.length>0);
 assert.ok(q.jobs.every(x=>['economic.wealth.repair','economic.wealth.saturate'].includes(x.type)));
 assert.ok(q.jobs.every(x=>x.dedupeKey));
});

test('queue planner cannot enqueue authority hard stops',()=>{
 const sat={repairMissions:[{id:'bad',blockerClass:'AUTHORITY_REQUIRED'}],replacementRequests:[]};
 const q=compileEconomicRepairQueuePlan({saturationPlan:sat});
 assert.equal(q.jobs.length,0);
});

test('modeled failure probability is complement of modeled clearance, not a guarantee',()=>{
 const out=compileEconomicSaturationPlan({inevitability:inevitability({boundedNightClearanceModel:.97}),executionPaths:[]});
 assert.equal(out.modeledAllPathsFailProbability,.03);
});
