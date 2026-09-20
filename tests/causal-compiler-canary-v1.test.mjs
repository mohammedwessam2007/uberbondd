import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileMinimumIntervention,
  runCausalCompilerCanaryV1,
  simulateCausalModel
} from '../src/causal-compiler-canary-v1.mjs';

const simple={
  nodes:[
    {id:'A',type:'INPUT',parents:[]},
    {id:'B',type:'INPUT',parents:[]},
    {id:'DISTRACTOR',type:'INPUT',parents:[]},
    {id:'T',type:'AND',parents:['A','B']}
  ],
  exogenous:{A:0,B:0,DISTRACTOR:0},
  controllableIds:['A','B','DISTRACTOR']
};

test('do-interventions override declared controls in a known acyclic model',()=>{
  const r=simulateCausalModel({model:simple,interventions:{A:1,B:1}});
  assert.equal(r.ok,true);
  assert.equal(r.values.T,1);
});

test('causal relevance pruning excludes variables with no path to the target',()=>{
  const r=compileMinimumIntervention({model:simple,goal:{T:1},mode:'CAUSAL_RELEVANCE_PRUNED'});
  assert.equal(r.ok,true);
  assert.deepEqual(r.prunedControllableIds,['DISTRACTOR']);
  assert.equal(r.interventionCardinality,2);
});

test('pruned and exhaustive search preserve exact minimum intervention cardinality',()=>{
  const a=compileMinimumIntervention({model:simple,goal:{T:1},mode:'CAUSAL_RELEVANCE_PRUNED'});
  const b=compileMinimumIntervention({model:simple,goal:{T:1},mode:'EXHAUSTIVE_ALL_CONTROLS'});
  assert.equal(a.interventionCardinality,b.interventionCardinality);
  assert.ok(a.evaluations<b.evaluations);
});

test('v1 benchmark preserves correctness and preregistered efficiency threshold',()=>{
  const r=runCausalCompilerCanaryV1();
  assert.equal(r.ok,true);
  assert.equal(r.correctnessAgreementRate,1);
  assert.ok(r.benchmarkCaseCount>=24);
  assert.ok(r.medianDistractorEvaluationReductionFactor>=10);
  assert.ok(r.maximumNegativeControlEvaluationRatio<=1.05);
  assert.equal(r.impossibleCaseAgreement,true);
});

test('a positive result remains narrow and cannot self-promote the founder moonshot',()=>{
  const r=runCausalCompilerCanaryV1();
  if(!r.falsifierTriggered){
    assert.equal(r.promotionCandidate.authority,'REVIEW_REQUIRED__NO_SELF_PROMOTION');
  }
  assert.match(r.claimBoundary,/DOES_NOT_DISCOVER_CAUSAL_STRUCTURE/);
  assert.equal(r.externalEffectAuthority,'NONE');
});
