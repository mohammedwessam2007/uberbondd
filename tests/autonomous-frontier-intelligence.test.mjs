import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCombinationSearchSpace, judgeFrontierOutcome, buildFrontierThinkerSwarm } from '../src/autonomous-frontier-intelligence.mjs';

test('Autonomous Frontier Intelligence bounds combinatorial search instead of claiming an infinite evaluation',()=>{
  const out=buildCombinationSearchSpace({capabilityAtoms:['a','b'],markets:['m1','m2'],channels:['c1','c2'],technologies:['t1','t2'],maxCandidates:3});
  assert.equal(out.ok,true);assert.equal(out.totalMaterialized,3);assert.equal(out.truncated,true);assert.equal(out.claimBoundary,'COMBINATION_IS_HYPOTHESIS_NOT_OPPORTUNITY_PROOF');
});

test('Autonomous Frontier Intelligence refuses outcome judgment without complete observation evidence',()=>{
  const out=judgeFrontierOutcome({hypothesisId:'h1',expected:'improve quality',observations:[{metric:'quality',direction:'IMPROVED',confidence:0.8,observedAt:'2026-09-11T12:00:00Z'}]});
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('complete-observation-evidence-required'));
});

test('Autonomous Frontier Intelligence preserves uncertainty and never self-promotes a thinker swarm',()=>{
  const out=buildFrontierThinkerSwarm({missionId:'m1',objective:'find a better route'});assert.equal(out.ok,true);assert.equal(out.businessEffectAuthority,'NONE');assert.ok(out.lanes.every(l=>l.executionAuthority==='NONE'));
});
