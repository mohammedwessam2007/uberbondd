import { assertCognitionPerimeterAdmission } from './cognition-transport-guard.mjs';

const KEY_URL='https://openrouter.ai/api/v1/key';
const DECISIONS_URL='https://openrouter.ai/api/alpha/decisions';
const MODEL='typesafe/jev-1.13';
const safeJson=async r=>{const t=await r.text();try{return JSON.parse(t)}catch{return {raw:t.slice(0,2000)}}};
const finite=x=>Number.isFinite(Number(x))&&Number(x)>=0;
const redact=x=>JSON.stringify(x??{}).replace(/sk-or-v1-[A-Za-z0-9_-]+/g,'[REDACTED]');

function bearer(key){
  if(typeof key!=='string'||key.length<16)throw new Error('openrouter-key-required');
  return 'Bearer '+key;
}
function keyData(body){return body?.data??body??{};}

export function validateJevQuestions(questions){
  if(!questions||typeof questions!=='object'||Array.isArray(questions)||!Object.keys(questions).length)throw new Error('jev-questions-object-required');
  const out={};
  for(const [id,q] of Object.entries(questions)){
    if(!/^[A-Za-z0-9_.:-]{1,96}$/.test(id))throw new Error('jev-question-id-invalid');
    if(!q||typeof q!=='object'||!['choice','score','noul'].includes(q.type)||typeof q.instructions!=='string'||!q.instructions.trim())throw new Error('jev-question-contract-invalid');
    if(q.type==='choice'){
      if(!q.criteria||typeof q.criteria!=='object'||Array.isArray(q.criteria)||Object.keys(q.criteria).length<2||Object.keys(q.criteria).length>255)throw new Error('jev-choice-criteria-invalid');
    }
    if(q.type==='score'){
      if(!Array.isArray(q.criteria)||q.criteria.length<2||q.criteria.length>10)throw new Error('jev-score-criteria-invalid');
    }
    if(q.type==='noul'&&q.criteria!==undefined){
      if(!q.criteria||typeof q.criteria!=='object'||Array.isArray(q.criteria))throw new Error('jev-noul-criteria-invalid');
      const keys=Object.keys(q.criteria);
      if(keys.some(k=>!['true','false'].includes(k)))throw new Error('jev-noul-criteria-keys-invalid');
    }
    out[id]=structuredClone(q);
  }
  return out;
}

export function createOpenRouterJevGovernedAdapter({
  apiKeyProvider,fetchImpl=fetch,expectedKeyLimitUsd,expectedLimitReset='monthly',
  cognitionPerimeterAdmission=null
}={}){
  assertCognitionPerimeterAdmission(cognitionPerimeterAdmission);
  if(typeof apiKeyProvider!=='function'||typeof fetchImpl!=='function')throw new Error('governed-jev-adapter-config-required');

  async function auth(){return bearer(await apiKeyProvider());}
  async function inspectKey(){
    const r=await fetchImpl(KEY_URL,{headers:{Authorization:await auth()}});
    const b=await safeJson(r);
    if(!r.ok)return {ok:false,status:'OPENROUTER_KEY_INSPECTION_FAILED',httpStatus:r.status};
    const d=keyData(b),limit=Number(d.limit),remaining=Number(d.limit_remaining),usageMonthly=Number(d.usage_monthly??d.usage);
    const reasons=[];
    if(!finite(limit)||!finite(remaining)||!finite(usageMonthly))reasons.push('key-limit-usage-fields-required');
    if(finite(expectedKeyLimitUsd)&&Math.abs(limit-Number(expectedKeyLimitUsd))>1e-9)reasons.push('key-limit-mismatch');
    if(expectedLimitReset&&d.limit_reset&&d.limit_reset!==expectedLimitReset)reasons.push('key-reset-mismatch');
    return {ok:reasons.length===0,status:reasons.length?'OPENROUTER_KEY_POLICY_MISMATCH':'OPENROUTER_KEY_POLICY_VERIFIED',reasons,
      key:{label:d.label??null,limitUsd:limit,limitRemainingUsd:remaining,usageMonthlyUsd:usageMonthly,limitReset:d.limit_reset??null}};
  }

  async function execute({state,questions,model=MODEL,costCeilingUsd=null}={}){
    if(model!==MODEL)throw new Error('pinned-jev-model-required');
    const q=validateJevQuestions(questions);
    const encoded=JSON.stringify({model,state,questions:q});
    if(encoded!==redact({model,state,questions:q}))throw new Error('secret-bearing-jev-state-refused');
    if(Buffer.byteLength(encoded)>220000)throw new Error('jev-request-too-large');

    const pre=await inspectKey();
    if(!pre.ok)return {...pre,providerCallsPerformed:0};
    const before=pre.key.usageMonthlyUsd;

    const r=await fetchImpl(DECISIONS_URL,{
      method:'POST',
      headers:{Authorization:await auth(),'Content-Type':'application/json','HTTP-Referer':'https://uberbond.local','X-Title':'UberBond Jev Hyperreflex'},
      body:encoded
    });
    const b=await safeJson(r);
    if(!r.ok)return {ok:false,status:'JEV_DECISION_FAILED',httpStatus:r.status,providerCallsPerformed:1,error:redact(b)};

    const usage=b?.usage??{};
    const cost=Number(usage.cost);
    if(!finite(cost))return {ok:false,status:'JEV_OBSERVED_COST_REQUIRED',providerCallsPerformed:1};
    if(Number.isFinite(costCeilingUsd)&&cost>costCeilingUsd+1e-12)return {ok:false,status:'JEV_COST_CEILING_EXCEEDED',providerCallsPerformed:1,observedCostUsd:cost};
    if(!b?.id||!b?.model||!b?.answers||typeof b.answers!=='object')return {ok:false,status:'JEV_TYPED_RESPONSE_REQUIRED',providerCallsPerformed:1};
    if(!String(b.model).startsWith('typesafe/jev-1.13'))return {ok:false,status:'JEV_MODEL_SNAPSHOT_DRIFT',providerCallsPerformed:1,observedModel:b.model};

    const post=await inspectKey();
    if(!post.ok)return {ok:false,status:'JEV_POST_KEY_POLICY_UNVERIFIED',providerCallsPerformed:1};
    const accountDelta=Math.max(0,post.key.usageMonthlyUsd-before);
    if(accountDelta+1e-9<cost)return {ok:false,status:'JEV_ACCOUNT_USAGE_UNDER_REPORTED',providerCallsPerformed:1,observedCostUsd:cost,accountDeltaUsd:accountDelta};

    return {
      ok:true,status:'JEV_TYPED_DECISION_OBSERVED',
      model:b.model,observedModel:MODEL,modelRevision:b.model,provider:b.provider??null,
      upstreamProvider:b.provider??null,id:b.id,providerRequestId:b.id,
      answers:structuredClone(b.answers),result:{answers:structuredClone(b.answers),modelRevision:b.model},
      usage:{
        inputTokens:Number(usage.input_tokens??0),
        outputTokens:Number(usage.output_tokens??0),
        cachedInputTokens:0,cacheWriteTokens:0,reasoningTokens:0,
        costUsd:cost,
        costBasis:'OPENROUTER_USAGE_COST_OBSERVED'
      },
      keyBefore:pre.key,keyAfter:post.key,accountDeltaUsd:accountDelta,
      semanticAuthority:'NONE',
      providerCallsPerformed:1
    };
  }

  return {inspectKey,execute};
}
