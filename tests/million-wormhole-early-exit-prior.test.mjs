import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileTopMillionWormholePriors } from '../src/million-wormhole-compiled-prior.mjs';
import { compileEarlyExitMillionWormholePriors } from '../src/million-wormhole-early-exit-prior.mjs';

const plan=JSON.parse(readFileSync(new URL('../artifacts/million-wormhole-tier2-search-policy-eval-v2.json',import.meta.url),'utf8'));

test('v2 evaluation was frozen before candidate implementation',()=>{
  assert.equal(plan.frozenBeforeCandidateImplementation,true);
  assert.equal(plan.baseline,'COMPILED_10400_ADDRESS_EXACT_PRIOR_SEARCH');
});

test('early exit exactly matches compiled v1 on frozen holdouts while evaluating exactly K addresses',()=>{
  for(const topK of plan.holdoutTopK){
    const baseline=compileTopMillionWormholePriors({topK});
    const candidate=compileEarlyExitMillionWormholePriors({topK});
    assert.equal(baseline.ok,true); assert.equal(candidate.ok,true);
    assert.deepEqual(candidate.selected.map(row=>row.id),baseline.selected.map(row=>row.id),`topK=${topK}`);
    assert.deepEqual(candidate.selected.map(row=>row.index),baseline.selected.map(row=>row.index),`topK=${topK}`);
    assert.equal(candidate.addressEvaluations,topK);
    assert.ok(candidate.addressEvaluations/1_048_576<=plan.efficiency.maximumCandidateAddressEvaluationsRatioToMillion);
    assert.equal(candidate.businessEffectAuthority,'NONE');
    assert.equal(candidate.externalEffectAuthority,'NONE');
    assert.ok(candidate.selected.every(row=>row.status==='HYPOTHESIS'));
  }
});

test('early exit refuses outside exact envelope',()=>{
  assert.equal(compileEarlyExitMillionWormholePriors({topK:0}).ok,false);
  assert.equal(compileEarlyExitMillionWormholePriors({topK:10401}).ok,false);
});
