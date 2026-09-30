import { assertCognitionPerimeterAdmission } from './cognition-transport-guard.mjs';
const BASE='https://openrouter.ai/api/v1';
const text=async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return {raw:t.slice(0,2000)}}};
const finite=x=>Number.isFinite(Number(x))&&Number(x)>=0;
const secretSafe=x=>JSON.stringify(x??{}).replace(/sk-or-v1-[A-Za-z0-9_-]+/g,'[REDACTED]');
function bearer(key){if(typeof key!=='string'||key.length<16)throw new Error('openrouter-key-required');return `Bearer ${key}`;}
function keyData(body){return body?.data??body??{};}

export function createOpenRouterGovernedAdapter({apiKeyProvider,fetchImpl=fetch,baseUrl=BASE,expectedKeyLimitUsd,expectedLimitReset='monthly',requireZdr=true,cognitionPerimeterAdmission=null}={}){
  assertCognitionPerimeterAdmission(cognitionPerimeterAdmission);
  if(typeof apiKeyProvider!=='function'||typeof fetchImpl!=='function'||baseUrl!==BASE) throw new Error('governed-openrouter-adapter-config-required');
  async function auth(){return bearer(await apiKeyProvider());}
  async function inspectKey(){
    const r=await fetchImpl(`${baseUrl}/key`,{headers:{Authorization:await auth()}});
    const b=await text(r); if(!r.ok)return {ok:false,status:'OPENROUTER_KEY_INSPECTION_FAILED',httpStatus:r.status};
    const d=keyData(b),limit=Number(d.limit),remaining=Number(d.limit_remaining),usageMonthly=Number(d.usage_monthly??d.usage);
    const reasons=[];
    if(!finite(limit)||!finite(remaining)||!finite(usageMonthly)) reasons.push('key-limit-usage-fields-required');
    if(finite(expectedKeyLimitUsd)&&Math.abs(limit-Number(expectedKeyLimitUsd))>1e-9) reasons.push('key-limit-mismatch');
    if(expectedLimitReset&&d.limit_reset&&d.limit_reset!==expectedLimitReset) reasons.push('key-reset-mismatch');
    return {ok:reasons.length===0,status:reasons.length?'OPENROUTER_KEY_POLICY_MISMATCH':'OPENROUTER_KEY_POLICY_VERIFIED',reasons,
      key:{label:d.label??null,limitUsd:limit,limitRemainingUsd:remaining,usageMonthlyUsd:usageMonthly,limitReset:d.limit_reset??null,isFreeTier:d.is_free_tier??null}};
  }
  async function generation(id){
    const r=await fetchImpl(`${baseUrl}/generation?id=${encodeURIComponent(id)}`,{headers:{Authorization:await auth()}});
    const b=await text(r); if(!r.ok)return {ok:false,status:'GENERATION_RECEIPT_PENDING',httpStatus:r.status};
    const d=b?.data??b??{};
    return {ok:true,status:'GENERATION_RECEIPT_OBSERVED',provider:d.provider_name??d.provider??null,model:d.model??d.model_permaslug??null,
      totalCostUsd:Number(d.total_cost??d.usage?.cost),cacheDiscountUsd:finite(d.cache_discount)?Number(d.cache_discount):null,
      tokensPrompt:Number(d.tokens_prompt??d.usage?.prompt_tokens??0),tokensCompletion:Number(d.tokens_completion??d.usage?.completion_tokens??0),
      generationId:id};
  }
  async function execute(payload){
    const pre=await inspectKey(); if(!pre.ok)return {ok:false,status:pre.status,providerCalls:0,keyReceipt:pre};
    if(!payload||typeof payload.model!=='string'||!Array.isArray(payload.messages)||payload.messages.length<1) throw new Error('bounded-chat-payload-required');
    if(!Number.isSafeInteger(payload.maxTokens)||payload.maxTokens<1||payload.maxTokens>4096) throw new Error('bounded-max-tokens-required');
    if (requireZdr && (payload.providerPolicy?.zdr === false || payload.providerPolicy?.data_collection === 'allow')) throw new Error('privacy-policy-cannot-loosen-zdr-or-data-collection-deny');
    const providerPolicy={...(payload.providerPolicy??{}),...(requireZdr?{zdr:true,data_collection:'deny'}:{})};
    const body={model:payload.model,messages:payload.messages,max_tokens:payload.maxTokens,stream:false,usage:{include:true},
      ...(payload.reasoning?{reasoning:payload.reasoning}:{}),...(payload.sessionId?{session_id:payload.sessionId}:{}),
      ...(Object.keys(providerPolicy).length?{provider:providerPolicy}:{})};
    const r=await fetchImpl(`${baseUrl}/chat/completions`,{method:'POST',headers:{Authorization:await auth(),'Content-Type':'application/json','HTTP-Referer':'https://uberbond.local','X-Title':'UberBond Infinite Opus'},body:JSON.stringify(body)});
    const b=await text(r); if(!r.ok)return {ok:false,status:'OPENROUTER_COMPLETION_FAILED',httpStatus:r.status,providerCalls:1,error:secretSafe(b)};
    const usage=b.usage??{},cost=Number(usage.cost),id=b.id,observedModel=b.model;
    if(typeof id!=='string'||!id||typeof observedModel!=='string'||!finite(cost))return {ok:false,status:'OPENROUTER_USAGE_OR_IDENTITY_MISSING',providerCalls:1,providerRequestId:id??null};
    if(observedModel!==payload.model && observedModel!==payload.expectedCanonicalModel) return {ok:false,status:'OPENROUTER_WRONG_MODEL_SERVED',providerCalls:1,providerRequestId:id,observedModel};
    const g=await generation(id);
    if(!g.ok)return {ok:false,status:'GENERATION_RECEIPT_PENDING_RESERVATION_MUST_HOLD',providerCalls:1,providerRequestId:id,observedModel,usage:{costBasis:'OPENROUTER_USAGE_COST_OBSERVED',costUsd:cost}};
    if(finite(g.totalCostUsd)&&Math.abs(g.totalCostUsd-cost)>0.000001)return {ok:false,status:'OPENROUTER_BILL_MISMATCH',providerCalls:1,providerRequestId:id,observedModel,generationReceipt:g};
    const post=await inspectKey();
    if(!post.ok)return {ok:false,status:'POST_CALL_KEY_RECONCILIATION_REQUIRED',providerCalls:1,providerRequestId:id,observedModel,generationReceipt:g};
    return {ok:true,status:'OPENROUTER_PAID_PROPOSAL_OBSERVED',providerCalls:1,providerRequestId:id,observedModel,provider:g.provider??'UNKNOWN',
      result:b.choices?.[0]?.message??null,usage:{costBasis:'OPENROUTER_USAGE_COST_OBSERVED',costUsd:cost,inputTokens:Number(usage.prompt_tokens??0),cachedInputTokens:Number(usage.prompt_tokens_details?.cached_tokens??0),cacheWriteTokens:Number(usage.prompt_tokens_details?.cache_write_tokens??0),outputTokens:Number(usage.completion_tokens??0),reasoningTokens:Number(usage.completion_tokens_details?.reasoning_tokens??0),cacheDiscountUsd:finite(usage.cache_discount)?Number(usage.cache_discount):g.cacheDiscountUsd},keyBefore:pre.key,keyAfter:post.key,generationReceipt:g,semanticAuthority:'NONE'};
  }
  return {inspectKey,execute,generation};
}
