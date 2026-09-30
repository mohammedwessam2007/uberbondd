import crypto from 'node:crypto';
import { createInfiniteOpusRuntime } from './infinite-opus-native-runtime.mjs';
import { createOpenRouterGovernedAdapter } from './openrouter-governed-adapter.mjs';
import { createOpenRouterJevGovernedAdapter } from './openrouter-jev-governed-adapter.mjs';
import { buildGenericJevControlQuestions, cheapestPossibleWriterLowerBound, chooseAdaptiveCandidateWriter,
  estimateDirectOpusUsd, estimateWriterThenCrownAcceptUsd, estimateIndependentCriticSurchargeUsd,
  shouldRunIndependentCritic } from './openrouter-processor-auction-v5.mjs';
import { COGNITION_PERIMETER_ADMISSION } from './cognition-transport-guard.mjs';
import { estimateCognitionCeiling } from './cognition-ledger.mjs';
import { selectCurrentPrice } from './infinite-opus-market.mjs';
import { verifyCrownAdmissionReceipt } from './crown-admission.mjs';
import { buildBuilderMessages, buildCrownReviewMessages, buildDirectCrownMessages,
  CROWN_REVIEW_RESPONSE_FORMAT, openAICompatibleCompletion, openAICompatibleDirectCrownCompletion,
  stableModelSessionId } from './infinite-opus-typingmind-gateway.mjs';

export const TYPINGMIND_BUILDER_MODEL='openai/gpt-6.1-sol';
export const TYPINGMIND_MIMO_MODEL='xiaomi/mimo-v2.6-flash';
export const TYPINGMIND_DEEPSEEK_MODEL='deepseek/deepseek-v4.1-flash';
export const TYPINGMIND_CROWN_MODEL='anthropic/claude-opus-5.5';
export const TYPINGMIND_JEV_MODEL='typesafe/jev-1.13';
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
const truncateUtf8=(value,maxBytes)=>{
  let out=String(value??'');
  while(Buffer.byteLength(out)>maxBytes && out.length>1)out=out.slice(0,Math.max(1,Math.floor(out.length*.75)));
  return out;
};

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
    rawChatQualityLaw:'CHEAPEST_CURRENT_PATH_WITH_ADMITTED_OPUS_CROWN_OR_DIRECT_OPUS',
    jevRawChatSuppressionAuthority:'NONE'};
}

export function createTypingMindLiveOrchestrator({store,openRouterKey,paidAuthorization,crownAdmission,marketSnapshot,fetchImpl=fetch,clock=Date.now}={}){
  const ready=inspectTypingMindLiveReadiness({paidAuthorization,crownAdmission,marketSnapshot,openRouterKeyPresent:Boolean(openRouterKey),now:clock()});
  if(!ready.ok)return {readiness:()=>ready,execute:async()=>({ok:false,status:ready.status,reasons:ready.reasons,providerCallsPerformed:0,semanticAuthority:'NONE'})};
  const builderRoute=selectCurrentPrice(marketSnapshot,TYPINGMIND_BUILDER_MODEL,clock());
  const crownRoute=selectCurrentPrice(marketSnapshot,TYPINGMIND_CROWN_MODEL,clock());
  let mimoRoute=null,deepseekRoute=null,jevRoute=null;
  try{mimoRoute=selectCurrentPrice(marketSnapshot,TYPINGMIND_MIMO_MODEL,clock());}catch{}
  try{deepseekRoute=selectCurrentPrice(marketSnapshot,TYPINGMIND_DEEPSEEK_MODEL,clock());}catch{}
  try{
    const observed=selectCurrentPrice(marketSnapshot,TYPINGMIND_JEV_MODEL,clock());
    jevRoute={...observed,contextTokens:Math.min(Number(observed.contextTokens)||32000,32000),maxOutputTokens:1};
  }catch{}
  const adapter=createOpenRouterGovernedAdapter({
    apiKeyProvider:async()=>openRouterKey,
    fetchImpl,
    expectedKeyLimitUsd:20,
    cognitionPerimeterAdmission:COGNITION_PERIMETER_ADMISSION
  });
  const jevAdapter=createOpenRouterJevGovernedAdapter({
    apiKeyProvider:async()=>openRouterKey,
    fetchImpl,
    expectedKeyLimitUsd:20
  });
  const paidExecutor=async payload=>{
    if(payload.decisionRequest){
      return jevAdapter.execute({...payload.decisionRequest,inputTokenCeiling:payload.inputTokenCeiling});
    }
    const result=await adapter.execute({
      model:payload.model,
      messages:payload.messages,
      maxTokens:payload.maxTokens,
      sessionId:payload.sessionId,
      reasoning:payload.reasoning,
      responseFormat:payload.responseFormat,
      providerPolicy:{data_collection:'deny',require_parameters:true},
      responseCache:payload.responseCache===true
    });
    // The runtime accounting provider is OpenRouter. Preserve the actual
    // upstream supplier separately so Crown admission can bind it exactly.
    return {...result,upstreamProvider:result.provider??null,provider:'openrouter'};
  };
  const runtime=createInfiniteOpusRuntime({
    store,clock,paidExecutor,paidAuthorization,
    routePrices:[builderRoute,crownRoute,...(mimoRoute?[mimoRoute]:[]),...(deepseekRoute?[deepseekRoute]:[]),...(jevRoute?[jevRoute]:[])],
    platformFeeRate:PLATFORM_FEE_RATE
  });

  async function callJevShadow(request){
    if(!jevRoute)return {ok:false,status:'JEV_MARKET_ROUTE_UNAVAILABLE_SHADOW_SKIPPED',providerCallsPerformed:0,semanticAuthority:'NONE'};
    try{
      const latestUser=[...request.messages].reverse().find(m=>m.role==='user')?.content??'';
      const state={
        task:truncateUtf8(latestUser,16000),
        message_count:request.messages.length,
        request_bytes:request.requestBytes,
        input_token_ceiling:request.inputTokenCeiling,
        quality_class:request.qualityClass,
        side_effect_class:request.sideEffectClass
      };
      const questions=buildGenericJevControlQuestions();
      const inputTokenCeiling=Math.min(32000,Buffer.byteLength(JSON.stringify({state,questions}))+2048);
      const estimate=estimateCognitionCeiling({route:jevRoute,inputTokens:inputTokenCeiling,maxOutputTokens:1,now:clock(),overheadRate:PLATFORM_FEE_RATE});
      const ceilingMicrousd=Math.max(10000,Math.ceil(estimate/10000)*10000);
      const taskId='tm-jev-'+crypto.randomUUID(),callId='or-jev-'+crypto.randomUUID();
      const prepared=await runtime.preparePaidCall({callId,taskId,model:TYPINGMIND_JEV_MODEL,provider:'openrouter',
        qualityClass:'Q_SHADOW_CONTROL',role:'WORKER',cacheState:'MISS_OR_UNKNOWN',ceilingMicrousd});
      if(!prepared.ok)return {...prepared,stage:'jev-shadow',providerCallsPerformed:0,semanticAuthority:'NONE'};
      return runtime.dispatchPaidCall(callId,{
        model:TYPINGMIND_JEV_MODEL,
        task:{taskId,objective:'TypingMind UberMind Jev shadow control tensor',consequenceClass:'LOCAL_PREPARATION'},
        maxTokens:1,inputTokenCeiling,costCeilingCents:centsFor(ceilingMicrousd),
        decisionRequest:{model:TYPINGMIND_JEV_MODEL,state,questions}
      });
    }catch(error){
      return {ok:false,status:'JEV_SHADOW_REFUSED_OR_FAILED',reason:String(error?.message||error),providerCallsPerformed:0,semanticAuthority:'NONE'};
    }
  }

  const routeByModel=new Map([[TYPINGMIND_BUILDER_MODEL,builderRoute],[TYPINGMIND_CROWN_MODEL,crownRoute],
    ...(mimoRoute?[[TYPINGMIND_MIMO_MODEL,mimoRoute]]:[]),...(deepseekRoute?[[TYPINGMIND_DEEPSEEK_MODEL,deepseekRoute]]:[])]);
  async function call({model,role,qualityClass,messages,maxTokens,inputTokenCeiling,sessionRoot,stage,reasoningEffort=null,responseFormat=null}){
    const route=routeByModel.get(model);
    if(!route)throw new Error('fresh-live-route-required:'+model);
    const estimate=estimateCognitionCeiling({route,inputTokens:inputTokenCeiling,maxOutputTokens:maxTokens,now:clock(),overheadRate:PLATFORM_FEE_RATE});
    const ceilingMicrousd=Math.max(10000,Math.ceil(estimate/10000)*10000);
    const taskId='tm-'+stage+'-'+crypto.randomUUID(),callId='or-'+stage+'-'+crypto.randomUUID();
    const prepared=await runtime.preparePaidCall({callId,taskId,model,provider:'openrouter',qualityClass,role,cacheState:'MISS_OR_UNKNOWN',ceilingMicrousd});
    if(!prepared.ok)return {...prepared,stage,providerCallsPerformed:0};
    return runtime.dispatchPaidCall(callId,{
      model,
      task:{taskId,objective:'TypingMind UberMind '+stage,consequenceClass:'LOCAL_PREPARATION'},
      messages,
      sessionId:stableModelSessionId(sessionRoot,model),
      reasoning:reasoningEffort?{effort:reasoningEffort}:null,
      responseFormat,
      maxTokens,
      inputTokenCeiling,
      responseCache:false,
      costCeilingCents:centsFor(ceilingMicrousd)
    });
  }

  function jevWorkerEffort(jevShadow){
    const score=Number(jevShadow?.proposal?.answers?.hard_reasoning?.score);
    if(score>=2)return 'max';
    if(score>=1)return 'high';
    return 'low';
  }

  async function verifyCrown(crown,providerCallsPerformed){
    const crownText=contentText(crown.proposal);
    if(!crownText)return {ok:false,status:'EMPTY_CROWN_PROPOSAL',providerCallsPerformed,semanticAuthority:'NONE'};
    if(!crown.upstreamProvider)return {ok:false,status:'CROWN_UPSTREAM_PROVIDER_UNOBSERVED',
      reasons:['observed-upstream-provider-required'],providerCallsPerformed,qualityAction:'QUEUE_NEVER_DOWNGRADE',
      semanticAuthority:'NONE',observedUpstreamProvider:null};
    const exactCrown=verifyCrownAdmissionReceipt(crownAdmission,{now:clock(),expected:{
      exactModelId:TYPINGMIND_CROWN_MODEL,
      taskClassRole:'GENERAL_CROWN',
      providerIdentity:crown.upstreamProvider,
      routeIdentity:TYPINGMIND_CROWN_ROUTE_IDENTITY
    }});
    if(!exactCrown.ok)return {ok:false,status:'CROWN_PROVIDER_OR_ROUTE_DRIFT_REFUSED',
      reasons:exactCrown.reasons,providerCallsPerformed,qualityAction:'QUEUE_NEVER_DOWNGRADE',
      semanticAuthority:'NONE',observedUpstreamProvider:crown.upstreamProvider,expectedRouteIdentity:TYPINGMIND_CROWN_ROUTE_IDENTITY};
    return {ok:true,crownText};
  }

  const writerModelById={mimo:TYPINGMIND_MIMO_MODEL,deepseek:TYPINGMIND_DEEPSEEK_MODEL,sol:TYPINGMIND_BUILDER_MODEL};
  function buildAdaptiveWriterMessages(request,writerId){
    const messages=buildBuilderMessages(request);
    const extra={
      mimo:' Use your cheap long-context bandwidth to produce a complete answer candidate. Preserve every material constraint; do not summarize away requirements.',
      deepseek:' Prioritize rigorous reasoning, coding correctness, counterexamples, and internal consistency. Produce a complete answer candidate, not a critique.',
      sol:' Use the assigned reasoning effort efficiently. Produce the complete strongest candidate so Crown can accept with minimal output.'
    }[writerId]??' Produce a complete answer candidate.';
    messages[0]={...messages[0],content:messages[0].content+extra};
    return messages;
  }

  function buildIndependentCriticMessages(request,candidate){
    return [
      {role:'system',content:[
        'You are an independent cheap adversarial auditor.',
        'Inspect the original user request and the candidate answer.',
        'Return only material defects that could change correctness, completeness, evidence fidelity, or required quality.',
        'Do not rewrite the answer. Do not manufacture objections. Keep output under 600 tokens.',
        'Your output is untrusted advice to the admitted Crown, not authority.'
      ].join(' ')},
      ...request.messages,
      {role:'assistant',content:candidate},
      {role:'user',content:'List only material MUST_FIX defects. If none, reply PASS.'}
    ];
  }

  async function runDirectCrown(request,{jevShadow=null,routeCandidates=[],reason='DIRECT_OPUS_COST_WINNER'}={}){
    const directMessages=buildDirectCrownMessages(request);
    const directBytes=Buffer.byteLength(JSON.stringify(directMessages));
    const crown=await call({
      model:TYPINGMIND_CROWN_MODEL,role:'CROWN',qualityClass:'Q_FRONTIER_INTERACTIVE',
      messages:directMessages,maxTokens:request.maxTokens,
      inputTokenCeiling:Math.min(300000,directBytes+4096),
      sessionRoot:request.sessionRoot,stage:'direct-crown',reasoningEffort:'high'
    });
    const jevCalls=Number(jevShadow?.providerCallsPerformed??0);
    if(!crown.ok)return {ok:false,status:crown.status??'CROWN_FAILED_OR_QUEUED',
      providerCallsPerformed:jevCalls+(crown.providerCallsPerformed??0),qualityAction:'QUEUE_NEVER_DOWNGRADE',semanticAuthority:'NONE'};
    const checked=await verifyCrown(crown,jevCalls+1);if(!checked.ok)return checked;
    const crownCost=Number(crown.observedCostMicrousd??0),jevCost=Number(jevShadow?.observedCostMicrousd??0),usage=crown.usage??{};
    return {ok:true,status:'TYPINGMIND_UBERMIND_DIRECT_CROWN_RESPONSE',
      completion:openAICompatibleDirectCrownCompletion({request,crownText:checked.crownText,usage:{
        promptTokens:Number(usage.inputTokens??0)+Number(jevShadow?.usage?.inputTokens??0),
        completionTokens:Number(usage.outputTokens??0)+Number(jevShadow?.usage?.outputTokens??0),
        crownModel:TYPINGMIND_CROWN_MODEL,providerCalls:jevCalls+1,actualCostUsd:(crownCost+jevCost)/1e6
      }}),
      crownReceipt:{providerRequestId:crown.providerRequestId??null,costMicrousd:crownCost,
        upstreamProvider:crown.upstreamProvider??null,routeIdentity:TYPINGMIND_CROWN_ROUTE_IDENTITY,
        openRouterRouter:crown.generationReceipt?.router??null,generationReceipt:crown.generationReceipt??null},
      semanticAuthority:'CURRENT_TASK_CLASS_CROWN',sideEffectAuthority:'NONE',
      routeDecision:{selected:'DIRECT_OPUS',reason,candidates:routeCandidates},
      jev:{mode:jevShadow?.ok?'SHADOW_OBSERVED_BEFORE_DIRECT':'NOT_NEEDED_OR_UNAVAILABLE',usedToSuppressCrown:false,
        answers:jevShadow?.proposal?.answers??null,costMicrousd:jevCost}
    };
  }

  return {
    readiness:()=>ready,
    runtime,
    async execute(request){
      const economicPath=chooseFreshFrontierPath({
        inputTokens:request.inputTokenCeiling,
        expectedOutputTokens:request.maxTokens,
        crownCachedPrefixTokens:0
      });

      // Do not buy a committee when direct admitted Opus is already the cheapest
      // quality-preserving path under current worst-case token geometry.
      if(economicPath.selected.path==='DIRECT_OPUS'){
        const directMessages=buildDirectCrownMessages(request);
        const directBytes=Buffer.byteLength(JSON.stringify(directMessages));
        const crown=await call({
          model:TYPINGMIND_CROWN_MODEL,role:'CROWN',qualityClass:'Q_FRONTIER_INTERACTIVE',
          messages:directMessages,maxTokens:request.maxTokens,
          inputTokenCeiling:Math.min(300000,directBytes+4096),
          sessionRoot:request.sessionRoot,stage:'direct-crown',reasoningEffort:'high'
        });
        if(!crown.ok)return {ok:false,status:crown.status??'CROWN_FAILED_OR_QUEUED',
          providerCallsPerformed:crown.providerCallsPerformed??0,qualityAction:'QUEUE_NEVER_DOWNGRADE',semanticAuthority:'NONE'};
        const checked=await verifyCrown(crown,1);if(!checked.ok)return checked;
        const cost=Number(crown.observedCostMicrousd??0),usage=crown.usage??{};
        return {ok:true,status:'TYPINGMIND_UBERMIND_DIRECT_CROWN_RESPONSE',
          completion:openAICompatibleDirectCrownCompletion({request,crownText:checked.crownText,usage:{
            promptTokens:Number(usage.inputTokens??0),completionTokens:Number(usage.outputTokens??0),
            crownModel:TYPINGMIND_CROWN_MODEL,providerCalls:1,actualCostUsd:cost/1e6
          }}),
          crownReceipt:{providerRequestId:crown.providerRequestId??null,costMicrousd:cost,
            upstreamProvider:crown.upstreamProvider??null,routeIdentity:TYPINGMIND_CROWN_ROUTE_IDENTITY,
            openRouterRouter:crown.generationReceipt?.router??null,generationReceipt:crown.generationReceipt??null},
          semanticAuthority:'CURRENT_TASK_CLASS_CROWN',sideEffectAuthority:'NONE',
          routeDecision:{selected:'DIRECT_OPUS',candidates:economicPath.candidates},
          jev:{mode:'SKIPPED_DIRECT_OPUS_COST_WINNER',usedToSuppressCrown:false,costMicrousd:0}
        };
      }

      // JEV remains non-authoritative for raw chat. It may cheaply tune Sol's
      // reasoning effort because admitted Opus still gates final semantics.
      const jevShadow=await callJevShadow(request);
      const reasoningEffort=jevShadow.ok?jevWorkerEffort(jevShadow):'medium';

      const builderMessages=buildBuilderMessages(request);
      const builder=await call({model:TYPINGMIND_BUILDER_MODEL,role:'WORKER',qualityClass:'Q_FRONTIER_PREPARATION',
        messages:builderMessages,maxTokens:request.maxTokens,inputTokenCeiling:request.inputTokenCeiling,
        sessionRoot:request.sessionRoot,stage:'builder',reasoningEffort});
      const jevCalls=Number(jevShadow.providerCallsPerformed??0);
      if(!builder.ok)return {ok:false,status:builder.status??'BUILDER_FAILED_OR_QUEUED',
        providerCallsPerformed:jevCalls+(builder.providerCallsPerformed??0),qualityAction:'QUEUE_NEVER_DOWNGRADE',semanticAuthority:'NONE'};

      const candidate=contentText(builder.proposal);
      if(!candidate)return {ok:false,status:'EMPTY_BUILDER_PROPOSAL',providerCallsPerformed:jevCalls+1,semanticAuthority:'NONE'};

      const crownMessages=buildCrownReviewMessages(request,candidate);
      const crownBytes=Buffer.byteLength(JSON.stringify(crownMessages));
      // crownBytes already contains the original conversation. Do not reserve it twice.
      const crownInputCeiling=Math.min(300000,crownBytes+4096);
      const crown=await call({model:TYPINGMIND_CROWN_MODEL,role:'CROWN',qualityClass:'Q_FRONTIER_INTERACTIVE',
        messages:crownMessages,maxTokens:request.maxTokens,inputTokenCeiling:crownInputCeiling,
        sessionRoot:request.sessionRoot,stage:'crown-delta',reasoningEffort:'high',
        responseFormat:CROWN_REVIEW_RESPONSE_FORMAT});
      if(!crown.ok)return {ok:false,status:crown.status??'CROWN_FAILED_OR_QUEUED',
        providerCallsPerformed:jevCalls+1+(crown.providerCallsPerformed??0),qualityAction:'QUEUE_NEVER_DOWNGRADE',semanticAuthority:'NONE'};

      const checked=await verifyCrown(crown,jevCalls+2);if(!checked.ok)return checked;
      const builderCost=Number(builder.observedCostMicrousd??0),crownCost=Number(crown.observedCostMicrousd??0),jevCost=Number(jevShadow.observedCostMicrousd??0);
      const builderUsage=builder.usage??{},crownUsage=crown.usage??{};
      const completion=openAICompatibleCompletion({request,candidate,crown:checked.crownText,usage:{
        promptTokens:Number(builderUsage.inputTokens??0)+Number(crownUsage.inputTokens??0)+Number(jevShadow.usage?.inputTokens??0),
        completionTokens:Number(builderUsage.outputTokens??0)+Number(crownUsage.outputTokens??0)+Number(jevShadow.usage?.outputTokens??0),
        builderModel:TYPINGMIND_BUILDER_MODEL,crownModel:TYPINGMIND_CROWN_MODEL,
        providerCalls:jevCalls+2,actualCostUsd:(builderCost+crownCost+jevCost)/1e6
      }});
      completion.uberbond.jevShadow={
        status:jevShadow.status??null,model:TYPINGMIND_JEV_MODEL,semanticAuthority:'NONE',
        usedToSuppressCrown:false,usedToTuneWorker:jevShadow.ok===true,reasoningEffort,
        observedModelRevision:jevShadow.observedModelRevision??null,costUsd:jevCost/1e6,
        answers:jevShadow.proposal?.answers??null
      };
      return {ok:true,status:'TYPINGMIND_UBERMIND_FRONTIER_RESPONSE',completion,
        builderReceipt:{providerRequestId:builder.providerRequestId??null,costMicrousd:builderCost,reasoningEffort},
        crownReceipt:{providerRequestId:crown.providerRequestId??null,costMicrousd:crownCost,
          upstreamProvider:crown.upstreamProvider??null,routeIdentity:TYPINGMIND_CROWN_ROUTE_IDENTITY,
          openRouterRouter:crown.generationReceipt?.router??null,generationReceipt:crown.generationReceipt??null},
        semanticAuthority:'CURRENT_TASK_CLASS_CROWN',sideEffectAuthority:'NONE',
        routeDecision:{selected:'SOL_THEN_OPUS_DELTA',candidates:economicPath.candidates},
        jev:{mode:jevShadow.ok?'SHADOW_CONTROL_OBSERVED':'SHADOW_SKIPPED_OR_FAILED',usedToSuppressCrown:false,
          usedToTuneWorker:jevShadow.ok===true,reasoningEffort,status:jevShadow.status??null,
          answers:jevShadow.proposal?.answers??null,costMicrousd:jevCost}
      };
    }
  };
}
