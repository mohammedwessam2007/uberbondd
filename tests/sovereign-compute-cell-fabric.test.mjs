import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateSovereignCells, normalizeResourceCell } from '../src/sovereign-compute-cell-fabric.mjs';

const base={provider:'owner',sourceRef:'receipt:cell:1',verifiedAt:'2026-09-11T10:00:00Z',capabilityTags:['browser-use'],allowedDataClasses:['PUBLIC'],availableUnits:100,costCents:0,reliability:.95,latencyScore:.8,privacyScore:.9,trustScore:.95,reversibilityScore:.9};

test('Sovereign Compute Cell Fabric rejects cells without provenance and trust metrics',()=>{
  const r=normalizeResourceCell({cellId:'x',resourceType:'BROWSER'});assert.equal(r.ok,false);assert.ok(r.reasonCodes.length>0);
});

test('Sovereign Compute Cell Fabric never routes founder-private data to a public-only cell',()=>{
  const r=allocateSovereignCells({requirements:[{resourceType:'BROWSER',dataClass:'FOUNDER_PRIVATE',requiredTags:['browser-use'],units:1}],cells:[{...base,cellId:'browser-1',resourceType:'BROWSER'}],maxTotalCostCents:0});
  assert.equal(r.ok,false);assert.ok(r.blocked[0].reasonCodes.includes('no-eligible-resource-cell'));
});

test('Sovereign Compute Cell Fabric refuses an allocation that exceeds the cost ceiling',()=>{
  const r=allocateSovereignCells({requirements:[{resourceType:'EXECUTION',dataClass:'SOURCE_CODE',requiredTags:['node20'],units:10}],cells:[{...base,cellId:'exec-1',resourceType:'EXECUTION',capabilityTags:['node20'],allowedDataClasses:['SOURCE_CODE'],availableUnits:10,costCents:5}],maxTotalCostCents:0});
  assert.equal(r.ok,false);assert.ok(r.blocked[0].reasonCodes.includes('cost-ceiling-would-be-exceeded'));
});

test('Sovereign Compute Cell Fabric chooses the minimum sufficient permitted resource cell without granting effects',()=>{
  const r=allocateSovereignCells({requirements:[{resourceType:'BROWSER',dataClass:'PUBLIC',requiredTags:['browser-use'],units:10,minimumReliability:.9,minimumPrivacy:.8,minimumTrust:.9,minimumReversibility:.8}],cells:[{...base,cellId:'browser-good',resourceType:'BROWSER'},{...base,cellId:'browser-weak',resourceType:'BROWSER',trustScore:.2}],maxTotalCostCents:0});
  assert.equal(r.ok,true);assert.equal(r.allocations[0].cellId,'browser-good');assert.equal(r.businessEffectAuthority,'NONE');
});
