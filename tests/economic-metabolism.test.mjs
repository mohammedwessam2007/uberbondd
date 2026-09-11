import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateEconomicMetabolism } from '../src/economic-metabolism.mjs';

const important={id:'important',kind:'COGNITION',objective:'resolve a high-impact uncertainty',expectedValue:.9,founderImpact:1,evidenceConfidence:.8,reversibility:.9,costCents:0,founderMinutes:5,resourceUnits:10};
const trivial={id:'trivial',kind:'RESEARCH',objective:'polish a low-impact curiosity',expectedValue:.8,founderImpact:.05,evidenceConfidence:.9,reversibility:1,costCents:0,founderMinutes:20,resourceUnits:10};

test('Economic Metabolism rejects malformed or unbounded interventions',()=>{
  const r=allocateEconomicMetabolism({candidates:[{id:'x',kind:'MAGIC'}],budget:{maxFounderMinutes:10,maxResourceUnits:10}});assert.equal(r.ok,false);
});

test('Economic Metabolism does not spend money when the budget is zero',()=>{
  const r=allocateEconomicMetabolism({candidates:[{...important,id:'paid',kind:'PROVIDER_SPEND',costCents:1}],budget:{maxCostCents:0,maxFounderMinutes:60,maxResourceUnits:100}});
  assert.equal(r.ok,true);assert.equal(r.proposal.selected.length,0);assert.equal(r.proposal.usage.costCents,0);
});

test('Economic Metabolism does not let trivial optimization consume founder life ahead of high-impact cognition',()=>{
  const r=allocateEconomicMetabolism({candidates:[trivial,important],budget:{maxCostCents:0,maxFounderMinutes:10,maxResourceUnits:20,minimumEvidenceConfidence:.2,explorationSlots:0}});
  assert.equal(r.ok,true);assert.deepEqual(r.proposal.selected.map(x=>x.id),['important']);assert.ok(r.proposal.rejected.some(x=>x.id==='trivial'));
});

test('Economic Metabolism preserves a bounded exploration slot without granting intervention authority',()=>{
  const uncertain={id:'unknown',kind:'EXPERIMENT',objective:'cheap falsification probe',expectedValue:.9,founderImpact:.9,evidenceConfidence:.1,reversibility:1,costCents:0,founderMinutes:1,resourceUnits:1};
  const r=allocateEconomicMetabolism({candidates:[important,uncertain],budget:{maxCostCents:0,maxFounderMinutes:20,maxResourceUnits:100,minimumEvidenceConfidence:.5,explorationSlots:1}});
  assert.equal(r.ok,true);assert.ok(r.proposal.selected.some(x=>x.id==='unknown'&&x.allocationReason==='BOUNDED_UNCERTAINTY_REDUCTION'));assert.equal(r.externalEffectAuthority,'NONE');
});
