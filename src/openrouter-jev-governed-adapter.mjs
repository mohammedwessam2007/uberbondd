const API='https://openrouter.ai/api';
const finite=x=>Number.isFinite(Number(x))&&Number(x)>=0;
const text=async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return {raw:t.slice(0,2000)}}};
const safe=x=>JSON.stringify(x??{}).replace(/sk-or-v1-[A-Za-z0-9_-]+/g,'[REDACTED]');
function bearer(key){if(typeof key!=='string'||key.length<16)throw new Error('openrouter-key-required');return 'Bearer '+key;}
function keyData(body){return body?.data??body??{};}

export function createOpenRouterJevGovernedAdapter({
  apiKeyProvider,fetchImpl=fetch,baseUrl=API,expectedKeyLimitUsd,expectedLimitReset='monthly'
}={}){
  if(typeof apiKeyProvider!=='function'||typeof fetchImpl!=='function'||baseUrl!==API)throw new Error('governed-jev-adapter-config-required');
  async function auth(){return bearer(await apiKeyProvider());}
  async function inspectKey(){
    const r=await fetchImpl(baseUrl+'/v1/key',{headers:{Authorization:await auth()}});
    const b=await text(r);if(!r.ok)return {ok:false,status:'OPENROUTER_KEY_INSPECTION_FAILED',httpStatus:r.status};
    const d=keyData(b),limit=Number(d.limit),remaining=Number(d.limit_remaining),usageMonthly=Number(d.usage_monthly??d.usage);
    const reasons=[];
    if(!finite(limit)||!finite(remaining)||!finite(usageMonthly))reasons.push('key-limit-usage-fields-required');
    if(finite(expectedKeyLimitUsd)&&Math.abs(limit-Number(expectedKeyLimitUsd))>1e-9)reasons.push('key-limit-mismatch');
    if(expectedLimitReset&&d.limit_reset&&d.limit_reset!==expectedLimitReset)reasons.push('key-reset-mismatch');
    return {ok:reasons.length===0,status:reasons.length?'OPENROUTER_KEY_POLICY_MISMATCH':'OPENROUTER_KEY_POLICY_VERIFIED',reasons,
      key:{label:d.label??null,limitUsd:limit,limitRemainingUsd:remaining,usageMonthlyUsd:usageMonthly,limitReset:d.limit_reset??null}};
  }
  async function execute(payload={}){
    const pre=await inspectKey();if(!pre.ok)return {ok:false,status:pre.status,providerCalls:0,keyReceipt:pre};
    const model=payload.model??'typesafe/jev-1.13';
    if(model!=='typesafe/jev-1.13')throw new Error('pinned-jev-1-13-required');
    if(!payload.state||typeof payload.questions!=='object'||Array.isArray(payload.questions)||!Object.keys(payload.questions).length)throw new Error('jev-state-and-questions-required');
    if(!Number.isSafeInteger(payload.inputTokenCeiling)||payload.inputTokenCeiling<1||payload.inputTokenCeiling>32000)throw new Error('jev-32k-input-ceiling-required');
    const entries=Object.entries(payload.questions);
    if(entries.length>128)throw new Error('bounded-jev-question-count-required');
    for(const [id,q] of entries){
      if(!/^[A-Za-z0-9_.:-]{1,120}$/.test(id)||!q||typeof q.instructions!=='string'||!['choice','score','noul'].includes(q.type))throw new Error('valid-jev-question-required');
      if(q.type==='choice'&&(!q.criteria||Array.isArray(q.criteria)||typeof q.criteria!=='object'))throw new Error('jev-choice-criteria-required');
      if(q.type==='score'&&(!Array.isArray(q.criteria)||q.criteria.length<2||q.criteria.length>10))throw new Error('jev-score-criteria-required');
    }
    const body={model,state:payload.state,questions:payload.questions};
    if(Buffer.byteLength(JSON.stringify(body))>150000)throw new Error('jev-request-bytes-too-large');
    const r=await fetchImpl(baseUrl+'/alpha/decisions',{method:'POST',headers:{Authorization:await auth(),'Content-Type':'application/json','HTTP-Referer':'https://uberbond.local','X-Title':'UberBond Infinite Opus JEV'},body:JSON.stringify(body)});
    const b=await text(r);if(!r.ok)return {ok:false,status:'OPENROUTER_JEV_DECISION_FAILED',httpStatus:r.status,providerCalls:1,error:safe(b)};
    const usage=b.usage??{},cost=Number(usage.cost),id=b.id,revision=b.model,upstream=b.provider;
    if(typeof id!=='string'||!id||typeof revision!=='string'||!revision.startsWith('typesafe/jev-1.13')||!finite(cost)||!b.answers||typeof b.answers!=='object')return {ok:false,status:'OPENROUTER_JEV_USAGE_OR_IDENTITY_MISSING',providerCalls:1,providerRequestId:id??null};
    const post=await inspectKey();if(!post.ok)return {ok:false,status:'POST_CALL_KEY_RECONCILIATION_REQUIRED',providerCalls:1,providerRequestId:id,observedModelRevision:revision};
    return {ok:true,status:'OPENROUTER_JEV_SHADOW_OBSERVED',providerCalls:1,providerRequestId:id,
      observedModel:model,observedModelRevision:revision,provider:'openrouter',upstreamProvider:upstream??null,
      result:{answers:structuredClone(b.answers)},usage:{costBasis:'OPENROUTER_USAGE_COST_OBSERVED',costUsd:cost,
        inputTokens:Number(usage.input_tokens??0),cachedInputTokens:0,cacheWriteTokens:0,outputTokens:Number(usage.output_tokens??0),reasoningTokens:0,cacheDiscountUsd:null},
      keyBefore:pre.key,keyAfter:post.key,semanticAuthority:'NONE'};
  }
  return {inspectKey,execute};
}
