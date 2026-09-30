import crypto from 'node:crypto';
import { compileModelUnderstanding, chooseAnalyticLane, estimateModelTariffMicrousd } from './infinite-opus-model-understanding.mjs';

export const UBERMIND_COCKPIT_TASK_SCHEMA='uberbond.ubermind.cockpit-task.v1';
export const UBERMIND_GATEWAY_VERSION='uberbond.ubermind.gateway.v1';

const QUALITIES=new Set(['Q_EXACT','Q_CERTIFIED_BOUNDED','Q_FRONTIER','Q_MULTI_FRONTIER','Q_REALITY_SETTLED','Q_UNKNOWN','Q_PREPARATION']);
const EFFECTS=new Set(['NONE']);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:/-]{1,240}$/.test(x);
const safeInt=x=>Number.isSafeInteger(x)&&x>=0;
const SECRET_KEY=/password|passwd|secret|token|api[_-]?key|authorization|cookie|private[_-]?key|credential/i;
const SAFE_TOKEN_COUNT_FIELDS=new Set(['estimatedInputTokens','estimatedCachedInputTokens','maxOutputTokens']);
const sha=x=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');

function secretPaths(value,path='',depth=0){
 if(depth>12||value==null||typeof value!=='object')return[];
 const out=[];
 for(const [k,v] of Object.entries(value)){
  const at=path?path+'.'+k:k;
  if(SECRET_KEY.test(k)&&!SAFE_TOKEN_COUNT_FIELDS.has(k))out.push(at);
  if(v&&typeof v==='object')out.push(...secretPaths(v,at,depth+1));
 }
 return out;
}

function refuse(status,reasons=[]){
 return {ok:false,schemaVersion:UBERMIND_GATEWAY_VERSION,status,reasons:[...new Set(reasons)],semanticAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',providerCallsAuthorized:0};
}

export function validateCockpitTask(task){
 const reasons=[];
 if(task?.schemaVersion!==UBERMIND_COCKPIT_TASK_SCHEMA)reasons.push('cockpit-task-schema-required');
 if(!id(task?.taskId))reasons.push('task-id-required');
 if(!id(task?.taskClass))reasons.push('task-class-required');
 if(!QUALITIES.has(task?.qualityClass))reasons.push('known-quality-class-required');
 if(!EFFECTS.has(task?.sideEffectClass))reasons.push('zero-side-effect-cockpit-task-required');
 if(task?.stakes==='UNKNOWN'||!id(task?.stakes))reasons.push('known-stakes-required');
 if(task?.requiredMechanics!=null&&(!Array.isArray(task.requiredMechanics)||task.requiredMechanics.length>32||task.requiredMechanics.some(x=>!id(x))))reasons.push('bounded-required-mechanics-required');
 if(task?.candidateModels!=null&&(!Array.isArray(task.candidateModels)||task.candidateModels.length>16||task.candidateModels.some(x=>!id(x))))reasons.push('bounded-candidate-model-list-required');
 if(task?.estimatedInputTokens!=null&&!safeInt(task.estimatedInputTokens))reasons.push('safe-estimated-input-tokens-required');
 if(task?.estimatedCachedInputTokens!=null&&!safeInt(task.estimatedCachedInputTokens))reasons.push('safe-estimated-cached-input-tokens-required');
 if(task?.maxOutputTokens!=null&&(!safeInt(task.maxOutputTokens)||task.maxOutputTokens<1||task.maxOutputTokens>131072))reasons.push('bounded-max-output-tokens-required');
 const secrets=secretPaths(task);
 if(secrets.length)reasons.push('secret-bearing-task-refused:'+secrets.slice(0,8).join(','));
 let bytes=Infinity;
 try{bytes=Buffer.byteLength(JSON.stringify(task));}catch{}
 if(bytes>128000)reasons.push('cockpit-task-byte-bound-exceeded');
 return {ok:reasons.length===0,reasons,bytes};
}

export function verifyGatewayBearer(candidate,expected){
 if(typeof candidate!=='string'||typeof expected!=='string'||expected.length<24)return false;
 const a=Buffer.from(candidate),b=Buffer.from(expected);
 return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

function candidateCostRows(registry,models,task){
 const fresh=task.estimatedInputTokens??0,cached=task.estimatedCachedInputTokens??0,maxOut=task.maxOutputTokens??null;
 return models.map(model=>{
  const profile=registry.profiles.find(p=>p.model===model);
  if(!profile)return{model,status:'MODEL_PROFILE_REQUIRED'};
  if(!profile.referenceTariff)return{model,status:'CURRENT_TARIFF_NOT_BOUND_IN_MODEL_PROFILE'};
  const est=estimateModelTariffMicrousd({profile,freshInputTokens:fresh,cachedInputTokens:cached,maxOutputTokens:maxOut});
  return {model,...est,claimBoundary:'TARIFF_ARITHMETIC_OR_CEILING_ONLY__NOT_ACTUAL_PROVIDER_BILL'};
 });
}

export function compileUberMindGatewayPlan({task,modelUnderstanding,jev={status:'NOT_CONNECTED',certified:false}}={}){
 const valid=validateCockpitTask(task);
 if(!valid.ok)return refuse('COCKPIT_TASK_REFUSED',valid.reasons);
 let registry;
 try{registry=compileModelUnderstanding(modelUnderstanding);}catch(e){return refuse('MODEL_UNDERSTANDING_REGISTRY_REFUSED',[String(e?.message||e)]);}
 const defaultModels=['xiaomi/mimo-v2.6-flash','deepseek/deepseek-v4.1-flash','openai/gpt-6.1-sol','openai/gpt-6.1-sol-pro','anthropic/claude-opus-5.5'];
 const candidates=(task.candidateModels?.length?task.candidateModels:defaultModels).filter(m=>registry.profiles.some(p=>p.model===m));
 const analytic=chooseAnalyticLane({registry,task,candidateModels:candidates});
 const base={ok:true,schemaVersion:UBERMIND_GATEWAY_VERSION,taskId:task.taskId,taskHash:sha(task),taskClass:task.taskClass,
  qualityClass:task.qualityClass,sideEffectClass:'NONE',semanticAuthority:analytic.semanticAuthority??'NONE',
  businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',providerCallsAuthorized:0,empiricalModelTestRequired:Boolean(analytic.empiricalModelTestRequired),
  modelUnderstandingObservedAt:registry.observedAt,modelUnderstandingExpiresAt:registry.expiresAt};

 if(analytic.lane==='E0_E4_BY_CONSTRUCTION')return{...base,status:'GATEWAY_PLAN_READY',lane:analytic.lane,
  executionOrder:['VERIFY_PROOF_AND_DEPENDENCIES','EXECUTE_CERTIFIED_PATH','REALITY_COURT_IF_REQUIRED','MINT_PROVABLE_EXECUTION_RECEIPT'],
  modelCallsPlanned:0,jevMode:'NOT_NEEDED_FOR_AUTHORITY',qualityRetestRequired:false,
  truthBoundary:'Current E0-E4 proof supplies bounded semantic equivalence. Software/proof validity still requires deterministic verification; no model beauty contest is required.'};

 if(analytic.lane==='DETERMINISTIC_CODE_OR_SOLVER')return{...base,status:'GATEWAY_PLAN_READY',lane:analytic.lane,
  executionOrder:['EXECUTE_EXACT_BACKEND','VERIFY_EXACT_RESULT','MINT_E1_OR_REALITY_RECEIPT'],
  modelCallsPlanned:0,jevMode:'NOT_NEEDED',qualityRetestRequired:false};

 const jevEligible=task.jevEligible===true&&task.qualityClass!=='Q_FRONTIER'&&task.qualityClass!=='Q_MULTI_FRONTIER';
 const jevMode=jevEligible?(jev.certified===true?'CERTIFIED_E4_CANDIDATE':'SHADOW_ONLY'):'NOT_APPLICABLE';
 const roleOrder=analytic.lane==='CROWN_PAGE_FAULT'
   ? ['openai/gpt-6.1-sol','openai/gpt-6.1-sol-pro','anthropic/claude-opus-5.5']
   : ['xiaomi/mimo-v2.6-flash','deepseek/deepseek-v4.1-flash','openai/gpt-6.1-sol'];
 const selected=roleOrder.filter(x=>candidates.includes(x));
 const executionOrder=[];
 if(jevMode==='SHADOW_ONLY')executionOrder.push('JEV_SHADOW_ROUTE_SIGNAL');
 if(task.preparationAllowed!==false)executionOrder.push('CHEAP_OR_STRONG_PREPARATION');
 if(analytic.lane==='CROWN_PAGE_FAULT')executionOrder.push('CURRENT_CROWN_ADMISSION_REQUIRED','CROWN_RESIDUAL_ADJUDICATION');
 else executionOrder.push('EXACT_OR_CERTIFIED_CLOSURE_REQUIRED_BEFORE_SHIP');
 executionOrder.push('REALITY_COURT','CAPITALIZE_REUSABLE_DESCENDANTS');

 return{...base,status:'GATEWAY_PLAN_READY',lane:analytic.lane,jevMode,jevStatus:jev.status??'UNKNOWN',
  candidateOrder:selected,costEnvelopes:candidateCostRows(registry,selected,task),executionOrder,
  modelCallsPlanned:'RUNTIME_DECIDES_AFTER_CACHE_EXACT_JEV_GATES',qualityRetestRequired:analytic.lane==='CROWN_PAGE_FAULT',
  truthBoundary:'Architecture and tariff mechanics reduce the search space and predict cost envelopes. They do not manufacture Crown authority for open-ended semantics. Paid inference remains separately authorized and provider billing remains settlement authority.'};
}

export function gatewayStatus({modelUnderstanding,jev={status:'NOT_CONNECTED',certified:false},runtime={}}={}){
 let registryStatus='REFUSED',profileCount=0,expiresAt=null;
 try{const r=compileModelUnderstanding(modelUnderstanding);registryStatus='CURRENT';profileCount=r.profiles.length;expiresAt=r.expiresAt;}catch{}
 return{ok:registryStatus==='CURRENT',schemaVersion:UBERMIND_GATEWAY_VERSION,status:registryStatus==='CURRENT'?'UBERMIND_GATEWAY_SOURCE_READY':'UBERMIND_GATEWAY_MODEL_REGISTRY_STALE_OR_INVALID',
  modelUnderstanding:{status:registryStatus,profileCount,expiresAt},jev:{status:jev.status??'NOT_CONNECTED',certified:jev.certified===true},
  runtime:{paidConnected:runtime.paidConnected===true,budgetConnected:runtime.budgetConnected===true,proofLedgerConnected:runtime.proofLedgerConnected===true},
  semanticAuthority:'NONE',externalEffectAuthority:'NONE',
  truthBoundary:'Gateway status is source/config readiness only. It does not prove deployment, TypingMind connectivity, live Jev, Crown admission, paid callability, realized savings or 33,333x compression.'};
}
