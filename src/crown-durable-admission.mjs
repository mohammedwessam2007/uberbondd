import { verifyCrownAdmissionReceipt } from './crown-admission.mjs';

export const DURABLE_CROWN_ADMISSION_SETTING='infiniteOpusCrownAdmissionV1';
export const DURABLE_CROWN_ATTEMPT_KEYS=Object.freeze([
  'infinite_opus_crown_resume_20261002_r3',
  'infinite_opus_crown_resume_20261001_r2',
  'infinite_opus_crown_replacement_20261001_r1',
  'infinite_opus_crown_autofinish_20261001_v7'
]);

const readSettings=async store=>store.transaction(async tx=>await tx.getSettings());

export async function resolveDurableCrownAdmission(store,{environmentReceipt=null,expected={},now=Date.now()}={}){
  if(!store)return {ok:false,status:'CROWN_STORE_REQUIRED',receipt:null,source:null};
  if(environmentReceipt){
    const verified=verifyCrownAdmissionReceipt(environmentReceipt,{now,expected});
    if(verified.ok)return {ok:true,status:'CURRENT_CROWN_ADMISSION_RESOLVED',receipt:environmentReceipt,source:'ENVIRONMENT'};
  }
  const settings=await readSettings(store);
  const durable=settings?.[DURABLE_CROWN_ADMISSION_SETTING];
  if(durable?.receipt){
    const verified=verifyCrownAdmissionReceipt(durable.receipt,{now,expected});
    if(verified.ok)return {ok:true,status:'CURRENT_CROWN_ADMISSION_RESOLVED',receipt:durable.receipt,source:'DURABLE_CANON'};
  }
  for(const key of DURABLE_CROWN_ATTEMPT_KEYS){
    const state=settings?.[key];
    if(state?.status!=='COMPLETE'||!state?.crownAdmission)continue;
    const verified=verifyCrownAdmissionReceipt(state.crownAdmission,{now,expected});
    if(verified.ok)return {ok:true,status:'CURRENT_CROWN_ADMISSION_RESOLVED',receipt:state.crownAdmission,source:'SEALED_ATTEMPT',sourceAttemptKey:key};
  }
  return {ok:false,status:'CURRENT_CROWN_ADMISSION_NOT_FOUND',receipt:null,source:null};
}

export async function persistDurableCrownAdmission(store,receipt,{expected={},sourceAttemptKey=null,now=Date.now()}={}){
  const verified=verifyCrownAdmissionReceipt(receipt,{now,expected});
  if(!verified.ok)return {ok:false,status:'CROWN_ADMISSION_PERSIST_REFUSED',reasons:verified.reasons};
  const record={
    schemaVersion:'uberbond.infinite-opus.durable-crown-admission.v1',
    receipt,
    receiptHash:receipt.receiptHash,
    sourceAttemptKey:sourceAttemptKey||null,
    persistedAt:new Date(now).toISOString(),
    sideEffectAuthority:'NONE'
  };
  await store.transaction(async tx=>{await tx.setSetting(DURABLE_CROWN_ADMISSION_SETTING,record);});
  return {ok:true,status:'CROWN_ADMISSION_PERSISTED',receiptHash:receipt.receiptHash,sourceAttemptKey:record.sourceAttemptKey};
}
