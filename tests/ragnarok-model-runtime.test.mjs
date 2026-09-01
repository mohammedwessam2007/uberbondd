import test from 'node:test';
import assert from 'node:assert/strict';
import { createVercelAIGatewayExecutor } from '../src/vercel-ai-gateway-executor.mjs';
import { inspectModelProviderReadiness } from '../src/model-provider-doctor.mjs';
import { executeWithFailover } from '../src/agent-model-failover.mjs';

const task={taskId:'task-1',objective:'prepare evidence',consequenceClass:'LOCAL_PREPARATION'};
const pricing={inputUsdPerMillion:1,outputUsdPerMillion:2,sourceRef:'https://example.test/pricing',verifiedAt:'2026-09-01T00:00:00.000Z'};
function goodPayload(model='openai/gpt-5.6-sol') { return {id:'req-1',model,usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30},choices:[{message:{content:JSON.stringify({outcome:'ok'})}}]}; }

test('gateway refuses pre-call spend above ceiling without a provider call',async()=>{
  let calls=0;
  const exec=createVercelAIGatewayExecutor({apiKey:'1234567890123456',enabled:true,pricing,fetchImpl:async()=>{calls++;throw new Error('should not call');}});
  const result=await exec({task,maxTokens:128000,costCeilingCents:0});
  assert.equal(result.ok,false);
  assert.ok(result.reasonCodes.includes('precall-cost-ceiling-exceeded'));
  assert.equal(calls,0);
});

test('gateway preserves observed serving model identity and never returns key',async()=>{
  const secret='super-secret-key-12345';
  const exec=createVercelAIGatewayExecutor({apiKey:secret,enabled:true,pricing,fetchImpl:async()=>({ok:true,status:200,text:async()=>JSON.stringify(goodPayload('anthropic/claude-fable-5.1'))})});
  const result=await exec({task,model:'openai/gpt-5.6-sol',maxTokens:100,costCeilingCents:10});
  assert.equal(result.ok,true);
  assert.equal(result.requestedModel,'openai/gpt-5.6-sol');
  assert.equal(result.servedModel,'anthropic/claude-fable-5.1');
  assert.equal(result.servedProvider,'anthropic');
  assert.equal(JSON.stringify(result).includes(secret),false);
});

test('gateway 401 is terminal credential failure while 5xx is uncertain outage',async()=>{
  const run=async status=>createVercelAIGatewayExecutor({apiKey:'1234567890123456',enabled:true,pricing,fetchImpl:async()=>({ok:false,status})})({task,maxTokens:100,costCeilingCents:10});
  const auth=await run(401); assert.equal(auth.outcome,'CONFIRMED_FAILURE'); assert.ok(auth.reasonCodes.includes('credential-rejected'));
  const outage=await run(503); assert.equal(outage.outcome,'UNCERTAIN'); assert.ok(outage.reasonCodes.includes('provider-outage'));
});

test('model doctor exposes readiness booleans not credentials and reaches multi-route only from configured routes',()=>{
  const env={
    OPENAI_API_KEY:'openai-secret',OPENAI_AGENT_ENABLED:'true',OPENAI_INPUT_USD_PER_MILLION:'1',OPENAI_OUTPUT_USD_PER_MILLION:'2',OPENAI_PRICING_SOURCE:'https://example.test',OPENAI_PRICING_VERIFIED_AT:'2026-09-01',
    AI_GATEWAY_API_KEY:'gateway-secret',AI_GATEWAY_AGENT_ENABLED:'true',AI_GATEWAY_INPUT_USD_PER_MILLION:'1',AI_GATEWAY_OUTPUT_USD_PER_MILLION:'2',AI_GATEWAY_PRICING_SOURCE:'https://example.test',AI_GATEWAY_PRICING_VERIFIED_AT:'2026-09-01'
  };
  const result=inspectModelProviderReadiness({env});
  assert.equal(result.status,'MULTI_ROUTE_READY');
  assert.equal(result.failoverAvailable,true);
  assert.equal(JSON.stringify(result).includes('openai-secret'),false);
  assert.equal(JSON.stringify(result).includes('gateway-secret'),false);
});

test('confirmed 429 fails over, but uncertain outage cannot fan out non-idempotent work',async()=>{
  const route={ok:true,selected:{provider:'openai',model:'m1'},alternatives:[{provider:'vercel-ai-gateway',model:'openai/m2'}]};
  const served=await executeWithFailover({route,authorizedProviders:['openai','vercel-ai-gateway'],execute:async c=>c.provider==='openai'?{ok:false,outcome:'CONFIRMED_FAILURE',reasonCodes:['openai-http-429']}:{ok:true,providerRequestId:'x'},maxAttempts:2});
  assert.equal(served.status,'SERVED_BY_FALLBACK');
  assert.equal(served.served.provider,'vercel-ai-gateway');

  let calls=0;
  const blocked=await executeWithFailover({route,authorizedProviders:['openai','vercel-ai-gateway'],execute:async()=>{calls++;return{ok:false,outcome:'UNCERTAIN',reasonCodes:['provider-outage']};},taskIdempotency:'NOT_IDEMPOTENT',maxAttempts:2});
  assert.equal(blocked.ok,false);
  assert.equal(calls,1);
  assert.ok(blocked.reasonCodes.includes('uncertain-outcome-not-retryable-for-non-idempotent-task'));
});

test('all configured routes exhausted terminates instead of looping',async()=>{
  const route={ok:true,selected:{provider:'openai',model:'m1'},alternatives:[{provider:'vercel-ai-gateway',model:'openai/m2'}]};
  let calls=0;
  const result=await executeWithFailover({route,authorizedProviders:['openai','vercel-ai-gateway'],execute:async()=>{calls++;return{ok:false,outcome:'CONFIRMED_FAILURE',reasonCodes:['rate_limit']};},maxAttempts:8});
  assert.equal(result.status,'ALL_ROUTES_EXHAUSTED');
  assert.equal(calls,2);
});
