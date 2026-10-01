import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenRouterGovernedAdapter} from '../src/openrouter-governed-adapter.mjs';
import {COGNITION_PERIMETER_ADMISSION} from '../src/cognition-transport-guard.mjs';
test('gateway 8192 output limit reaches strict governed transport; excess refuses before network',async()=>{
 const requests=[];
 const rows=[{data:{limit:20,limit_remaining:20,usage_monthly:0,limit_reset:'monthly'}},
 {id:'fixture',model:'fixture-model',choices:[{message:{content:'fixture'}}],usage:{cost:.001}},
 {data:{model:'fixture-model',provider_name:'fixture-provider',total_cost:.001}},
 {data:{limit:20,limit_remaining:19.999,usage_monthly:.001,limit_reset:'monthly'}}];
 const adapter=createOpenRouterGovernedAdapter({apiKeyProvider:async()=> 'fixture-key-32-characters-long',expectedKeyLimitUsd:20,cognitionPerimeterAdmission:COGNITION_PERIMETER_ADMISSION,fetchImpl:async(url,opts)=>{requests.push({url,...opts});return {ok:true,text:async()=>JSON.stringify(rows.shift())}}});
 const payload={model:'fixture-model',messages:[{role:'user',content:'fixture'}],maxTokens:8192,providerPolicy:{allow_fallbacks:false,zdr:true,data_collection:'deny'}};
 const out=await adapter.execute(payload);assert.equal(out.ok,true);
 const sent=JSON.parse(requests.find(r=>r.method==='POST').body);assert.equal(sent.max_tokens,8192);assert.equal(sent.provider.zdr,true);assert.equal(sent.provider.allow_fallbacks,false);assert.equal(sent.provider.require_parameters,true);
 const before=requests.length;
 for(const maxTokens of [8193,0,-1,1.5,null])await assert.rejects(adapter.execute({...payload,maxTokens}),/bounded-max-tokens-required/);
 assert.equal(requests.length,before);
});
