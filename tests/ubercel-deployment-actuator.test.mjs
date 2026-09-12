import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUbercelDeployment } from '../src/ubercel-deployment-control-plane.mjs';
import { executeUbercelDeployment } from '../src/ubercel-deployment-actuator.mjs';

const NOW='2026-09-12T18:40:00Z';
const SHA='a'.repeat(40);
const D='sha256:'+'b'.repeat(64);
const release={sourceCommit:SHA,imageDigest:D,configDigest:D,artifactDigest:D,signatureRef:'receipt:offline-signer:release',signerIdentity:'uberbond-offline-signer',signedAt:NOW,signatureVerified:true};
const mesh={providerIndependent:true,transport:'WIREGUARD',evidenceRef:'receipt:ubermesh:live'};
const req={requirementId:'runtime',resourceType:'EXECUTION',dataClass:'SOURCE_CODE',requiredTags:['node20'],units:1,minimumReliability:.8,minimumPrivacy:.8,minimumTrust:.8,minimumReversibility:.8};
const cell=(id,provider)=>({cellId:id,resourceType:'EXECUTION',provider,sourceRef:`receipt:${id}`,verifiedAt:NOW,capabilityTags:['node20'],allowedDataClasses:['SOURCE_CODE'],availableUnits:2,costCents:0,reliability:.99,latencyScore:.9,privacyScore:1,trustScore:1,reversibilityScore:1,ownershipClass:'THIRD_PARTY_REPLACEABLE',networkMode:'UBERMESH',credentialCustody:'OWNER'});
const adapter=(id,provider,type)=>({adapterId:id,adapterType:type,provider,sourceRef:`receipt:adapter:${id}`,verifiedAt:NOW,capabilityTags:['deploy'],deploymentAuthority:false,policyAuthority:false});
const plan=()=>compileUbercelDeployment({serviceId:'uberbond-runtime',target:'SOVEREIGN',release,cloudRequirements:[req],resourceCells:[cell('linux-a','linux-a'),cell('docker-b','docker-b')],meshReceipt:mesh,maxTotalCostCents:0,adapters:[adapter('owned-linux','linux-a','OWNED_LINUX'),adapter('generic-docker','docker-b','GENERIC_DOCKER')],healthContract:{authenticatedHealthRef:'probe:/api/health',expectedStatus:200},rollbackContract:{rollbackProcedureRef:'ops:rollback:signed-release',independentRollbackEvidenceRequired:true}});
const auth=p=>({authorizationId:'auth-1',evidenceRef:'founder:current-session',approvedByRole:'FOUNDER',sourceCommit:SHA,planDigest:p.planDigest,target:'SOVEREIGN',approvedAt:'2026-09-12T18:39:00Z',expiresAt:'2026-09-12T19:39:00Z',adapterIds:[p.plan.adapterBindings.find(x=>x.role==='primary').adapterId],deploymentAuthority:'EXPLICIT_ONE_SHOT',oneShot:true});
const successExecutor=binding=>({adapterId:binding.adapterId,provider:binding.provider,async executeDeployment(input){return{ok:true,status:'ADAPTER_DEPLOYMENT_OBSERVED',sourceCommit:input.release.sourceCommit,deploymentRef:`deployment:${binding.adapterId}:1`,healthEvidenceRef:'health:200',rollbackEvidenceRef:'rollback:ready',externalEffectLedger:{providerCalls:0,messages:0,purchases:0,deployments:1,credentialChanges:0,dnsChanges:0,productionMutations:1,spendCents:0}};}});

function claimant(){const used=new Set();return async ({authorizationId})=>{if(used.has(authorizationId))return{ok:false};used.add(authorizationId);return{ok:true,claimRef:`claim:${authorizationId}`};};}

test('Ubercel executes an exact signed plan through its selected replaceable adapter',async()=>{
  const p=plan();assert.equal(p.ok,true,JSON.stringify(p));
  const primary=p.plan.adapterBindings.find(x=>x.role==='primary');
  const result=await executeUbercelDeployment({deploymentPlan:p,authorization:auth(p),claimAuthorization:claimant(),adapterExecutors:{[primary.adapterId]:successExecutor(primary)},now:new Date(NOW)});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.status,'UBERCEL_DEPLOYMENT_EXECUTED');
  assert.equal(result.receipt.adapterReceipts.length,1);
  assert.equal(result.receipt.adapterReceipts[0].provider,primary.provider);
  assert.equal(result.externalEffectLedger.deployments,1);
  assert.equal(result.deploymentAuthority,'CONSUMED');
});

test('Ubercel refuses a tampered deployment plan before authority is claimed',async()=>{
  const p=plan();const tampered={...p,plan:{...p.plan,target:'PRODUCTION'}};let claims=0;
  const result=await executeUbercelDeployment({deploymentPlan:tampered,authorization:auth(p),claimAuthorization:async()=>{claims++;return{ok:true,claimRef:'bad'};},adapterExecutors:{},now:new Date(NOW)});
  assert.equal(result.ok,false);assert.ok(result.reasonCodes.includes('ubercel-plan-digest-mismatch'));assert.equal(claims,0);
});

test('Ubercel refuses an adapter identity substitution before dispatch',async()=>{
  const p=plan();const primary=p.plan.adapterBindings.find(x=>x.role==='primary');let executed=0;
  const result=await executeUbercelDeployment({deploymentPlan:p,authorization:auth(p),claimAuthorization:claimant(),adapterExecutors:{[primary.adapterId]:{adapterId:primary.adapterId,provider:'attacker',async executeDeployment(){executed++;}}},now:new Date(NOW)});
  assert.equal(result.ok,false);assert.ok(result.reasonCodes.includes('adapter-executor-identity-mismatch'));assert.equal(executed,0);
});

test('Ubercel one-shot authorization cannot replay',async()=>{
  const p=plan();const primary=p.plan.adapterBindings.find(x=>x.role==='primary');const claim=claimant();const executors={[primary.adapterId]:successExecutor(primary)};const authorization=auth(p);
  const first=await executeUbercelDeployment({deploymentPlan:p,authorization,claimAuthorization:claim,adapterExecutors:executors,now:new Date(NOW)});assert.equal(first.ok,true);
  const second=await executeUbercelDeployment({deploymentPlan:p,authorization,claimAuthorization:claim,adapterExecutors:executors,now:new Date(NOW)});assert.equal(second.ok,false);assert.ok(second.reasonCodes.includes('deployment-authorization-already-used-or-unclaimable'));
});

test('post-claim adapter exception becomes uncertain effect, never zero',async()=>{
  const p=plan();const primary=p.plan.adapterBindings.find(x=>x.role==='primary');
  const result=await executeUbercelDeployment({deploymentPlan:p,authorization:auth(p),claimAuthorization:claimant(),adapterExecutors:{[primary.adapterId]:{adapterId:primary.adapterId,provider:primary.provider,async executeDeployment(){throw new Error('lost-after-dispatch');}}},now:new Date(NOW)});
  assert.equal(result.ok,false);assert.equal(result.status,'UBERCEL_DEPLOYMENT_EXECUTION_UNCERTAIN');assert.equal(result.externalEffectLedger.deployments,'UNKNOWN');assert.equal(result.deploymentAuthority,'CONSUMED');
});
