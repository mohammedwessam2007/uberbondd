import crypto from 'node:crypto';
import { SOURCE_KEY, RESUME_KEY, recoverCrownResumeCheckpoint } from '../src/crown-resume-checkpoint.mjs';
import { openCrownCheckpoint } from '../src/crown-sealed-checkpoint.mjs';
import { verifyCrownProviderModel } from '../src/crown-model-identity.mjs';
// Zero-spend recovery: expose only bounded metadata, never sealed payloads or secrets.
const allowed = new Set(['status','schemaVersion','version','month','monthlyCapMicrousd','callId','taskId','model','requestedModel','observedModel','provider','providerName','providerIdentity','generationId','providerCallId','id','actualMicrousd','reservedMicrousd','worstCaseMicrousd','costUsd','newSpendUsd','startedAt','updatedAt','createdAt','settledAt','timestamp','taskCommitment','hiddenTaskCount','receiptHash','snapshotHash','answerHash','promptHash','rubricHash','kind','observedAt','providerRequestId','receiptRef']);
const atom = value => typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean' || value === null || typeof value === 'string' && value.length <= 240 && /^[a-zA-Z0-9_.:/+ -]*$/.test(value) && !/(?:sk-|Bearer|password|secret|token=)/i.test(value);
function metadata(value, depth=0) {
  if(depth>7)return {omitted:true};
  if(Array.isArray(value)) return value.slice(0,64).map(v=>metadata(v,depth+1));
  if(!value || typeof value!=='object')return undefined;
  const out={};
  for(const [k,v] of Object.entries(value)){
    if(allowed.has(k)&&atom(v))out[k]=v;
    else if(['ledger','archivedLedgers','calls','lastGeneration','generationJournal','pendingGeneration','oldUncertainTournament','receipts'].includes(k)&&v&&typeof v==='object'){
      out[k]=k==='archivedLedgers'?Object.fromEntries(Object.entries(v).filter(([m])=>/^2026-\d{2}$/.test(m)).map(([m,l])=>[m,metadata(l,depth+1)])):metadata(v,depth+1);
    }
  }
  return out;
}
export async function readCrownRecoveryMetadata(store){
  const settings=await store.transaction(async tx=>await tx.getSettings());
  const states={};
  for(const [key,state] of Object.entries(settings)){
    if(key==='infiniteOpusRuntimeV1'||/^infinite_opus_crown_autofinish_20261001_v[1-7]$/.test(key)){
      states[key]={fields:Object.keys(state??{}).filter(k=>/^[a-zA-Z0-9_]{1,80}$/.test(k)),metadata:metadata(state)};
    }
  }
  const inventory=Object.entries(settings).filter(([key])=>/crown|sealed|tournament/i.test(key)&&/^[a-zA-Z0-9_.:-]{1,160}$/.test(key)&&!/(secret|password|token|api.?key)/i.test(key)).slice(0,100).map(([key,state])=>({
    key,fields:state&&typeof state==='object'?Object.keys(state).filter(k=>/^[a-zA-Z0-9_]{1,80}$/.test(k)).slice(0,80):[],
    encryptedCheckpointPresent:state?.sealedEvidence?.schemaVersion==='uberbond.sealed-crown-checkpoint.v1',
    privateEvidencePointerPresent:typeof state?.privateEvidenceRef==='string',
    metadata:metadata(state)
  }));
  let resumeCheckpoint={status:'NOT_PRESENT'};
  if(settings[SOURCE_KEY]){
   try{
    const p=recoverCrownResumeCheckpoint(settings[SOURCE_KEY],{key:process.env.TOKEN_ENCRYPTION_KEY});
    resumeCheckpoint={status:'VERIFIED_ENCRYPTED_PARTIAL_CHECKPOINT',hiddenTaskCount:p.tasks.length,retainedCandidateAnswers:p.calls.length,missingCandidateAnswers:p.tasks.length*2-p.calls.length,missingEvaluatorCalls:1,minimumPaidCalls:p.tasks.length*2-p.calls.length+1,taskCommitment:p.taskCommitment,inheritedSpendUsd:p.inheritedSpendUsd,sealedPayloadsExposed:false};
   }catch{resumeCheckpoint={status:'ENCRYPTED_CHECKPOINT_NOT_VERIFIED',sealedPayloadsExposed:false};}
  }
  let continuationCheckpoint={status:'NOT_PRESENT'};
  if(settings[RESUME_KEY]){
   try{
    const s=settings[RESUME_KEY],p=openCrownCheckpoint(s.sealedEvidence,{key:process.env.TOKEN_ENCRYPTION_KEY,binding:RESUME_KEY+'|'+s.taskCommitment});
    const hash=x=>'sha256:'+crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
    const commitment=hash(p.tasks.map(t=>({id:t.id,promptHash:hash(t.prompt),rubricHash:hash(t.rubric),mustNotHash:hash(t.must_not??[])})));
    if(p.tasks.length!==2||commitment!==s.taskCommitment||commitment!==settings[SOURCE_KEY]?.taskCommitment||p.calls.length>4)throw Error('checkpoint-refused');
    const pairs=new Set();
    for(const c of p.calls){const t=p.tasks.find(t=>t.id===c.taskId),pair=c.taskId+'|'+c.model;
     if(pairs.has(pair)||!t||c.answerHash!==hash(p.answers[pair])||c.promptHash!==hash(t.prompt)||c.rubricHash!==hash(t.rubric)||!verifyCrownProviderModel({requestedModel:c.model,observedModel:c.metaModel,provider:c.providerName}))throw Error('answer-refused');pairs.add(pair);}
    continuationCheckpoint={status:'VERIFIED_ENCRYPTED_CONTINUATION_CHECKPOINT',retainedCandidateAnswers:p.calls.length,missingCandidateAnswers:4-p.calls.length,missingEvaluatorCalls:p.gradeDoc?0:1,taskCommitment:commitment,privateInterruptedResponsePresent:Boolean(p.providerResponses?.['gen-1790900587-TKEqsFrik1iupnf4Ljrd']),sealedPayloadsExposed:false};
   }catch{continuationCheckpoint={status:'CONTINUATION_CHECKPOINT_NOT_VERIFIED',sealedPayloadsExposed:false};}
  }
  return {resumeCheckpoint,continuationCheckpoint,status:'READ_ONLY_CROWN_RECOVERY',providerCallsPerformed:0,sealedPayloadsExposed:false,states,inventory};
}
