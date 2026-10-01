import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { compileInfiniteOpusMarket } from '../src/infinite-opus-market.mjs';
import { issueCrownAdmissionReceipt } from '../src/crown-admission.mjs';
import { compileTypingMindChatRequest, TYPINGMIND_UBERMIND_MODEL } from '../src/infinite-opus-typingmind-gateway.mjs';
import { createTypingMindLiveOrchestrator, inspectTypingMindLiveReadiness,
  TYPINGMIND_JEV_MODEL,TYPINGMIND_BUILDER_MODEL,TYPINGMIND_MIMO_MODEL,TYPINGMIND_DEEPSEEK_MODEL,
  TYPINGMIND_CROWN_MODEL,TYPINGMIND_CROWN_ROUTE_IDENTITY } from '../src/infinite-opus-typingmind-live.mjs';

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
 {id:TYPINGMIND_JEV_MODEL,canonical_slug:'jev-r1',pricing:{prompt:'0.000000042',completion:'0'},context_length:32000,top_provider:{max_completion_tokens:1},supported_parameters:[],architecture:{input_modalities:['text']}},
 {id:TYPINGMIND_BUILDER_MODEL,canonical_slug:'sol-r1',pricing:{prompt:'0.000002',completion:'0.000010',input_cache_read:'0.0000001',input_cache_write:'0.0000025'},context_length:1050000,top_provider:{max_completion_tokens:128000},supported_parameters:['tools','structured_outputs'],architecture:{input_modalities:['text']}},
 {id:TYPINGMIND_CROWN_MODEL,canonical_slug:'opus-r1',pricing:{prompt:'0.000004',completion:'0.000020',input_cache_read:'0.0000002',input_cache_write:'0.000005'},context_length:1000000,top_provider:{max_completion_tokens:128000},supported_parameters:['tools','structured_outputs'],architecture:{input_modalities:['text']}}
]},{verifiedAt:iso,ttlMs:86400000});

const adaptiveMarket=()=>compileInfiniteOpusMarket({data:[
 {id:TYPINGMIND_JEV_MODEL,canonical_slug:'jev-r1',pricing:{prompt:'0.000000042',completion:'0'},context_length:32000,top_provider:{max_completion_tokens:1},supported_parameters:[],architecture:{input_modalities:['text']}},
 {id:TYPINGMIND_MIMO_MODEL,canonical_slug:'mimo-r1',pricing:{prompt:'0.00000014',completion:'0.00000028',input_cache_read:'0.0000000028'},context_length:1000000,top_provider:{max_completion_tokens:128000},supported_parameters:['structured_outputs'],architecture:{input_modalities:['text','image']}},
 {id:TYPINGMIND_DEEPSEEK_MODEL,canonical_slug:'deepseek-r1',pricing:{prompt:'0.00000013',completion:'0.00000052',input_cache_read:'0.0000000026'},context_length:1048576,top_provider:{max_completion_tokens:128000},supported_parameters:['tools'],architecture:{input_modalities:['text','image']}},
 {id:TYPINGMIND_BUILDER_MODEL,canonical_slug:'sol-r1',pricing:{prompt:'0.000002',completion:'0.000010',input_cache_read:'0.0000001',input_cache_write:'0.0000025'},context_length:1050000,top_provider:{max_completion_tokens:128000},supported_parameters:['tools','structured_outputs'],architecture:{input_modalities:['text']}},
 {id:TYPINGMIND_CROWN_MODEL,canonical_slug:'opus-r1',pricing:{prompt:'0.000004',completion:'0.000020',input_cache_read:'0.0000002',input_cache_write:'0.000005'},context_length:1000000,top_provider:{max_completion_tokens:128000},supported_parameters:['tools','structured_outputs'],architecture:{input_modalities:['text']}}
]},{verifiedAt:iso,ttlMs:86400000});

const admission=(provider='Amazon Bedrock',routeIdentity=TYPINGMIND_CROWN_ROUTE_IDENTITY)=>{
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
const builderRequest=()=>compileTypingMindChatRequest({model:TYPINGMIND_UBERMIND_MODEL,messages:[{role:'user',content:'Produce a detailed answer.'}],max_tokens:3000});
const directRequest=()=>compileTypingMindChatRequest({model:TYPINGMIND_UBERMIND_MODEL,messages:[{role:'user',content:'Short exact explanation.'}],max_tokens:100});
const key=usage=>({data:{label:'uberbond-runtime-20',limit:20,limit_remaining:20-usage,usage_monthly:usage,limit_reset:'monthly'}});

function builderSequence({crownProvider='Amazon Bedrock',crownReview={verdict:'ACCEPT',patches:[],rewrite:''},hardScore=2}={}){
 return [
  key(0),
  {model:'typesafe/jev-1.13-20260917',answers:{
    task_shape:{type:'choice',choice:'other',probabilities:{other:.8,coding:.2},confidence:.7},
    source_compression_value:{type:'score',score:0,confidence:.9},
    independent_challenge:{type:'noul',noul:.2},
    hard_reasoning:{type:'score',score:hardScore,confidence:.9},
    crown_necessity:{type:'noul',noul:.99}
  },usage:{input_tokens:500,output_tokens:40,cost:.000042},id:'gen-dec-1',provider:'TypeSafe'},
  key(.000042),

  key(.000042),
  {id:'g-builder',model:TYPINGMIND_BUILDER_MODEL,choices:[{message:{role:'assistant',content:'Builder answer is 41.'}}],usage:{cost:.001,prompt_tokens:100,completion_tokens:10,prompt_tokens_details:{cached_tokens:0,cache_write_tokens:0}}},
  {data:{provider_name:'OpenAI',router:'openrouter/auto',model:TYPINGMIND_BUILDER_MODEL,total_cost:.001,tokens_prompt:100,tokens_completion:10}},
  key(.001042),

  key(.001042),
  {id:'g-crown',model:TYPINGMIND_CROWN_MODEL,choices:[{message:{role:'assistant',content:JSON.stringify(crownReview)}}],usage:{cost:.002,prompt_tokens:150,completion_tokens:8,prompt_tokens_details:{cached_tokens:0,cache_write_tokens:0}}},
  {data:{provider_name:crownProvider,router:'openrouter/auto',model:TYPINGMIND_CROWN_MODEL,total_cost:.002,tokens_prompt:150,tokens_completion:8}},
  key(.003042)
 ];
}

function directSequence({provider='Amazon Bedrock',text='Direct Crown answer'}={}){
 return [
  key(0),
  {id:'g-direct',model:TYPINGMIND_CROWN_MODEL,choices:[{message:{role:'assistant',content:text}}],usage:{cost:.002,prompt_tokens:50,completion_tokens:20,prompt_tokens_details:{cached_tokens:0,cache_write_tokens:0}}},
  {data:{provider_name:provider,router:'openrouter/auto',model:TYPINGMIND_CROWN_MODEL,total_cost:.002,tokens_prompt:50,tokens_completion:20}},
  key(.002)
 ];
}

test('readiness refuses missing current Crown admission before any inference',()=>{
 const r=inspectTypingMindLiveReadiness({paidAuthorization:authorization(),crownAdmission:null,marketSnapshot:market(),openRouterKeyPresent:true,now});
 assert.equal(r.ok,false);assert.ok(r.reasons.includes('valid-current-general-crown-admission-required'));
});

test('short input/output chooses one direct Opus call instead of paying fixed-chain tax',async()=>{
 const rows=directSequence();let calls=0;
 const fetchImpl=async()=>{calls++;return {ok:true,status:200,text:async()=>JSON.stringify(rows.shift())};};
 const o=createTypingMindLiveOrchestrator({store:makeStore(),openRouterKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:authorization(),crownAdmission:admission(),marketSnapshot:market(),fetchImpl,clock:()=>now});
 const out=await o.execute(directRequest());
 assert.equal(out.ok,true);assert.equal(out.status,'TYPINGMIND_UBERMIND_DIRECT_CROWN_RESPONSE');
 assert.equal(out.completion.choices[0].message.content,'Direct Crown answer');
 assert.equal(out.completion.uberbond.authorityClass,'DIRECT_CURRENT_CROWN');
 assert.equal(out.routeDecision.selected,'DIRECT_OPUS');
 assert.equal(out.jev.mode,'NOT_NEEDED_FOR_DIRECT_COST_WINNER');
 assert.equal(calls,4);
});

test('generation-heavy task uses Jev control, Sol builder, then Opus delta ACCEPT with all bills settled',async()=>{
 const rows=builderSequence();let calls=0,solEffort=null,crownStructured=false;
 const fetchImpl=async(url,opts={})=>{
   calls++;
   if(String(url).includes('/chat/completions')){
     const req=JSON.parse(opts.body);
     assert.equal(req.stream,false);assert.equal(req.provider.zdr,true);assert.equal(req.provider.data_collection,'deny');
     if(req.model===TYPINGMIND_BUILDER_MODEL)solEffort=req.reasoning?.effort;
     if(req.model===TYPINGMIND_CROWN_MODEL)crownStructured=req.response_format?.type==='json_schema';
   }
   const body=rows.shift();assert.ok(body,'unexpected provider call');
   return {ok:true,status:200,text:async()=>JSON.stringify(body)};
 };
 const store=makeStore();
 const o=createTypingMindLiveOrchestrator({store,openRouterKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:authorization(),crownAdmission:admission(),marketSnapshot:market(),fetchImpl,clock:()=>now});
 const out=await o.execute(builderRequest());
 assert.equal(out.ok,true);assert.equal(out.completion.choices[0].message.content,'Builder answer is 41.');
 assert.equal(out.completion.uberbond.authorityClass,'CROWN_VERIFIED_SEMANTIC_ACCEPT');
 assert.equal(out.routeDecision.selected,'SOL_THEN_OPUS_DELTA');
 assert.equal(out.jev.mode,'SHADOW_CONTROL_OBSERVED');assert.equal(out.jev.usedToSuppressCrown,false);
 assert.equal(out.jev.usedToTuneWorker,true);assert.equal(out.jev.reasoningEffort,'max');
 assert.equal(solEffort,'max');assert.equal(crownStructured,true);
 assert.equal(out.completion.uberbond.actualCostUsd,.003042);
 assert.equal(calls,11);
 const snap=await o.runtime.snapshot();
 assert.equal(snap.budget.monthSpentMicrousd,3042);
 assert.equal(snap.budget.crownEscrowRemainingMicrousd,14_998_000);
});

test('Crown exact PATCH repairs only the unique defect and avoids full rewrite',async()=>{
 const rows=builderSequence({crownReview:{verdict:'PATCH',patches:[{old:'41',replacement:'42'}],rewrite:''},hardScore:0});
 const fetchImpl=async()=>({ok:true,status:200,text:async()=>JSON.stringify(rows.shift())});
 const o=createTypingMindLiveOrchestrator({store:makeStore(),openRouterKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:authorization(),crownAdmission:admission(),marketSnapshot:market(),fetchImpl,clock:()=>now});
 const out=await o.execute(builderRequest());
 assert.equal(out.ok,true);assert.equal(out.completion.choices[0].message.content,'Builder answer is 42.');
 assert.equal(out.completion.uberbond.authorityClass,'CROWN_VERIFIED_EXACT_PATCH');
 assert.equal(out.jev.reasoningEffort,'low');
});

test('Crown structured REWRITE becomes direct Crown answer',async()=>{
 const rows=builderSequence({crownReview:{verdict:'REWRITE',patches:[],rewrite:'Corrected frontier answer'}});
 const fetchImpl=async()=>({ok:true,status:200,text:async()=>JSON.stringify(rows.shift())});
 const o=createTypingMindLiveOrchestrator({store:makeStore(),openRouterKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:authorization(),crownAdmission:admission(),marketSnapshot:market(),fetchImpl,clock:()=>now});
 const out=await o.execute(builderRequest());
 assert.equal(out.ok,true);assert.equal(out.completion.choices[0].message.content,'Corrected frontier answer');
 assert.equal(out.completion.uberbond.authorityClass,'DIRECT_CURRENT_CROWN');
});

test('upstream Crown provider drift refuses authority after observed paid calls',async()=>{
 const rows=builderSequence({crownProvider:'Unexpected Provider'});let calls=0;
 const fetchImpl=async()=>{calls++;return {ok:true,status:200,text:async()=>JSON.stringify(rows.shift())};};
 const o=createTypingMindLiveOrchestrator({store:makeStore(),openRouterKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:authorization(),crownAdmission:admission('Amazon Bedrock'),marketSnapshot:market(),fetchImpl,clock:()=>now});
 const out=await o.execute(builderRequest());
 assert.equal(out.ok,false);assert.equal(out.status,'CROWN_PROVIDER_OR_ROUTE_DRIFT_REFUSED');
 assert.equal(out.semanticAuthority,'NONE');assert.equal(out.qualityAction,'QUEUE_NEVER_DOWNGRADE');
 assert.equal(calls,11);
});

test('routing-policy mismatch in Crown Admission Receipt refuses before paid inference',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw new Error('provider-must-not-be-called');};
 const wrong=admission('Amazon Bedrock','openrouter:different-policy');
 const o=createTypingMindLiveOrchestrator({store:makeStore(),openRouterKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:authorization(),crownAdmission:wrong,marketSnapshot:market(),fetchImpl,clock:()=>now});
 assert.equal(o.readiness().ok,false);
 const out=await o.execute(builderRequest());
 assert.equal(out.ok,false);assert.equal(out.status,'TYPINGMIND_UBERMIND_LIVE_NOT_READY');assert.equal(calls,0);
});

function adaptiveWriterSequence({writerModel,shape='source_heavy',hardScore=0,independent=.2,writerText='Cheap candidate'}={}){
 const writerProvider=writerModel===TYPINGMIND_MIMO_MODEL?'Xiaomi':'DeepSeek';
 return [
  key(0),
  {model:'typesafe/jev-1.13-20260917',answers:{
    task_shape:{type:'choice',choice:shape,probabilities:{[shape]:.95},confidence:.9},
    source_compression_value:{type:'score',score:2,confidence:.9},
    independent_challenge:{type:'noul',noul:independent},
    hard_reasoning:{type:'score',score:hardScore,confidence:.9},
    crown_necessity:{type:'noul',noul:.99}
  },usage:{input_tokens:500,output_tokens:40,cost:.000042},id:'gen-dec-adaptive',provider:'TypeSafe'},
  key(.000042),

  key(.000042),
  {id:'g-writer',model:writerModel,choices:[{message:{role:'assistant',content:writerText}}],usage:{cost:.0002,prompt_tokens:100,completion_tokens:50,prompt_tokens_details:{cached_tokens:0,cache_write_tokens:0}}},
  {data:{provider_name:writerProvider,router:'openrouter/auto',model:writerModel,total_cost:.0002,tokens_prompt:100,tokens_completion:50}},
  key(.000242),

  key(.000242),
  {id:'g-crown',model:TYPINGMIND_CROWN_MODEL,choices:[{message:{role:'assistant',content:JSON.stringify({verdict:'ACCEPT',patches:[],rewrite:''})}}],usage:{cost:.002,prompt_tokens:150,completion_tokens:8,prompt_tokens_details:{cached_tokens:0,cache_write_tokens:0}}},
  {data:{provider_name:'Amazon Bedrock',router:'openrouter/auto',model:TYPINGMIND_CROWN_MODEL,total_cost:.002,tokens_prompt:150,tokens_completion:8}},
  key(.002242)
 ];
}

test('source-heavy routine work uses MiMo as candidate writer while Opus retains final authority',async()=>{
 const rows=adaptiveWriterSequence({writerModel:TYPINGMIND_MIMO_MODEL,shape:'source_heavy',hardScore:0,writerText:'MiMo complete candidate'});let seenModels=[];
 const fetchImpl=async(url,opts={})=>{
   if(String(url).includes('/chat/completions'))seenModels.push(JSON.parse(opts.body).model);
   return {ok:true,status:200,text:async()=>JSON.stringify(rows.shift())};
 };
 const o=createTypingMindLiveOrchestrator({store:makeStore(),openRouterKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:authorization(),crownAdmission:admission(),marketSnapshot:adaptiveMarket(),fetchImpl,clock:()=>now});
 const out=await o.execute(builderRequest());
 assert.equal(out.ok,true);
 assert.equal(out.routeDecision.selected,'MIMO_THEN_OPUS_DELTA');
 assert.equal(out.completion.choices[0].message.content,'MiMo complete candidate');
 assert.equal(out.completion.uberbond.authorityClass,'CROWN_VERIFIED_SEMANTIC_ACCEPT');
 assert.equal(out.completion.uberbond.processorFabric.writerModel,TYPINGMIND_MIMO_MODEL);
 assert.deepEqual(seenModels,[TYPINGMIND_MIMO_MODEL,TYPINGMIND_CROWN_MODEL]);
});

test('empty cheap candidate falls back to direct Opus and preserves sunk writer cost',async()=>{
 const rows=[
  key(0),
  {model:'typesafe/jev-1.13-20260917',answers:{
    task_shape:{type:'choice',choice:'source_heavy',probabilities:{source_heavy:.95},confidence:.9},
    source_compression_value:{type:'score',score:2,confidence:.9},
    independent_challenge:{type:'noul',noul:.1},
    hard_reasoning:{type:'score',score:0,confidence:.9},
    crown_necessity:{type:'noul',noul:.99}
  },usage:{input_tokens:500,output_tokens:40,cost:.000042},id:'gen-dec-fallback',provider:'TypeSafe'},
  key(.000042),
  key(.000042),
  {id:'g-empty-writer',model:TYPINGMIND_MIMO_MODEL,choices:[{message:{role:'assistant',content:''}}],usage:{cost:.0002,prompt_tokens:100,completion_tokens:1,prompt_tokens_details:{cached_tokens:0,cache_write_tokens:0}}},
  {data:{provider_name:'Xiaomi',router:'openrouter/auto',model:TYPINGMIND_MIMO_MODEL,total_cost:.0002,tokens_prompt:100,tokens_completion:1}},
  key(.000242),
  key(.000242),
  {id:'g-direct-after-empty',model:TYPINGMIND_CROWN_MODEL,choices:[{message:{role:'assistant',content:'Direct Crown fallback'}}],usage:{cost:.002,prompt_tokens:150,completion_tokens:20,prompt_tokens_details:{cached_tokens:0,cache_write_tokens:0}}},
  {data:{provider_name:'Amazon Bedrock',router:'openrouter/auto',model:TYPINGMIND_CROWN_MODEL,total_cost:.002,tokens_prompt:150,tokens_completion:20}},
  key(.002242)
 ];
 const fetchImpl=async()=>({ok:true,status:200,text:async()=>JSON.stringify(rows.shift())});
 const o=createTypingMindLiveOrchestrator({store:makeStore(),openRouterKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:authorization(),crownAdmission:admission(),marketSnapshot:adaptiveMarket(),fetchImpl,clock:()=>now});
 const out=await o.execute(builderRequest());
 assert.equal(out.ok,true);
 assert.equal(out.status,'TYPINGMIND_UBERMIND_DIRECT_CROWN_RESPONSE');
 assert.equal(out.completion.choices[0].message.content,'Direct Crown fallback');
 assert.equal(out.completion.uberbond.actualCostUsd,.002242);
 assert.equal(out.completion.uberbond.providerCalls,3);
 assert.equal(out.routeDecision.sunkCostMicrousd,200);
 assert.equal(out.routeDecision.reason,'EMPTY_CANDIDATE_FALLBACK_DIRECT_CROWN');
});

test('coding-shaped non-hard work can use DeepSeek candidate writer instead of paying Sol',async()=>{
 const rows=adaptiveWriterSequence({writerModel:TYPINGMIND_DEEPSEEK_MODEL,shape:'coding',hardScore:1,writerText:'DeepSeek coding candidate'});let seenModels=[];
 const fetchImpl=async(url,opts={})=>{
   if(String(url).includes('/chat/completions'))seenModels.push(JSON.parse(opts.body).model);
   return {ok:true,status:200,text:async()=>JSON.stringify(rows.shift())};
 };
 const o=createTypingMindLiveOrchestrator({store:makeStore(),openRouterKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:authorization(),crownAdmission:admission(),marketSnapshot:adaptiveMarket(),fetchImpl,clock:()=>now});
 const out=await o.execute(builderRequest());
 assert.equal(out.ok,true);
 assert.equal(out.routeDecision.selected,'DEEPSEEK_THEN_OPUS_DELTA');
 assert.equal(out.completion.uberbond.processorFabric.writerModel,TYPINGMIND_DEEPSEEK_MODEL);
 assert.deepEqual(seenModels,[TYPINGMIND_DEEPSEEK_MODEL,TYPINGMIND_CROWN_MODEL]);
});

test('worker budget cannot consume protected Crown reserve before any calls',async()=>{
 const o=createTypingMindLiveOrchestrator({
   store:makeStore(),openRouterKey:'sk-or-v1-'+'x'.repeat(32),paidAuthorization:authorization(),
   crownAdmission:admission(),marketSnapshot:market(),fetchImpl:async()=>{throw new Error('unused')},clock:()=>now
 });
 const snap=await o.runtime.snapshot();
 assert.equal(snap.budget.crownEscrowRemainingMicrousd,15_000_000);
 assert.equal(snap.budget.workerAvailableMicrousd,5_000_000);
});


test('admitted Bedrock Crown is pinned to the same ZDR transport at live execution',async()=>{
 const rows=directSequence({provider:'Amazon Bedrock',text:'Pinned Crown answer'});
 const seen=[];
 const fetchImpl=async(url,opts={})=>{
   if(String(url).includes('/chat/completions')){
     const body=JSON.parse(opts.body);seen.push(body);
   }
   const body=rows.shift();assert.ok(body,'unexpected provider call');
   return {ok:true,status:200,text:async()=>JSON.stringify(body)};
 };
 const o=createTypingMindLiveOrchestrator({
   store:makeStore(),openRouterKey:'sk-or-v1-'+'x'.repeat(32),
   paidAuthorization:authorization(),crownAdmission:admission('Amazon Bedrock'),
   marketSnapshot:market(),fetchImpl,clock:()=>now
 });
 assert.equal(o.readiness().ok,true);
 const out=await o.execute(directRequest());
 assert.equal(out.ok,true);
 const crownReq=seen.find(x=>x.model===TYPINGMIND_CROWN_MODEL);
 assert.ok(crownReq);
 assert.deepEqual(crownReq.provider.order,['amazon-bedrock']);
 assert.equal(crownReq.provider.allow_fallbacks,false);
 assert.equal(crownReq.provider.zdr,true);
 assert.equal(crownReq.provider.data_collection,'deny');
 assert.equal(out.crownReceipt.upstreamProvider,'Amazon Bedrock');
});
