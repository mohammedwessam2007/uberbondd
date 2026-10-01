import test from 'node:test';
test('metadata interruption preserves generation ID and blocks repeat dispatch',async()=>{
  const original=globalThis.fetch,f=fixture();
  let requests=0;
  globalThis.fetch=async()=>{
    requests++;
    if(requests===1)return json({id:'fixture-unsettled',choices:[{message:{content:'SYNTHETIC'}}]});
    throw new Error('fixture-metadata-unavailable');
  };
  try{
    const result=await runCrownAutoFinish({store:f.store,apiKey:'fixture-secret',paidAuthorization:authorization(),checkpointKey:'fixture-encryption-key-32-characters-long'});
    assert.equal(result.status,'FAILED_NO_AUTOMATIC_RETRY');
    assert.equal(f.settings[KEY].pendingCall.generationId,'fixture-unsettled');
    assert.equal(f.settings[KEY].generationJournal[0].status,'DISPATCHED_UNRECONCILED');
    assert.equal(f.settings[KEY].newSpendUsd,0);
    await runCrownAutoFinish({store:f.store,apiKey:'fixture-secret',paidAuthorization:authorization(),checkpointKey:'fixture-encryption-key-32-characters-long'});
    assert.equal(requests,2);
  }finally{globalThis.fetch=original;}
});
import assert from 'node:assert/strict';
import { runCrownAutoFinish } from '../scripts/infinite-opus-crown-autofinish.mjs';

const KEY='infinite_opus_crown_autofinish_20261001_v7';
const PRIOR_KEY='infinite_opus_crown_autofinish_20261001_v6';
function fixture(current=null){
  const settings={[PRIOR_KEY]:{status:'FAILED_NO_AUTOMATIC_RETRY',
    reason:'provider-call-refused:anthropic/claude-opus-5.5:404:fixture',
    newSpendUsd:.01437375},...(current?{[KEY]:current}:{})};
  return {settings,store:{transaction:async fn=>fn({
    getSettings:async()=>structuredClone(settings),
    setSetting:async(key,value)=>{settings[key]=structuredClone(value);}
  })}};
}
const authorization=()=>({evidenceRef:'SYNTHETIC-TEST-ONLY',month:new Date().toISOString().slice(0,7),
  maxMonthlyMicrousd:20_000_000,expiresAt:new Date(Date.now()+60000).toISOString(),
  crownRoutes:['openrouter:anthropic/claude-opus-5.5']});
const json=data=>new Response(JSON.stringify(data),{status:200});

test('existing failed and running v7 attempts refuse any provider dispatch',async()=>{
  const original=globalThis.fetch;
  let requests=0;
  globalThis.fetch=async()=>{requests++;throw new Error('unexpected dispatch');};
  try{
    for(const status of ['FAILED_NO_AUTOMATIC_RETRY','RUNNING']){
      const f=fixture({status});
      const result=await runCrownAutoFinish({store:f.store,apiKey:'fixture-secret'});
      assert.equal(result.status,'AUTOFINISH_ALREADY_ATTEMPTED_NO_RETRY');
    }
    assert.equal(requests,0);
  }finally{globalThis.fetch=original;}
});

test('billed model drift is journaled before rejection and is never retried',async()=>{
  const original=globalThis.fetch,f=fixture();
  let requests=0;
  const prompt='SYNTHETIC TEST ONLY. '+ 'x'.repeat(100);
  const responses=[
    json({id:'fixture-custodian',choices:[{message:{content:JSON.stringify({tasks:[
      {prompt,rubric:['a','b','c','d','e'],must_not:[]},
      {prompt:prompt+'2',rubric:['a','b','c','d','e'],must_not:[]}
    ]})},finish_reason:'stop'}]}),
    json({data:{model:'google/gemini-2.5-pro',total_cost:.01,provider_name:'Google Vertex'}}),
    json({id:'fixture-drift',choices:[{message:{content:'SYNTHETIC SEALED ANSWER'},finish_reason:'stop'}]}),
    json({data:{model:'anthropic/claude-opus-5.5-20260922',total_cost:.02,
      provider_name:'Amazon Bedrock',native_tokens_prompt:100,native_tokens_completion:200}})
  ];
  globalThis.fetch=async()=>{requests++;return responses.shift();};
  try{
    const result=await runCrownAutoFinish({store:f.store,apiKey:'fixture-secret',paidAuthorization:authorization(),checkpointKey:'fixture-encryption-key-32-characters-long',mainSha:'fixture'});
    assert.equal(result.status,'FAILED_NO_AUTOMATIC_RETRY');
    assert.match(result.reason,/model-identity-drift/);
    const state=f.settings[KEY];
    assert.ok(Math.abs(state.newSpendUsd-.03)<1e-12);
    assert.equal(state.pendingCall.generationId,'fixture-drift');
    assert.equal(state.pendingCall.reconciliationStatus,'RECONCILED_INVALID_EVIDENCE');
    const row=state.generationJournal.find(x=>x.id==='fixture-drift');
    assert.equal(row.costUsd,.02);
    assert.equal(row.observedModel,'anthropic/claude-opus-5.5-20260922');
    assert.equal(row.provider,'Amazon Bedrock');
    assert.equal(row.promptTokens,100);
    assert.equal(row.completionTokens,200);
    assert.equal(row.status,'RECONCILED_INVALID_EVIDENCE');
    const durable=JSON.stringify(state);
    assert.equal(durable.includes('SYNTHETIC SEALED ANSWER'),false);
    assert.equal(durable.includes(prompt),false);
    assert.equal(durable.includes('fixture-secret'),false);
    assert.equal(requests,4);
    const again=await runCrownAutoFinish({store:f.store,apiKey:'fixture-secret'});
    assert.equal(again.status,'AUTOFINISH_ALREADY_ATTEMPTED_NO_RETRY');
    assert.equal(requests,4);
  }finally{globalThis.fetch=original;}
});

test('missing, expired, wrong-month, wrong-cap and wrong-route authority perform zero dispatch',async()=>{
  const original=globalThis.fetch;
  let requests=0;
  globalThis.fetch=async()=>{requests++;throw new Error('unexpected dispatch');};
  try{
    for(const paidAuthorization of [null,{...authorization(),expiresAt:'2000-01-01T00:00:00Z'},
      {...authorization(),month:'2000-01'},{...authorization(),maxMonthlyMicrousd:21_000_000},
      {...authorization(),crownRoutes:[]}]){
      const f=fixture();
      const result=await runCrownAutoFinish({store:f.store,apiKey:'fixture-secret',paidAuthorization});
      assert.equal(result.status,'EXPLICIT_PAID_RUNTIME_AUTHORITY_REQUIRED');
      assert.equal(result.providerCallsPerformed,0);
      assert.equal(f.settings[KEY],undefined);
    }
    assert.equal(requests,0);
  }finally{globalThis.fetch=original;}
});
