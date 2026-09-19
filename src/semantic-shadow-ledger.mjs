import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const SEMANTIC_SHADOW_LEDGER_VERSION='uberbond.semantic-shadow-ledger.v1';
const hash=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const finite=v=>Number.isFinite(Number(v))?Number(v):null;

function root(runtimeRoot=process.env.UBERLIT_ROOT||'/var/lib/uberlit/uberbond'){
  return path.resolve(runtimeRoot,'artifacts','system-one');
}
function ledgerFile(runtimeRoot){return path.join(root(runtimeRoot),'shadow-observations.jsonl');}
function outcomeFile(runtimeRoot){return path.join(root(runtimeRoot),'shadow-outcomes.jsonl');}
function append(file,row){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const line=`${JSON.stringify(row)}\n`;
  fs.appendFileSync(file,line,{encoding:'utf8',mode:0o600});
  fs.chmodSync(file,0o600);
}

export function recordSemanticShadowObservation({
  runtimeRoot,
  programId,
  programDigest,
  stateDigest,
  registers={},
  escalations=[],
  providerEvidence={},
  taskClass='GENERAL',
  observedAt=new Date()
}={}){
  const when=new Date(observedAt);
  if(!programId||!programDigest||!stateDigest||!Number.isFinite(when.getTime()))throw new Error('semantic-shadow-observation-invalid');
  const sanitizedRegisters=Object.fromEntries(Object.entries(registers).map(([id,row])=>[
    String(id).slice(0,120),
    {
      op:String(row?.op||'').slice(0,20),
      value:typeof row?.value==='string'?String(row.value).slice(0,160):finite(row?.value),
      confidence:finite(row?.confidence)
    }
  ]));
  const body={
    schemaVersion:SEMANTIC_SHADOW_LEDGER_VERSION,
    observationId:null,
    observedAt:when.toISOString(),
    programId:String(programId).slice(0,160),
    programDigest:String(programDigest).slice(0,160),
    stateDigest:String(stateDigest).slice(0,160),
    taskClass:String(taskClass||'GENERAL').slice(0,120).toUpperCase(),
    registers:sanitizedRegisters,
    escalations:Array.isArray(escalations)?escalations.map(x=>({instructionId:String(x?.instructionId||'').slice(0,120),confidence:finite(x?.confidence),threshold:finite(x?.threshold)})):[],
    providerEvidence:{
      provider:String(providerEvidence?.provider||'').slice(0,120)||null,
      requestedModel:String(providerEvidence?.requestedModel||'').slice(0,160)||null,
      observedModel:String(providerEvidence?.observedModel||'').slice(0,160)||null,
      requestDigest:String(providerEvidence?.requestDigest||'').slice(0,160)||null,
      latencyMs:finite(providerEvidence?.latencyMs),
      inputTokens:finite(providerEvidence?.usage?.inputTokens),
      outputTokens:finite(providerEvidence?.usage?.outputTokens),
      costUsd:finite(providerEvidence?.usage?.costUsd)
    },
    rawStateStored:false,
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE'
  };
  body.observationId=`semobs_${hash(body).slice(7,31)}`;
  append(ledgerFile(runtimeRoot),body);
  return Object.freeze({ok:true,status:'SEMANTIC_SHADOW_OBSERVATION_RECORDED',observationId:body.observationId,rawStateStored:false});
}

export function recordSemanticOutcome({
  runtimeRoot,
  observationId,
  correct,
  realizedValue=null,
  evidenceRefs=[],
  observedAt=new Date()
}={}){
  const when=new Date(observedAt);
  if(!/^semobs_[0-9a-f]{24}$/.test(String(observationId||'')))throw new Error('semantic-observation-id-invalid');
  if(typeof correct!=='boolean')throw new Error('semantic-outcome-correct-boolean-required');
  if(!Number.isFinite(when.getTime()))throw new Error('semantic-outcome-time-invalid');
  const row={
    schemaVersion:SEMANTIC_SHADOW_LEDGER_VERSION,
    observationId,
    observedAt:when.toISOString(),
    correct,
    realizedValueDigest:realizedValue==null?null:hash(String(realizedValue).slice(0,2000)),
    evidenceRefs:Array.isArray(evidenceRefs)?[...new Set(evidenceRefs.map(x=>String(x).slice(0,500)).filter(Boolean))].slice(0,20):[],
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE'
  };
  append(outcomeFile(runtimeRoot),row);
  return Object.freeze({ok:true,status:'SEMANTIC_OUTCOME_RECORDED',observationId});
}

function readJsonl(file){
  try{
    const stat=fs.lstatSync(file);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>64_000_000)return[];
    return fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean).map(line=>{try{return JSON.parse(line)}catch{return null}}).filter(Boolean);
  }catch{return[]}
}

export function summarizeSemanticCalibration({runtimeRoot,taskClass=null}={}){
  const observations=readJsonl(ledgerFile(runtimeRoot));
  const outcomes=readJsonl(outcomeFile(runtimeRoot));
  const byOutcome=new Map(outcomes.map(x=>[x.observationId,x]));
  const rows=observations.filter(x=>!taskClass||x.taskClass===String(taskClass).toUpperCase()).map(obs=>{
    const outcome=byOutcome.get(obs.observationId);
    if(!outcome)return null;
    const confidences=Object.values(obs.registers||{}).map(x=>finite(x?.confidence)).filter(x=>x!=null);
    const confidence=confidences.length?confidences.reduce((a,b)=>a+b,0)/confidences.length:null;
    return confidence==null?null:{confidence,correct:outcome.correct};
  }).filter(Boolean);
  if(!rows.length)return{ok:true,status:'NO_CALIBRATED_OUTCOMES',count:0,accuracy:null,calibrationError:null};
  const accuracy=rows.filter(x=>x.correct).length/rows.length;
  const buckets=Array.from({length:10},()=>[]);
  for(const row of rows)buckets[Math.min(9,Math.floor(row.confidence*10))].push(row);
  let ece=0;
  for(const bucket of buckets){
    if(!bucket.length)continue;
    const conf=bucket.reduce((n,x)=>n+x.confidence,0)/bucket.length;
    const acc=bucket.filter(x=>x.correct).length/bucket.length;
    ece+=(bucket.length/rows.length)*Math.abs(conf-acc);
  }
  return{ok:true,status:'SEMANTIC_CALIBRATION_SUMMARY',count:rows.length,accuracy,calibrationError:ece,taskClass:taskClass?String(taskClass).toUpperCase():null};
}
