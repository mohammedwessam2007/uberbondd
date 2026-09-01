import { OPENAI_AGENT_RESULT_SCHEMA } from './openai-agent-executor.mjs';

export const VERCEL_AI_GATEWAY_EXECUTOR_VERSION = 'uberbond.vercel-ai-gateway-executor-1.0.0';
const ENDPOINT = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const MAX_BODY_BYTES = 300_000;
const MAX_RESPONSE_BYTES = 1_000_000;

function text(value, max = 1000) { return String(value ?? '').trim().slice(0, max); }
function finite(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value); return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value); return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
}
function bytes(value) { return Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value ?? null), 'utf8'); }
function failure(reasonCodes, outcome = 'CONFIRMED_FAILURE', extra = {}) {
  return { ok:false, outcome, reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))], ...extra };
}
function validPricing(pricing) {
  return finite(pricing?.inputUsdPerMillion,0,1_000_000)!=null
    && finite(pricing?.outputUsdPerMillion,0,1_000_000)!=null
    && text(pricing?.sourceRef,500).length>0
    && text(pricing?.verifiedAt,80).length>0;
}
function requestBody({ task, model, maxTokens }) {
  return {
    model,
    max_tokens:maxTokens,
    messages:[
      { role:'system', content:'You are one worker inside the UberBond bounded agent mesh. Complete only the supplied LOCAL_PREPARATION task. Do not claim external effects, revenue, deployment, sending, purchases, DNS changes or credential changes. Unknown facts stay unresolved. Return only the required structured JSON result.' },
      { role:'user', content:JSON.stringify({
        taskId:task.taskId, objective:task.objective, originAgent:task.originAgent, targetAgent:task.targetAgent,
        parentTask:task.parentTask||null, contextRefs:task.contextRefs||[], evidenceRefs:task.evidenceRefs||[], constraints:task.constraints||[],
        forbiddenActions:task.forbiddenActions||[], requiredOutputs:task.requiredOutputs||[], acceptanceTests:task.acceptanceTests||[],
        economicObjective:task.economicObjective||'', consequenceClass:task.consequenceClass||'LOCAL_PREPARATION'
      }) }
    ],
    response_format:{ type:'json_schema', json_schema:{ name:'uberbond_agent_worker_result', strict:true, schema:OPENAI_AGENT_RESULT_SCHEMA } }
  };
}
function estimateMaximumCostCents(body, maxTokens, pricing) {
  const inputTokensUpperBound = Math.ceil(bytes(body) / 3);
  const usd = (inputTokensUpperBound * Number(pricing.inputUsdPerMillion) + maxTokens * Number(pricing.outputUsdPerMillion)) / 1_000_000;
  return Math.ceil(usd * 100 - 1e-12);
}
function usage(payload, pricing) {
  const inputTokens = integer(payload?.usage?.prompt_tokens,0,100_000_000);
  const outputTokens = integer(payload?.usage?.completion_tokens,0,100_000_000);
  const totalTokens = integer(payload?.usage?.total_tokens,0,100_000_000);
  if(inputTokens==null||outputTokens==null||totalTokens==null||totalTokens<inputTokens+outputTokens) return null;
  const usd=(inputTokens*Number(pricing.inputUsdPerMillion)+outputTokens*Number(pricing.outputUsdPerMillion))/1_000_000;
  return {inputTokens,outputTokens,totalTokens,costCents:Math.ceil(usd*100-1e-12),costBasis:'CONFIGURED_CONSERVATIVE_ESTIMATE'};
}
function servedIdentity(raw, requestedModel) {
  const observed = text(raw?.model,200);
  if (!observed) return { requestedModel, servedModel:null, servedProvider:null, identityVerification:'UNVERIFIED' };
  const slash = observed.indexOf('/');
  return {
    requestedModel,
    servedModel:observed,
    servedProvider:slash>0?observed.slice(0,slash):null,
    identityVerification:'OBSERVED'
  };
}

export function createVercelAIGatewayExecutor({
  apiKey,
  enabled=false,
  pricing,
  defaultModel='openai/gpt-5.6-sol',
  fetchImpl=globalThis.fetch,
  endpoint=ENDPOINT,
  timeoutMs=60_000
}={}) {
  const key=String(apiKey||'');
  const configuredModel=text(defaultModel,200);
  const validTimeout=Number.isSafeInteger(timeoutMs)&&timeoutMs>=100&&timeoutMs<=180_000;
  return async function vercelAIGatewayExecutor({task,model,maxTokens,costCeilingCents}={}) {
    if(!enabled) return failure(['ai-gateway-executor-disabled']);
    if(!key||key.length<12) return failure(['ai-gateway-api-key-required']);
    if(endpoint!==ENDPOINT) return failure(['ai-gateway-endpoint-not-allowlisted']);
    if(typeof fetchImpl!=='function') return failure(['fetch-implementation-required']);
    if(!validTimeout) return failure(['valid-ai-gateway-timeout-required']);
    if(!task?.taskId||!task?.objective) return failure(['valid-agent-task-required']);
    if(task.consequenceClass&&task.consequenceClass!=='LOCAL_PREPARATION') return failure(['ai-gateway-worker-only-accepts-local-preparation']);
    if(!validPricing(pricing)) return failure(['verified-pricing-config-required']);
    const outputLimit=integer(maxTokens,1,128_000);
    const costLimit=integer(costCeilingCents,0,10_000_000);
    if(outputLimit==null) return failure(['valid-max-output-tokens-required']);
    if(costLimit==null) return failure(['valid-cost-ceiling-required']);
    const selectedModel=text(model||configuredModel,200);
    if(!selectedModel||!selectedModel.includes('/')) return failure(['gateway-model-must-include-provider-prefix']);
    const body=requestBody({task,model:selectedModel,maxTokens:outputLimit});
    if(bytes(body)>MAX_BODY_BYTES) return failure(['ai-gateway-request-body-too-large']);
    const maximumCostCents=estimateMaximumCostCents(body,outputLimit,pricing);
    if(maximumCostCents>costLimit) return failure(['precall-cost-ceiling-exceeded'],'CONFIRMED_FAILURE',{maximumCostCents,costCeilingCents:costLimit});

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(new Error('ai-gateway-timeout')),timeoutMs);
    let response;
    try {
      response=await fetchImpl(ENDPOINT,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
    } catch(error) {
      const reason=controller.signal.aborted?'ai-gateway-timeout':'ai-gateway-transport-uncertain';
      return failure([reason],'UNCERTAIN',{uncertain:true,detail:text(error?.message,300)});
    } finally { clearTimeout(timer); }

    const status=integer(response?.status,0,999,0);
    if(!response?.ok) {
      if(status===401||status===403) return failure([`ai-gateway-http-${status}`,'credential-rejected'],'CONFIRMED_FAILURE');
      if(status===429) return failure(['ai-gateway-http-429','rate-limit'],'CONFIRMED_FAILURE');
      if(status>=500) return failure([`ai-gateway-http-${status}`,'provider-outage'],'UNCERTAIN',{uncertain:true});
      return failure([`ai-gateway-http-${status||'unknown'}`],'CONFIRMED_FAILURE');
    }

    let raw;
    try {
      const rawText=await response.text();
      if(bytes(rawText)>MAX_RESPONSE_BYTES) return failure(['ai-gateway-response-too-large'],'UNCERTAIN',{uncertain:true});
      raw=JSON.parse(rawText);
    } catch(error) {
      return failure(['ai-gateway-response-parse-uncertain'],'UNCERTAIN',{uncertain:true,detail:text(error?.message,300)});
    }
    const identity=servedIdentity(raw,selectedModel);
    const metered=usage(raw,pricing);
    if(!metered) return failure(['ai-gateway-usage-invalid'],'UNCERTAIN',{uncertain:true,...identity});
    const content=raw?.choices?.[0]?.message?.content;
    if(typeof content!=='string'||!content.trim()) return failure(['ai-gateway-structured-output-missing'],'UNCERTAIN',{uncertain:true,...identity,usage:metered});
    let result;
    try { result=JSON.parse(content); }
    catch(error) { return failure(['ai-gateway-structured-output-json-invalid'],'UNCERTAIN',{uncertain:true,...identity,usage:metered,detail:text(error?.message,300)}); }
    return {
      ok:true,
      outcome:'COMPLETED',
      providerRequestId:text(raw?.id,240)||null,
      providerStatus:'completed',
      model:identity.servedModel,
      ...identity,
      usage:metered,
      pricingEvidence:{sourceRef:text(pricing.sourceRef,500),verifiedAt:text(pricing.verifiedAt,80),inputUsdPerMillion:Number(pricing.inputUsdPerMillion),outputUsdPerMillion:Number(pricing.outputUsdPerMillion),costBasis:metered.costBasis},
      maximumReservedCostCents:maximumCostCents,
      result
    };
  };
}
