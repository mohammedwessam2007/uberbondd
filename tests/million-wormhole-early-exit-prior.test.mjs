import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileMillionWormholeShard } from '../src/million-wormhole-tournament.mjs';
import { COMPILED_MAX_EXACT_TOP_K, compileTopMillionWormholePriors, compileTopMillionWormholePriorsEarlyExit } from '../src/million-wormhole-compiled-prior.mjs';

const plan=JSON.parse(readFileSync(new URL('../artifacts/million-wormhole-tier2-search-policy-eval-v2.json',import.meta.url),'utf8'));
function exhaustiveTop(topK){const rows=[];for(let shardIndex=0;shardIndex<4096;shardIndex++){const result=compileMillionWormholeShard({shardIndex,topK:Math.min(topK,256),target:'SEARCH_POLICY'});assert.equal(result.ok,true);rows.push(...result.selected);}rows.sort((a,b)=>b.staticPrior-a.staticPrior||a.index-b.index);return rows.slice(0,topK);}

test('frozen v2 holdouts exactly match compiled v1 and exhaustive ordering',()=>{
  assert.equal(plan.frozenBeforeCandidateImplementation,true);
  const baseline=exhaustiveTop(Math.max(...plan.holdoutTopK));
  for(const topK of plan.holdoutTopK){
    const v1=compileTopMillionWormholePriors({topK});
    const v2=compileTopMillionWormholePriorsEarlyExit({topK});
    assert.equal(v2.ok,true);
    assert.deepEqual(v2.selected.map(row=>row.id),v1.selected.map(row=>row.id),`v1 topK=${topK}`);
    assert.deepEqual(v2.selected.map(row=>row.id),baseline.slice(0,topK).map(row=>row.id),`exhaustive topK=${topK}`);
    assert.deepEqual(v2.selected.map(row=>row.index),v1.selected.map(row=>row.index),`indices topK=${topK}`);
  }
});

test('v2 evaluates exactly K addresses and satisfies frozen million-universe ceiling',()=>{
  for(const topK of plan.holdoutTopK){
    const result=compileTopMillionWormholePriorsEarlyExit({topK});
    assert.equal(result.addressEvaluations,topK);
    assert.ok(result.addressEvaluations/1_048_576<=plan.efficiency.maximumCandidateAddressEvaluationsRatioToMillion);
  }
});

test('v2 fails closed outside exact envelope and preserves zero authority',()=>{
  assert.equal(compileTopMillionWormholePriorsEarlyExit({topK:0}).ok,false);
  assert.equal(compileTopMillionWormholePriorsEarlyExit({topK:COMPILED_MAX_EXACT_TOP_K+1}).ok,false);
  const result=compileTopMillionWormholePriorsEarlyExit({topK:251});
  assert.equal(result.businessEffectAuthority,'NONE');
  assert.equal(result.externalEffectAuthority,'NONE');
  assert.ok(result.selected.every(row=>row.status==='HYPOTHESIS'));
  assert.match(result.truthBoundary,/NOT_GENERAL_INTELLIGENCE_OR_ASI_PROOF/);
});

test('v2 remains exact across envelope boundary probes',()=>{
  for(const topK of [1,256,257,1024,4096,10400]){
    const v1=compileTopMillionWormholePriors({topK});
    const v2=compileTopMillionWormholePriorsEarlyExit({topK});
    assert.equal(v2.ok,true);
    assert.equal(v2.addressEvaluations,topK);
    assert.deepEqual(v2.selected.map(row=>row.id),v1.selected.map(row=>row.id),`topK=${topK}`);
  }
});
