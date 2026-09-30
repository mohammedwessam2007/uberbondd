import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyTypingMindGatewayBearer, compileTypingMindChatRequest, stableModelSessionId,
  buildBuilderMessages, buildCrownReviewMessages, buildDirectCrownMessages, applyCrownReview,
  openAICompatibleCompletion, openAICompatibleDirectCrownCompletion, CROWN_REVIEW_RESPONSE_FORMAT, gatewayStatus,
  TYPINGMIND_UBERMIND_MODEL } from '../src/infinite-opus-typingmind-gateway.mjs';
import { createOpenRouterGovernedAdapter } from '../src/openrouter-governed-adapter.mjs';
import { COGNITION_PERIMETER_ADMISSION } from '../src/cognition-transport-guard.mjs';

test('gateway bearer uses dedicated secret and rejects short/unrelated values',()=>{
 const secret='g'.repeat(48);
 assert.equal(verifyTypingMindGatewayBearer('Bearer '+secret,secret),true);
 assert.equal(verifyTypingMindGatewayBearer('Bearer wrong',secret),false);
 assert.equal(verifyTypingMindGatewayBearer('Bearer '+secret,'short'),false);
 assert.equal(verifyTypingMindGatewayBearer('',secret),false);
});

test('raw TypingMind chat is bounded, text-only and frontier-reviewed by default',()=>{
 const r=compileTypingMindChatRequest({model:TYPINGMIND_UBERMIND_MODEL,messages:[{role:'system',content:'stable'},{role:'user',content:'Solve this.'}],max_tokens:3000});
 assert.equal(r.maxTokens,3000);assert.equal(r.qualityClass,'Q_FRONTIER_INTERACTIVE');assert.equal(r.defaultLane,'CROWN_REVIEW_REQUIRED');
 assert.ok(r.inputTokenCeiling<300000);assert.equal(r.semanticAuthority,'NONE');
 assert.throws(()=>compileTypingMindChatRequest({model:'openai/gpt',messages:[{role:'user',content:'x'}]}),/ubermind-auto-model/);
 const streaming=compileTypingMindChatRequest({model:TYPINGMIND_UBERMIND_MODEL,messages:[{role:'user',content:'x'}],stream:true});
 assert.equal(streaming.streamRequested,true);
 assert.throws(()=>compileTypingMindChatRequest({model:TYPINGMIND_UBERMIND_MODEL,messages:[{role:'user',content:'x'}],tools:[{}]}),/tools-disabled/);
});

test('transport fingerprint binds the entire conversation and output ceiling',()=>{
 const base={model:TYPINGMIND_UBERMIND_MODEL,messages:[{role:'user',content:'same'}],max_tokens:100};
 const a=compileTypingMindChatRequest(base),b=compileTypingMindChatRequest(structuredClone(base));
 const c=compileTypingMindChatRequest({...base,max_tokens:101});
 const d=compileTypingMindChatRequest({...base,messages:[{role:'user',content:'changed'}]});
 assert.equal(a.requestFingerprint,b.requestFingerprint);
 assert.notEqual(a.requestFingerprint,c.requestFingerprint);
 assert.notEqual(a.requestFingerprint,d.requestFingerprint);
});

test('stable per-model session id survives later conversation growth',()=>{
 const a=compileTypingMindChatRequest({model:TYPINGMIND_UBERMIND_MODEL,messages:[{role:'system',content:'s'},{role:'user',content:'first'}]});
 const b=compileTypingMindChatRequest({model:TYPINGMIND_UBERMIND_MODEL,messages:[{role:'system',content:'s'},{role:'user',content:'first'},{role:'assistant',content:'a'},{role:'user',content:'second'}]});
 assert.equal(a.sessionRoot,b.sessionRoot);
 assert.equal(stableModelSessionId(a.sessionRoot,'m'),stableModelSessionId(b.sessionRoot,'m'));
 assert.notEqual(stableModelSessionId(a.sessionRoot,'m'),stableModelSessionId(a.sessionRoot,'n'));
});

test('builder is proposal only and Crown uses deterministic accept/patch/rewrite delta protocol',()=>{
 const request=compileTypingMindChatRequest({model:TYPINGMIND_UBERMIND_MODEL,messages:[{role:'user',content:'Question'}]});
 assert.match(buildBuilderMessages(request)[0].content,/Do not claim Crown authority/);
 assert.match(buildCrownReviewMessages(request,'candidate')[0].content,/structured JSON/);
 assert.equal(CROWN_REVIEW_RESPONSE_FORMAT.type,'json_schema');
 const accept=applyCrownReview('candidate',JSON.stringify({verdict:'ACCEPT',patches:[],rewrite:''}));
 assert.equal(accept.finalText,'candidate');assert.equal(accept.authorityClass,'CROWN_VERIFIED_SEMANTIC_ACCEPT');
 const patched=applyCrownReview('The answer is 41.',JSON.stringify({verdict:'PATCH',patches:[{old:'41',replacement:'42'}],rewrite:''}));
 assert.equal(patched.finalText,'The answer is 42.');assert.equal(patched.authorityClass,'CROWN_VERIFIED_EXACT_PATCH');
 const rewrite=applyCrownReview('candidate',JSON.stringify({verdict:'REWRITE',patches:[],rewrite:'correct'}));
 assert.equal(rewrite.finalText,'correct');assert.equal(rewrite.authorityClass,'DIRECT_CURRENT_CROWN');
 assert.throws(()=>applyCrownReview('x x',JSON.stringify({verdict:'PATCH',patches:[{old:'x',replacement:'y'}],rewrite:''})),/exactly-once/);
});

test('OpenAI compatible response preserves UberBond authority metadata without claiming multiplier',()=>{
 const request=compileTypingMindChatRequest({model:TYPINGMIND_UBERMIND_MODEL,messages:[{role:'user',content:'Question'}]});
 const out=openAICompatibleCompletion({request,candidate:'candidate',crown:'ACCEPT',usage:{promptTokens:10,completionTokens:2,builderModel:'builder',crownModel:'crown',providerCalls:2,actualCostUsd:.01}});
 assert.equal(out.model,TYPINGMIND_UBERMIND_MODEL);assert.equal(out.choices[0].message.content,'candidate');
 assert.equal(out.uberbond.multiplierClaim,null);assert.equal(out.uberbond.sideEffectAuthority,'NONE');
 assert.equal(gatewayStatus({runtimeConnected:true,crownAdmissionValid:true}).qualityDowngradeAllowed,false);
});

test('OpenRouter response cache is explicit and never silently enabled',async()=>{
 const secret='sk-or-v1-xxxxxxxxxxxxxxxx';let i=0,completionHeaders=[];
 const rows=[
  {data:{label:'runtime',limit:20,limit_remaining:20,usage_monthly:0,limit_reset:'monthly'}},
  {id:'g1',model:'m',choices:[{message:{role:'assistant',content:'OK'}}],usage:{cost:0,prompt_tokens:1,completion_tokens:1,prompt_tokens_details:{cached_tokens:0,cache_write_tokens:0}}},
  {data:{provider_name:'provider',model:'m',total_cost:0,tokens_prompt:1,tokens_completion:1}},
  {data:{label:'runtime',limit:20,limit_remaining:20,usage_monthly:0,limit_reset:'monthly'}},
  {data:{label:'runtime',limit:20,limit_remaining:20,usage_monthly:0,limit_reset:'monthly'}},
  {id:'g2',model:'m',choices:[{message:{role:'assistant',content:'OK'}}],usage:{cost:0,prompt_tokens:1,completion_tokens:1,prompt_tokens_details:{cached_tokens:0,cache_write_tokens:0}}},
  {data:{provider_name:'provider',model:'m',total_cost:0,tokens_prompt:1,tokens_completion:1}},
  {data:{label:'runtime',limit:20,limit_remaining:20,usage_monthly:0,limit_reset:'monthly'}}
 ];
 const fetchImpl=async(url,opts={})=>{
   if(String(url).includes('/chat/completions'))completionHeaders.push(opts.headers);
   const body=rows[i++];return {ok:true,status:200,text:async()=>JSON.stringify(body)};
 };
 const a=createOpenRouterGovernedAdapter({apiKeyProvider:async()=>secret,expectedKeyLimitUsd:20,cognitionPerimeterAdmission:COGNITION_PERIMETER_ADMISSION,fetchImpl});
 await a.execute({model:'m',messages:[{role:'user',content:'x'}],maxTokens:1});
 await a.execute({model:'m',messages:[{role:'user',content:'x'}],maxTokens:1,responseCache:true});
 assert.equal(completionHeaders[0]['X-OpenRouter-Cache'],undefined);
 assert.equal(completionHeaders[1]['X-OpenRouter-Cache'],'true');
});


test('direct Crown path returns direct authority without pretending there was a Builder',()=>{
 const request=compileTypingMindChatRequest({model:TYPINGMIND_UBERMIND_MODEL,messages:[{role:'user',content:'Short question'}]});
 assert.match(buildDirectCrownMessages(request)[0].content,/admitted UberMind task-class Crown/);
 const out=openAICompatibleDirectCrownCompletion({request,crownText:'Direct answer',usage:{promptTokens:5,completionTokens:2,crownModel:'opus',providerCalls:1,actualCostUsd:.001}});
 assert.equal(out.choices[0].message.content,'Direct answer');
 assert.equal(out.uberbond.authorityClass,'DIRECT_CURRENT_CROWN');
 assert.equal(out.uberbond.builderModel,null);
 assert.equal(out.uberbond.providerCalls,1);
});
