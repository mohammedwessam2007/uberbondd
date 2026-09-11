import test from 'node:test';
import assert from 'node:assert/strict';
import { MILLION_WORMHOLE_CANDIDATE_COUNT, MILLION_WORMHOLE_SHARD_COUNT, MILLION_WORMHOLE_SHARD_SIZE, encodeMillionWormholeIndex, decodeMillionWormholeIndex, renderMillionWormholeCandidate } from '../src/million-wormhole-universe.mjs';
import { compileMillionWormholeShard, compileRecursiveWormholeRound, intelligenceDensity } from '../src/million-wormhole-tournament.mjs';

test('exact million-plus universe is bijective',()=>{
  assert.equal(MILLION_WORMHOLE_CANDIDATE_COUNT,1048576);
  assert.equal(MILLION_WORMHOLE_SHARD_COUNT*MILLION_WORMHOLE_SHARD_SIZE,1048576);
  for(const index of [0,1,255,256,65535,736291,1048575]){
    const axes=decodeMillionWormholeIndex(index);
    assert.equal(encodeMillionWormholeIndex(axes),index);
    assert.equal(renderMillionWormholeCandidate(index).status,'HYPOTHESIS');
  }
});

test('shards are bounded disjoint exact coverage slices',()=>{
  const first=compileMillionWormholeShard({shardIndex:0,topK:8});
  const last=compileMillionWormholeShard({shardIndex:4095,topK:8});
  assert.equal(first.ok,true);
  assert.equal(first.coverage.evaluatedNow,256);
  assert.equal(first.coverage.virtualTotal,1048576);
  assert.ok(first.selected.every(candidate=>candidate.index>=0&&candidate.index<256));
  assert.ok(last.selected.every(candidate=>candidate.index>=1048320&&candidate.index<1048576));
});

test('recursive search can target its own search policy without promotion authority',()=>{
  const result=compileRecursiveWormholeRound({shardIndex:10,topK:16,target:'SEARCH_POLICY'});
  assert.equal(result.ok,true);
  assert.equal(result.recursiveTarget,'SEARCH_POLICY');
  assert.equal(result.promotionAuthority,'NONE');
  assert.equal(result.externalEffectAuthority,'NONE');
  assert.match(result.selfImprovementLaw,/CANNOT_SCORE_OR_PROMOTE_ITS_OWN_CHANGE/);
});

test('intelligence density rewards equal capability at lower resource burden',()=>{
  const cheap=intelligenceDensity({capabilityGain:1,computeUnits:1,seconds:1});
  const expensive=intelligenceDensity({capabilityGain:1,computeUnits:100,dollars:10,seconds:600,founderMinutes:30,riskBurden:2});
  assert.ok(cheap>expensive);
});
