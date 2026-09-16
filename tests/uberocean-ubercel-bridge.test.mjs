import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberOceanUbercelDeployment } from '../src/uberocean-ubercel-bridge.mjs';

const NOW=new Date('2026-09-15T12:00:00.000Z');
const sha='a'.repeat(40), digest=`sha256:${'b'.repeat(64)}`;
const release={sourceCommit:sha,imageDigest:digest,configDigest:digest,artifactDigest:digest,signatureRef:'receipt:signature:1',signerIdentity:'founder-offline-signer',signedAt:'2026-09-15T11:50:00.000Z',signatureVerified:true};
const mesh={providerIndependent:true,transport:'WIREGUARD',evidenceRef:'receipt:mesh:1'};
const common={architecture:'arm64',os:'ubuntu-linux',vcpus:4,memoryMb:12288,diskGb:80,monthlyCostCents:0,reliability:0.95,latencyScore:0.8,privacyScore:0.95,trustScore:0.95,reversibilityScore:0.95,networkReachable:true,sshOrConsoleReachable:true,observedAt:'2026-09-15T11:55:00.000Z'};
const hosts=[
  {...common,hostId:'owned-a',provider:'owner-a',hostClass:'OWNER_LINUX',sourceRef:'receipt:owned-a',failureDomain:'home-a',failureDomainEvidenceRef:'receipt:fd:home-a'},
  {...common,hostId:'oracle-b',provider:'oracle-free',hostClass:'ORACLE_ALWAYS_FREE',sourceRef:'receipt:oracle-b',failureDomain:'oracle-ad-1',failureDomainEvidenceRef:'receipt:fd:oracle-ad-1'}
];

test('two observed independent zero-cost hosts compile directly into a sovereign UberCel deployment plan',()=>{
  const result=compileUberOceanUbercelDeployment({hosts,meshReceipt:mesh,release,requireZeroNewSpend:true,requireIndependentFallback:true,healthContract:{authenticatedHealthRef:'local:https://127.0.0.1:32443/api/health',expectedStatus:200},rollbackContract:{rollbackProcedureRef:'ops/sovereign/rollback-uberlit.sh',independentRollbackEvidenceRequired:true},now:NOW});
  assert.equal(result.ok,true);
  assert.equal(result.status,'UBEROCEAN_UBERCEL_DEPLOYMENT_PLAN_READY');
  assert.equal(result.ubercel.ok,true);
  assert.equal(result.ubercel.plan.adapterBindings.length,2);
  assert.equal(result.executionContract.runtimeTarget,'UBERLIT');
  assert.equal(result.deploymentAuthority,'NONE');
  assert.equal(result.spendAuthority,'NONE');
});

test('a single host is not silently promoted to sovereign production when UberCel requires independent failure-domain fallback',()=>{
  const result=compileUberOceanUbercelDeployment({hosts:[hosts[0]],meshReceipt:mesh,release,requireZeroNewSpend:true,healthContract:{authenticatedHealthRef:'local:health',expectedStatus:200},rollbackContract:{rollbackProcedureRef:'local:rollback',independentRollbackEvidenceRequired:true},now:NOW});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('ubercel-plan-required'));
});

test('missing physical hosts remains a hard refusal rather than simulated compute',()=>{
  const result=compileUberOceanUbercelDeployment({hosts:[],meshReceipt:mesh,release,now:NOW});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('uberocean-substrate-required'));
});
