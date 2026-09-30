import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenRouterJevGovernedAdapter, validateJevQuestions } from '../src/openrouter-jev-governed-adapter.mjs';
import { COGNITION_PERIMETER_ADMISSION } from '../src/cognition-transport-guard.mjs';

const secret='sk-or-v1-'+'x'.repeat(32);
const keyBody=usage=>({data:{label:'uberbond-runtime-20',limit:20,limit_remaining:20-usage,usage_monthly:usage,limit_reset:'monthly'}});

test('Jev validator enforces lowercase Decisions API types and bounded criteria',()=>{
  assert.equal(validateJevQuestions({
    route:{type:'choice',instructions:'Choose route',criteria:{direct:'Direct',prepared:'Prepared'}},
    crown:{type:'noul',instructions:'Does this require Crown?'},
    hardness:{type:'score',instructions:'How hard?',criteria:['low','high']}
  }).route.type,'choice');
  assert.throws(()=>validateJevQuestions({x:{type:'Choice',instructions:'bad',criteria:{a:'a',b:'b'}}}),/contract-invalid/);
  assert.throws(()=>validateJevQuestions({x:{type:'score',instructions:'bad',criteria:['one']}}),/score-criteria-invalid/);
});

test('governed Jev adapter verifies key before and after and returns typed observed-cost decision',async()=>{
  const rows=[
    keyBody(0),
    {
      model:'typesafe/jev-1.13-20260917',
      answers:{
        task_shape:{type:'choice',choice:'source_heavy',probabilities:{source_heavy:.94,short_direct:.06},confidence:.9},
        crown_necessity:{type:'noul',noul:.99}
      },
      usage:{input_tokens:1000,output_tokens:40,cost:.000042},
      id:'gen-dec-fixture',
      provider:'TypeSafe'
    },
    keyBody(.000042)
  ];
  let calls=0;
  const fetchImpl=async(url,opts={})=>{
    calls++;
    if(String(url).includes('/decisions')){
      assert.equal(opts.method,'POST');
      const body=JSON.parse(opts.body);
      assert.equal(body.model,'typesafe/jev-1.13');
      assert.equal(body.questions.task_shape.type,'choice');
    }
    const body=rows.shift();
    return {ok:true,status:200,text:async()=>JSON.stringify(body)};
  };
  const a=createOpenRouterJevGovernedAdapter({
    apiKeyProvider:async()=>secret,fetchImpl,expectedKeyLimitUsd:20,
    cognitionPerimeterAdmission:COGNITION_PERIMETER_ADMISSION
  });
  const r=await a.execute({
    state:{task:'Analyze 100 pages'},
    questions:{
      task_shape:{type:'choice',instructions:'Which shape?',criteria:{source_heavy:'Large source set',short_direct:'Small task'}},
      crown_necessity:{type:'noul',instructions:'Does open-ended semantics require frontier review?'}
    },
    costCeilingUsd:.001
  });
  assert.equal(r.ok,true);assert.equal(r.status,'JEV_TYPED_DECISION_OBSERVED');
  assert.equal(r.model,'typesafe/jev-1.13-20260917');assert.equal(r.usage.costUsd,.000042);
  assert.equal(r.answers.task_shape.choice,'source_heavy');assert.equal(r.semanticAuthority,'NONE');
  assert.equal(calls,3);
});

test('Jev refuses if provider cost exceeds caller ceiling',async()=>{
  const rows=[
    keyBody(0),
    {model:'typesafe/jev-1.13-20260917',answers:{x:{type:'noul',noul:.5}},usage:{input_tokens:1000,output_tokens:10,cost:.002},id:'g',provider:'TypeSafe'}
  ];
  const a=createOpenRouterJevGovernedAdapter({
    apiKeyProvider:async()=>secret,
    fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify(rows.shift())}),
    expectedKeyLimitUsd:20,cognitionPerimeterAdmission:COGNITION_PERIMETER_ADMISSION
  });
  const r=await a.execute({state:'x',questions:{x:{type:'noul',instructions:'Is x true?'}},costCeilingUsd:.001});
  assert.equal(r.ok,false);assert.equal(r.status,'JEV_COST_CEILING_EXCEEDED');
});

test('Jev refuses snapshot drift rather than silently accepting another decision model',async()=>{
  const rows=[
    keyBody(0),
    {model:'typesafe/jev-2.0',answers:{x:{type:'noul',noul:.9}},usage:{input_tokens:10,output_tokens:1,cost:.000001},id:'g',provider:'TypeSafe'}
  ];
  const a=createOpenRouterJevGovernedAdapter({
    apiKeyProvider:async()=>secret,
    fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify(rows.shift())}),
    expectedKeyLimitUsd:20,cognitionPerimeterAdmission:COGNITION_PERIMETER_ADMISSION
  });
  const r=await a.execute({state:'x',questions:{x:{type:'noul',instructions:'Is x true?'}}});
  assert.equal(r.status,'JEV_MODEL_SNAPSHOT_DRIFT');
});
