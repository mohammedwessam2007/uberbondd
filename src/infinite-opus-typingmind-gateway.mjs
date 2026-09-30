import crypto from 'node:crypto';

export const TYPINGMIND_UBERMIND_MODEL='ubermind/auto';
export const TYPINGMIND_UBERMIND_GATEWAY_SCHEMA='uberbond.typingmind-infinite-opus-gateway.v1';
const ALLOWED_ROLES=new Set(['system','user','assistant']);
const MAX_MESSAGES=128;
const MAX_REQUEST_BYTES=300000;
const MAX_OUTPUT_TOKENS=4096;

const hash=value=>'sha256:'+crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const digestToken=value=>crypto.createHash('sha256').update(String(value??'')).digest();

export function verifyTypingMindGatewayBearer(authorization,expectedToken){
  if(typeof expectedToken!=='string'||expectedToken.length<32)return false;
  const raw=String(authorization??'');
  if(!raw.startsWith('Bearer '))return false;
  const provided=raw.slice(7);
  return crypto.timingSafeEqual(digestToken(provided),digestToken(expectedToken));
}

function textContent(content){
  if(typeof content==='string')return content;
  if(!Array.isArray(content))throw new Error('typingmind-message-content-must-be-text-or-openai-content-array');
  let out='';
  for(const part of content){
    if(!part||typeof part!=='object'||part.type!=='text'||typeof part.text!=='string')throw new Error('typingmind-gateway-text-only-v1');
    out+=part.text;
  }
  return out;
}

export function compileTypingMindChatRequest(body={}){
  if(body.stream===true)throw new Error('typingmind-gateway-nonstreaming-v1');
  if(body.model!==TYPINGMIND_UBERMIND_MODEL)throw new Error('ubermind-auto-model-required');
  if(body.tools||body.tool_choice||body.functions||body.function_call)throw new Error('typingmind-gateway-tools-disabled-v1');
  if(!Array.isArray(body.messages)||body.messages.length<1||body.messages.length>MAX_MESSAGES)throw new Error('bounded-chat-messages-required');
  if(body.messages.some(m=>!m||!ALLOWED_ROLES.has(m.role)))throw new Error('typingmind-message-role-refused');
  const messages=body.messages.map(m=>({role:m.role,content:textContent(m.content)}));
  if(!messages.some(m=>m.role==='user'&&m.content.trim()))throw new Error('nonempty-user-message-required');
  const requestBytes=Buffer.byteLength(JSON.stringify({model:body.model,messages}));
  if(requestBytes>MAX_REQUEST_BYTES)throw new Error('typingmind-gateway-request-too-large');
  const maxTokens=Math.min(MAX_OUTPUT_TOKENS,Math.max(1,Number.isSafeInteger(body.max_tokens)?body.max_tokens:2048));
  // Upper-bound tokenization conservatively by UTF-8 bytes + protocol headroom.
  // This avoids the historical fixed 300k-token reservation while never using a
  // lower bound that depends on an optimistic tokenizer assumption.
  const inputTokenCeiling=Math.min(300000,requestBytes+4096);
  const firstStableTurn=messages.find(m=>m.role==='user')?.content??'';
  const sessionRoot=hash({system:messages.filter(m=>m.role==='system').map(m=>m.content),firstUser:firstStableTurn});
  return {
    schemaVersion:TYPINGMIND_UBERMIND_GATEWAY_SCHEMA,
    messages,
    maxTokens,
    requestBytes,
    inputTokenCeiling,
    sessionRoot,
    qualityClass:'Q_FRONTIER_INTERACTIVE',
    sideEffectClass:'NONE',
    semanticAuthority:'NONE',
    rawHumanLanguage:true,
    defaultLane:'CROWN_REVIEW_REQUIRED',
    reason:'Raw human chat is E6-like until a typed/proven recurrence path closes it.'
  };
}

export function stableModelSessionId(sessionRoot,model){
  return crypto.createHash('sha256').update(JSON.stringify({sessionRoot,model})).digest('hex').slice(0,48);
}

export function buildBuilderMessages(request){
  return [
    {role:'system',content:[
      'You are UberMind Builder. Produce the strongest candidate answer you can.',
      'Preserve uncertainty, exact numbers, caveats, and source obligations.',
      'Do not claim side effects. Do not claim Crown authority.',
      'Prefer a complete candidate answer that a frontier reviewer can ACCEPT with minimal output.'
    ].join(' ')},
    ...request.messages
  ];
}

export function buildCrownReviewMessages(request,candidateText){
  if(typeof candidateText!=='string'||!candidateText.trim())throw new Error('nonempty-builder-candidate-required');
  return [
    {role:'system',content:[
      'You are the admitted UberMind task-class Crown reviewing an untrusted candidate.',
      'Judge the full user request and conversation, not style alone.',
      'If the candidate is fully acceptable with no material correction, reply exactly ACCEPT.',
      'Otherwise reply exactly REWRITE followed by a newline and the complete corrected final answer.',
      'Do not use tools. Do not claim external effects.'
    ].join(' ')},
    ...request.messages,
    {role:'assistant',content:candidateText},
    {role:'user',content:'Crown review: ACCEPT exactly, or REWRITE followed by the complete corrected final answer.'}
  ];
}

export function applyCrownReview(candidateText,crownText){
  const raw=String(crownText??'').trim();
  if(raw==='ACCEPT')return {ok:true,status:'CROWN_ACCEPTED_BUILDER',finalText:candidateText,authorityClass:'CROWN_VERIFIED_SEMANTIC_ACCEPT'};
  if(raw.startsWith('REWRITE\n')){
    const finalText=raw.slice('REWRITE\n'.length).trim();
    if(!finalText)throw new Error('empty-crown-rewrite-refused');
    return {ok:true,status:'CROWN_REWROTE',finalText,authorityClass:'DIRECT_CURRENT_CROWN'};
  }
  // A malformed review protocol cannot silently authorize the cheaper draft.
  // The direct Crown output itself is returned as the only semantically safer
  // fallback, while marking protocol drift for repair.
  if(!raw)throw new Error('empty-crown-response-refused');
  return {ok:true,status:'CROWN_PROTOCOL_DRIFT_DIRECT_OUTPUT_ONLY',finalText:raw,authorityClass:'DIRECT_CURRENT_CROWN',protocolDrift:true};
}

export function openAICompatibleCompletion({request,candidate,crown,usage={}}={}){
  const reviewed=applyCrownReview(candidate,crown);
  const id='chatcmpl_ubermind_'+crypto.randomBytes(12).toString('hex');
  return {
    id,
    object:'chat.completion',
    created:Math.floor(Date.now()/1000),
    model:TYPINGMIND_UBERMIND_MODEL,
    choices:[{index:0,message:{role:'assistant',content:reviewed.finalText},finish_reason:'stop'}],
    usage:{
      prompt_tokens:Number(usage.promptTokens??0),
      completion_tokens:Number(usage.completionTokens??0),
      total_tokens:Number(usage.promptTokens??0)+Number(usage.completionTokens??0)
    },
    uberbond:{
      schemaVersion:TYPINGMIND_UBERMIND_GATEWAY_SCHEMA,
      status:reviewed.status,
      authorityClass:reviewed.authorityClass,
      crownProtocolDrift:reviewed.protocolDrift===true,
      builderModel:usage.builderModel??null,
      crownModel:usage.crownModel??null,
      providerCalls:Number(usage.providerCalls??0),
      actualCostUsd:Number.isFinite(usage.actualCostUsd)?usage.actualCostUsd:null,
      sessionRoot:request.sessionRoot,
      sideEffectAuthority:'NONE',
      multiplierClaim:null
    }
  };
}

export function gatewayStatus({runtimeConnected=false,crownAdmissionValid=false,jevShadowReady=false}={}){
  return {
    ok:true,
    schemaVersion:TYPINGMIND_UBERMIND_GATEWAY_SCHEMA,
    model:TYPINGMIND_UBERMIND_MODEL,
    runtimeConnected,
    crownAdmissionValid,
    jev:{mode:'SHADOW_ONLY',ready:jevShadowReady,maySuppressCrown:false},
    exactAndE0E4:'INTERNAL_TYPED_RUNTIME_ONLY',
    rawChatPolicy:'BUILDER_THEN_ADMITTED_CROWN_REVIEW',
    qualityDowngradeAllowed:false,
    sideEffectAuthority:'NONE'
  };
}
