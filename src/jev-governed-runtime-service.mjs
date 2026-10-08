import crypto from 'node:crypto';
import { createInfiniteOpusRuntime } from './infinite-opus-native-runtime.mjs';
import { createOpenRouterJevGovernedAdapter } from './openrouter-jev-governed-adapter.mjs';
import { selectCurrentPrice } from './infinite-opus-market.mjs';
import { estimateCognitionCeiling } from './cognition-ledger.mjs';
import { OPENROUTER_JEV_MODEL } from './openrouter-decision-market.mjs';
import { compileJevSharedStateTensor, executeGovernedJevTensor } from './jev-shared-state-tensor.mjs';

export const GOVERNED_JEV_SERVICE_SCHEMA='uberbond.governed-jev-runtime-service.v1';
const FEE=.055;
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_.:/-]{1,180}$/.test(x);
const hash=x=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');

export function createGovernedJevRuntimeService({store,apiKey,paidAuthorization,marketSnapshot,fetchImpl=fetch,clock=Date.now}={}){
  if(!store||typeof store.transaction!=='function')throw new Error('governed-jev-store-required');
  if(typeof apiKey!=='string'||apiKey.length<16)throw new Error('governed-jev-openrouter-key-required');
  if(!paidAuthorization?.evidenceRef)throw new Error('governed-jev-paid-authorization-required');
  const route=selectCurrentPrice(marketSnapshot,OPENROUTER_JEV_MODEL,clock());
  if(route.provider!=='openrouter')throw new Error('governed-jev-openrouter-route-required');
  const adapter=createOpenRouterJevGovernedAdapter({apiKeyProvider:async()=>apiKey,fetchImpl,expectedKeyLimitUsd:20});
  const runtime=createInfiniteOpusRuntime({
    store,clock,paidAuthorization,routePrices:[route],platformFeeRate:FEE,
    paidExecutor:async payload=>{
      if(!payload?.decisionRequest)throw new Error('governed-jev-decision-request-required');
      return adapter.execute({...payload.decisionRequest,model:OPENROUTER_JEV_MODEL,inputTokenCeiling:payload.inputTokenCeiling});
    }
  });

  async function executeDecision({operationId,state,questions,inputTokenCeiling=2048,maximumSpendUsd=.001}={}){
    if(!validId(operationId))throw new Error('governed-jev-operation-id-required');
    if(!state||typeof state!=='object'||Array.isArray(state))throw new Error('governed-jev-state-required');
    if(!questions||typeof questions!=='object'||Array.isArray(questions)||!Object.keys(questions).length)throw new Error('governed-jev-questions-required');
    if(!Number.isSafeInteger(inputTokenCeiling)||inputTokenCeiling<1||inputTokenCeiling>32000)throw new Error('governed-jev-input-token-ceiling-required');
    const maxUsd=Number(maximumSpendUsd);
    if(!Number.isFinite(maxUsd)||maxUsd<=0||maxUsd>.001)throw new Error('governed-jev-sub-mill-spend-bound-required');
    const estimatedMicrousd=estimateCognitionCeiling({route,inputTokens:inputTokenCeiling,maxOutputTokens:1,now:clock(),overheadRate:FEE});
    const hardMicrousd=Math.floor(maxUsd*1e6);
    if(!Number.isSafeInteger(estimatedMicrousd)||estimatedMicrousd<1||estimatedMicrousd>hardMicrousd)
      return {ok:false,status:'JEV_DECISION_ESTIMATE_EXCEEDS_BOUND',estimatedMicrousd,hardMicrousd,providerCallsPerformed:0,semanticAuthority:'NONE',crownSuppressionAuthority:'NONE'};
    const ceilingMicrousd=Math.max(100,Math.ceil(estimatedMicrousd/100)*100);
    if(ceilingMicrousd>hardMicrousd)
      return {ok:false,status:'JEV_DECISION_RESERVATION_EXCEEDS_BOUND',estimatedMicrousd,ceilingMicrousd,hardMicrousd,providerCallsPerformed:0,semanticAuthority:'NONE',crownSuppressionAuthority:'NONE'};

    const digest=hash({operationId,state,questions,inputTokenCeiling});
    const suffix=digest.slice(7,31),taskId='jev-shadow-'+suffix,callId='jev-shadow-call-'+suffix;
    const prepared=await runtime.preparePaidCall({callId,taskId,model:OPENROUTER_JEV_MODEL,provider:'openrouter',qualityClass:'Q_SHADOW_CONTROL',role:'WORKER',cacheState:'MISS_OR_UNKNOWN',ceilingMicrousd});
    if(!prepared.ok)return {...prepared,operationId,digest,estimatedMicrousd,ceilingMicrousd,semanticAuthority:'NONE',crownSuppressionAuthority:'NONE'};
    const result=await runtime.dispatchPaidCall(callId,{model:OPENROUTER_JEV_MODEL,task:{taskId,objective:'UberBond governed bounded Jev decision',consequenceClass:'NONE'},maxTokens:1,inputTokenCeiling,costCeilingMicrousd:ceilingMicrousd,decisionRequest:{model:OPENROUTER_JEV_MODEL,state,questions}});
    return {...result,schemaVersion:GOVERNED_JEV_SERVICE_SCHEMA,operationId,digest,estimatedMicrousd,ceilingMicrousd,semanticAuthority:'NONE',crownSuppressionAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};
  }
  async function triagePageFault({taskId,maximumSpendUsd=.001}={}){
    if(!validId(taskId))throw new Error('governed-jev-page-fault-task-id-required');
    const pending=await runtime.listPendingJevTriage({limit:64});
    if(!pending.ok)return {...pending,semanticAuthority:'NONE',crownSuppressionAuthority:'NONE'};
    const row=pending.rows.find(x=>x.taskId===taskId);
    if(!row)return {ok:true,status:'JEV_PAGE_FAULT_NOT_PENDING_OR_ALREADY_TRIAGED',taskId,providerCallsPerformed:0,semanticAuthority:'NONE',crownSuppressionAuthority:'NONE'};
    const plan=row.jevPlan;
    const operationId='native-pagefault-'+hash({taskId,planDigest:plan.planDigest}).slice(7,39);
    const result=await executeDecision({
      operationId,
      state:plan.state,
      questions:plan.questions,
      inputTokenCeiling:2048,
      maximumSpendUsd
    });
    if(!result.ok)return {...result,taskId,planDigest:plan.planDigest,semanticAuthority:'NONE',crownSuppressionAuthority:'NONE'};
    const recorded=await runtime.recordJevPageFaultTriage({
      taskId,
      planDigest:plan.planDigest,
      providerRequestId:result.providerRequestId,
      observedModelRevision:result.observedModelRevision,
      upstreamProvider:result.upstreamProvider,
      actualMicrousd:Number(result.observedCostMicrousd),
      answers:result.proposal?.answers??{}
    });
    return {...recorded,observedCostMicrousd:Number(result.observedCostMicrousd),providerCallsPerformed:1,
      modelRevision:result.observedModelRevision??null,upstreamProvider:result.upstreamProvider??null,
      semanticAuthority:'NONE',crownSuppressionAuthority:'NONE'};
  }

  async function executeDecisionTensor({batchId,requests,maximumTotalSpendUsd=.005,maximumPerGroupSpendUsd=.001}={}){
    const plan=compileJevSharedStateTensor({batchId,requests});
    if(!plan.ok)return plan;
    return executeGovernedJevTensor({plan,executeDecision,maximumTotalSpendUsd,maximumPerGroupSpendUsd});
  }

  return {model:OPENROUTER_JEV_MODEL,route:structuredClone(route),runtime,executeDecision,triagePageFault,
    compileDecisionTensor:compileJevSharedStateTensor,executeDecisionTensor};
}
