import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenRouterJevGovernedAdapter } from '../src/openrouter-jev-governed-adapter.mjs';

test('governed Jev adapter performs key-policy checks and preserves exact served snapshot',async()=>{
  const rows=[
    {data:{label:'uberbond-runtime-20',limit:20,limit_remaining:20,usage_monthly:0,limit_reset:'monthly'}},
    {model:'typesafe/jev-1.13-20260917',answers:{
      route:{type:'choice',choice:'coding',probabilities:{coding:.96,research:.04},confidence:.92},
      crown:{type:'noul',noul:.81}
    },usage:{input_tokens:447,output_tokens:40,cost:.000018774},id:'gen-dec-test-1',provider:'TypeSafe'},
    {data:{label:'uberbond-runtime-20',limit:20,limit_remaining:19.999981226,usage_monthly:.000018774,limit_reset:'monthly'}}
  ];
  let i=0;const seen=[];
  const fetchImpl=async(url,opts={})=>{seen.push({url:String(url),opts});return {ok:true,status:200,text:async()=>JSON.stringify(rows[i++])};};
  const a=createOpenRouterJevGovernedAdapter({apiKeyProvider:async()=>('sk-or-v1-'+'x'.repeat(32)),expectedKeyLimitUsd:20,fetchImpl});
  const r=await a.execute({
    model:'typesafe/jev-1.13',
    state:{task:'Fix this repository bug.'},
    questions:{
      route:{type:'choice',instructions:'Which task type?',criteria:{coding:'Software work',research:'Research work'}},
      crown:{type:'noul',instructions:'Does this require frontier semantic review?'}
    },
    inputTokenCeiling:2048
  });
  assert.equal(r.ok,true);
  assert.equal(r.observedModel,'typesafe/jev-1.13');
  assert.equal(r.observedModelRevision,'typesafe/jev-1.13-20260917');
  assert.equal(r.provider,'openrouter');
  assert.equal(r.upstreamProvider,'TypeSafe');
  assert.equal(r.semanticAuthority,'NONE');
  assert.equal(r.usage.costUsd,.000018774);
  assert.equal(seen.filter(x=>x.url.endsWith('/alpha/decisions')).length,1);
  const body=JSON.parse(seen.find(x=>x.url.endsWith('/alpha/decisions')).opts.body);
  assert.equal(body.questions.route.type,'choice');
});

test('governed Jev adapter refuses wrong schemas and over-context requests before inference',async()=>{
  let calls=0;
  const key={data:{label:'runtime',limit:20,limit_remaining:20,usage_monthly:0,limit_reset:'monthly'}};
  const fetchImpl=async()=>{calls++;return {ok:true,status:200,text:async()=>JSON.stringify(key)};};
  const a=createOpenRouterJevGovernedAdapter({apiKeyProvider:async()=>('sk-or-v1-'+'x'.repeat(32)),expectedKeyLimitUsd:20,fetchImpl});
  await assert.rejects(()=>a.execute({state:{x:'y'},questions:{q:{type:'Choice',instructions:'bad',criteria:{a:'A'}}},inputTokenCeiling:100}),/valid-jev-question/);
  await assert.rejects(()=>a.execute({state:{x:'y'},questions:{q:{type:'noul',instructions:'ok'}},inputTokenCeiling:32001}),/jev-32k-input-ceiling/);
  // Each rejected execution may inspect the key first, but neither dispatches the Decisions API.
  assert.equal(calls,2);
});
