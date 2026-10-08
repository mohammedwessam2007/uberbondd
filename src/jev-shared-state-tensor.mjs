import { semanticHash } from './semantic-closure-kernel.mjs';
import { redactSecrets } from './secret-patterns.mjs';

export const JEV_TENSOR_SCHEMA='uberbond.jev-shared-state-tensor.v1';
const MODEL='typesafe/jev-1.13';
const MAX_QUESTIONS=128;
const MAX_GROUPS=32;
const MAX_INPUT_TOKENS=32000;
const MAX_PAYLOAD_BYTES=150000;
const ID=/^[A-Za-z0-9_.:-]{1,120}$/;
const SHA=/^(?:sha256:)?[a-f0-9]{64}$/;
const SAFE=/^[A-Za-z0-9_.:/-]{1,160}$/;
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const refusal=(reason,extra={})=>({
  ok:false,status:'JEV_TENSOR_COMPILATION_REFUSED',reason,providerCallsPerformed:0,
  spendAuthorized:false,semanticAuthority:'NONE',crownSuppressionAuthority:'NONE',...extra
});

function validateQuestion(question){
  if(!isObj(question)||!['choice','score','noul'].includes(question.type)||
    typeof question.instructions!=='string'||!question.instructions.trim()||
    question.instructions.length>1000)return false;
  if(question.type==='noul')return !Object.hasOwn(question,'criteria');
  if(question.type==='choice'){
    if(!isObj(question.criteria))return false;
    const entries=Object.entries(question.criteria);
    return entries.length>=2&&entries.length<=20&&
      entries.every(([key,value])=>ID.test(key)&&
        typeof value==='string'&&value.length>0&&value.length<=1000);
  }
  if(!Array.isArray(question.criteria)||question.criteria.length<2||question.criteria.length>10)return false;
  return question.criteria.every(x=>typeof x==='string'&&x.length>0&&x.length<=1000);
}
function validateScope(s){
  return isObj(s)&&Object.keys(s).length===7&&
    ['tenantId','credentialScopeId','dataClass','qualityContractHash','sourceDigest','freshnessClass','sideEffectClass']
      .every(k=>Object.hasOwn(s,k))&&
    SAFE.test(s.tenantId)&&SAFE.test(s.credentialScopeId)&&
    ['PUBLIC','INTERNAL','CONFIDENTIAL'].includes(s.dataClass)&&
    SHA.test(s.qualityContractHash)&&SHA.test(s.sourceDigest)&&
    ['IMMUTABLE','DEPENDENCY_BOUND','LIVE'].includes(s.freshnessClass)&&
    s.sideEffectClass==='NONE';
}
const sizeOf=(state,questions)=>{
  const bytes=Buffer.byteLength(JSON.stringify({model:MODEL,state,questions}),'utf8');
  return {bytes,inputTokenCeiling:bytes+128}; // conservative 1 UTF-8 byte/token, not measured usage
};
const limitOk=x=>x.bytes<=MAX_PAYLOAD_BYTES&&x.inputTokenCeiling<=MAX_INPUT_TOKENS;
const validProb=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
function validateAnswer(answer,question){
 if(!isObj(answer)||answer.type!==question.type)return false;
 if(answer.type==='noul')return validProb(answer.noul);
 if(answer.type==='choice')return typeof answer.choice==='string'&&Object.hasOwn(question.criteria,answer.choice)&&
   (answer.confidence===undefined||validProb(answer.confidence));
 if(answer.type==='score')return typeof answer.score==='number'&&Number.isFinite(answer.score)&&
   answer.score>=0&&answer.score<=question.criteria.length-1&&
   (answer.confidence===undefined||validProb(answer.confidence));
 return false;
}


/**
 * Compile same-state, same-authority-scope typed questions into one bounded Jev
 * request. Never merge tenants, credential scopes, data classes, source versions,
 * freshness contracts, or distinct states. No inference or savings proof here.
 */
export function compileJevSharedStateTensor({batchId,requests=[]}={}){
  if(!SAFE.test(batchId??'')||!Array.isArray(requests)||requests.length===0||requests.length>256)
    return refusal('bounded-batch-required');
  const ids=new Set(),contexts=new Map();
  let originalQuestionCount=0;
  for(const row of requests){
    if(!isObj(row)||!SAFE.test(row.requestId??'')||ids.has(row.requestId))
      return refusal('unique-request-id-required');
    ids.add(row.requestId);
    if(!validateScope(row.scope))return refusal('complete-identical-authority-scope-required',{requestId:row.requestId});
    if(!isObj(row.state))return refusal('object-state-required',{requestId:row.requestId});
    let serialized;
    try {serialized=JSON.stringify({state:row.state,questions:row.questions});}
    catch {return refusal('canonical-state-required',{requestId:row.requestId});}
    if(typeof serialized!=='string'||serialized!==redactSecrets(serialized))
      return refusal('secret-bearing-tensor-refused',{requestId:row.requestId});
    if(!isObj(row.questions)||!Object.keys(row.questions).length)
      return refusal('bounded-typed-questions-required',{requestId:row.requestId});
    const entries=Object.entries(row.questions);
    if(entries.length>MAX_QUESTIONS||entries.some(([k,q])=>!ID.test(k)||!validateQuestion(q)))
      return refusal('invalid-typed-question',{requestId:row.requestId});
    originalQuestionCount+=entries.length;
    if(originalQuestionCount>1024)return refusal('batch-question-cap-exceeded');
    let fingerprint;
    try {fingerprint=semanticHash({scope:row.scope,state:row.state});}
    catch{return refusal('canonical-state-required',{requestId:row.requestId});}
    const group=contexts.get(fingerprint)??{state:structuredClone(row.state),scope:structuredClone(row.scope),rows:[]};
    group.rows.push({requestId:row.requestId,entries:entries.map(([id,q])=>({id,question:structuredClone(q)}))});
    contexts.set(fingerprint,group);
  }
  const groups=[];
  for(const context of contexts.values()){
    let questions=Object.create(null),mapping=[],n=0,exactQuestionIds=new Map();
    const flush=()=>{
      if(!mapping.length)return;
      const next={...questions},size=sizeOf(context.state,next);
      const ordinal=groups.length;
      const id='jev-tensor-'+semanticHash({batchId,ordinal,scope:context.scope,state:context.state,questions:next,mapping}).slice(7,39);
      groups.push({operationId:id,ordinal,scope:structuredClone(context.scope),state:structuredClone(context.state),
        questions:next,mapping:[...mapping],questionCount:n,
        inputTokenCeiling:size.inputTokenCeiling,payloadBytes:size.bytes,
        semanticAuthority:'NONE',crownSuppressionAuthority:'NONE'});
      questions=Object.create(null);mapping=[];n=0;exactQuestionIds=new Map();
    };
    for(const row of context.rows)for(const entry of row.entries){
      const questionDigest=semanticHash(entry.question);
      if(exactQuestionIds.has(questionDigest)){
        mapping.push({questionId:exactQuestionIds.get(questionDigest),requestId:row.requestId,originalQuestionId:entry.id});
        continue;
      }
      const questionId='q_'+String(n+1).padStart(3,'0');
      const proposal={...questions,[questionId]:entry.question};
      if(n===MAX_QUESTIONS||!limitOk(sizeOf(context.state,proposal))){
        flush();
      }
      const id='q_'+String(n+1).padStart(3,'0');
      const candidate={...questions,[id]:entry.question};
      if(!limitOk(sizeOf(context.state,candidate)))
        return refusal('single-question-exceeds-jev-context',{requestId:row.requestId});
      questions=candidate;
      mapping.push({questionId:id,requestId:row.requestId,originalQuestionId:entry.id});
      exactQuestionIds.set(questionDigest,id);
      n++;
    }
    flush();
  }
  if(groups.length>MAX_GROUPS)return refusal('too-many-request-groups');
  return {ok:true,status:'JEV_SHARED_STATE_TENSOR_PLAN_ONLY',
    schemaVersion:JEV_TENSOR_SCHEMA,batchId,groupCount:groups.length,
    originalQuestionCount,uniqueQuestionCount:groups.reduce((sum,g)=>sum+g.questionCount,0),groups,
    exactQuestionDedupCount:originalQuestionCount-groups.reduce((sum,g)=>sum+g.questionCount,0),
    potentialIndividualRequests:originalQuestionCount,
    potentialRequestReduction:Math.max(0,originalQuestionCount-groups.length),
    savingsEvidence:'MODELED_UNVERIFIED_NO_ACTUAL_BASELINE',
    providerCallsPerformed:0,spendAuthorized:false,
    semanticAuthority:'NONE',crownSuppressionAuthority:'NONE',
    truthBoundary:'Grouped typed questions share EXACT state and scope. Jev returns advisory probabilities, not correct reasoning; no paid call, Crown suppression, matched reference cost, or quality proof is created by compilation.'};
}

/**
 * Execute compiled Jev tensor only through the existing paid runtime, one group
 * at a time, with a conservative aggregate reserved ceiling. Never retry an
 * uncertain dispatch and never silently accept partial/misaddressed answers.
 */
export async function executeGovernedJevTensor({plan,executeDecision,
  maximumTotalSpendUsd=.005,maximumPerGroupSpendUsd=.001}={}){
  const fail=(status,extra={})=>({ok:false,status,...extra,
    automaticRetryAuthorized:false,semanticAuthority:'NONE',crownSuppressionAuthority:'NONE'});
  if(!plan?.ok||plan.schemaVersion!==JEV_TENSOR_SCHEMA||!Array.isArray(plan.groups)||
    !Number.isFinite(maximumTotalSpendUsd)||maximumTotalSpendUsd<=0||maximumTotalSpendUsd>.005||
    !Number.isFinite(maximumPerGroupSpendUsd)||maximumPerGroupSpendUsd<=0||maximumPerGroupSpendUsd>.001||
    typeof executeDecision!=='function')
    return fail('JEV_TENSOR_EXECUTION_INPUT_REFUSED',{providerCallsPerformed:0});
  // Validate the complete plan before any network crossing.
  if(plan.groups.length===0||plan.groups.length>MAX_GROUPS||
    plan.groupCount!==plan.groups.length||
    !Number.isSafeInteger(plan.originalQuestionCount)||plan.originalQuestionCount<1||
    plan.originalQuestionCount>1024)
    return fail('JEV_TENSOR_PLAN_SHAPE_REFUSED',{providerCallsPerformed:0});
  const rows=new Map();
  for(const group of plan.groups){
    if(!group||!Array.isArray(group.mapping)||!group.mapping.length||
      new Set(group.mapping.map(x=>x.questionId)).size!==Object.keys(group.questions??{}).length)
      return fail('JEV_TENSOR_MAPPING_REFUSED',{providerCallsPerformed:0});
    for(const item of group.mapping){
      if(!ID.test(item.questionId)||!SAFE.test(item.requestId)||!ID.test(item.originalQuestionId)||
        !Object.hasOwn(group.questions,item.questionId))
        return fail('JEV_TENSOR_MAPPING_REFUSED',{providerCallsPerformed:0});
      const entry=rows.get(item.requestId)??{requestId:item.requestId,questions:{}};
      if(Object.hasOwn(entry.questions,item.originalQuestionId))
        return fail('JEV_TENSOR_DUPLICATE_ANSWER_REFUSED',{providerCallsPerformed:0});
      entry.questions[item.originalQuestionId]=group.questions[item.questionId];
      rows.set(item.requestId,entry);
    }
  }
  const maxCalls=Math.floor(maximumTotalSpendUsd*1e6);
  const reservedPerGroup=Math.floor(maximumPerGroupSpendUsd*1e6);
  if(reservedPerGroup<1||plan.groups.length*reservedPerGroup>maxCalls)
    return fail('JEV_TENSOR_TOTAL_RESERVATION_EXCEEDS_BOUND',{providerCallsPerformed:0});
  const results=[],answers=[];
  let performed=0,charged=0;
  for(const [ordinal,group] of plan.groups.entries()){
    if(group.ordinal!==ordinal||!validateScope(group.scope)||group.scope.dataClass!=='PUBLIC'||
      !isObj(group.state)||!isObj(group.questions)||
      Object.entries(group.questions).some(([k,q])=>!ID.test(k)||!validateQuestion(q))||
      Object.keys(group.questions).length>MAX_QUESTIONS||
      !limitOk(sizeOf(group.state,group.questions))||
      !Number.isSafeInteger(group.inputTokenCeiling)||
      group.inputTokenCeiling<sizeOf(group.state,group.questions).inputTokenCeiling||
      group.inputTokenCeiling>MAX_INPUT_TOKENS||
      group.operationId!=='jev-tensor-'+semanticHash({batchId:plan.batchId,ordinal,scope:group.scope,state:group.state,questions:group.questions,mapping:group.mapping}).slice(7,39))
      return fail('JEV_TENSOR_GROUP_INTEGRITY_REFUSED',{providerCallsPerformed:performed,results});
  }
  if([...rows.values()].reduce((n,row)=>n+Object.keys(row.questions).length,0)!==plan.originalQuestionCount)
    return fail('JEV_TENSOR_TOTAL_QUESTION_COUNT_REFUSED',{providerCallsPerformed:0});
  for(const group of plan.groups){
    let result;
    try{result=await executeDecision({operationId:group.operationId,
      state:group.state,questions:group.questions,inputTokenCeiling:group.inputTokenCeiling,
      maximumSpendUsd:maximumPerGroupSpendUsd});}
    catch{return fail('JEV_TENSOR_DISPATCH_UNCERTAIN_HOLD',{providerCallsPerformed:null,results});}
    const n=result?.providerCallsPerformed;
    if(n!==0&&n!==1)return fail('JEV_TENSOR_PROVIDER_CALL_COUNT_UNKNOWN',{providerCallsPerformed:null,results});
    performed+=n;
    results.push({operationId:group.operationId,status:result?.status??'UNKNOWN',
      providerCallsPerformed:n,providerRequestId:result?.providerRequestId??null,
      actualCostMicrousd:result?.observedCostMicrousd??null});
    if(!result?.ok)return fail('JEV_TENSOR_PARTIAL_OR_REFUSED_NO_RETRY',{providerCallsPerformed:performed,results});
    const cost=result.observedCostMicrousd;
    if(!Number.isSafeInteger(cost)||cost<0)return fail('JEV_TENSOR_BILLING_UNKNOWN',{providerCallsPerformed:performed,results});
    charged+=cost;
    if(charged>maxCalls)return fail('JEV_TENSOR_BUDGET_BREACHED',{providerCallsPerformed:performed,results});
    const actual=result.proposal?.answers;
    if(!isObj(actual)||Object.keys(actual).length!==Object.keys(group.questions).length||
      group.mapping.some(x=>!Object.hasOwn(actual,x.questionId)))
      return fail('JEV_TENSOR_ANSWER_COMPLETENESS_REFUSED',{providerCallsPerformed:performed,results});
    for(const m of group.mapping){
      const a=actual[m.questionId];
      if(!validateAnswer(a,group.questions[m.questionId]))
        return fail('JEV_TENSOR_ANSWER_TYPE_REFUSED',{providerCallsPerformed:performed,results});
      answers.push({requestId:m.requestId,questionId:m.originalQuestionId,answer:structuredClone(a),
        providerRequestId:result.providerRequestId??null,semanticAuthority:'NONE'});
    }
  }
  return {ok:true,status:'JEV_TENSOR_ADVISORY_DECISIONS_OBSERVED',
    providerCallsPerformed:performed,observedCostMicrousd:charged,results,answers,
    originalQuestionCount:plan.originalQuestionCount,groupCount:plan.groupCount,
    savingsEvidence:'NO_MATCHED_COUNTERFACTUAL_OBSERVED',
    semanticAuthority:'NONE',crownSuppressionAuthority:'NONE',
    automaticRetryAuthorized:false,externalEffectAuthority:'NONE'};
}
