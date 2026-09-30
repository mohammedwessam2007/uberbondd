import crypto from 'node:crypto';
import { createInfiniteOpusRuntime } from './infinite-opus-native-runtime.mjs';
import { createOpenRouterGovernedAdapter } from './openrouter-governed-adapter.mjs';
import { createOpenRouterJevGovernedAdapter } from './openrouter-jev-governed-adapter.mjs';
import { COGNITION_PERIMETER_ADMISSION } from './cognition-transport-guard.mjs';
import { estimateCognitionCeiling } from './cognition-ledger.mjs';
import { selectCurrentPrice } from './infinite-opus-market.mjs';
import { verifyCrownAdmissionReceipt } from './crown-admission.mjs';
import {
  buildBuilderMessages,buildCrownReviewMessages,buildDirectCrownMessages,
  CROWN_REVIEW_RESPONSE_FORMAT,openAICompatibleCompletion,openAICompatibleDirectCrownCompletion,
  stableModelSessionId
} from './infinite-opus-typingmind-gateway.mjs';
import { chooseFreshFrontierPath,buildGenericJevControlQuestions } from './openrouter-processor-auction-v5.mjs';

export const TYPINGMIND_JEV_MODEL='typesafe/jev-1.13';
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

function fallbackJevRoute(now){
  const verifiedAt='2026-09-30T15:46:00.000Z',expiresAt='2026-10-01T15:46:00.000Z';
  if(Date.parse(verifiedAt)>now||Date.parse(expiresAt)<=now)return null;
  return {
    model:TYPINGMIND_JEV_MODEL,modelRevision:'typesafe/jev-1.13',provider:'openrouter',
    sourceRef:'https://openrouter.ai/typesafe/jev-1.13/api',sourceRecordHash:'PUBLIC_WEB_2026_09_30',
    verifiedAt,expiresAt,inputUsdPerMillion:.042,outputUsdPerMillion:0,
    cacheReadUsdPerMillion:null,cacheWriteUsdPerMillion:.042,cacheWrite1hUsdPerMillion:null,
    priceOverrides:[],otherChargesPerUnit:{},contextTokens:32000,maxOutputTokens:1,
    tools:false,structuredOutput:true,modalities:['text'],supportedParameters:[],
    batch:false,flex:'UNKNOWN',privacy:'ROUTE_DEPENDENT_UNVERIFIED',rateLimits:'UNKNOWN',
    latency:'UNKNOWN',throughput:'UNKNOWN',reliability:'UNKNOWN',callableOnOwnerAccount:'UNKNOWN',
    routeEndpoint:'https://openrouter.ai/api/alpha/decisions',priceAdmission:'PUBLIC_PRICE_CANDIDATE',semanticAuthority:'NONE'
  };
}

function currentJevRoute(snapshot,now){
  try{return selectCurrentPrice(snapshot,TYPINGMIND_JEV_MODEL,now);}catch{return fallbackJevRoute(now);}
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
    rawChatQualityLaw:'CHEAPEST_CURRENT_PATH_WITH_ADMITTED_OPUS_CROWN_OR_DIRECT_OPUS',
    jevRawChatSuppressionAuthority:'NONE',
    jevRouteAvailable:Boolean(currentJevRoute(marketSnapshot,now))};
}

function jevEffort(answers){
  const score=Number(answers?.hard_reasoning?.score);
  if(score>=2)return 'max';
  if(score>=1)return 'high';
  return 'low';
}

export function createTypingMindLiveOrchestrator({store,openRouterKey,paidAuthorization,crownAdmission,marketSnapshot,fetchImpl=fetch,clock=Date.now}={}){
  const ready=inspectTypingMindLiveReadiness({paidAuthorization,crownAdmission,marketSnapshot,openRouterKeyPresent:Boolean(openRouterKey),now:clock()});
  if(!ready.ok)return {readiness:()=>ready,execute:async()=>({ok:false,status:ready.status,reasons:ready.reasons,providerCallsPerformed:0,semanticAuthority:'NONE'})};

  const builderRoute=selectCurrentPrice(marketSnapshot,TYPINGMIND_BUILDER_MODEL,clock());
  const crownRoute=selectCurrentPrice(marketSnapshot,TYPINGMIND_CROWN_MODEL,clock());
  const jevRoute=currentJevRoute(marketSnapshot,clock());
  const routes=[builderRoute,crownRoute,...(jevRoute?[jevRoute]:[])];
  const routeByModel=new Map(routes.map(r=>[r.model,r]));

  const adapter=createOpenRouterGovernedAdapter({
    apiKeyProvider:async()=>openRouterKey,fetchImpl,expectedKeyLimitUsd:20,
    cognitionPerimeterAdmission:COGNITION_PERIMETER_ADMISSION
  });
  const jevAdapter=createOpenRouterJevGovernedAdapter({
    apiKeyProvider:async()=>openRouterKey,fetchImpl,expectedKeyLimitUsd:20,
    cognitionPerimeterAdmission:COGNITION_PERIMETER_ADMISSION
  });

  const paidExecutor=async payload=>{
    if(payload.kind==='JEV_DECISION'){
      const result=await jevAdapter.execute({
        model:TYPINGMIND_JEV_MODEL,state:payload.state,questions:payload.questions,
        costCeilingUsd:payload.costCeilingCents/100
      });
      return {...result,provider:'openrouter',upstreamProvider:result.upstreamProvider??result.provider??null};
    }
    const result=await adapter.execute({
      model:payload.model,messages:payload.messages,maxTokens:payload.maxTokens,
      sessionId:payload.sessionId,reasoning:payload.reasoning,responseFormat:payload.responseFormat,
      providerPolicy:{data_collection:'deny',require_parameters:true},
      responseCache:payload.responseCache===true
    });
    return {...result,upstreamProvider:result.provider??null,provider:'openrouter'};
  };

  const runtime=createInfiniteOpusRuntime({
    store,clock,paidExecutor,paidAuthorization,routePrices:routes,platformFeeRate:PLATFORM_FEE_RATE
  });

  async function call({model,role,qualityClass,messages,maxTokens,inputTokenCeiling,sessionRoot,stage,reasoningEffort='medium',responseFormat=null,extraPayload={}}){
    const route=routeByModel.get(model);
    if(!route)throw new Error('fresh-live-route-required:'+model);
    const estimate=estimateCognitionCeiling({route,inputTokens:inputTokenCeiling,maxOutputTokens:maxTokens,now:clock(),overheadRate:PLATFORM_FEE_RATE});
    const ceilingMicrousd=Math.max(10000,Math.ceil(estimate/10000)*10000);
    const taskId='tm-'+stage+'-'+crypto.randomUUID(),callId='or-'+stage+'-'+crypto.randomUUID();
    const prepared=await runtime.preparePaidCall({callId,taskId,model,provider:'openrouter',qualityClass,role,cacheState:'MISS_OR_UNKNOWN',ceilingMicrousd});
    if(!prepared.ok)return {...prepared,stage,providerCallsPerformed:0};
    return runtime.dispatchPaidCall(callId,{
      model,task:{taskId,objective:'TypingMind UberMind '+stage,consequenceClass:'LOCAL_PREPARATION'},
      messages:messages??[{role:'user',content:stage}],
      sessionId:stableModelSessionId(sessionRoot,model),
      reasoning:model===TYPINGMIND_JEV_MODEL?undefined:{effort:reasoningEffort},
      maxTokens,inputTokenCeiling,responseCache:false,responseFormat,
      costCeilingCents:centsFor(ceilingMicrousd),...extraPayload
    });
  }

  async function verifyCrownCall(crown,providerCallsPerformed){
    const crownText=contentText(crown.proposal);
    if(!crownText)return {ok:false,status:'EMPTY_CROWN_PROPOSAL',providerCallsPerformed,semanticAuthority:'NONE'};
    if(!crown.upstreamProvider)return {ok:false,status:'CROWN_UPSTREAM_PROVIDER_UNOBSERVED',
      reasons:['observed-upstream-provider-required'],providerCallsPerformed,qualityAction:'QUEUE_NEVER_DOWNGRADE',
      semanticAuthority:'NONE',observedUpstreamProvider:null};
    const exactCrown=verifyCrownAdmissionReceipt(crownAdmission,{now:clock(),expected:{
      exactModelId:TYPINGMIND_CROWN_MODEL,taskClassRole:'GENERAL_CROWN',
      providerIdentity:crown.upstreamProvider,routeIdentity:TYPINGMIND_CROWN_ROUTE_IDENTITY
    }});
    if(!exactCrown.ok)return {ok:false,status:'CROWN_PROVIDER_OR_ROUTE_DRIFT_REFUSED',
      reasons:exactCrown.reasons,providerCallsPerformed,qualityAction:'QUEUE_NEVER_DOWNGRADE',
      semanticAuthority:'NONE',observedUpstreamProvider:crown.upstreamProvider,expectedRouteIdentity:TYPINGMIND_CROWN_ROUTE_IDENTITY};
    return {ok:true,crownText};
  }

  return {
    readiness:()=>ready,
    runtime,
    async execute(request){
      const path=chooseFreshFrontierPath({
        inputTokens:request.inputTokenCeiling,
        expectedOutputTokens:request.maxTokens,
        crownCachedPrefixTokens:0
      });

      // When preprocessing cannot beat direct Opus on worst-case token geometry,
      // do not pay for a committee. Buy the admitted Crown once.
      if(path.selected.path==='DIRECT_OPUS'){
        const directMessages=buildDirectCrownMessages(request);
        const directBytes=Buffer.byteLength(JSON.stringify(directMessages));
        const crown=await call({
          model:TYPINGMIND_CROWN_MODEL,role:'CROWN',qualityClass:'Q_FRONTIER_INTERACTIVE',
          messages:directMessages,maxTokens:request.maxTokens,
          inputTokenCeiling:Math.min(300000,directBytes+4096),sessionRoot:request.sessionRoot,
          stage:'direct-crown',reasoningEffort:'high'
        });
        if(!crown.ok)return {ok:false,status:crown.status??'CROWN_FAILED_OR_QUEUED',providerCallsPerformed:crown.providerCallsPerformed??0,qualityAction:'QUEUE_NEVER_DOWNGRADE',semanticAuthority:'NONE'};
        const checked=await verifyCrownCall(crown,1);if(!checked.ok)return checked;
        const cost=Number(crown.observedCostMicrousd??0),usage=crown.usage??{};
        return {ok:true,status:'TYPINGMIND_UBERMIND_DIRECT_CROWN_RESPONSE',
          completion:openAICompatibleDirectCrownCompletion({request,crownText:checked.crownText,usage:{
            promptTokens:Number(usage.inputTokens??0),completionTokens:Number(usage.outputTokens??0),
            crownModel:TYPINGMIND_CROWN_MODEL,providerCalls:1,actualCostUsd:cost/1e6
          }}),
          crownReceipt:{providerRequestId:crown.providerRequestId??null,costMicrousd:cost,upstreamProvider:crown.upstreamProvider??null,
            routeIdentity:TYPINGMIND_CROWN_ROUTE_IDENTITY,generationReceipt:crown.generationReceipt??null},
          semanticAuthority:'CURRENT_TASK_CLASS_CROWN',sideEffectAuthority:'NONE',
          routeDecision:{selected:'DIRECT_OPUS',candidates:path.candidates},
          jev:{mode:'NOT_NEEDED_FOR_DIRECT_COST_WINNER',usedToSuppressCrown:false}
        };
      }

      // JEV is a tiny control-plane call only when the request fits its 32K window.
      // It may tune worker effort, but it cannot suppress the required Crown.
      let jev=null,reasoningEffort='medium',jevCost=0,preCalls=0;
      if(jevRoute && request.requestBytes+6000<=30000){
        const questions=buildGenericJevControlQuestions();
        const jevInputCeiling=Math.min(30000,request.requestBytes+6000);
        jev=await call({
          model:TYPINGMIND_JEV_MODEL,role:'WORKER',qualityClass:'Q_ROUTING_SHADOW',
          maxTokens:1,inputTokenCeiling:jevInputCeiling,sessionRoot:request.sessionRoot,stage:'jev-control',
          extraPayload:{kind:'JEV_DECISION',state:{conversation:request.messages},questions}
        });
        if(jev.ok){
          reasoningEffort=jevEffort(jev.proposal?.answers);
          jevCost=Number(jev.observedCostMicrousd??0);preCalls=1;
        } else {
          // Routing advice is optional. A Jev failure cannot lower quality or block Crown.
          jev=null;
        }
      }

      const builderMessages=buildBuilderMessages(request);
      const builder=await call({
        model:TYPINGMIND_BUILDER_MODEL,role:'WORKER',qualityClass:'Q_FRONTIER_PREPARATION',
        messages:builderMessages,maxTokens:request.maxTokens,inputTokenCeiling:request.inputTokenCeiling,
        sessionRoot:request.sessionRoot,stage:'builder',reasoningEffort
      });
      if(!builder.ok)return {ok:false,status:builder.status??'BUILDER_FAILED_OR_QUEUED',providerCallsPerformed:preCalls+(builder.providerCallsPerformed??0),qualityAction:'QUEUE_NEVER_DOWNGRADE',semanticAuthority:'NONE'};

      const candidate=contentText(builder.proposal);
      if(!candidate)return {ok:false,status:'EMPTY_BUILDER_PROPOSAL',providerCallsPerformed:preCalls+1,semanticAuthority:'NONE'};
      const crownMessages=buildCrownReviewMessages(request,candidate);
      const crownBytes=Buffer.byteLength(JSON.stringify(crownMessages));
      const crown=await call({
        model:TYPINGMIND_CROWN_MODEL,role:'CROWN',qualityClass:'Q_FRONTIER_INTERACTIVE',
        messages:crownMessages,maxTokens:request.maxTokens,inputTokenCeiling:Math.min(300000,crownBytes+4096),
        sessionRoot:request.sessionRoot,stage:'crown-review',reasoningEffort:'high',
        responseFormat:CROWN_REVIEW_RESPONSE_FORMAT
      });
      if(!crown.ok)return {ok:false,status:crown.status??'CROWN_FAILED_OR_QUEUED',providerCallsPerformed:preCalls+1+(crown.providerCallsPerformed??0),qualityAction:'QUEUE_NEVER_DOWNGRADE',semanticAuthority:'NONE'};

      const checked=await verifyCrownCall(crown,preCalls+2);if(!checked.ok)return checked;
      const builderCost=Number(builder.observedCostMicrousd??0),crownCost=Number(crown.observedCostMicrousd??0);
      const builderUsage=builder.usage??{},crownUsage=crown.usage??{};
      return {ok:true,status:'TYPINGMIND_UBERMIND_FRONTIER_RESPONSE',
        completion:openAICompatibleCompletion({request,candidate,crown:checked.crownText,usage:{
          promptTokens:Number(builderUsage.inputTokens??0)+Number(crownUsage.inputTokens??0)+(Number(jev?.usage?.inputTokens??0)),
          completionTokens:Number(builderUsage.outputTokens??0)+Number(crownUsage.outputTokens??0)+(Number(jev?.usage?.outputTokens??0)),
          builderModel:TYPINGMIND_BUILDER_MODEL,crownModel:TYPINGMIND_CROWN_MODEL,
          providerCalls:preCalls+2,actualCostUsd:(jevCost+builderCost+crownCost)/1e6
        }}),
        builderReceipt:{providerRequestId:builder.providerRequestId??null,costMicrousd:builderCost,reasoningEffort},
        crownReceipt:{providerRequestId:crown.providerRequestId??null,costMicrousd:crownCost,
          upstreamProvider:crown.upstreamProvider??null,routeIdentity:TYPINGMIND_CROWN_ROUTE_IDENTITY,
          openRouterRouter:crown.generationReceipt?.router??null,generationReceipt:crown.generationReceipt??null},
        semanticAuthority:'CURRENT_TASK_CLASS_CROWN',sideEffectAuthority:'NONE',
        routeDecision:{selected:'SOL_THEN_OPUS_DELTA',candidates:path.candidates},
        jev:{mode:jev?'SHADOW_CONTROL_OBSERVED':'SKIPPED',usedToSuppressCrown:false,
          usedToTuneWorker:Boolean(jev),reasoningEffort,costMicrousd:jevCost,
          answers:jev?.proposal?.answers??null}
      };
    }
  };
}
