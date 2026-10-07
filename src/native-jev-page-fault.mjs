import crypto from 'node:crypto';
import { buildGenericJevControlQuestions } from './openrouter-processor-auction-v5.mjs';

export const NATIVE_JEV_PAGE_FAULT_SCHEMA='uberbond.native-jev-page-fault-plan.v1';

const h=value=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uniq=xs=>[...new Set((Array.isArray(xs)?xs:[]).map(x=>String(x)).filter(Boolean))].slice(0,32);

export function compileNativeJevPageFaultPlan({task,context=null,closureReasons=[]}={}){
  if(!task||typeof task!=='object'||typeof task.taskId!=='string'||typeof task.taskClass!=='string')
    return {ok:false,status:'NATIVE_JEV_PLAN_INPUT_REFUSED',providerCallsPerformed:0,semanticAuthority:'NONE'};

  const reasons=uniq(closureReasons);
  const questions=buildGenericJevControlQuestions();
  const state={
    task_class:String(task.taskClass).slice(0,120),
    stakes:String(task.stakes??'UNKNOWN').slice(0,80),
    obligation_digest:h(task.obligation??task.request??task.payload??{taskId:task.taskId}),
    semantic_context_digest:context?h(context):null,
    closure_reason_codes:reasons,
    has_context:Boolean(context),
    has_request:Boolean(task.request),
    has_payload:Boolean(task.payload),
    exact_and_certified_lanes_exhausted:true,
    current_authority:'NONE',
    consequence_class:'NONE'
  };
  const body={
    schemaVersion:NATIVE_JEV_PAGE_FAULT_SCHEMA,
    mode:'PLAN_ONLY',
    purpose:'Triage an unresolved native semantic page fault after exact/certified lanes and before frontier escalation.',
    state,
    questions,
    providerCallAuthorized:false,
    spendAuthorized:false,
    maySelectWorker:false,
    mayTuneWorker:false,
    mayRequestMoreReview:true,
    maySuppressCrown:false,
    promotionRequiredForCrownSuppression:true,
    rawTaskStored:false,
    rawContextStored:false,
    providerCallsPerformed:0,
    semanticAuthority:'NONE',
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE'
  };
  return {ok:true,status:'NATIVE_JEV_PAGE_FAULT_PLAN_COMPILED',plan:{...body,planDigest:h(body)}};
}
