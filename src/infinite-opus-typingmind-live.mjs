import crypto from 'node:crypto';
import { createInfiniteOpusRuntime } from './infinite-opus-native-runtime.mjs';
import { createOpenRouterGovernedAdapter } from './openrouter-governed-adapter.mjs';
import { COGNITION_PERIMETER_ADMISSION } from './cognition-transport-guard.mjs';
import { estimateCognitionCeiling } from './cognition-ledger.mjs';
import { selectCurrentPrice } from './infinite-opus-market.mjs';
import { verifyCrownAdmissionReceipt } from './crown-admission.mjs';
import { buildBuilderMessages, buildCrownReviewMessages, openAICompatibleCompletion, stableModelSessionId } from './infinite-opus-typingmind-gateway.mjs';

export const TYPINGMIND_BUILDER_MODEL='openai/gpt-6.1-sol';
export const TYPINGMIND_CROWN_MODEL='anthropic/claude-opus-5.5';
export const TYPINGMIND_CROWN_ROUTE_IDENTITY='openrouter:auto-provider-zdr-deny-required-parameters-v1';
const PLATFORM_FEE_RATE=.055;

const contentText=message=>{
  const c=message?.content;
  if(typeof c==='string')return c;
  if(Array.isArray(c))return c.filter(x=>x?.type==='text'&&typeof x.text==='string').map(x=>x.text).join('');
  return '';
};
const centsFor=microusd=>Math.max(1,Math.ceil(microusd/10000));
const routeKey=(provider,model)=>provider+':'+model;

function activeAuthorization(paidAuthorization,now=Date.now()){
  return paidAuthorization?.evidenceRef &&
    paidAuthorization.month===new Date(now).toISOString().slice(0,7) &&
    paidAuthorization.maxMonthlyMicrousd===20_000_000 &&
    Number.isFinite(Date.parse(paidAuthorization.expiresAt)) &&
    Date.parse(paidAuthorization.expiresAt)>now;
}

export function inspectTypingMindLiveReadiness({paidAuthorization,crownAdmission,marketSnapshot,openRouterKeyPresent=false,now=Date.now()}={}){
  const reasons=[];
  if(!openRouterKeyPresent)reasons.push('runtime-openrouter-key-absent');
  if(!activeAuthorization(paidAuthorization,now))reasons.push('current-20-dollar-runtime-authorization-required');
  if(!(paidAuthorization?.crownRoutes??[]).includes(routeKey('openrouter',TYPINGMIND_CROWN_MODEL)))reasons.push('opus-crown-route-not-authorized');
  const crown=verifyCrownAdmissionReceipt(crownAdmission,{now,expected:{exactModelId:TYPINGMIND_CROWN_MODEL,taskClassRole:'GENERAL_CROWN',routeIdentity:TYPINGMIND_CROWN_ROUTE_IDENTITY}});
  if(!crown.ok)reasons.push('valid-current-general-crown-admission-required');
  try{selectCurrentPrice(marketSnapshot,TYPINGMIND_BUILDER_MODEL,now);selectCurrentPrice(marketSnapshot,TYPINGMIND_CROWN_MODEL,now);}
  catch{reasons.push('fresh-builder-and-crown-price-records-required');}
  return {ok:reasons.length===0,status:reasons.length?'TYPINGMIND_UBERMIND_LIVE_NOT_READY':'TYPINGMIND_UBERMIND_LIVE_READY',reasons,
    builderModel:TYPINGMIND_BUILDER_MODEL,crownModel:TYPINGMIND_CROWN_MODEL,
    rawChatQualityLaw:'BUILDER_PROPOSAL_THEN_ADMITTED_CROWN_ACCEPT_OR_REWRITE',
    jevRawChatSuppressionAuthority:'NONE'};
}

export function createTypingMindLiveOrchestrator({store,openRouterKey,paidAuthorization,crownAdmission,marketSnapshot,fetchImpl=fetch,clock=Date.now}={}){
  const ready=inspectTypingMindLiveReadiness({paidAuthorization,crownAdmission,marketSnapshot,openRouterKeyPresent:Boolean(openRouterKey),now:clock()});
  if(!ready.ok)return {readiness:()=>ready,execute:async()=>({ok:false,status:ready.status,reasons:ready.reasons,providerCallsPerformed:0,semanticAuthority:'NONE'})};
  const builderRoute=selectCurrentPrice(marketSnapshot,TYPINGMIND_BUILDER_MODEL,clock());
  const crownRoute=selectCurrentPrice(marketSnapshot,TYPINGMIND_CROWN_MODEL,clock());
  const adapter=createOpenRouterGovernedAdapter({
    apiKeyProvider:async()=>openRouterKey,
    fetchImpl,
    expectedKeyLimitUsd:20,
    cognitionPerimeterAdmission:COGNITION_PERIMETER_ADMISSION
  });
  const paidExecutor=async payload=>{
    const result=await adapter.execute({
      model:payload.model,
      messages:payload.messages,
      maxTokens:payload.maxTokens,
      sessionId:payload.sessionId,
      reasoning:payload.reasoning,
      providerPolicy:{data_collection:'deny',require_parameters:true},
      responseCache:payload.responseCache===true
    });
    // The runtime accounting provider is OpenRouter. Preserve the actual
    // upstream supplier separately so Crown admission can bind it exactly.
    return {...result,upstreamProvider:result.provider??null,provider:'openrouter'};
  };
  const runtime=createInfiniteOpusRuntime({
    store,clock,paidExecutor,paidAuthorization,
    routePrices:[builderRoute,crownRoute],
    platformFeeRate:PLATFORM_FEE_RATE
  });

  async function call({model,role,qualityClass,messages,maxTokens,inputTokenCeiling,sessionRoot,stage}){
    const route=model===TYPINGMIND_CROWN_MODEL?crownRoute:builderRoute;
    const estimate=estimateCognitionCeiling({route,inputTokens:inputTokenCeiling,maxOutputTokens:maxTokens,now:clock(),overheadRate:PLATFORM_FEE_RATE});
    // Runtime dispatch speaks integer cents. Reserve at least one cent but no
    // less than the fresh miss/write ceiling.
    const ceilingMicrousd=Math.max(10000,Math.ceil(estimate/10000)*10000);
    const taskId='tm-'+stage+'-'+crypto.randomUUID(),callId='or-'+stage+'-'+crypto.randomUUID();
    const prepared=await runtime.preparePaidCall({callId,taskId,model,provider:'openrouter',qualityClass,role,cacheState:'MISS_OR_UNKNOWN',ceilingMicrousd});
    if(!prepared.ok)return {...prepared,stage,providerCallsPerformed:0};
    return runtime.dispatchPaidCall(callId,{
      model,
      task:{taskId,objective:'TypingMind UberMind '+stage,consequenceClass:'LOCAL_PREPARATION'},
      messages,
      sessionId:stableModelSessionId(sessionRoot,model),
      reasoning:{effort:role==='CROWN'?'high':'medium'},
      maxTokens,
      inputTokenCeiling,
      responseCache:false,
      costCeilingCents:centsFor(ceilingMicrousd)
    });
  }

  return {
    readiness:()=>ready,
    runtime,
    async execute(request){
      const builderMessages=buildBuilderMessages(request);
      const builder=await call({model:TYPINGMIND_BUILDER_MODEL,role:'WORKER',qualityClass:'Q_FRONTIER_PREPARATION',
        messages:builderMessages,maxTokens:request.maxTokens,inputTokenCeiling:request.inputTokenCeiling,sessionRoot:request.sessionRoot,stage:'builder'});
      if(!builder.ok)return {ok:false,status:builder.status??'BUILDER_FAILED_OR_QUEUED',providerCallsPerformed:builder.providerCallsPerformed??0,qualityAction:'QUEUE_NEVER_DOWNGRADE',semanticAuthority:'NONE'};

      const candidate=contentText(builder.proposal);
      if(!candidate)return {ok:false,status:'EMPTY_BUILDER_PROPOSAL',providerCallsPerformed:1,semanticAuthority:'NONE'};
      const crownMessages=buildCrownReviewMessages(request,candidate);
      const crownBytes=Buffer.byteLength(JSON.stringify(crownMessages));
      const crownInputCeiling=Math.min(300000,request.inputTokenCeiling+crownBytes+4096);
      const crown=await call({model:TYPINGMIND_CROWN_MODEL,role:'CROWN',qualityClass:'Q_FRONTIER_INTERACTIVE',
        messages:crownMessages,maxTokens:request.maxTokens,inputTokenCeiling:crownInputCeiling,sessionRoot:request.sessionRoot,stage:'crown'});
      if(!crown.ok)return {ok:false,status:crown.status??'CROWN_FAILED_OR_QUEUED',providerCallsPerformed:1+(crown.providerCallsPerformed??0),qualityAction:'QUEUE_NEVER_DOWNGRADE',semanticAuthority:'NONE'};

      const crownText=contentText(crown.proposal);
      if(!crownText)return {ok:false,status:'EMPTY_CROWN_PROPOSAL',providerCallsPerformed:2,semanticAuthority:'NONE'};
      if(!crown.upstreamProvider)return {ok:false,status:'CROWN_UPSTREAM_PROVIDER_UNOBSERVED',
        reasons:['observed-upstream-provider-required'],providerCallsPerformed:2,qualityAction:'QUEUE_NEVER_DOWNGRADE',
        semanticAuthority:'NONE',observedUpstreamProvider:null};
      const exactCrown=verifyCrownAdmissionReceipt(crownAdmission,{now:clock(),expected:{
        exactModelId:TYPINGMIND_CROWN_MODEL,
        taskClassRole:'GENERAL_CROWN',
        providerIdentity:crown.upstreamProvider,
        routeIdentity:TYPINGMIND_CROWN_ROUTE_IDENTITY
      }});
      if(!exactCrown.ok)return {ok:false,status:'CROWN_PROVIDER_OR_ROUTE_DRIFT_REFUSED',
        reasons:exactCrown.reasons,providerCallsPerformed:2,qualityAction:'QUEUE_NEVER_DOWNGRADE',
        semanticAuthority:'NONE',observedUpstreamProvider:crown.upstreamProvider,expectedRouteIdentity:TYPINGMIND_CROWN_ROUTE_IDENTITY};
      const builderCost=Number(builder.observedCostMicrousd??0),crownCost=Number(crown.observedCostMicrousd??0);
      const builderUsage=builder.usage??{},crownUsage=crown.usage??{};
      return {ok:true,status:'TYPINGMIND_UBERMIND_FRONTIER_RESPONSE',
        completion:openAICompatibleCompletion({request,candidate,crown:crownText,usage:{
          promptTokens:Number(builderUsage.inputTokens??0)+Number(crownUsage.inputTokens??0),
          completionTokens:Number(builderUsage.outputTokens??0)+Number(crownUsage.outputTokens??0),
          builderModel:TYPINGMIND_BUILDER_MODEL,crownModel:TYPINGMIND_CROWN_MODEL,
          providerCalls:2,actualCostUsd:(builderCost+crownCost)/1e6
        }}),
        builderReceipt:{providerRequestId:builder.providerRequestId??null,costMicrousd:builderCost},
        crownReceipt:{providerRequestId:crown.providerRequestId??null,costMicrousd:crownCost,
          upstreamProvider:crown.upstreamProvider??null,routeIdentity:TYPINGMIND_CROWN_ROUTE_IDENTITY,
          openRouterRouter:crown.generationReceipt?.router??null,
          generationReceipt:crown.generationReceipt??null},
        semanticAuthority:'CURRENT_TASK_CLASS_CROWN',
        sideEffectAuthority:'NONE',
        jev:{mode:'SHADOW_ONLY',usedToSuppressCrown:false}
      };
    }
  };
}
