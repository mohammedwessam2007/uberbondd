import crypto from 'node:crypto';

export const JEV_CALIBRATION_SETTING='infiniteOpusJevCalibrationV1';
export const JEV_CALIBRATION_SCHEMA='uberbond.jev-calibration-vault.v1';
const MAX_OBSERVATIONS=5000;

const h=x=>'sha256:'+crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const finite=x=>Number.isFinite(Number(x))?Number(x):null;
const safeAnswers=answers=>{
  const out={};
  for(const [key,value] of Object.entries(answers??{})){
    if(!value||typeof value!=='object')continue;
    if(typeof value.choice==='string')out[key]={type:'choice',choice:String(value.choice).slice(0,80),confidence:finite(value.confidence)};
    else if(Number.isFinite(Number(value.score)))out[key]={type:'score',score:Number(value.score),confidence:finite(value.confidence)};
    else if(Number.isFinite(Number(value.noul)))out[key]={type:'noul',noul:Number(value.noul)};
  }
  return out;
};

const empty=()=>({
  schemaVersion:JEV_CALIBRATION_SCHEMA,
  observations:[],
  promotionState:'SHADOW',
  crownSuppressionAuthority:'NONE',
  updatedAt:null
});

export async function recordJevCalibrationObservation(store,input={},now=Date.now()){
  if(typeof store?.transaction!=='function')throw new Error('jev-calibration-durable-store-required');
  const crownOutcome=String(input.crownOutcome??'');
  if(!['CROWN_ACCEPTED_BUILDER','CROWN_PATCHED_BUILDER','CROWN_REWROTE','CROWN_PROTOCOL_DRIFT_DIRECT_OUTPUT_ONLY'].includes(crownOutcome))
    throw new Error('jev-calibration-current-crown-outcome-required');
  if(typeof input.requestFingerprint!=='string'||!input.requestFingerprint)throw new Error('jev-calibration-request-fingerprint-required');
  if(typeof input.writerModel!=='string'||!input.writerModel)throw new Error('jev-calibration-writer-model-required');

  const observedAt=new Date(now).toISOString();
  const row={
    observationId:h({
      requestFingerprint:input.requestFingerprint,
      jevProviderRequestId:input.jevProviderRequestId??null,
      writerProviderRequestId:input.writerProviderRequestId??null,
      crownProviderRequestId:input.crownProviderRequestId??null,
      crownOutcome
    }),
    observedAt,
    requestFingerprint:input.requestFingerprint,
    sessionRoot:typeof input.sessionRoot==='string'?input.sessionRoot:null,
    jevModel:String(input.jevModel??'typesafe/jev-1.13'),
    jevModelRevision:typeof input.jevModelRevision==='string'?input.jevModelRevision:null,
    jevAnswers:safeAnswers(input.jevAnswers),
    qualityClass:typeof input.qualityClass==='string'?String(input.qualityClass).slice(0,80):'UNKNOWN',
    selectedWriterId:String(input.selectedWriterId??'unknown').slice(0,64),
    writerModel:input.writerModel,
    crownModel:typeof input.crownModel==='string'?String(input.crownModel).slice(0,160):null,
    crownModelRevision:typeof input.crownModelRevision==='string'?String(input.crownModelRevision).slice(0,200):null,
    crownOutcome,
    acceptedWithoutMutation:crownOutcome==='CROWN_ACCEPTED_BUILDER',
    patchRequired:crownOutcome==='CROWN_PATCHED_BUILDER',
    rewriteRequired:['CROWN_REWROTE','CROWN_PROTOCOL_DRIFT_DIRECT_OUTPUT_ONLY'].includes(crownOutcome),
    costsMicrousd:{
      jev:finite(input.jevCostMicrousd),
      writer:finite(input.writerCostMicrousd),
      critic:finite(input.criticCostMicrousd),
      crown:finite(input.crownCostMicrousd)
    },
    providerRequestRefs:{
      jev:typeof input.jevProviderRequestId==='string'?input.jevProviderRequestId:null,
      writer:typeof input.writerProviderRequestId==='string'?input.writerProviderRequestId:null,
      crown:typeof input.crownProviderRequestId==='string'?input.crownProviderRequestId:null
    },
    semanticAuthority:'NONE',
    crownSuppressionAuthority:'NONE',
    rawPromptStored:false,
    rawCandidateStored:false,
    rawCrownOutputStored:false
  };

  return store.transaction(async tx=>{
    const settings=await tx.getSettings();
    const state=structuredClone(settings?.[JEV_CALIBRATION_SETTING]??empty());
    if(state.schemaVersion!==JEV_CALIBRATION_SCHEMA)throw new Error('jev-calibration-schema-drift');
    const existing=state.observations.find(x=>x.observationId===row.observationId);
    if(existing)return {ok:true,status:'JEV_CALIBRATION_IDEMPOTENT',observationId:row.observationId,summary:summarizeJevCalibration(state)};
    state.observations.push(row);
    if(state.observations.length>MAX_OBSERVATIONS)state.observations.splice(0,state.observations.length-MAX_OBSERVATIONS);
    state.updatedAt=observedAt;
    await tx.setSetting(JEV_CALIBRATION_SETTING,state);
    return {ok:true,status:'JEV_CALIBRATION_OBSERVED',observationId:row.observationId,summary:summarizeJevCalibration(state)};
  });
}

export function summarizeJevCalibration(state={}){
  const rows=Array.isArray(state.observations)?state.observations:[];
  const total=rows.length;
  const accepted=rows.filter(x=>x.acceptedWithoutMutation).length;
  const patched=rows.filter(x=>x.patchRequired).length;
  const rewritten=rows.filter(x=>x.rewriteRequired).length;
  const byWriter={};
  for(const row of rows){
    const key=row.writerModel??'unknown';
    const agg=byWriter[key]??={total:0,acceptedWithoutMutation:0,patched:0,rewritten:0};
    agg.total++;
    if(row.acceptedWithoutMutation)agg.acceptedWithoutMutation++;
    if(row.patchRequired)agg.patched++;
    if(row.rewriteRequired)agg.rewritten++;
    byWriter[key]=agg;
  }
  return {
    schemaVersion:JEV_CALIBRATION_SCHEMA,
    status:'JEV_SHADOW_CALIBRATION',
    totalObservations:total,
    acceptedWithoutMutation:accepted,
    patched,
    rewritten,
    acceptRate:total?accepted/total:null,
    patchRate:total?patched/total:null,
    rewriteRate:total?rewritten/total:null,
    byWriter,
    promotionState:state.promotionState??'SHADOW',
    crownSuppressionAuthority:'NONE',
    promotionEligible:false,
    promotionBlockers:[
      'independent-zero-loss-certificate-required',
      'stable-calibration-windows-required',
      'explicit-certified-bounded-domain-required'
    ],
    rawPayloadsStored:false,
    updatedAt:state.updatedAt??null
  };
}

export async function readJevCalibrationSummary(store){
  if(typeof store?.transaction!=='function')throw new Error('jev-calibration-durable-store-required');
  return store.transaction(async tx=>{
    const settings=await tx.getSettings();
    return summarizeJevCalibration(settings?.[JEV_CALIBRATION_SETTING]??empty());
  });
}
