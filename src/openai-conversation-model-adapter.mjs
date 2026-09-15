const API='https://api.openai.com/v1';
function required(name,v){ if(!v) throw new Error(`${name}-required`); return v; }
export function createOpenAIConversationModelAdapter({apiKey=process.env.OPENAI_API_KEY,model='gpt-5'}={}){
  required('openai-api-key',apiKey);
  const headers={Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'};
  async function json(url,init){ const r=await fetch(url,{...init,headers:{...headers,...init?.headers}}); const t=await r.text(); let b={}; try{b=t?JSON.parse(t):{}}catch{b={raw:t}} if(!r.ok) throw new Error(`openai-http-${r.status}:${b?.error?.message||t}`); return b; }
  async function createConversation({metadata={}}={}){
    const b=await json(`${API}/conversations`,{method:'POST',body:JSON.stringify({metadata})});
    return {conversationId:b.id,raw:b};
  }
  async function respond({conversationId,input,peerEnvelope}){
    required('conversation-id',conversationId);
    const body={model,conversation:conversationId,input:String(input||''),metadata:{uberSocket:'true',peerMessageId:String(peerEnvelope?.messageId||'')}};
    const b=await json(`${API}/responses`,{method:'POST',body:JSON.stringify(body)});
    const text=typeof b.output_text==='string'?b.output_text:(b.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text||'').join('\n');
    return {text,responseId:b.id,conversationId:b.conversation?.id||conversationId,raw:b};
  }
  return Object.freeze({provider:'openai',model,createConversation,respond});
}
