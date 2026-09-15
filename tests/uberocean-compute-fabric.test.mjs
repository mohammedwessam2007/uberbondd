import test from 'node:test';
import assert from 'node:assert/strict';
import { compileUberOceanSubstrate, normalizeUberOceanHost } from '../src/uberocean-compute-fabric.mjs';

const NOW = new Date('2026-09-15T12:00:00.000Z');
const mesh = {providerIndependent:true,transport:'WIREGUARD',evidenceRef:'receipt:ubermesh:1'};
const host = (overrides={}) => ({
  hostId:'air-a',provider:'owner-a',hostClass:'OWNER_LINUX',sourceRef:'receipt:host:air-a',observedAt:'2026-09-15T11:55:00.000Z',
  failureDomain:'home-a',failureDomainEvidenceRef:'receipt:failure:home-a',architecture:'arm64',os:'ubuntu-linux',vcpus:4,memoryMb:12288,diskGb:80,
  monthlyCostCents:0,reliability:0.95,latencyScore:0.8,privacyScore:0.98,trustScore:0.98,reversibilityScore:0.95,
  networkReachable:true,sshOrConsoleReachable:true,...overrides
});

test('admits only freshly observed reachable Linux hosts',()=>{
  assert.equal(normalizeUberOceanHost(host(),{now:NOW}).ok,true);
  assert.equal(normalizeUberOceanHost(host({networkReachable:false}),{now:NOW}).ok,false);
  assert.equal(normalizeUberOceanHost(host({sshOrConsoleReachable:false}),{now:NOW}).ok,false);
  assert.equal(normalizeUberOceanHost(host({observedAt:'2026-09-15T10:00:00.000Z'}),{now:NOW}).ok,false);
  assert.equal(normalizeUberOceanHost(host({os:'windows'}),{now:NOW}).ok,false);
});

test('zero-new-spend mode refuses a merely cheap paid host',()=>{
  const result=compileUberOceanSubstrate({hosts:[host({monthlyCostCents:600})],meshReceipt:mesh,requireZeroNewSpend:true,now:NOW});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('no-zero-new-spend-host-available'));
});

test('compiles observed zero-cost host into UberCloud cell and UberCel adapter without authority',()=>{
  const result=compileUberOceanSubstrate({hosts:[host()],meshReceipt:mesh,requireZeroNewSpend:true,now:NOW});
  assert.equal(result.ok,true);
  assert.equal(result.status,'UBEROCEAN_SUBSTRATE_READY');
  assert.equal(result.plan.resourceCells.length,1);
  assert.equal(result.plan.resourceCells[0].provider,'owner-a');
  assert.equal(result.plan.resourceCells[0].capabilityTags.includes('ubercel'),true);
  assert.equal(result.plan.adapters[0].adapterType,'OWNED_LINUX');
  assert.equal(result.plan.adapters[0].deploymentAuthority,false);
  assert.equal(result.plan.maxTotalCostCents,0);
  assert.equal(result.deploymentAuthority,'NONE');
  assert.equal(result.spendAuthority,'NONE');
});

test('independent fallback requires distinct provider and failure domain',()=>{
  const same=compileUberOceanSubstrate({hosts:[host(),host({hostId:'air-b',provider:'owner-a',failureDomain:'home-b',failureDomainEvidenceRef:'receipt:failure:home-b'})],meshReceipt:mesh,requireIndependentFallback:true,now:NOW});
  assert.equal(same.ok,false);
  const diverse=compileUberOceanSubstrate({hosts:[host(),host({hostId:'free-b',provider:'oracle-free',hostClass:'ORACLE_ALWAYS_FREE',failureDomain:'oracle-ad-1',failureDomainEvidenceRef:'receipt:failure:oracle-ad-1',sourceRef:'receipt:host:oracle',monthlyCostCents:0})],meshReceipt:mesh,requireIndependentFallback:true,now:NOW});
  assert.equal(diverse.ok,true);
  assert.equal(diverse.plan.fallbackHostId,'free-b');
});

test('provider cannot smuggle policy or deployment authority through host evidence',()=>{
  assert.equal(normalizeUberOceanHost(host({providerOwnedPolicy:true}),{now:NOW}).ok,false);
  assert.equal(normalizeUberOceanHost(host({providerOwnedDeploymentAuthority:true}),{now:NOW}).ok,false);
});
