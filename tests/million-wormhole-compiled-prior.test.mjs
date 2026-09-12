import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileMillionWormholeShard } from '../src/million-wormhole-tournament.mjs';
import { COMPILED_MAX_EXACT_TOP_K, compileTopMillionWormholePriors } from '../src/million-wormhole-compiled-prior.mjs';

const plan=JSON.parse(readFileSync(new URL('../artifacts/million-wormhole-tier2-search-policy-eval.json',import.meta.url),'utf8'));

function exhaustiveTop(topK){
  const rows=[];
  for(let shardIndex=0;shardIndex<4096;shardIndex++){
    const result=compileMillionWormholeShard({shardIndex,topK:Math.min(topK,256),target:'SEARCH_POLICY'});
    assert.equal(result.ok,true);
    rows.push(...result.selected);
  }
  rows.sort((a,b)=>b.staticPrior-a.staticPrior||a.index-b.index);
  return rows.slice(0,topK);
}

test('frozen tier-2 holdouts exactly match exhaustive search ordering',()=>{
  assert.equal(plan.frozenBeforeCandidateImplementation,true);
  const maxK=Math.max(...plan.holdoutTopK);
  const baseline=exhaustiveTop(maxK);
  for(const topK of plan.holdoutTopK){
    const candidate=compileTopMillionWormholePriors({topK});
    assert.equal(candidate.ok,true);
    assert.deepEqual(candidate.selected.map(row=>row.id),baseline.slice(0,topK).map(row=>row.id),`topK=${topK}`);
    assert.deepEqual(candidate.selected.map(row=>row.index),baseline.slice(0,topK).map(row=>row.index),`topK=${topK}`);
    assert.equal(candidate.externalEffectAuthority,'NONE');
    assert.equal(candidate.businessEffectAuthority,'NONE');
    assert.ok(candidate.selected.every(row=>row.status==='HYPOTHESIS'));
  }
});

test('compiled search reduces candidate-address work below frozen five-percent ceiling',()=>{
  const result=compileTopMillionWormholePriors({topK:Math.max(...plan.holdoutTopK)});
  assert.equal(result.ok,true);
  assert.ok(result.addressEvaluations/1_048_576<=plan.efficiency.maximumCandidateAddressEvaluationsRatio);
});

test('compiled search refuses requests outside its exact envelope rather than approximating',()=>{
  assert.equal(compileTopMillionWormholePriors({topK:0}).ok,false);
  const tooLarge=compileTopMillionWormholePriors({topK:COMPILED_MAX_EXACT_TOP_K+1});
  assert.equal(tooLarge.ok,false);
  assert.ok(tooLarge.reasonCodes.includes('top-k-outside-exact-compiled-envelope'));
});
