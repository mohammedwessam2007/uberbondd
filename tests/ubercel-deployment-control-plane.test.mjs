import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUbercelDeployment, compileUbercelFailover } from '../src/ubercel-deployment-control-plane.mjs';

const NOW='2026-09-11T11:00:00Z';
const SHA='a'.repeat(40);
const D='sha256:'+'b'.repeat(64);
const release={sourceCommit:SHA,imageDigest:D,configDigest:D,artifactDigest:D,signatureRef:'receipt:offline-signer:release',signerIdentity:'uberbond-offline-signer',signedAt:NOW,signatureVerified:true};
const mesh={providerIndependent:true,transport:'WIREGUARD',evidenceRef:'receipt:ubermesh:test'};
const req={requirementId:'web',resourceType:'EXECUTION',dataClass:'SOURCE_CODE',requiredTags:['node20'],units:1,minimumReliability:.8,minimumPrivacy:.8,minimumTrust:.8,minimumReversibility:.8};
const cell=(id,provider,failureDomain,overrides={})=>({cellId:id,resourceType:'EXECUTION',provider,failureDomain,failureDomainEvidenceRef:`receipt:failure-domain:${failureDomain}`,sourceRef:`receipt:${id}`,verifiedAt:NOW,capabilityTags:['node20'],allowedDataClasses:['SOURCE_CODE'],availableUnits:2,costCents:0,reliability:.99,latencyScore:.9,privacyScore:1,trustScore:1,reversibilityScore:1,ownershipClass:provider==='owned'?'OWNER_OWNED':'THIRD_PARTY_REPLACEABLE',networkMode:'UBERMESH',credentialCustody:'OWNER',...overrides});
const adapter=(id,provider,type)=>({adapterId:id,adapterType:type,provider,sourceRef:`receipt:adapter:${id}`,verifiedAt:NOW,capabilityTags:['deploy'],deploymentAuthority:false,policyAuthority:false});
const base=()=>({serviceId:'uberbond-runtime',target:'SOVEREIGN',release,cloudRequirements:[req],resourceCells:[cell('owned-a','owned','founder-node-a'),cell('open-b','open-b','independent-host-b')],meshReceipt:mesh,maxTotalCostCents:0,adapters:[adapter('owned-linux','owned','OWNED_LINUX'),adapter('generic-docker','open-b','GENERIC_DOCKER')],healthContract:{authenticatedHealthRef:'probe:/api/health',expectedStatus:200},rollbackContract:{rollbackProcedureRef:'ops:rollback:signed-release',independentRollbackEvidenceRequired:true}});

test('Ubercel refuses unsigned or unverifiable releases',()=>{
  const result=compileUbercelDeployment({...base(),release:{...release,signatureVerified:false}});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('offline-signature-verification-required'));
});

test('Ubercel refuses a provider adapter that claims deployment or policy authority',()=>{
  const input=base();
  input.adapters[1]={...input.adapters[1],deploymentAuthority:true};
  const result=compileUbercelDeployment(input);
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('invalid-provider-adapter'));
  assert.ok(result.adapterErrors.flat().includes('adapter-must-not-own-deployment-authority'));
});

test('Ubercel requires every primary and fallback provider cell to have an explicit adapter',()=>{
  const input=base();
  input.adapters=input.adapters.filter(row=>row.provider!=='open-b');
  const result=compileUbercelDeployment(input);
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('unbound-provider-cell'));
});

test('Ubercel refuses cosmetic provider diversity inside one failure domain',()=>{
  const input=base();
  input.resourceCells[1]={...input.resourceCells[1],failureDomain:input.resourceCells[0].failureDomain,failureDomainEvidenceRef:'receipt:failure-domain:same-host'};
  const result=compileUbercelDeployment(input);
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('ubercloud-placement-required'));
  assert.ok(result.uberCloud.blocked.some(row=>row.reasonCodes.includes('distinct-provider-and-failure-domain-fallback-required')));
});

test('Ubercel compiles a signed provider-neutral plan with evidenced failure-domain diversity',()=>{
  const result=compileUbercelDeployment(base());
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.status,'UBERCEL_DEPLOYMENT_PLAN_READY');
  assert.equal(result.plan.authority.policy,'UBERBOND_ONLY');
  assert.equal(result.plan.authority.providerAdapters,'NONE');
  assert.equal(result.plan.deploymentAuthority,'NONE');
  assert.equal(result.plan.uberCloudPlan.serviceId,'uberbond-runtime');
  assert.equal(result.plan.placements.length,1);
  assert.notEqual(result.plan.placements[0].primary.provider,result.plan.placements[0].fallback.provider);
  assert.notEqual(result.plan.placements[0].primary.failureDomain,result.plan.placements[0].fallback.failureDomain);
});

test('Ubercel failover is digest-bound and proposal-only',()=>{
  const deployment=compileUbercelDeployment(base());
  assert.equal(deployment.ok,true,JSON.stringify(deployment));
  const failed=deployment.plan.placements[0].primary.provider;
  const evacuation=compileUbercelFailover({deploymentPlan:deployment,failedProviders:[failed]});
  assert.equal(evacuation.ok,true,JSON.stringify(evacuation));
  assert.equal(evacuation.status,'UBERCEL_FAILOVER_PLAN_READY');
  assert.equal(evacuation.authority,'PROPOSAL_ONLY');
  assert.equal(evacuation.deploymentAuthority,'NONE');
  assert.equal(evacuation.moves.length,1);

  const tampered={...deployment,plan:{...deployment.plan,target:'PRODUCTION'}};
  const refused=compileUbercelFailover({deploymentPlan:tampered,failedProviders:[failed]});
  assert.equal(refused.ok,false);
  assert.ok(refused.reasonCodes.includes('ubercel-plan-digest-mismatch'));
});
