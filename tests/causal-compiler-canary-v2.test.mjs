import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCausalGoalV2, runCausalCompilerCanaryV2 } from '../src/causal-compiler-canary-v2.mjs';

test('v2 directly compiles a simple tree-like causal goal',()=>{
  const model={
    nodes:[
      {id:'A',type:'INPUT',parents:[]},{id:'B',type:'INPUT',parents:[]},
      {id:'T',type:'AND',parents:['A','B']}
    ],
    exogenous:{A:0,B:0},controllableIds:['A','B']
  };
  const r=compileCausalGoalV2({model,goal:{T:1}});
  assert.equal(r.ok,true);
  assert.equal(r.mode,'GOAL_DIRECTED_BACKWARD_COMPILATION');
  assert.equal(r.interventionCardinality,2);
  assert.equal(r.fullModelEvaluations,1);
});

test('v2 safely falls back when relevant upstream structure is shared',()=>{
  const model={
    nodes:[
      {id:'A',type:'INPUT',parents:[]},{id:'B',type:'INPUT',parents:[]},
      {id:'X',type:'COPY',parents:['A']},
      {id:'Y',type:'OR',parents:['A','B']},
      {id:'T',type:'AND',parents:['X','Y']}
    ],
    exogenous:{A:0,B:0},controllableIds:['A','B']
  };
  const r=compileCausalGoalV2({model,goal:{T:1}});
  assert.equal(r.ok,true);
  assert.equal(r.fallbackUsed,true);
  assert.equal(r.mode,'EXACT_RELEVANCE_PRUNED_FALLBACK');
});

test('v2 preregistered benchmark preserves exactness and exceeds full-model evaluation threshold',()=>{
  const r=runCausalCompilerCanaryV2();
  assert.equal(r.ok,true);
  assert.equal(r.correctnessAgreementRate,1);
  assert.ok(r.medianDistractorFullModelEvaluationReductionFactor>=10);
  assert.equal(r.sharedFallbackAgreement,true);
  assert.equal(r.impossibleCaseAgreement,true);
  assert.equal(r.directVerificationFailureCount,0);
});

test('positive v2 remains a narrow software primitive with review-only promotion',()=>{
  const r=runCausalCompilerCanaryV2();
  if(!r.falsifierTriggered){
    assert.equal(r.promotionCandidate.authority,'REVIEW_REQUIRED__NO_SELF_PROMOTION');
  }
  assert.match(r.claimBoundary,/NO_CAUSAL_DISCOVERY/);
  assert.equal(r.externalEffectAuthority,'NONE');
});
