import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberCloudPlan, compileUberCloudEvacuation } from '../src/ubercloud-sovereign-fabric.mjs';

const NOW='2026-09-11T10:00:00Z';
const mesh={providerIndependent:true,transport:'WIREGUARD',evidenceRef:'receipt:ubermesh:test'};
const cell=(overrides={})=>({
  cellId:'owned-a',resourceType:'EXECUTION',provider:'owned-a',failureDomain:'founder-node-a',failureDomainEvidenceRef:'receipt:failure-domain:founder-node-a',sourceRef:'receipt:cell:a',verifiedAt:NOW,
  capabilityTags:['node20'],allowedDataClasses:['SOURCE_CODE'],availableUnits:4,costCents:0,
  reliability:.99,latencyScore:.95,privacyScore:1,trustScore:1,reversibilityScore:1,
  ownershipClass:'OWNER_OWNED',networkMode:'UBERMESH',credentialCustody:'OWNER',...overrides
});

const execReq={requirementId:'runtime',resourceType:'EXECUTION',dataClass:'SOURCE_CODE',requiredTags:['node20'],units:1,minimumReliability:.8,minimumPrivacy:.8,minimumTrust:.8,minimumReversibility:.8};

test('UberCloud refuses one cell without an independent fallback',()=>{
  const result=compileUberCloudPlan({serviceId:'continuum',requirements:[execReq],cells:[cell()],meshReceipt:mesh,maxTotalCostCents:0});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('independence-constraints-unmet'));
  assert.ok(result.blocked.some(row=>row.reasonCodes.includes('distinct-provider-and-failure-domain-fallback-required')));
});

test('UberCloud refuses cosmetic provider diversity inside the same failure domain',()=>{
  const result=compileUberCloudPlan({serviceId:'continuum',requirements:[execReq],meshReceipt:mesh,maxTotalCostCents:0,cells:[
    cell({cellId:'a',provider:'provider-a',failureDomain:'same-rack',failureDomainEvidenceRef:'receipt:fd:same-rack:a'}),
    cell({cellId:'b',provider:'provider-b',failureDomain:'same-rack',failureDomainEvidenceRef:'receipt:fd:same-rack:b',sourceRef:'receipt:cell:b'})
  ]});
  assert.equal(result.ok,false);
  assert.ok(result.blocked.some(row=>row.reasonCodes.includes('distinct-provider-and-failure-domain-fallback-required')));
});

test('UberCloud refuses provider-native networking as the root for founder-private state',()=>{
  const req={requirementId:'private-state',resourceType:'DATABASE',dataClass:'FOUNDER_PRIVATE',requiredTags:['postgres'],units:1,minimumReliability:.8,minimumPrivacy:.9,minimumTrust:.9,minimumReversibility:.8};
  const state=(id,provider,networkMode,fd)=>cell({cellId:id,provider,failureDomain:fd,failureDomainEvidenceRef:`receipt:fd:${fd}`,resourceType:'DATABASE',sourceRef:`receipt:${id}`,capabilityTags:['postgres'],allowedDataClasses:['FOUNDER_PRIVATE'],networkMode,portableExport:true,openFormat:true,stateFormat:'pg_dump',restoreProcedureRef:'ops:restore-postgres'});
  const result=compileUberCloudPlan({serviceId:'private-memory',requirements:[req],cells:[state('db-a','vendor-a','PROVIDER_NATIVE','vendor-a-region'),state('db-b','vendor-b','PROVIDER_NATIVE','vendor-b-region')],meshReceipt:mesh,maxTotalCostCents:0});
  assert.equal(result.ok,false);
  assert.ok(result.blocked.some(row=>row.reasonCodes.includes('distinct-provider-and-failure-domain-fallback-required'))||result.blocked.some(row=>row.reasonCodes.includes('primary-state-not-portable')));
});

test('UberCloud requires portable state and provider-independent UberMesh evidence',()=>{
  const req={requirementId:'state',resourceType:'DATABASE',dataClass:'INTERNAL_NON_SECRET',requiredTags:['postgres'],units:1};
  const locked=cell({cellId:'db-a',provider:'vendor-a',failureDomain:'fd-a',failureDomainEvidenceRef:'receipt:fd:a',resourceType:'DATABASE',capabilityTags:['postgres'],allowedDataClasses:['INTERNAL_NON_SECRET'],portableExport:false,openFormat:false,stateFormat:null,restoreProcedureRef:null});
  const portable=cell({cellId:'db-b',provider:'vendor-b',failureDomain:'fd-b',failureDomainEvidenceRef:'receipt:fd:b',resourceType:'DATABASE',capabilityTags:['postgres'],allowedDataClasses:['INTERNAL_NON_SECRET'],portableExport:true,openFormat:true,stateFormat:'pg_dump',restoreProcedureRef:'ops:restore'});
  const noMesh=compileUberCloudPlan({serviceId:'stateful',requirements:[req],cells:[locked,portable],meshReceipt:{},maxTotalCostCents:0});
  assert.equal(noMesh.ok,false);
  assert.ok(noMesh.reasonCodes.includes('provider-independent-ubermesh-evidence-required'));
  const lockedPrimary=compileUberCloudPlan({serviceId:'stateful',requirements:[req],cells:[locked,portable],meshReceipt:mesh,maxTotalCostCents:0});
  assert.equal(lockedPrimary.ok,false);
  assert.ok(lockedPrimary.reasonCodes.includes('independence-constraints-unmet'));
});

test('UberCloud compiles and verifies provider plus failure-domain evacuation',()=>{
  const result=compileUberCloudPlan({
    serviceId:'continuum',requirements:[execReq],meshReceipt:mesh,maxTotalCostCents:0,
    cells:[cell({cellId:'owned-a',provider:'owned-a',failureDomain:'founder-node-a',failureDomainEvidenceRef:'receipt:fd:founder-node-a'}),cell({cellId:'open-b',provider:'open-b',failureDomain:'independent-host-b',failureDomainEvidenceRef:'receipt:fd:independent-host-b',sourceRef:'receipt:cell:b',ownershipClass:'OPEN_SELF_HOSTED',reliability:.95})]
  });
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.status,'SOVEREIGN_UBERCLOUD_PLAN_READY');
  assert.notEqual(result.plan.placements[0].primary.provider,result.plan.placements[0].fallback.provider);
  assert.notEqual(result.plan.placements[0].primary.failureDomain,result.plan.placements[0].fallback.failureDomain);
  assert.ok(result.plan.failureDomainDiversity>=2);
  assert.equal(result.plan.controlPlaneAuthority,'OWNER_ONLY');
  assert.equal(result.businessEffectAuthority,'NONE');
  assert.equal(result.externalEffectAuthority,'NONE');

  const failedDomain=result.plan.placements[0].primary.failureDomain;
  const evacuation=compileUberCloudEvacuation({planResult:result,failedFailureDomains:[failedDomain]});
  assert.equal(evacuation.ok,true,JSON.stringify(evacuation));
  assert.equal(evacuation.moves.length,1);
  assert.equal(evacuation.moves[0].action,'PROPOSE_FAILOVER_ONLY');
  assert.equal(evacuation.externalEffectAuthority,'NONE');

  const tampered={...result,plan:{...result.plan,controlPlaneAuthority:'PROVIDER'}};
  const refused=compileUberCloudEvacuation({planResult:tampered,failedProviders:['owned-a']});
  assert.equal(refused.ok,false);
  assert.ok(refused.reasonCodes.includes('ubercloud-plan-digest-mismatch'));
});
