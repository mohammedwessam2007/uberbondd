import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIConversationModelAdapter } from '../src/openai-conversation-model-adapter.mjs';

test('OpenAI adapter creates and reuses persistent conversation context', async () => {
  const seen=[];
  const original=globalThis.fetch;
  globalThis.fetch=async (url,init={})=>{
    seen.push({url:String(url),body:init.body?JSON.parse(init.body):null,auth:init.headers?.Authorization});
    if(String(url).endsWith('/conversations')) return new Response(JSON.stringify({id:'conv_123'}),{status:200,headers:{'content-type':'application/json'}});
    if(String(url).endsWith('/responses')) return new Response(JSON.stringify({id:'resp_1',conversation:{id:'conv_123'},output:[{content:[{type:'output_text',text:'hello from chat-b'}]}]}),{status:200,headers:{'content-type':'application/json'}});
    return new Response('{}',{status:404});
  };
  try{
    const adapter=createOpenAIConversationModelAdapter({apiKey:'test-key',model:'gpt-5'});
    const c=await adapter.createConversation({metadata:{peer:'chat-b'}});
    assert.equal(c.conversationId,'conv_123');
    const r=await adapter.respond({conversationId:c.conversationId,input:'peer prompt',peerEnvelope:{messageId:'m1'}});
    assert.equal(r.text,'hello from chat-b');
    assert.equal(seen[1].body.conversation,'conv_123');
    assert.equal(seen[1].body.metadata.peerMessageId,'m1');
    assert.equal(seen[1].auth,'Bearer test-key');
  } finally { globalThis.fetch=original; }
});
