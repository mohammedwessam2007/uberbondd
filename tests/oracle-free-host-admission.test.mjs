import test from 'node:test';
import assert from 'node:assert/strict';
import { compileOracleFreeHostAdmission } from '../src/oracle-free-host-admission.mjs';

const now=new Date('2026-09-19T02:00:00.000Z');
const owner={
  observedAt:'2026-09-19T01:55:00.000Z',
  alwaysFreeEligible:true,
  incrementalCostCents:0,
  sourceRef:'oracle-console:instance-details:always-free'
};
const instance={
  id:'ocid1.instance.oc1.example',
  displayName:'uberbond-air-free',
  shape:'VM.Standard.A1.Flex',
  availabilityDomain:'TEST:AD-1',
  faultDomain:'FAULT-DOMAIN-1'
};
const shapeConfig={ocpus:2,memoryInGBs:12};

test('admits a freshly observed zero-cost Oracle A1 host into UberOcean without inventing redundancy',()=>{
  const result=compileOracleFreeHostAdmission({
    ownerEvidence:owner,
    instance,
    shapeConfig,
    tailscaleIp:'100.100.10.20',
    diskGb:50,
    uberlitHttpsHealthy:true,
    architecture:'arm64',
    now
  });
  assert.equal(result.ok,true);
  assert.equal(result.status,'ORACLE_FREE_UBEROCEAN_HOST_ADMITTED');
  assert.equal(result.host.provider,'oracle-free');
  assert.equal(result.host.costCents,0);
  assert.equal(result.host.uberocean.hostClass,'ORACLE_ALWAYS_FREE');
  assert.equal(result.adapter.adapterType,'OWNED_LINUX');
  assert.equal(result.ubercelSovereignDeploymentReady,false);
  assert.equal(result.resilienceBlocker,'INDEPENDENT_FAILURE_DOMAIN_FALLBACK_NOT_YET_OBSERVED');
  assert.equal(result.deploymentAuthority,'NONE');
});

test('refuses stale or non-zero-cost console evidence',()=>{
  const stale=compileOracleFreeHostAdmission({
    ownerEvidence:{...owner,observedAt:'2026-09-19T01:00:00.000Z'},
    instance,shapeConfig,tailscaleIp:'100.100.10.20',diskGb:50,uberlitHttpsHealthy:true,architecture:'arm64',now
  });
  assert.equal(stale.ok,false);
  assert.ok(stale.reasonCodes.includes('fresh-oracle-owner-evidence-required'));
  const paid=compileOracleFreeHostAdmission({
    ownerEvidence:{...owner,incrementalCostCents:1},
    instance,shapeConfig,tailscaleIp:'100.100.10.20',diskGb:50,uberlitHttpsHealthy:true,architecture:'arm64',now
  });
  assert.equal(paid.ok,false);
  assert.ok(paid.reasonCodes.includes('oracle-always-free-zero-cost-owner-evidence-required'));
});

test('refuses wrong shape, resources, architecture, health or public/non-tailnet reachability',()=>{
  const common={ownerEvidence:owner,instance,shapeConfig,tailscaleIp:'100.100.10.20',diskGb:50,uberlitHttpsHealthy:true,architecture:'arm64',now};
  assert.equal(compileOracleFreeHostAdmission({...common,instance:{...instance,shape:'VM.Standard.E2.1.Micro'}}).ok,false);
  assert.equal(compileOracleFreeHostAdmission({...common,shapeConfig:{ocpus:1,memoryInGBs:6}}).ok,false);
  assert.equal(compileOracleFreeHostAdmission({...common,architecture:'x64'}).ok,false);
  assert.equal(compileOracleFreeHostAdmission({...common,uberlitHttpsHealthy:false}).ok,false);
  assert.equal(compileOracleFreeHostAdmission({...common,tailscaleIp:'8.8.8.8'}).ok,false);
});
