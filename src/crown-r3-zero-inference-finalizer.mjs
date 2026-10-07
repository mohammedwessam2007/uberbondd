import crypto from 'node:crypto';
import { openCrownCheckpoint } from './crown-sealed-checkpoint.mjs';
import { verifyCrownProviderModel, OPUS_CANONICAL_REVISION } from './crown-model-identity.mjs';
import { compileCrownTournament, adjudicateCrownTournament } from './crown-tournament.mjs';
import { issueCrownAdmissionReceipt } from './crown-admission.mjs';
import { persistDurableCrownAdmission } from './crown-durable-admission.mjs';
import { INTERRUPTED_RESUME_KEY } from './crown-resume-checkpoint.mjs';

const OPUS='anthropic/claude-opus-5.5';
const SOL='openai/gpt-6.1-sol-pro';
const EVALUATOR='google/gemini-2.5-pro';
const ROUTE='openrouter:auto-provider-zdr-deny-required-parameters-v1';
const h=x=>'sha256:'+crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const content=j=>{
 const m=j?.choices?.[0]?.message??{};
 if(typeof m.content==='string')return m.content;
 if(m.parsed&&typeof m.parsed==='object')return JSON.stringify(m.parsed);
 if(Array.isArray(m.content))return m.content.map(x=>typeof x==='string'?x:(typeof x?.text==='string'?x.text:(typeof x?.content==='string'?x.content:''))).join('');
 return '';
};
const parseJson=text=>{
 const s=String(text??'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 try{return JSON.parse(s);}catch{}
 const a=s.indexOf('{'),b=s.lastIndexOf('}');
 if(a>=0&&b>a)return JSON.parse(s.slice(a,b+1));
 throw Error('sealed-grade-json-parse-failed');
};
async function generation(apiKey,id){
 const r=await fetch('https://openrouter.ai/api/v1/generation?id='+encodeURIComponent(id),{
  headers:{authorization:'Bearer '+apiKey},signal:AbortSignal.timeout(15000)
 });
 if(!r.ok)throw Error('evaluator-generation-metadata-unavailable:'+r.status);
 const d=(await r.json())?.data;
 if(!d||!Number.isFinite(Number(d.total_cost)))throw Error('evaluator-provider-bill-required');
 return d;
}
export async function finalizeR3WithoutNewInference({store,apiKey,checkpointKey,mainSha='unknown',paidAuthorization}={}){
 if(!store||!apiKey||typeof checkpointKey!=='string'||checkpointKey.length<32)return {ok:false,status:'FINALIZER_INPUT_MISSING',providerInferenceCalls:0};
 const state=await store.transaction(async tx=>(await tx.getSettings())[INTERRUPTED_RESUME_KEY]??null);
 const pending=state?.pendingCall;
 if(state?.status!=='FAILED_NO_AUTOMATIC_RETRY'||!String(state.reason||'').startsWith('generation-reconciliation-required:')||
    pending?.model!==EVALUATOR||pending?.tag!=='custodian-grade'||pending?.reconciliationStatus!=='DISPATCHED_UNRECONCILED'||
    !pending?.generationId||!state?.sealedEvidence)return {ok:false,status:'EXACT_R3_EVALUATOR_INTERRUPTION_REQUIRED',providerInferenceCalls:0};
 const generationId=pending.generationId;
 const payload=openCrownCheckpoint(state.sealedEvidence,{key:checkpointKey,binding:INTERRUPTED_RESUME_KEY+'|'+state.taskCommitment});
 if(!Array.isArray(payload.tasks)||payload.tasks.length!==2||!Array.isArray(payload.calls)||payload.calls.length!==4||
    Object.keys(payload.answers??{}).length!==4||payload.gradeDoc)throw Error('exact-four-answer-pregrade-checkpoint-required');
 const saved=payload.providerResponses?.[generationId];
 if(!saved?.response)throw Error('sealed-evaluator-response-required');
 const meta=await generation(apiKey,generationId);
 const costUsd=Number(meta.total_cost),provider=String(meta.provider_name??''),observedModel=String(meta.model??saved.response?.model??'');
 if(costUsd<0||costUsd>Number(pending.reservedWorstCaseUsd)||!verifyCrownProviderModel({requestedModel:EVALUATOR,observedModel,provider}))
  throw Error('evaluator-bill-or-identity-refused');
 const gradeDoc=parseJson(content(saved.response));
 const grades=gradeDoc?.grades;
 if(!Array.isArray(grades)||grades.length!==4)throw Error('four-blind-grades-required');
 const mapping={};
 for(const t of payload.tasks){
  const flip=parseInt(h(t.id).slice(-2),16)%2===1;
  const order=flip?[SOL,OPUS]:[OPUS,SOL];
  mapping[t.id]={A:order[0],B:order[1]};
 }
 const byPair=new Map();
 for(const g of grades){
  const model=mapping[g.task_id]?.[g.candidate];
  if(!model)throw Error('blind-grade-mapping-failed');
  const key=g.task_id+'|'+model;
  if(byPair.has(key))throw Error('duplicate-grade');
  const score=Number(g.quality_score),reg=Number(g.required_regressions);
  if(!Number.isFinite(score)||score<0||score>100||!Number.isInteger(reg)||reg<0)throw Error('invalid-grade');
  byPair.set(key,{score,reg,zero:g.canonical_zero_loss===true});
 }
 if(byPair.size!==4)throw Error('complete-blind-grade-matrix-required');
 const hiddenTasks=payload.tasks.map(t=>({taskId:t.id,role:'GENERAL_CROWN',
  qualityDimensions:['correctness','constraint_fidelity','evidence_discipline','counterexamples','synthesis'],
  sealedExpectedRef:'sealed://custodian/'+state.taskCommitment+'/'+t.id}));
 const candidates=[{model:OPUS,roles:['GENERAL_CROWN']},{model:SOL,roles:['GENERAL_CROWN']}];
 const candidateSnapshotHash=h({models:[OPUS,SOL],mainSha,observedAt:new Date().toISOString().slice(0,13)});
 const observations=payload.calls.map(c=>{
  const g=byPair.get(c.taskId+'|'+c.model);
  if(!g)throw Error('candidate-grade-missing');
  return {taskId:c.taskId,model:c.model,role:'GENERAL_CROWN',hiddenTask:true,providerBillObserved:true,
   modelIdentityVerified:verifyCrownProviderModel({requestedModel:c.model,observedModel:c.metaModel,provider:c.providerName}),
   requiredRegressions:g.reg,sealedTrialRef:'sealed://trial/'+c.id,canonicalZeroLossCertified:g.zero&&g.reg===0,
   qualityScore:g.score,costUsd:c.cost};
 });
 const compiled=compileCrownTournament({candidateSnapshotHash,hiddenTasks,candidates,budgetAuthorizationRef:paidAuthorization?.evidenceRef??'owner-approved-usd20-runtime'});
 if(!compiled.ok)throw Error('canonical-tournament-compile:'+compiled.status);
 const adjudicated=adjudicateCrownTournament({plan:compiled.plan,observations});
 if(!adjudicated.ok||adjudicated.status!=='TASK_CLASS_CROWN_CANDIDATE_EVIDENCE_READY')throw Error('canonical-tournament-adjudication:'+adjudicated.status);
 const selected=adjudicated.roles?.GENERAL_CROWN;
 if(!selected)throw Error('general-crown-not-selected');
 const sealedRefs=[...new Set(observations.filter(o=>o.model===selected.candidate).map(o=>o.sealedTrialRef))].sort();
 const tournamentBody={schemaVersion:'uberbond.infinite-opus.crown-tournament-receipt.v1',observedAt:new Date().toISOString(),
  candidateSnapshotHash,budgetAuthorizationRef:compiled.plan.budgetAuthorizationRef,generalCrown:{...selected,model:selected.candidate},
  sealedTrialRefs:sealedRefs,sealedCustodianIndependent:true,rawHiddenPromptsExposedToOptimizer:false,
  plaintextAnswersExposedBeforeEvaluation:false,adjudicationStatus:adjudicated.status,semanticAuthority:'NONE',
  claimBoundary:'Recovered from the already-returned sealed evaluator response; no new inference was performed by finalization.'};
 const tournament={...tournamentBody,receiptHash:h(tournamentBody)};
 const journal=(state.generationJournal??[]).map(row=>row.id===generationId?{...row,status:'PROVIDER_RECONCILED_PENDING_EVIDENCE',
  costUsd,provider,observedModel,reconciledAt:new Date().toISOString(),semanticAuthority:'NONE'}:row);
 const newSpendUsd=Number(state.newSpendUsd)+costUsd;
 let crownAdmission=null,durableAdmission=null;
 if(selected.candidate===OPUS){
  const opusCall=payload.calls.find(c=>c.model===OPUS&&String(c.providerName).toLowerCase()==='amazon bedrock');
  if(!opusCall)throw Error('observed-amazon-bedrock-provider-required');
  const task=payload.tasks.find(t=>t.id===opusCall.taskId);
  const evidenceRefs=[...sealedRefs,'openrouter-generation://'+opusCall.id,'tournament://'+tournament.receiptHash];
  const issued=issueCrownAdmissionReceipt({providerCallId:opusCall.id,exactModelId:OPUS,modelRevision:opusCall.metaModel,
   providerIdentity:opusCall.providerName,routeIdentity:ROUTE,taskClassRole:'GENERAL_CROWN',
   promptProgramHash:h('uberbond.runtime-sealed-custodian.v1'),semanticInputHash:h(task.prompt),
   qualityContractHash:h({rubric:task.rubric,must_not:task.must_not??[]}),outputHash:opusCall.answerHash,
   timestamp:new Date(opusCall.createdAt).toISOString(),expiresAt:new Date(Date.now()+6*60*60*1000).toISOString(),
   budgetAuthorizationRef:compiled.plan.budgetAuthorizationRef,costReceiptRef:'openrouter-generation://'+opusCall.id,
   modelCallabilityReceiptRef:'openrouter-generation://'+opusCall.id,revalidationPolicy:'fresh-hidden-tasks-on-expiry-model-route-or-quality-drift',
   sourceDependencyHashes:[h(mainSha),state.taskCommitment],evidenceReferences:evidenceRefs,
   actualCostMicrousd:Math.round(opusCall.cost*1e6),sideEffectAuthority:'NONE',providerBillObserved:true,
   modelIdentityVerified:true,modelCallabilityVerified:true,tournamentEvidenceVerified:true,
   roleTournamentEvidenceRef:'tournament://'+tournament.receiptHash,authorizationStatus:'AUTHORIZED_FOR_THIS_CALL'});
  if(!issued.ok)throw Error('crown-admission-refused:'+(issued.reasons??[]).join('|'));
  crownAdmission=issued.receipt;
 }
 const completed={...state,status:selected.candidate===OPUS?'COMPLETE':'COMPLETE_NON_OPUS_WINNER',winner:selected.candidate,
  tournament,crownAdmission:crownAdmission??undefined,newSpendUsd,generationJournal:journal,pendingCall:null,
  sealedEvidence:state.sealedEvidence,evaluatorFinancialReconciliation:{id:generationId,costUsd,provider,observedModel,reconciledAt:new Date().toISOString()},
  completedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
 await store.transaction(async tx=>await tx.setSetting(INTERRUPTED_RESUME_KEY,completed));
 if(crownAdmission) durableAdmission=await persistDurableCrownAdmission(store,crownAdmission,{
  expected:{exactModelId:OPUS,modelRevision:OPUS_CANONICAL_REVISION,routeIdentity:ROUTE,taskClassRole:'GENERAL_CROWN'},
  sourceAttemptKey:INTERRUPTED_RESUME_KEY
 });
 const summary={ok:true,status:selected.candidate===OPUS?'CROWN_ADMISSION_READY':'NON_OPUS_GENERAL_CROWN_WON',
  winner:selected.candidate,newSpendUsd,evaluatorCostUsd:costUsd,tournamentReceiptHash:tournament.receiptHash,
  crownAdmissionReceiptHash:crownAdmission?.receiptHash??null,durableAdmissionStatus:durableAdmission?.status??null,
  providerInferenceCalls:0,providerMetadataCalls:1,hiddenPayloadsExposed:false,
  scores:Object.fromEntries([OPUS,SOL].map(model=>[model,{
   taskScores:payload.tasks.map(t=>byPair.get(t.id+'|'+model)?.score),
   requiredRegressions:payload.tasks.map(t=>byPair.get(t.id+'|'+model)?.reg),
   zeroLoss:payload.tasks.map(t=>byPair.get(t.id+'|'+model)?.zero)
  }]))};
 return summary;
}
