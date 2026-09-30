import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { compileInfiniteOpusMarket } from '../src/infinite-opus-market.mjs';
import { issueCrownAdmissionReceipt } from '../src/crown-admission.mjs';
import { compileTypingMindChatRequest, TYPINGMIND_UBERMIND_MODEL } from '../src/infinite-opus-typingmind-gateway.mjs';
import { createTypingMindLiveOrchestrator, inspectTypingMindLiveReadiness,
  TYPINGMIND_BUILDER_MODEL, TYPINGMIND_CROWN_MODEL, TYPINGMIND_JEV_MODEL, TYPINGMIND_CROWN_ROUTE_IDENTITY } from '../src/infinite-opus-typingmind-live.mjs';

const h=x=>'sha256:'+crypto.createHash('sha256').update(String(x)).digest('hex');
const now=Date.parse('2026-09-30T13:30:00Z');
const iso=new Date(now).toISOString();
const makeStore=()=>{
 let settings={};
 return {
   transaction:async fn=>fn({
     transactionClient:false,
     getSettings:async()=>structuredClone(settings),
     setSetting:async(k,v)=>{settings={...settings,[k]:structuredClone(v)};}
   }),
   dump:()=>structuredClone(settings)
 };
};
const market=()=>compileInfiniteOpusMarket({data:[
 {id:TYPINGMIND_BUILDER_MODEL,canonical_slug:'sol-r1',pricing:{prompt:'0.000002',completion:'0.000010',input_cache_read:'0.0000001',input_cache_write:'0.0000025'},context_length:1050000,top_provider:{max_completion_tokens:128000},supported_parameters:['tools','structured_outputs'],architecture:{input_modalities:['text']}},
 {id:TYPINGMIND_CROWN_MODEL,canonical_slug:'opus-r1',pricing:{prompt:'0.000004',completion:'0.000020',input_cache_read:'0.0000002',input_cache_write:'0.000005'},context_length:1000000,top_provider:{max_completion_tokens:128000},supported_parameters:['tools','structured_outputs'],architecture:{input_modalities:['text']}}
]},{verifiedAt:iso,ttlMs:86400000});
const marketWithJev=()=>compileInfiniteOpusMarket({data:[
 {id:TYPINGMIND_JEV_MODEL,canonical_slug:'jev-1.13-20260917',pricing:{prompt:'0.000000042',completion:'0'},context_length:32000,top_provider:{max_completion_tokens:1},supported_parameters:[],architecture:{input_modalities:['text']}},
 {id:TYPINGMIND_BUILDER_MODEL,canonical_slug:'sol-r1',pricing:{prompt:'0.000002',completion:'0.000010',input_cache_read:'0.0000001',input_cache_write:'0.0000025'},context_length:1050000,top_provider:{max_completion_tokens:128000},supported_parameters:['tools','structured_outputs'],architecture:{input_modalities:['text']}},
 {id:TYPINGMIND_CROWN_MODEL,canonical_slug:'opus-r1',pricing:{prompt:'0.000004',completion:'0.000020',input_cache_read:'0.0000002',input_cache_write:'0.000005'},context_length:1000000,top_provider:{max_completion_tokens:128000},supported_parameters:['tools','structured_outputs'],architecture:{input_modalities:['text']}}
]},{verifiedAt:iso,ttlMs:86400000});

const admission=(provider='Anthropic',routeIdentity=TYPINGMIND_CROWN_ROUTE_IDENTITY)=>{
 const issued=issueCrownAdmissionReceipt({
  providerCallId:'tournament-opus',exactModelId:TYPINGMIND_CROWN_MODEL,providerIdentity:provider,routeIdentity,
  taskClassRole:'GENERAL_CROWN',promptProgramHash:h('prompt'),semanticInputHash:h('input'),qualityContractHash:h('quality'),
  sourceDependencyHashes:[h('source')],evidenceReferences:['fixture://sealed-tournament'],outputHash:h('out'),
  timestamp:iso,expiresAt:'2026-10-01T00:00:00Z',budgetAuthorizationRef:'fixture-auth',costReceiptRef:'fixture-bill',
  modelCallabilityReceiptRef:'fixture-callability',revalidationPolicy:'EXPIRE_OR_SUCCESSION',authorizationStatus:'AUTHORIZED_FOR_THIS_CALL',
  actualCostMicrousd:2000,sideEffectAuthority:'NONE',providerBillObserved:true,modelIdentityVerified:true,modelCallabilityVerified:true,
  tournamentEvidenceVerified:true,roleTournamentEvidenceRef:'fixture://tournament'
 });
 assert.equal(issued.ok,true);return issued.receipt;
};
const authorization=()=>({evidenceRef:'owner-fixture',month:'2026-09',maxMonthlyMicrousd:20_000_000,expiresAt:'2026-10-01T00:00:00Z',
 crownRoutes:['openrouter:'+TYPINGMIND_CROWN_MODEL]});
const request=()=>compileTypingMindChatRequest({model:TYPINGMIND_UBERMIND_MODEL,messages:[{role:'user',content:'Give me the exact answer.'}],max_tokens:100});

function providerSequence({crownProvider='Anthropic',crownText='ACCEPT'}={}){
 const key=(usage=0)=>({data:{label:'uberbond-runtime-20',limit:20,limit_remaining:20-usage,usage_monthly:usage,limit_reset:'monthly'}});
 return [
  key(0),
  {id:'g-builder',model:TYPINGMIND_BUILDER_MODEL,choices:[{message:{role:'assistant',content:'Builder candidate'}}],usage:{cost:.001,prompt_tokens:100,completion_tokens:10,prompt_tokens_details:{cached_tokens:0,cache_write_tokens:0}}},
  {data:{provider_name:'OpenAI',router:'openrouter/auto',model:TYPINGMIND_BUILDER_MODEL,total_cost:.001,tokens_prompt:100,tokens_completion:10}},
  key(.001),
  key(.001),
  {id:'g-crown',model:TYPINGMIND_CROWN_MODEL,choices:[{message:{role:'assistant',content:crownText}}],usage:{cost:.002,prompt_tokens:150,completion_tokens:1,prompt_tokens_details:{cached_tokens:0,cache_write_tokens:0}}},
  {data:{provider_name:crownProvider,router:'openrouter/auto',model:TYPINGMIND_CROWN_MODEL,total_cost:.002,tokens_prompt:150,tokens_completion:1}},
  key(.003)
 ];
}

test('readiness refuses missing current Crown admission before any inference',()=>{
 const r=inspectTypingMindLiveReadiness({paidAuthorization:authorization(),crownAdmission:null,marketSnapshot:market(),openRouterKeyPresent:true,now});
 assert.equal(r.ok,false);assert.ok(r.reasons.includes('valid-current-general-crown-admission-required'));
});

test('live gateway performs Sol builder then exact-provider Opus Crown ACCEPT and settles both bills',async()=>{
 const rows=providerSequence();let calls=0;
 const fetchImpl=async(url,opts={})=>{
   calls++;const body=rows.shift();assert.ok(body,'unexpected provider call');
   if(String(url).includes('/chat/completions')){
     const req=JSON.parse(opts.body);assert.equal(req.stream,false);assert.equal(req.provider.zdr,true);assert.equal(req.provider.data_collection,'deny');
   }
   return {ok:true,status:200,text:async()=>JSON.stringify(body)};
 };
 const store=makeStore();
 const o=createTypingMindLiveOrchestrator({store,openRouterKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:authorization(),crownAdmission:admission(),marketSnapshot:market(),fetchImpl,clock:()=>now});
 assert.equal(o.readiness().ok,true);
 const out=await o.execute(request());
 assert.equal(out.ok,true);assert.equal(out.completion.choices[0].message.content,'Builder candidate');
 assert.equal(out.completion.uberbond.authorityClass,'CROWN_VERIFIED_SEMANTIC_ACCEPT');
 assert.equal(out.completion.uberbond.builderModel,TYPINGMIND_BUILDER_MODEL);assert.equal(out.completion.uberbond.crownModel,TYPINGMIND_CROWN_MODEL);
 assert.equal(out.completion.uberbond.actualCostUsd,.003);assert.equal(out.sideEffectAuthority,'NONE');assert.equal(out.jev.usedToSuppressCrown,false);
 assert.equal(calls,8);
 const snap=await o.runtime.snapshot();
 assert.equal(snap.budget.monthSpentMicrousd,3000);assert.equal(snap.budget.crownEscrowRemainingMicrousd,14_998_000);
});

test('live gateway records Jev control tensor in shadow while Opus remains final authority',async()=>{
 const key=(usage=0)=>({data:{label:'uberbond-runtime-20',limit:20,limit_remaining:20-usage,usage_monthly:usage,limit_reset:'monthly'}});
 const rows=[
   key(0),
   {model:'typesafe/jev-1.13-20260917',answers:{
     task_shape:{type:'choice',choice:'other',probabilities:{short_direct:.2,source_heavy:.1,coding:.1,research:.2,agentic_tool:.1,other:.3},confidence:.3},
     source_compression_value:{type:'score',score:0,legend:{0:'Little',1:'Moderate',2:'Large'},probabilities:{0:.8,1:.15,2:.05},confidence:.7},
     independent_challenge:{type:'noul',noul:.4},hard_reasoning:{type:'score',score:1,legend:{0:'Routine',1:'Substantial',2:'Exceptional'},probabilities:{0:.2,1:.7,2:.1},confidence:.6},
     crown_necessity:{type:'noul',noul:.9}
   },usage:{input_tokens:500,output_tokens:80,cost:.000018774},id:'gen-dec-shadow-1',provider:'TypeSafe'},
   key(.000018774),
   key(.000018774),
   {id:'g-builder',model:TYPINGMIND_BUILDER_MODEL,choices:[{message:{role:'assistant',content:'Builder candidate'}}],usage:{cost:.001,prompt_tokens:100,completion_tokens:10,prompt_tokens_details:{cached_tokens:0,cache_write_tokens:0}}},
   {data:{provider_name:'OpenAI',router:'openrouter/auto',model:TYPINGMIND_BUILDER_MODEL,total_cost:.001,tokens_prompt:100,tokens_completion:10}},
   key(.001018774),
   key(.001018774),
   {id:'g-crown',model:TYPINGMIND_CROWN_MODEL,choices:[{message:{role:'assistant',content:'ACCEPT'}}],usage:{cost:.002,prompt_tokens:150,completion_tokens:1,prompt_tokens_details:{cached_tokens:0,cache_write_tokens:0}}},
   {data:{provider_name:'Anthropic',router:'openrouter/auto',model:TYPINGMIND_CROWN_MODEL,total_cost:.002,tokens_prompt:150,tokens_completion:1}},
   key(.003018774)
 ];
 let calls=0;
 const fetchImpl=async()=>{calls++;const body=rows.shift();assert.ok(body,'unexpected provider call');return {ok:true,status:200,text:async()=>JSON.stringify(body)};};
 const o=createTypingMindLiveOrchestrator({store:makeStore(),openRouterKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:authorization(),crownAdmission:admission(),marketSnapshot:marketWithJev(),fetchImpl,clock:()=>now});
 const out=await o.execute(request());
 assert.equal(out.ok,true);
 assert.equal(out.completion.uberbond.jevShadow.semanticAuthority,'NONE');
 assert.equal(out.completion.uberbond.jevShadow.usedToSuppressCrown,false);
 assert.equal(out.completion.uberbond.jevShadow.observedModelRevision,'typesafe/jev-1.13-20260917');
 assert.equal(out.completion.uberbond.jevShadow.answers.crown_necessity.noul,.9);
 assert.equal(out.completion.uberbond.authorityClass,'CROWN_VERIFIED_SEMANTIC_ACCEPT');
 assert.equal(out.completion.uberbond.providerCalls,3);
 assert.equal(calls,11);
 const snap=await o.runtime.snapshot();
 assert.equal(snap.budget.monthSpentMicrousd,3019);
});

test('upstream provider drift refuses Crown authority after observed paid call and freezes no false answer into cockpit',async()=>{
 const rows=providerSequence({crownProvider:'Unexpected Provider'});let calls=0;
 const fetchImpl=async()=>{calls++;return {ok:true,status:200,text:async()=>JSON.stringify(rows.shift())};};
 const o=createTypingMindLiveOrchestrator({store:makeStore(),openRouterKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:authorization(),crownAdmission:admission('Anthropic'),marketSnapshot:market(),fetchImpl,clock:()=>now});
 const out=await o.execute(request());
 assert.equal(out.ok,false);assert.equal(out.status,'CROWN_PROVIDER_OR_ROUTE_DRIFT_REFUSED');
 assert.equal(out.semanticAuthority,'NONE');assert.equal(out.qualityAction,'QUEUE_NEVER_DOWNGRADE');assert.equal(calls,8);
});

test('missing upstream provider refuses Crown authority even when model matches',async()=>{
 const rows=providerSequence();delete rows[6].data.provider_name;
 const fetchImpl=async()=>({ok:true,status:200,text:async()=>JSON.stringify(rows.shift())});
 const o=createTypingMindLiveOrchestrator({store:makeStore(),openRouterKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:authorization(),crownAdmission:admission(),marketSnapshot:market(),fetchImpl,clock:()=>now});
 const out=await o.execute(request());
 assert.equal(out.ok,false);assert.equal(out.status,'CROWN_UPSTREAM_PROVIDER_UNOBSERVED');assert.equal(out.semanticAuthority,'NONE');
});

test('routing-policy mismatch in Crown Admission Receipt refuses before paid inference',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw new Error('provider-must-not-be-called');};
 const wrong=admission('Anthropic','openrouter:different-policy');
 const o=createTypingMindLiveOrchestrator({store:makeStore(),openRouterKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:authorization(),crownAdmission:wrong,marketSnapshot:market(),fetchImpl,clock:()=>now});
 assert.equal(o.readiness().ok,false);
 const out=await o.execute(request());
 assert.equal(out.ok,false);assert.equal(out.status,'TYPINGMIND_UBERMIND_LIVE_NOT_READY');assert.equal(calls,0);
});

test('Crown REWRITE becomes direct Crown answer and never authorizes builder prose',async()=>{
 const rows=providerSequence({crownText:'REWRITE\nCorrected frontier answer'});
 const fetchImpl=async()=>({ok:true,status:200,text:async()=>JSON.stringify(rows.shift())});
 const o=createTypingMindLiveOrchestrator({store:makeStore(),openRouterKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:authorization(),crownAdmission:admission(),marketSnapshot:market(),fetchImpl,clock:()=>now});
 const out=await o.execute(request());
 assert.equal(out.ok,true);assert.equal(out.completion.choices[0].message.content,'Corrected frontier answer');
 assert.equal(out.completion.uberbond.authorityClass,'DIRECT_CURRENT_CROWN');
});

test('worker budget cannot consume the protected Crown reserve',async()=>{
 const rows=providerSequence();
 const fetchImpl=async()=>({ok:true,status:200,text:async()=>JSON.stringify(rows.shift())});
 const o=createTypingMindLiveOrchestrator({store:makeStore(),openRouterKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:authorization(),crownAdmission:admission(),marketSnapshot:market(),fetchImpl,clock:()=>now});
 const snap=await o.runtime.snapshot();
 assert.equal(snap.budget.crownEscrowRemainingMicrousd,15_000_000);assert.equal(snap.budget.workerAvailableMicrousd,5_000_000);
});
