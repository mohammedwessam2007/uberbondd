import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileUbercelDeployment } from '../src/ubercel-deployment-control-plane.mjs';
import { executeUbercelDeployment } from '../src/ubercel-deployment-actuator.mjs';
import { createUberLitLinuxAdapterExecutor } from '../src/ubercel-uberlit-linux-adapter.mjs';

const NOW='2026-09-12T19:00:00Z';
const SHA='a'.repeat(40),D='sha256:'+'b'.repeat(64);
const release={sourceCommit:SHA,imageDigest:D,configDigest:D,artifactDigest:D,signatureRef:'receipt:offline-signer',signerIdentity:'uberbond-offline-signer',signedAt:NOW,signatureVerified:true};
const mesh={providerIndependent:true,transport:'WIREGUARD',evidenceRef:'receipt:ubermesh:current'};
const requirement={requirementId:'runtime',resourceType:'EXECUTION',dataClass:'SOURCE_CODE',requiredTags:['node20'],units:1,minimumReliability:.8,minimumPrivacy:.8,minimumTrust:.8,minimumReversibility:.8};
const cell=(id,provider,fd,reliability)=>({cellId:id,resourceType:'EXECUTION',provider,failureDomain:fd,failureDomainEvidenceRef:`receipt:fd:${fd}`,sourceRef:`receipt:cell:${id}`,verifiedAt:NOW,capabilityTags:['node20'],allowedDataClasses:['SOURCE_CODE'],availableUnits:1,costCents:0,reliability,latencyScore:1,privacyScore:1,trustScore:1,reversibilityScore:1,ownershipClass:'THIRD_PARTY_REPLACEABLE',networkMode:'UBERMESH',credentialCustody:'OWNER'});
const adapter=(id,provider,type)=>({adapterId:id,adapterType:type,provider,sourceRef:`receipt:adapter:${id}`,verifiedAt:NOW,capabilityTags:['deploy'],deploymentAuthority:false,policyAuthority:false});
const plan=()=>compileUbercelDeployment({serviceId:'uberbond-runtime',target:'SOVEREIGN',release,adapters:[adapter('uberlit-linux','owned-linux','OWNED_LINUX'),adapter('fallback-docker','fallback-host','GENERIC_DOCKER')],cloudRequirements:[requirement],resourceCells:[cell('owned','owned-linux','founder-linux-host',1),cell('fallback','fallback-host','independent-fallback-host',.95)],meshReceipt:mesh,maxTotalCostCents:0,healthContract:{authenticatedHealthRef:'local:/api/health',expectedStatus:200},rollbackContract:{rollbackProcedureRef:'ops/sovereign/rollback-uberlit.sh',independentRollbackEvidenceRequired:true}});
const authorization=p=>({authorizationId:'founder-live-1',evidenceRef:'founder:session',approvedByRole:'FOUNDER',sourceCommit:SHA,planDigest:p.planDigest,target:'SOVEREIGN',approvedAt:'2026-09-12T18:59:00Z',expiresAt:'2026-09-12T20:00:00Z',adapterIds:['uberlit-linux'],deploymentAuthority:'EXPLICIT_ONE_SHOT',oneShot:true});
const claimant=()=>{let used=false;return async()=>used?{ok:false}:(used=true,{ok:true,claimRef:'claim:founder-live-1'});};

function successfulRunner(){
  const calls=[];
  const run=(file,args)=>{
    calls.push([file,...args]);
    if(file==='git'&&args.includes('rev-parse'))return{status:0,stdout:`${SHA}\n`,stderr:''};
    if(file==='git'&&args.includes('status'))return{status:0,stdout:'',stderr:''};
    if(file==='bash'&&String(args[0]).endsWith('install-uberlit.sh'))return{status:0,stdout:`{\"ok\":true,\"status\":\"UBERLIT_NODE_INSTALLED\",\"sourceCommit\":\"${SHA}\",\"serviceStarted\":true}\n`,stderr:''};
    if(file==='bash'&&String(args[0]).endsWith('rollback-uberlit.sh'))return{status:0,stdout:'{"ok":true,"status":"UBERLIT_ROLLBACK_COMPLETED"}\n',stderr:''};
    return{status:2,stdout:'',stderr:'unexpected'};
  };
  return{run,calls};
}

test('Ubercel executes an UberLit release through the first-party Linux cell adapter',async()=>{
  const p=plan();assert.equal(p.ok,true,JSON.stringify(p));
  const fake=successfulRunner();
  const executor=createUberLitLinuxAdapterExecutor({adapterId:'uberlit-linux',provider:'owned-linux',sourceCheckout:'/srv/uberbond',runCommand:fake.run,probeHealth:async()=>({ok:true,status:200,body:'{"ok":true}'})});
  const result=await executeUbercelDeployment({deploymentPlan:p,authorization:authorization(p),claimAuthorization:claimant(),adapterExecutors:{'uberlit-linux':executor},now:new Date(NOW)});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.status,'UBERCEL_DEPLOYMENT_EXECUTED');
  assert.equal(result.receipt.adapterReceipts[0].sourceCommit,SHA);
  assert.equal(result.externalEffectLedger.deployments,1);
  assert.ok(fake.calls.some(row=>row[0]==='bash'&&String(row[1]).endsWith('install-uberlit.sh')));
});

test('Linux adapter refuses source mismatch before installer execution',async()=>{
  let installCalls=0;
  const executor=createUberLitLinuxAdapterExecutor({sourceCheckout:'/srv/uberbond',runCommand:(file,args)=>{
    if(file==='git'&&args.includes('rev-parse'))return{status:0,stdout:`${'c'.repeat(40)}\n`};
    if(file==='bash')installCalls++;
    return{status:0,stdout:''};
  },probeHealth:async()=>({ok:true,status:200})});
  const out=await executor.executeDeployment({release:{sourceCommit:SHA},binding:{adapterId:'uberlit-linux',provider:'owned-linux'},healthContract:{expectedStatus:200}});
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('linux-cell-source-mismatch'));assert.equal(installCalls,0);
});

test('health failure invokes first-party rollback and refuses success',async()=>{
  const fake=successfulRunner();
  const executor=createUberLitLinuxAdapterExecutor({sourceCheckout:'/srv/uberbond',runCommand:fake.run,probeHealth:async()=>({ok:false,status:503})});
  await assert.rejects(()=>executor.executeDeployment({release:{sourceCommit:SHA},binding:{adapterId:'uberlit-linux',provider:'owned-linux'},healthContract:{expectedStatus:200}}),/uberlit-health-refused-after-install/);
  assert.ok(fake.calls.some(row=>row[0]==='bash'&&String(row[1]).endsWith('rollback-uberlit.sh')));
});

test('rollback path swaps to the previous exact UberLit source and restarts all resident services',()=>{
  const body=fs.readFileSync(new URL('../ops/sovereign/rollback-uberlit.sh',import.meta.url),'utf8');
  assert.match(body,/source\.old/);assert.match(body,/source\.failed/);assert.match(body,/systemctl restart uberlit\.service uberlit-tls-edge\.service uberlit-worker\.service/);assert.match(body,/UBERLIT_ROLLBACK_COMPLETED/);
});
