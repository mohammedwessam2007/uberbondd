import crypto from 'node:crypto';
import { compileCrownTournament, adjudicateCrownTournament } from '../src/crown-tournament.mjs';
import { issueCrownAdmissionReceipt } from '../src/crown-admission.mjs';

const KEY='infinite_opus_crown_autofinish_20261001_v2';
const PRIOR_KEY='infinite_opus_crown_autofinish_20261001_v1';
const PRIOR_EXPECTED_SPEND_USD=0.010025;
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
  const c=j?.choices?.[0]?.message?.content;
  return typeof c==='string'?c:Array.isArray(c)?c.filter(x=>x?.type==='text').map(x=>x.text).join(''):'';
};
async function getState(store,key=KEY){
  return store.transaction(async tx=>(await tx.getSettings())[key]??null);
}
async function setState(store,patch){
  return store.transaction(async tx=>{
    const settings=await tx.getSettings(),prior=settings[KEY]??{};
    const next={...prior,...patch,updatedAt:new Date().toISOString()};
    await tx.setSetting(KEY,next); return next;
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
async function call(apiKey,{model,messages,maxTokens,provider,tag,responseFormat=null}){
  const body={model,messages,max_tokens:maxTokens,stream:false,temperature:0,
    ...(responseFormat?{response_format:responseFormat}:{}),
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
  const meta=await generation(apiKey,id);
  const observedModel=String(meta.model??j.model??'');
  if(observedModel!==model)throw new Error('model-identity-drift:'+model+':'+observedModel);
  const cost=Number(meta.total_cost);
  if(!Number.isFinite(cost)||cost<0)throw new Error('provider-bill-required:'+id);
  return {id,text:content(j),meta,cost,model,providerName:String(meta.provider_name??'')};
}

function taskResponseFormat(){
 return {type:'json_schema',json_schema:{name:'sealed_general_crown_tasks',strict:true,schema:{
   type:'object',additionalProperties:false,required:['tasks'],properties:{tasks:{type:'array',minItems:2,maxItems:2,items:{
     type:'object',additionalProperties:false,required:['id','prompt','rubric','must_not'],properties:{
       id:{type:'string'},prompt:{type:'string'},rubric:{type:'array',minItems:5,maxItems:8,items:{type:'string'}},
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
  {role:'user',content:'Return {"tasks":[{"id":"t1","prompt":"...","rubric":["..."],"must_not":["..."]},{"id":"t2","prompt":"...","rubric":["..."],"must_not":["..."]}]}. Each prompt should fit under 900 UTF-8 bytes and each rubric should contain 5-8 concise requirements.'}
 ];
}
function evaluationMessages(tasks,blind){
 return [
  {role:'system',content:'You are the same independent sealed benchmark custodian. Grade answers strictly against the supplied hidden task rubrics. Candidate labels A/B are randomized and reveal no model identity. Return strict JSON only. quality_score is 0..100. required_regressions counts material failures of explicit rubric requirements. canonical_zero_loss is true only when required_regressions is 0. Do not reward verbosity.'},
  {role:'user',content:JSON.stringify({tasks:tasks.map(t=>({id:t.id,prompt:t.prompt,rubric:t.rubric,must_not:t.must_not})),answers:blind,output:{grades:[{task_id:'t1',candidate:'A',quality_score:0,required_regressions:0,canonical_zero_loss:true,reason:'brief'}]}})}
 ];
}
export async function runCrownAutoFinish({store,apiKey,paidAuthorization,mainSha='unknown'}={}){
 if(!store||!apiKey)return {ok:false,status:'AUTOFINISH_INPUT_MISSING'};
 const prior=await getState(store);
 const priorV1=await getState(store,PRIOR_KEY);
 if(priorV1?.status!=='FAILED_NO_AUTOMATIC_RETRY'||
    priorV1?.reason!=='sealed-json-parse-failed'||
    Math.abs(Number(priorV1?.newSpendUsd)-PRIOR_EXPECTED_SPEND_USD)>1e-9){
   return {ok:false,status:'AUTOFINISH_V2_PRIOR_STATE_REFUSED',reason:'expected-v1-parse-failure-state-required'};
 }
 if(prior?.status==='COMPLETE')return {ok:true,status:'AUTOFINISH_ALREADY_COMPLETE',receiptHash:prior.crownAdmission?.receiptHash??null};
 if(prior?.status==='RUNNING')return {ok:false,status:'AUTOFINISH_ALREADY_CLAIMED_NO_RETRY'};
 await setState(store,{status:'RUNNING',startedAt:new Date().toISOString(),oldUncertainTournament:{
   status:'ABANDONED_UNCERTAIN_NO_RETRY',callId:'sealed-call-06264df855de7eedeb12982dfad2909db0cdcfb0',
   taskId:'sealed-paid-0-0-805bb7d11651df598fcb',reservedWorstCaseUsd:OLD_UNCERTAIN_RESERVE_USD
 },priorFailedAttempt:{key:PRIOR_KEY,status:priorV1.status,reason:priorV1.reason,newSpendUsd:Number(priorV1.newSpendUsd)},
 newSpendUsd:0,mainSha});
 let spend=0;
 const charge=async spec=>{
   const r=await call(apiKey,spec); spend+=r.cost;
   if(spend>MAX_NEW_SPEND_USD)throw new Error('new-tournament-spend-cap-exceeded');
   await setState(store,{newSpendUsd:spend,lastGeneration:{id:r.id,model:r.model,costUsd:r.cost,provider:r.providerName}});
   return r;
 };
 try{
   const gen=await charge({model:EVALUATOR,provider:'google-vertex/global',messages:taskGenerationMessages(),maxTokens:4000,tag:'custodian-generate',responseFormat:taskResponseFormat()});
   const taskDoc=parseJson(gen.text),tasks=taskDoc?.tasks;
   if(!Array.isArray(tasks)||tasks.length!==2)throw new Error('exactly-two-hidden-tasks-required');
   for(const [i,t] of tasks.entries()){
     if(typeof t?.prompt!=='string'||Buffer.byteLength(t.prompt)>900||!Array.isArray(t.rubric)||t.rubric.length<5)throw new Error('hidden-task-contract-refused:'+i);
     t.id='sealed-'+(i+1)+'-'+h(t.prompt).slice(7,19);
   }
   const taskCommitment=h(tasks.map(t=>({id:t.id,promptHash:h(t.prompt),rubricHash:h(t.rubric),mustNotHash:h(t.must_not??[])})));
   await setState(store,{taskCommitment,hiddenTaskCount:2});

   const answers={};
   const calls=[];
   for(const t of tasks){
     for(const [model,provider] of [[OPUS,'anthropic'],[SOL,'openai']]){
       const r=await charge({model,provider,messages:[
         {role:'system',content:'Solve the task independently. Follow every explicit constraint. Be precise and self-contained. No tools or web.'},
         {role:'user',content:t.prompt}
       ],maxTokens:1200,tag:'candidate'});
       if(!r.text)throw new Error('empty-candidate-answer:'+model);
       const key=t.id+'|'+model; answers[key]=r.text;
       calls.push({taskId:t.id,model,id:r.id,cost:r.cost,providerName:r.providerName,
         answerHash:h(r.text),createdAt:r.meta.created_at??new Date().toISOString(),
         metaModel:r.meta.model??model,promptHash:h(t.prompt),rubricHash:h(t.rubric)});
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
   const grade=await charge({model:EVALUATOR,provider:'google-vertex/global',messages:evaluationMessages(tasks,blind),maxTokens:5000,tag:'custodian-grade',responseFormat:gradeResponseFormat()});
   const gradeDoc=parseJson(grade.text),grades=gradeDoc?.grades;
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
       providerBillObserved:true,modelIdentityVerified:c.metaModel===c.model,
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

   const opusCall=calls.find(c=>c.model===OPUS&&c.providerName.toLowerCase()==='anthropic');
   if(!opusCall)throw new Error('observed-anthropic-provider-required');
   const task=tasks.find(t=>t.id===opusCall.taskId);
   const evidenceRefs=[...sealedRefs,'openrouter-generation://'+opusCall.id,'tournament://'+tournament.receiptHash];
   const issued=issueCrownAdmissionReceipt({
     providerCallId:opusCall.id,exactModelId:OPUS,providerIdentity:'Anthropic',routeIdentity:ROUTE,
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
