import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { sealCrownCheckpoint } from '../src/crown-sealed-checkpoint.mjs';
import { recoverCrownResumeCheckpoint,validCrownResumeAuthority,RESUME_KEY,SOURCE_KEY } from '../src/crown-resume-checkpoint.mjs';
import { verifyCrownProviderModel,SOL_CANONICAL_REVISION } from '../src/crown-model-identity.mjs';
import { runCrownAutoFinish } from '../scripts/infinite-opus-crown-autofinish.mjs';
const h=x=>'sha256:'+crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const key='synthetic-fixture-encryption-key-not-real';
function fixture(){
 const tasks=[{id:'synthetic-t1',prompt:'SYNTHETIC TASK 1',rubric:['SYNTHETIC'],must_not:[]},{id:'synthetic-t2',prompt:'SYNTHETIC TASK 2',rubric:['SYNTHETIC'],must_not:[]}];
 const taskCommitment=h(tasks.map(t=>({id:t.id,promptHash:h(t.prompt),rubricHash:h(t.rubric),mustNotHash:h(t.must_not)})));
 const calls=[{taskId:tasks[0].id,model:'anthropic/claude-opus-5.5',id:'gen-1790892512-UbTWrlnGj57GXlT32paI',cost:.03676,providerName:'Amazon Bedrock',metaModel:'anthropic/claude-opus-5.5-20260921',answerHash:h('SYNTHETIC ANSWER'),promptHash:h(tasks[0].prompt),rubricHash:h(tasks[0].rubric)}];
 const answers={[tasks[0].id+'|anthropic/claude-opus-5.5']:'SYNTHETIC ANSWER'};
 const generationJournal=[{id:'gen-1790892485-fQko2TrlRCNPUJ3SD9EO',costUsd:.01053375},{id:calls[0].id,costUsd:.03676},{id:'gen-1790892555-BOCiTbz8qFX9HAnXIRR3',costUsd:.017744}];
 const state={status:'FAILED_NO_AUTOMATIC_RETRY',reason:'model-identity-drift:openai/gpt-6.1-sol-pro:openai/gpt-6.1-sol-pro-20260929',newSpendUsd:.06503775,taskCommitment,generationJournal,sealedEvidence:sealCrownCheckpoint({tasks,answers,calls},{key,binding:SOURCE_KEY+'|'+taskCommitment})};
 return {state,payload:{tasks,answers,calls}};
}
test('Azure alias accepts only exact observed Sol revision and provider',()=>{
 assert.equal(verifyCrownProviderModel({requestedModel:'openai/gpt-6.1-sol-pro',observedModel:SOL_CANONICAL_REVISION,provider:'Azure'}),true);
 for(const provider of ['Amazon Bedrock','Other'])assert.equal(verifyCrownProviderModel({requestedModel:'openai/gpt-6.1-sol-pro',observedModel:SOL_CANONICAL_REVISION,provider}),false);
 assert.equal(verifyCrownProviderModel({requestedModel:'openai/gpt-6.1-sol-pro',observedModel:'openai/gpt-6.1-sol-pro-20260930',provider:'Azure'}),false);
});
test('exact encrypted partial state reuses two tasks and one answer; four missing paid edges',()=>{
 const {state}=fixture(),p=recoverCrownResumeCheckpoint(state,{key});
 assert.equal(p.tasks.length,2);assert.equal(p.calls.length,1);assert.equal(p.tasks.length*2-p.calls.length+1,4);assert.equal(p.inheritedSpendUsd,.06503775);
});
for(const field of ['reason','status','newSpendUsd','taskCommitment']){
 test('changed source '+field+' refuses before reuse',()=>{
 const {state}=fixture();state[field]=field==='newSpendUsd'?0:'tampered';assert.throws(()=>recoverCrownResumeCheckpoint(state,{key}));
 });
}
test('changed answer and poisoned ciphertext refuse; private key is mandatory',()=>{
 const {state,payload}=fixture();payload.answers['synthetic-t1|anthropic/claude-opus-5.5']='TAMPERED';state.sealedEvidence=sealCrownCheckpoint(payload,{key,binding:SOURCE_KEY+'|'+state.taskCommitment});assert.throws(()=>recoverCrownResumeCheckpoint(state,{key}),/trust-pin/);
 assert.throws(()=>recoverCrownResumeCheckpoint(fixture().state,{key:'another-fixture-key-that-is-long-enough'}));
});
test('missing or contradictory historic charge cannot become free reuse',()=>{
 const {state}=fixture();state.generationJournal[2].costUsd=0;assert.throws(()=>recoverCrownResumeCheckpoint(state,{key}),/billing/);
});
test('resume authority is separate, bounded and expired authority refuses',()=>{
 const now=Date.now(),a={operation:'resume-existing-sealed-general-crown-evaluation',attemptKey:RESUME_KEY,sourceKey:SOURCE_KEY,maxIncrementalMicrousd:300000,maxTotalEvaluationMicrousd:450000,monthlyCapMicrousd:20000000,evidenceRef:'owner-approved-missing-crown-edges-r2',authorizedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60000).toISOString()};
 assert.equal(validCrownResumeAuthority(a,now),true);
 for(const x of [{...a,maxIncrementalMicrousd:300001},{...a,maxTotalEvaluationMicrousd:450001},{...a,monthlyCapMicrousd:20000001},{...a,sourceKey:'old-v7'},{...a,expiresAt:new Date(now).toISOString()}])assert.equal(validCrownResumeAuthority(x,now),false);
});
test('absent resume permission makes zero provider calls and zero writes',async()=>{
 let writes=0;const store={transaction:async()=>{writes++;throw Error('must-not-touch');}};
 const r=await runCrownAutoFinish({store,apiKey:'fixture-not-secret',resumeAuthorization:{}});
 assert.equal(r.status,'EXPLICIT_MISSING_EDGE_RESUME_AUTHORITY_REQUIRED');assert.equal(r.providerCallsPerformed,0);assert.equal(writes,0);
});

test('authorized continuation executes only three missing candidates and one grader, then refuses replay',async()=>{
 const {state}=fixture(),now=Date.now();
 Object.assign(state.generationJournal[0],{model:'google/gemini-2.5-pro',observedModel:'google/gemini-2.5-pro',provider:'Google'});
 Object.assign(state.generationJournal[1],{model:'anthropic/claude-opus-5.5',observedModel:'anthropic/claude-opus-5.5-20260921',provider:'Amazon Bedrock'});
 Object.assign(state.generationJournal[2],{model:'openai/gpt-6.1-sol-pro',observedModel:'openai/gpt-6.1-sol-pro-20260929',provider:'Azure'});
 let settings={[SOURCE_KEY]:state,infinite_opus_crown_autofinish_20261001_v7:{status:'FAILED_NO_AUTOMATIC_RETRY'},infinite_opus_crown_financial_recovery_20261001_r1:{status:'RECONCILED_INVALID_TOURNAMENT_EVIDENCE',generationId:'gen-1790807964-m6HWX42a5VtncUFVBpL1'}};
 const store={transaction:async fn=>fn({getSettings:async()=>settings,setSetting:async(k,v)=>{settings[k]=v;}})};
 const original=globalThis.fetch,observed={},paid=[];
 globalThis.fetch=async(url,o={})=>{
  if(o.method==='POST'){
   const b=JSON.parse(o.body),id='synthetic-gen-'+(paid.length+1);paid.push(b);
   assert.equal(b.provider.zdr,true);assert.equal(b.provider.allow_fallbacks,false);assert.equal(b.provider.require_parameters,true);assert.equal(b.temperature,undefined);
   let answer='SYNTHETIC NEW ANSWER';
   if(b.model==='google/gemini-2.5-pro'){
    const input=JSON.parse(b.messages[1].content);
    answer=JSON.stringify({grades:input.tasks.flatMap(t=>['A','B'].map(candidate=>({task_id:t.id,candidate,quality_score:100,required_regressions:0,canonical_zero_loss:true,reason:'SYNTHETIC ONLY'})))});
   }
   observed[id]={id,model:b.model==='anthropic/claude-opus-5.5'?'anthropic/claude-opus-5.5-20260921':b.model==='openai/gpt-6.1-sol-pro'?SOL_CANONICAL_REVISION:b.model,provider_name:b.model==='anthropic/claude-opus-5.5'?'Amazon Bedrock':b.model==='openai/gpt-6.1-sol-pro'?'Azure':'Google',total_cost:.001,created_at:new Date(now).toISOString()};
   return {ok:true,text:async()=>JSON.stringify({id,choices:[{message:{content:answer},finish_reason:'stop'}]})};
  }
  if(String(url).endsWith('/key'))return {ok:true,json:async()=>({data:{limit:20,limit_reset:'monthly',limit_remaining:20}})};
  const id=new URL(url).searchParams.get('id');
  const old=state.generationJournal.find(r=>r.id===id);
  const d=id==='gen-1790807964-m6HWX42a5VtncUFVBpL1'?{id,request_id:'req-1790807964-Ve3fJIrYt0PXl3LqGRb0',created_at:'2026-09-30T22:39:24.829Z',model:'anthropic/claude-opus-5.5-20260921',provider_name:'Amazon Bedrock',total_cost:.011224,native_tokens_prompt:681,native_tokens_completion:425}:old?{id,model:old.observedModel,provider_name:old.provider,total_cost:old.costUsd}:observed[id];
  return {ok:true,json:async()=>({data:d})};
 };
 const options={store,apiKey:'synthetic-private-key',checkpointKey:key,paidAuthorization:{evidenceRef:'SYNTHETIC',month:new Date(now).toISOString().slice(0,7),maxMonthlyMicrousd:20000000,expiresAt:new Date(now+60000).toISOString(),crownRoutes:['openrouter:anthropic/claude-opus-5.5']},resumeAuthorization:{operation:'resume-existing-sealed-general-crown-evaluation',attemptKey:RESUME_KEY,sourceKey:SOURCE_KEY,maxIncrementalMicrousd:300000,maxTotalEvaluationMicrousd:450000,monthlyCapMicrousd:20000000,evidenceRef:'owner-approved-missing-crown-edges-r2',authorizedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now+60000).toISOString()}};
 try{
  const r=await runCrownAutoFinish(options);
  assert.equal(r.status,'NON_OPUS_GENERAL_CROWN_WON');
  assert.deepEqual(paid.map(p=>p.model),['openai/gpt-6.1-sol-pro','anthropic/claude-opus-5.5','openai/gpt-6.1-sol-pro','google/gemini-2.5-pro']);
  assert.equal(settings[SOURCE_KEY].status,'FAILED_NO_AUTOMATIC_RETRY');
  assert(Math.abs(settings[RESUME_KEY].newSpendUsd-.06903775)<1e-12);
  await runCrownAutoFinish(options);assert.equal(paid.length,4);
 }finally{globalThis.fetch=original;}
});
