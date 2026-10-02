import crypto from 'node:crypto';
import { RESUME_KEY, SOURCE_KEY, validCrownResumeAuthority, recoverCrownResumeCheckpoint } from '../src/crown-resume-checkpoint.mjs';
import { RECOVERY_KEY, reconcileOriginalCrownFinancialState, ORIGINAL_GENERATION } from './infinite-opus-crown-financial-recovery.mjs';
import { REPLACEMENT_KEY, validReplacementAuthority } from '../src/crown-replacement-authority.mjs';
import { verifyCrownProviderModel } from '../src/crown-model-identity.mjs';
import { sealCrownCheckpoint, openCrownCheckpoint } from '../src/crown-sealed-checkpoint.mjs';
import { compileCrownTournament, adjudicateCrownTournament } from '../src/crown-tournament.mjs';
import { issueCrownAdmissionReceipt } from '../src/crown-admission.mjs';

const KEY='infinite_opus_crown_autofinish_20261001_v7';
const PRIOR_KEY='infinite_opus_crown_autofinish_20261001_v6';
const PRIOR_EXPECTED_SPEND_USD=0.01437375;
const EVALUATOR='google/gemini-2.5-pro';
const OPUS='anthropic/claude-opus-5.5';
const SOL='openai/gpt-6.1-sol-pro';
const ROUTE='openrouter:auto-provider-zdr-deny-required-parameters-v1';
const MAX_NEW_SPEND_USD=.45;
const OLD_UNCERTAIN_RESERVE_USD=.073277;
const PRICE_CAPS=Object.freeze({
  [EVALUATOR]:{prompt:1.26,completion:10.01},
  [OPUS]:{prompt:4.01,completion:20.01},
  [SOL]:{prompt:2.01,completion:10.01}
});
const h=x=>'sha256:'+crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const parseJson=text=>{
  const s=String(text??'').trim().replace(/^\`\`\`(?:json)?\s*/i,'').replace(/\s*\`\`\`$/,'');
  try{return JSON.parse(s);}catch{}
  const a=s.indexOf('{'),b=s.lastIndexOf('}'); if(a>=0&&b>a)return JSON.parse(s.slice(a,b+1));
  throw new Error('sealed-json-parse-failed');
};
const content=j=>{
  const m=j?.choices?.[0]?.message??{};
  if(typeof m.content==='string')return m.content;
  if(m.parsed&&typeof m.parsed==='object')return JSON.stringify(m.parsed);
  if(Array.isArray(m.content))return m.content.map(x=>{
    if(typeof x==='string')return x;
    if(typeof x?.text==='string')return x.text;
    if(typeof x?.text?.value==='string')return x.text.value;
    if(typeof x?.content==='string')return x.content;
    return '';
  }).join('');
  return '';
};
const callUpperBoundUsd=({model,messages,maxTokens,responseFormat})=>{
  const cap=PRICE_CAPS[model]; if(!cap)throw new Error('price-cap-required:'+model);
  // UTF-8 bytes are a deliberately conservative upper bound on text token count.
  // Add 4096 input tokens for provider/schema/system framing not represented in messages.
  const inputBytes=Buffer.byteLength(JSON.stringify({messages,response_format:responseFormat??null}));
  const inputTokensUpper=inputBytes+4096;
  return (inputTokensUpper*cap.prompt+Number(maxTokens)*cap.completion)/1_000_000;
};
async function getState(store,key=KEY){
  return store.transaction(async tx=>(await tx.getSettings())[key]??null);
}
async function writeState(store,patch,key=KEY){
  return store.transaction(async tx=>{
    const settings=await tx.getSettings(),prior=settings[key]??{};
    const next={...prior,...patch,updatedAt:new Date().toISOString()};
    await tx.setSetting(key,next); return next;
  });
}
async function generation(apiKey,id){
  for(let i=0;i<8;i++){
    const r=await fetch('https://openrouter.ai/api/v1/generation?id='+encodeURIComponent(id),{
      headers:{authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(15000)
    });
    if(r.ok){
      const j=await r.json(),d=j?.data;
      if(d&&Number.isFinite(Number(d.total_cost)))return d;
    }
    await sleep(1000*(i+1));
  }
  throw new Error('generation-reconciliation-required:'+id);
}
async function call(apiKey,{model,messages,maxTokens,provider,tag,responseFormat=null,reasoningTokens=null,onGeneration=async()=>{},onSealedResponse=async()=>{}}){
  const body={model,messages,max_tokens:maxTokens,stream:false,
    ...(responseFormat?{response_format:responseFormat}:{}),
    ...(Number.isInteger(reasoningTokens)?{reasoning:{max_tokens:reasoningTokens,exclude:true}}:{}),
    provider:{order:[provider],allow_fallbacks:false,require_parameters:true,data_collection:'deny',zdr:true,
      max_price:PRICE_CAPS[model]}};
  const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{
    method:'POST',headers:{authorization:'Bearer '+apiKey,'content-type':'application/json','x-title':'UberBond Sealed Crown '+tag},
    body:JSON.stringify(body),signal:AbortSignal.timeout(120000)
  });
  const raw=await r.text();
  if(!r.ok)throw new Error('provider-call-refused:'+model+':'+r.status+':'+raw.slice(0,300));
  const j=JSON.parse(raw),id=String(j?.id??'');
  if(!id)throw new Error('provider-generation-id-required:'+model);
  // Persist identity before reconciliation so a billed response cannot disappear.
  await onGeneration({id,model,status:'DISPATCHED_UNRECONCILED'});
  const meta=await generation(apiKey,id);
  const observedModel=String(meta.model??j.model??'');
  const cost=Number(meta.total_cost);
  if(!Number.isFinite(cost)||cost<0)throw new Error('provider-bill-required:'+id);
  await onGeneration({
    id,model,observedModel,costUsd:cost,provider:String(meta.provider_name??''),
    finishReason:String(j?.choices?.[0]?.finish_reason??meta.finish_reason??''),
    promptTokens:meta.native_tokens_prompt??null,completionTokens:meta.native_tokens_completion??null,
    reasoningTokens:meta.native_tokens_reasoning??null,
    status:verifyCrownProviderModel({requestedModel:model,observedModel,provider:String(meta.provider_name??'')})?'PROVIDER_RECONCILED_PENDING_EVIDENCE':'RECONCILED_INVALID_EVIDENCE'
  });
  await onSealedResponse({id,model,text:content(j),meta,cost});
  if(!verifyCrownProviderModel({requestedModel:model,observedModel,provider:String(meta.provider_name??'')}))throw new Error('model-identity-drift:'+model+':'+observedModel);
  const text=content(j),reasoning=String(j?.choices?.[0]?.message?.reasoning??'');
  return {id,text,meta,cost,model,providerName:String(meta.provider_name??''),
    finishReason:String(j?.choices?.[0]?.finish_reason??meta.finish_reason??''),
    contentBytes:Buffer.byteLength(text),reasoningBytes:Buffer.byteLength(reasoning)};
}

function taskResponseFormat(){
 return {type:'json_schema',json_schema:{name:'sealed_general_crown_tasks',strict:true,schema:{
   type:'object',additionalProperties:false,required:['tasks'],properties:{tasks:{type:'array',minItems:2,maxItems:2,items:{
     type:'object',additionalProperties:false,required:['id','prompt','rubric','must_not'],properties:{
       id:{type:'string'},prompt:{type:'string',minLength:100,maxLength:600},rubric:{type:'array',minItems:5,maxItems:8,items:{type:'string'}},
       must_not:{type:'array',items:{type:'string'}}
     }
   }}}
 }}};
}
function gradeResponseFormat(){
 return {type:'json_schema',json_schema:{name:'sealed_general_crown_grades',strict:true,schema:{
   type:'object',additionalProperties:false,required:['grades'],properties:{grades:{type:'array',minItems:4,maxItems:4,items:{
     type:'object',additionalProperties:false,required:['task_id','candidate','quality_score','required_regressions','canonical_zero_loss','reason'],properties:{
       task_id:{type:'string'},candidate:{type:'string',enum:['A','B']},quality_score:{type:'number',minimum:0,maximum:100},
       required_regressions:{type:'integer',minimum:0},canonical_zero_loss:{type:'boolean'},reason:{type:'string'}
     }
   }}}
 }}};
}

function taskGenerationMessages(){
 return [
  {role:'system',content:'You are an independent sealed benchmark custodian. Create exactly two fresh, difficult GENERAL_CROWN tasks testing broad reasoning, evidence discipline, constraint tracking, counterexample handling, and synthesis. Tasks must be self-contained, text-only, answerable without web/tools, not depend on obscure trivia, and have objective evaluation criteria. Return strict JSON only. Never mention candidate model names.'},
  {role:'user',content:'Return {"tasks":[{"id":"t1","prompt":"...","rubric":["..."],"must_not":["..."]},{"id":"t2","prompt":"...","rubric":["..."],"must_not":["..."]}]}. HARD CONTRACT: each prompt MUST be 100-600 ASCII characters (not words), self-contained and difficult; each rubric MUST contain 5-8 concise requirements. Keep must_not concise. Do not exceed 600 characters in either prompt.'}
 ];
}
function evaluationMessages(tasks,blind){
 return [
  {role:'system',content:'You are the same independent sealed benchmark custodian. Grade answers strictly against the supplied hidden task rubrics. Candidate labels A/B are randomized and reveal no model identity. Return strict JSON only. quality_score is 0..100. required_regressions counts material failures of explicit rubric requirements. canonical_zero_loss is true only when required_regressions is 0. Do not reward verbosity.'},
  {role:'user',content:JSON.stringify({tasks:tasks.map(t=>({id:t.id,prompt:t.prompt,rubric:t.rubric,must_not:t.must_not})),answers:blind,output:{grades:[{task_id:'t1',candidate:'A',quality_score:0,required_regressions:0,canonical_zero_loss:true,reason:'brief'}]}})}
 ];
}
function currentPaidAuthority(authorization,now=Date.now()){
 return Boolean(authorization?.evidenceRef &&
   authorization.month===new Date(now).toISOString().slice(0,7) &&
   authorization.maxMonthlyMicrousd===20_000_000 &&
   Number.isFinite(Date.parse(authorization.expiresAt)) &&
   Date.parse(authorization.expiresAt)>now &&
   (authorization.crownRoutes??[]).includes('openrouter:'+OPUS));
}
export async function runCrownAutoFinish({store,apiKey,paidAuthorization,mainSha='unknown',checkpointKey=process.env.TOKEN_ENCRYPTION_KEY,replacementAuthorization=null,resumeAuthorization=null}={}){
 if(!store||!apiKey)return {ok:false,status:'AUTOFINISH_INPUT_MISSING'};
 const resuming=resumeAuthorization!==null;
 if(resuming&&!validCrownResumeAuthority(resumeAuthorization))return {ok:false,status:'EXPLICIT_MISSING_EDGE_RESUME_AUTHORITY_REQUIRED',providerCallsPerformed:0};
 const replacement=resuming||replacementAuthorization!==null;
 if(replacement&&!resuming&&!validReplacementAuthority(replacementAuthorization))return {ok:false,status:'EXPLICIT_REPLACEMENT_AUTHORITY_REQUIRED',providerCallsPerformed:0};
 const attemptKey=resuming?RESUME_KEY:replacement?REPLACEMENT_KEY:KEY;
 const readState=()=>getState(store,attemptKey);
 const setState=(s,p)=>writeState(s,p,attemptKey);
 const prior=await readState();
 let recovered=null;

 const priorV6=await getState(store,PRIOR_KEY);
 if(!replacement&&(priorV6?.status!=='FAILED_NO_AUTOMATIC_RETRY'||!String(priorV6?.reason||'').startsWith('provider-call-refused:anthropic/claude-opus-5.5:404:')||Math.abs(Number(priorV6?.newSpendUsd)-PRIOR_EXPECTED_SPEND_USD)>1e-9))return {ok:false,status:'AUTOFINISH_V7_PRIOR_STATE_REFUSED',reason:'exact-v6-parameter-routing-refusal-required'};
 if(prior)return {
   ok:prior.status==='COMPLETE',
   status:prior.status==='COMPLETE'?'AUTOFINISH_ALREADY_COMPLETE':'AUTOFINISH_ALREADY_ATTEMPTED_NO_RETRY',
   receiptHash:prior.crownAdmission?.receiptHash??null,
   priorStatus:prior.status
 };
 if(resuming)recovered=recoverCrownResumeCheckpoint(await getState(store,SOURCE_KEY),{key:checkpointKey});
 if(!currentPaidAuthority(paidAuthorization))return {ok:false,status:'EXPLICIT_PAID_RUNTIME_AUTHORITY_REQUIRED',providerCallsPerformed:0};
 if(typeof checkpointKey!=='string'||checkpointKey.length<32)return {ok:false,status:'PRIVATE_SEALED_CHECKPOINT_KEY_REQUIRED',providerCallsPerformed:0};
 if(replacement){
  const old=await getState(store,KEY);
  if(old?.status!=='FAILED_NO_AUTOMATIC_RETRY')return {ok:false,status:'EXACT_FAILED_V7_STATE_REQUIRED',providerCallsPerformed:0};
  if(resuming){
   const source=await getState(store,SOURCE_KEY);
   for(const row of source.generationJournal){
    const observed=await generation(apiKey,row.id);
    if(observed.id!==row.id||Number(observed.total_cost)!==row.costUsd||observed.model!==row.observedModel||observed.provider_name!==row.provider)
     throw new Error('prior-billing-reconciliation-drift');
   }
  }
  const meta=await generation(apiKey,ORIGINAL_GENERATION);
  await reconcileOriginalCrownFinancialState({store,generationMetadata:meta});
  const keyResponse=await fetch('https://openrouter.ai/api/v1/key',{headers:{authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(15000)});
  const keyBody=keyResponse.ok?await keyResponse.json():null,policy=keyBody?.data;
  if(Number(policy?.limit)!==20||policy?.limit_reset!=='monthly'||Number(policy?.limit_remaining)<15+MAX_NEW_SPEND_USD)
   return {ok:false,status:'KEY_CAP_OR_PROTECTED_CROWN_RESERVE_REFUSED',providerCallsPerformed:0};
 }
 const claimed=await store.transaction(async tx=>{
  if(tx.transactionClient===true)await tx.pool.query('SELECT pg_advisory_xact_lock($1)',[1347375955]);
  const settings=await tx.getSettings();
  if(settings[attemptKey])return false;
  await tx.setSetting(attemptKey,{status:'CLAIMED',updatedAt:new Date().toISOString()}); return true;
 });
 if(!claimed)return {ok:false,status:'AUTOFINISH_ALREADY_ATTEMPTED_NO_RETRY',providerCallsPerformed:0};
 await setState(store,{status:'RUNNING',startedAt:new Date().toISOString(),oldUncertainTournament:{
   status:replacement?'FINANCIALLY_RECONCILED_INVALID_EVIDENCE':'ABANDONED_UNCERTAIN_NO_RETRY',callId:'sealed-call-06264df855de7eedeb12982dfad2909db0cdcfb0',
   taskId:'sealed-paid-0-0-805bb7d11651df598fcb',reservedWorstCaseUsd:OLD_UNCERTAIN_RESERVE_USD
 },newSpendUsd:recovered?.inheritedSpendUsd??0,mainSha,...(replacement?{replacementAuthorization,financialRecoveryKey:RECOVERY_KEY}:{}),...(resuming?{resumeAuthorization,sourceAttemptKey:SOURCE_KEY}:{})});
 let spend=recovered?.inheritedSpendUsd??0;
 const spendCeiling=resuming?Math.min(MAX_NEW_SPEND_USD,spend+resumeAuthorization.maxIncrementalMicrousd/1e6):MAX_NEW_SPEND_USD;
 const charge=async spec=>{
   if(replacement&&!resuming&&!validReplacementAuthority(replacementAuthorization))throw new Error('replacement-authority-expired');
   if(resuming&&!validCrownResumeAuthority(resumeAuthorization))throw new Error('resume-authority-expired');
   if(!currentPaidAuthority(paidAuthorization))throw new Error('current-paid-runtime-authority-required');
   const reserve=callUpperBoundUsd(spec);
   if(spend+reserve>spendCeiling)throw new Error('precall-new-tournament-spend-cap-refused:'+spec.model);
   await setState(store,{pendingCall:{model:spec.model,tag:spec.tag,reservedWorstCaseUsd:reserve},newSpendUsd:spend});
   let chargeRecorded=false;
   const r=await call(apiKey,{...spec,onSealedResponse:async response=>{
     if(spec.tag!=='candidate')return;
     const state=await readState();
     const payload=openCrownCheckpoint(state.sealedEvidence,{key:checkpointKey,binding:attemptKey+'|'+state.taskCommitment});
     payload.providerResponses??={}; payload.providerResponses[response.id]=response;
     await setState(store,{sealedEvidence:sealCrownCheckpoint(payload,{key:checkpointKey,binding:attemptKey+'|'+state.taskCommitment})});
   },onGeneration:async observation=>{
     // Billing is independent of evidence validity; refuse drift without losing its cost.
     if(Number.isFinite(observation.costUsd)&&!chargeRecorded){
       spend+=observation.costUsd; chargeRecorded=true;
     }
     const state=await readState();
     const journal=[...(state?.generationJournal??[])];
     const index=journal.findIndex(row=>row.id===observation.id);
     const row={...(index>=0?journal[index]:{}),...observation,tag:spec.tag,
       reservedWorstCaseUsd:reserve,observedAt:new Date().toISOString()};
     if(index>=0)journal[index]=row;else journal.push(row);
     await setState(store,{generationJournal:journal,newSpendUsd:spend,
       pendingCall:{model:spec.model,tag:spec.tag,generationId:observation.id,
         reservedWorstCaseUsd:reserve,reconciliationStatus:observation.status}});
   }});
   if(spend>spendCeiling)throw new Error('new-tournament-spend-cap-exceeded');
   await setState(store,{newSpendUsd:spend,pendingCall:null,lastGeneration:{
     id:r.id,model:r.model,costUsd:r.cost,provider:r.providerName,finishReason:r.finishReason,
     contentBytes:r.contentBytes,reasoningBytes:r.reasoningBytes,reservedWorstCaseUsd:reserve
   }});
   return r;
 };
 try{
   let gen,tasks,taskCommitment;
   let answers={},calls=[];
   if(recovered){
    ({tasks,taskCommitment,answers,calls}=recovered);
    gen={id:recovered.custodianGenerationId};
    await setState(store,{taskCommitment,hiddenTaskCount:tasks.length,sealedEvidence:sealCrownCheckpoint({tasks,answers,calls},{key:checkpointKey,binding:attemptKey+'|'+taskCommitment})});
   }else{
   gen=await charge({model:EVALUATOR,provider:'google-vertex/global',messages:taskGenerationMessages(),maxTokens:3000,reasoningTokens:512,tag:'custodian-generate',responseFormat:taskResponseFormat()});
   let taskDoc;
   try{taskDoc=parseJson(gen.text);}
   catch{throw new Error('sealed-json-parse-failed:'+gen.id+':finish='+gen.finishReason+':contentBytes='+gen.contentBytes+':reasoningBytes='+gen.reasoningBytes);}
   tasks=taskDoc?.tasks;
   if(!Array.isArray(tasks)||tasks.length!==2)throw new Error('exactly-two-hidden-tasks-required');
   for(const [i,t] of tasks.entries()){
     if(typeof t?.prompt!=='string'||Buffer.byteLength(t.prompt)>900||!Array.isArray(t.rubric)||t.rubric.length<5)throw new Error('hidden-task-contract-refused:'+i+':promptBytes='+Buffer.byteLength(String(t?.prompt??''))+':rubricCount='+(Array.isArray(t?.rubric)?t.rubric.length:-1));
     t.id='sealed-'+(i+1)+'-'+h(t.prompt).slice(7,19);
   }
   taskCommitment=h(tasks.map(t=>({id:t.id,promptHash:h(t.prompt),rubricHash:h(t.rubric),mustNotHash:h(t.must_not??[])})));
   await setState(store,{taskCommitment,hiddenTaskCount:2,sealedEvidence:sealCrownCheckpoint({tasks,answers:{},calls:[]},{key:checkpointKey,binding:attemptKey+'|'+taskCommitment})});

   }

   for(const t of tasks){
     for(const [model,provider] of [[OPUS,'amazon-bedrock'],[SOL,'azure']]){
       if(calls.some(c=>c.taskId===t.id&&c.model===model))continue;
       const r=await charge({model,provider,messages:[
         {role:'system',content:'Solve the task independently. Follow every explicit constraint. Be precise and self-contained. No tools or web.'},
         {role:'user',content:t.prompt}
       ],maxTokens:3000,tag:'candidate'});
       if(!r.text)throw new Error('empty-candidate-answer:'+model);
       const key=t.id+'|'+model; answers[key]=r.text;
       calls.push({taskId:t.id,model,id:r.id,cost:r.cost,providerName:r.providerName,
         answerHash:h(r.text),createdAt:r.meta.created_at??new Date().toISOString(),
         metaModel:r.meta.model??model,promptHash:h(t.prompt),rubricHash:h(t.rubric)});
       await setState(store,{sealedEvidence:sealCrownCheckpoint({tasks,answers,calls},{key:checkpointKey,binding:attemptKey+'|'+taskCommitment})});
     }
   }

   const blind={};
   const mapping={};
   for(const t of tasks){
     const flip=parseInt(h(t.id).slice(-2),16)%2===1;
     const order=flip?[SOL,OPUS]:[OPUS,SOL];
     blind[t.id]={A:answers[t.id+'|'+order[0]],B:answers[t.id+'|'+order[1]]};
     mapping[t.id]={A:order[0],B:order[1]};
   }
   const grade=await charge({model:EVALUATOR,provider:'google-vertex/global',messages:evaluationMessages(tasks,blind),maxTokens:4500,reasoningTokens:1500,tag:'custodian-grade',responseFormat:gradeResponseFormat()});
   let gradeDoc;
   try{gradeDoc=parseJson(grade.text);}
   catch{throw new Error('sealed-grade-json-parse-failed:'+grade.id+':finish='+grade.finishReason+':contentBytes='+grade.contentBytes+':reasoningBytes='+grade.reasoningBytes);}
   await setState(store,{sealedEvidence:sealCrownCheckpoint({tasks,answers,calls,gradeDoc},{key:checkpointKey,binding:attemptKey+'|'+taskCommitment})});
   const grades=gradeDoc?.grades;
   if(!Array.isArray(grades)||grades.length!==4)throw new Error('four-blind-grades-required');

   const byPair=new Map();
   for(const g of grades){
     const model=mapping[g.task_id]?.[g.candidate];
     if(!model)throw new Error('blind-grade-mapping-failed');
     const key=g.task_id+'|'+model;
     if(byPair.has(key))throw new Error('duplicate-grade');
     const score=Number(g.quality_score),reg=Number(g.required_regressions);
     if(!Number.isFinite(score)||score<0||score>100||!Number.isInteger(reg)||reg<0)throw new Error('invalid-grade');
     byPair.set(key,{score,reg,zero:g.canonical_zero_loss===true});
   }

   const hiddenTasks=tasks.map(t=>({taskId:t.id,role:'GENERAL_CROWN',
     qualityDimensions:['correctness','constraint_fidelity','evidence_discipline','counterexamples','synthesis'],
     sealedExpectedRef:'sealed://custodian/'+taskCommitment+'/'+t.id}));
   const candidates=[{model:OPUS,roles:['GENERAL_CROWN']},{model:SOL,roles:['GENERAL_CROWN']}];
   const candidateSnapshotHash=h({models:[OPUS,SOL],mainSha,observedAt:new Date().toISOString().slice(0,13)});
   const observations=calls.map(c=>{
     const g=byPair.get(c.taskId+'|'+c.model);
     return {taskId:c.taskId,model:c.model,role:'GENERAL_CROWN',hiddenTask:true,
       providerBillObserved:true,modelIdentityVerified:verifyCrownProviderModel({requestedModel:c.model,observedModel:c.metaModel,provider:c.providerName}),
       requiredRegressions:g.reg,sealedTrialRef:'sealed://trial/'+c.id,
       canonicalZeroLossCertified:g.zero&&g.reg===0,qualityScore:g.score,costUsd:c.cost};
   });
   const compiled=compileCrownTournament({candidateSnapshotHash,hiddenTasks,candidates,budgetAuthorizationRef:paidAuthorization?.evidenceRef??'owner-approved-usd20-runtime'});
   if(!compiled.ok)throw new Error('canonical-tournament-compile:'+compiled.status);
   const adjudicated=adjudicateCrownTournament({plan:compiled.plan,observations});
   if(!adjudicated.ok||adjudicated.status!=='TASK_CLASS_CROWN_CANDIDATE_EVIDENCE_READY')throw new Error('canonical-tournament-adjudication:'+adjudicated.status);
   const selected=adjudicated.roles?.GENERAL_CROWN;
   if(!selected)throw new Error('general-crown-not-selected');

   const sealedRefs=[...new Set(observations.filter(o=>o.model===selected.candidate).map(o=>o.sealedTrialRef))].sort();
   const tournamentBody={schemaVersion:'uberbond.infinite-opus.crown-tournament-receipt.v1',
     observedAt:new Date().toISOString(),candidateSnapshotHash,budgetAuthorizationRef:compiled.plan.budgetAuthorizationRef,
     generalCrown:{...selected,model:selected.candidate},sealedTrialRefs:sealedRefs,
     sealedCustodianIndependent:true,rawHiddenPromptsExposedToOptimizer:false,plaintextAnswersExposedBeforeEvaluation:false,
     adjudicationStatus:adjudicated.status,semanticAuthority:'NONE',
     claimBoundary:'Fresh tasks and raw candidate answers remained inside the runtime custodian. This receipt supplies bounded tournament evidence only.'};
   const tournament={...tournamentBody,receiptHash:h(tournamentBody)};
   if(selected.candidate!==OPUS){
     await setState(store,{status:'COMPLETE_NON_OPUS_WINNER',winner:selected.candidate,tournament,newSpendUsd:spend});
     console.log('UBERMIND_CROWN_AUTOFINISH '+JSON.stringify({ok:false,status:'NON_OPUS_GENERAL_CROWN_WON',winner:selected.candidate,tournamentReceiptHash:tournament.receiptHash,newSpendUsd:spend}));
     return {ok:false,status:'NON_OPUS_GENERAL_CROWN_WON',winner:selected.candidate};
   }

   const opusCall=calls.find(c=>c.model===OPUS&&c.providerName.toLowerCase()==='amazon bedrock');
   if(!opusCall)throw new Error('observed-amazon-bedrock-provider-required');
   const task=tasks.find(t=>t.id===opusCall.taskId);
   const evidenceRefs=[...sealedRefs,'openrouter-generation://'+opusCall.id,'tournament://'+tournament.receiptHash];
   const issued=issueCrownAdmissionReceipt({
     providerCallId:opusCall.id,exactModelId:OPUS,modelRevision:opusCall.metaModel,providerIdentity:opusCall.providerName,routeIdentity:ROUTE,
     taskClassRole:'GENERAL_CROWN',promptProgramHash:h('uberbond.runtime-sealed-custodian.v1'),
     semanticInputHash:h(task.prompt),qualityContractHash:h({rubric:task.rubric,must_not:task.must_not??[]}),
     outputHash:opusCall.answerHash,timestamp:new Date(opusCall.createdAt).toISOString(),
     expiresAt:new Date(Date.now()+6*60*60*1000).toISOString(),
     budgetAuthorizationRef:compiled.plan.budgetAuthorizationRef,
     costReceiptRef:'openrouter-generation://'+opusCall.id,
     modelCallabilityReceiptRef:'openrouter-generation://'+opusCall.id,
     revalidationPolicy:'fresh-hidden-tasks-on-expiry-model-route-or-quality-drift',
     sourceDependencyHashes:[h(mainSha),taskCommitment],evidenceReferences:evidenceRefs,
     actualCostMicrousd:Math.round(opusCall.cost*1e6),sideEffectAuthority:'NONE',
     providerBillObserved:true,modelIdentityVerified:true,modelCallabilityVerified:true,
     tournamentEvidenceVerified:true,roleTournamentEvidenceRef:'tournament://'+tournament.receiptHash,
     authorizationStatus:'AUTHORIZED_FOR_THIS_CALL'
   });
   if(!issued.ok)throw new Error('crown-admission-refused:'+(issued.reasons??[]).join('|'));
   const safeCalls=calls.map(c=>({taskId:c.taskId,model:c.model,generationId:c.id,costUsd:c.cost,provider:c.providerName,
     answerHash:c.answerHash,promptHash:c.promptHash,rubricHash:c.rubricHash}));
   await setState(store,{status:'COMPLETE',winner:OPUS,tournament,crownAdmission:issued.receipt,
     taskCommitment,newSpendUsd:spend,calls:safeCalls,custodianGenerations:[gen.id,grade.id]});
   console.log('UBERMIND_CROWN_AUTOFINISH '+JSON.stringify({ok:true,status:'CROWN_ADMISSION_READY',
     winner:OPUS,newSpendUsd:spend,tournamentReceiptHash:tournament.receiptHash,
     crownAdmission:issued.receipt,taskCommitment,calls:safeCalls,
     truthBoundary:'Hidden prompts, rubrics and plaintext candidate answers were not logged.'}));
   return {ok:true,status:'CROWN_ADMISSION_READY',receipt:issued.receipt};
 }catch(error){
   const message=String(error?.message||error);
   await setState(store,{status:'FAILED_NO_AUTOMATIC_RETRY',reason:message,newSpendUsd:spend});
   console.error('UBERMIND_CROWN_AUTOFINISH '+JSON.stringify({ok:false,status:'FAILED_NO_AUTOMATIC_RETRY',reason:message,newSpendUsd:spend}));
   return {ok:false,status:'FAILED_NO_AUTOMATIC_RETRY',reason:message};
 }
}
