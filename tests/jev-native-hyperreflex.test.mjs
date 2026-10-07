import test from 'node:test';
import assert from 'node:assert/strict';
import { compileNativeJevPageFaultPlan, NATIVE_JEV_PAGE_FAULT_SCHEMA } from '../src/native-jev-page-fault.mjs';
import { chooseAdaptiveCandidateWriter } from '../src/openrouter-processor-auction-v5.mjs';

test('native page fault compiles a zero-call JEV tensor without authority',()=>{
  const out=compileNativeJevPageFaultPlan({
    task:{
      taskId:'jev-native-1',
      taskClass:'RESEARCH_SYNTHESIS',
      stakes:'normal',
      sideEffectClass:'NONE',
      obligation:{kind:'resolve',claim:'bounded fixture'}
    },
    context:{qualityContractHash:'fixture-quality',sourceHashes:{a:'fixture'}},
    closureReasons:['MISSING_AUTHORITY','MISSING_AUTHORITY']
  });
  assert.equal(out.ok,true);
  assert.equal(out.plan.schemaVersion,NATIVE_JEV_PAGE_FAULT_SCHEMA);
  assert.equal(out.plan.mode,'PLAN_ONLY');
  assert.equal(out.plan.providerCallAuthorized,false);
  assert.equal(out.plan.spendAuthorized,false);
  assert.equal(out.plan.providerCallsPerformed,0);
  assert.equal(out.plan.semanticAuthority,'NONE');
  assert.equal(out.plan.maySuppressCrown,false);
  assert.equal(out.plan.promotionRequiredForCrownSuppression,true);
  assert.equal(out.plan.rawTaskStored,false);
  assert.equal(out.plan.rawContextStored,false);
  assert.equal(out.plan.state.closure_reason_codes.length,1);
  assert.ok(out.plan.questions.hard_reasoning);
  assert.ok(out.plan.questions.crown_necessity);
  assert.match(out.plan.planDigest,/^sha256:[0-9a-f]{64}$/);
});

test('JEV hard residual prefers Sol Pro when available but keeps standard Sol fallback',()=>{
  const crown={model:'anthropic/claude-opus-5.5',inputUsdPerMillion:4,outputUsdPerMillion:20};
  const sol={model:'openai/gpt-6.1-sol',inputUsdPerMillion:2,outputUsdPerMillion:10};
  const solPro={model:'openai/gpt-6.1-sol-pro',inputUsdPerMillion:2,outputUsdPerMillion:10};
  const hard=chooseAdaptiveCandidateWriter({
    jevAnswers:{task_shape:{choice:'research'},hard_reasoning:{score:2}},
    availableRoutes:{sol,solPro},
    crownRoute:crown,inputTokens:4000,candidateOutputTokens:2500
  });
  assert.equal(hard.selected.id,'solPro');
  assert.equal(hard.selected.reason,'JEV_HARD_RESIDUAL__MEASURED_SOL_PRO_PRIOR');
  assert.equal(hard.eligible.some(x=>x.id==='sol'),true);

  const fallback=chooseAdaptiveCandidateWriter({
    jevAnswers:{task_shape:{choice:'research'},hard_reasoning:{score:2}},
    availableRoutes:{sol},
    crownRoute:crown,inputTokens:4000,candidateOutputTokens:2500
  });
  assert.equal(fallback.selected.id,'sol');
});

test('routine JEV lanes do not pull Sol Pro into ordinary work',()=>{
  const crown={model:'anthropic/claude-opus-5.5',inputUsdPerMillion:4,outputUsdPerMillion:20};
  const sol={model:'openai/gpt-6.1-sol',inputUsdPerMillion:2,outputUsdPerMillion:10};
  const solPro={model:'openai/gpt-6.1-sol-pro',inputUsdPerMillion:2,outputUsdPerMillion:10};
  const deepseek={model:'deepseek/deepseek-v4.1-flash',inputUsdPerMillion:.13,outputUsdPerMillion:.52};
  const out=chooseAdaptiveCandidateWriter({
    jevAnswers:{task_shape:{choice:'coding'},hard_reasoning:{score:1}},
    availableRoutes:{sol,solPro,deepseek},
    crownRoute:crown,inputTokens:4000,candidateOutputTokens:2500
  });
  assert.notEqual(out.selected.id,'solPro');
  assert.equal(out.eligible.some(x=>x.id==='solPro'),false);
});
