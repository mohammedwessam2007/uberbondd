import crypto from 'node:crypto';

export const PHOENIX_VAULT_VERSION = 'uberbond.phoenix-owner-vault.v1';
const LOCAL_SCHEMA='uberbond.phoenix-local-draft.v1';
const CORPUS_SHA='23bb3c1813e3b5997d8ec76c801db2d5c59baf780573fb496da867d90d7017f0';
const KINDS=new Set(['DECISION','IMPLEMENTATION','GOAL','TEST','EXTERNAL_EVIDENCE','BLOCKER','FAILED_ATTEMPT','CONTRADICTION','DONOR','UNKNOWN','NEXT_ACTION']);
const SECRET=/(?:sk-proj|sk-live|ghp_|gho_|github_pat_|xoxb-|xoxp-|Bearer\s+[a-z0-9_.-]{12,}|password\s*[:=]\s*\S+|api[_-]?key\s*[:=]\s*\S+|-----BEGIN (?:RSA|OPENSSH|PRIVATE) KEY)/i;
const SAFE_SHA=/^[0-9a-f]{40}$/;
const SAFE_DIGEST=/^[0-9a-f]{64}$/;
const STRING=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!SECRET.test(v);
function fail(code){const error=new Error('PHOENIX_VAULT_'+code);error.phoenixCode=code;throw error;}
function exactKeys(value,expected) {
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 return Object.keys(value).sort().join('|')===expected.slice().sort().join('|');
}
function timeValid(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v)&&Number.isFinite(Date.parse(v));}
export function validatePhoenixLocalDraft(envelope){
 if(!exactKeys(envelope,['body','digest']))fail('ENVELOPE_SHAPE');
 if(!SAFE_DIGEST.test(envelope.digest||''))fail('DIGEST_FORMAT');
 const body=envelope.body;
 if(!exactKeys(body,['schemaVersion','sourceType','exportedAt','mainSha','moonshotCorpusSha','entries','truthBoundary']))fail('BODY_SHAPE');
 if(body.schemaVersion!==LOCAL_SCHEMA||body.sourceType!=='MANUAL_LOCAL_DRAFT_NOT_FULL_CHAT_EXPORT')fail('SCHEMA');
 if(body.moonshotCorpusSha!==CORPUS_SHA)fail('CORPUS_ANCHOR');
 if(body.truthBoundary!=='MANUALLY_ENTERED_MATERIAL_ONLY; SOURCE_NOT_REVALIDATED; ZERO_EXTERNAL_EFFECT_AUTHORITY')fail('AUTHORITY');
 if(!timeValid(body.exportedAt))fail('EXPORTED_AT');
 if(body.mainSha!==null && !SAFE_SHA.test(body.mainSha||''))fail('MAIN_SHA');
 if(!Array.isArray(body.entries)||body.entries.length<1||body.entries.length>120)fail('ENTRY_COUNT');
 if(JSON.stringify(body).length>250000)fail('SIZE');
 for(let i=0;i<body.entries.length;i++){
  const e=body.entries[i];
  if(!exactKeys(e,['id','kind','summary','source','recordedAt']))fail('ENTRY_SHAPE');
  if(e.id!=='checkpoint-'+(i+1))fail('ENTRY_SEQUENCE');
  if(!KINDS.has(e.kind)||!STRING(e.summary,1500)||!STRING(e.source,600)||!timeValid(e.recordedAt))fail('ENTRY_CONTENT');
 }
 const computed=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
 const left=Buffer.from(computed,'hex'),right=Buffer.from(envelope.digest,'hex');
 if(!crypto.timingSafeEqual(left,right))fail('DIGEST_MISMATCH');
 return {ok:true,status:'PHOENIX_MANUAL_DRAFT_INTEGRITY_CHECKED',id:'phx_'+computed,digest:computed,entryCount:body.entries.length,mainSha:body.mainSha,
  truthBoundary:'CHECKSUM_VALIDATED_ONLY; USER_ENTERED_NOT_SOURCE_VERIFIED; APP_DATABASE_PLAINTEXT_UNLESS_PROVIDER_ENCRYPTION'};
}
export async function savePhoenixLocalDraft(store,envelope,{now=new Date().toISOString()}={}){
 const verified=validatePhoenixLocalDraft(envelope);
 const existing=await store.get('phoenixCapsules',verified.id);
 if(existing)return {ok:true,status:'PHOENIX_ALREADY_SAVED',id:existing.id,digest:existing.digest,entryCount:existing.entryCount,createdAt:existing.createdAt,authority:'NONE'};
 const record={
   id:verified.id,digest:verified.digest,sessionId:'owner-manual-capsule',
   entryCount:verified.entryCount,createdAt:now,body:structuredClone(envelope.body),
   evidenceClass:'OWNER_MANUAL_SOURCE_UNVERIFIED',authority:'NONE'
 };
 try{await store.add('phoenixCapsules',record)}
 catch(error){
  if(error?.code!=='CONFLICT')throw error;
  const after=await store.get('phoenixCapsules',verified.id);if(!after)throw error;
  return {ok:true,status:'PHOENIX_ALREADY_SAVED',id:after.id,digest:after.digest,entryCount:after.entryCount,createdAt:after.createdAt,authority:'NONE'};
 }
 return {ok:true,status:'PHOENIX_SAVED_TO_APP_DATABASE',id:record.id,digest:record.digest,entryCount:record.entryCount,createdAt:record.createdAt,authority:'NONE'};
}
export async function listPhoenixCapsules(store,{limit=20}={}){
 const cap=Math.max(1,Math.min(40,Number(limit)||20));
 const rows=await store.list('phoenixCapsules',{orderBy:'createdAt',direction:'desc',limit:cap});
 return {ok:true,status:'PHOENIX_VAULT_READ_ONLY',capsules:rows.map(r=>({id:r.id,digest:r.digest,entryCount:r.entryCount,createdAt:r.createdAt,mainSha:r.body?.mainSha||null,evidenceClass:r.evidenceClass})),authority:'NONE'};
}
export async function readPhoenixCapsule(store,id){
 if(typeof id!=='string'||!/^phx_[0-9a-f]{64}$/.test(id))fail('BAD_CAPSULE_ID');
 const record=await store.get('phoenixCapsules',id);
 if(!record)return {ok:false,status:'PHOENIX_NOT_FOUND'};
 const envelope={body:record.body,digest:record.digest};
 const check=validatePhoenixLocalDraft(envelope);
 if(check.id!==record.id)fail('PERSISTED_ID_MISMATCH');
 return {ok:true,status:'PHOENIX_SAVED_DRAFT_RESTORED',capsule:envelope,createdAt:record.createdAt,authority:'NONE'};
}
