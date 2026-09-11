import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const CONTEXT_JOURNAL_RUNTIME_STATE_POLICY_VERSION='context-journal-runtime-state-1.0.0';
export const CONTEXT_JOURNAL_RUNTIME_STATE_SCHEMA='uberbond.context-journal-runtime-state.v1';
const SHA64=/^[a-f0-9]{64}$/;
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
function fail(reasonCodes,status='CONTEXT_JOURNAL_RUNTIME_STATE_REFUSED',extra={}){return{ok:false,policyVersion:CONTEXT_JOURNAL_RUNTIME_STATE_POLICY_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function payload(state={}){const{stateId:_ignored,...rest}=state;return rest;}

export function verifyContextJournalRuntimeState(state){
  if(!state||typeof state!=='object'||Array.isArray(state)||state.schemaVersion!==CONTEXT_JOURNAL_RUNTIME_STATE_SCHEMA)return fail(['canonical-runtime-state-required'],'CONTEXT_JOURNAL_RUNTIME_STATE_INVALID');
  if(state.mode!=='ARCHIVE_PLUS_TAIL')return fail(['layered-runtime-mode-required'],'CONTEXT_JOURNAL_RUNTIME_STATE_INVALID');
  if(!SHA64.test(String(state.archiveManifestId||''))||!SHA64.test(String(state.archiveTipDigest||'')))return fail(['archive-manifest-and-tip-required'],'CONTEXT_JOURNAL_RUNTIME_STATE_INVALID');
  if(!Number.isSafeInteger(state.archiveEntryCount)||state.archiveEntryCount<1)return fail(['positive-archive-entry-count-required'],'CONTEXT_JOURNAL_RUNTIME_STATE_INVALID');
  if(!SHA64.test(String(state.generationId||''))||state.tailFile!==`tail-${state.generationId}.jsonl`)return fail(['content-addressed-tail-generation-required'],'CONTEXT_JOURNAL_RUNTIME_STATE_INVALID');
  if(state.previousStateId!==null&&!SHA64.test(String(state.previousStateId||'')))return fail(['valid-previous-runtime-state-id-required'],'CONTEXT_JOURNAL_RUNTIME_STATE_INVALID');
  if(!Number.isFinite(Date.parse(String(state.activatedAt||''))))return fail(['valid-runtime-state-time-required'],'CONTEXT_JOURNAL_RUNTIME_STATE_INVALID');
  if(state.businessEffectAuthority!=='NONE'||state.externalEffectAuthority!=='NONE'||state.consequenceAuthority!=='NONE')return fail(['zero-runtime-state-authority-required'],'CONTEXT_JOURNAL_RUNTIME_STATE_INVALID');
  if(!SHA64.test(String(state.stateId||''))||state.stateId!==digest(payload(state)))return fail(['runtime-state-digest-mismatch'],'CONTEXT_JOURNAL_RUNTIME_STATE_INVALID');
  return{ok:true,policyVersion:CONTEXT_JOURNAL_RUNTIME_STATE_POLICY_VERSION,status:'CONTEXT_JOURNAL_RUNTIME_STATE_VERIFIED',stateId:state.stateId,generationId:state.generationId,archiveManifestId:state.archiveManifestId,archiveEntryCount:state.archiveEntryCount,archiveTipDigest:state.archiveTipDigest,tailFile:state.tailFile,previousStateId:state.previousStateId,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}

export function compileContextJournalRuntimeState({archiveManifestId,archiveEntryCount,archiveTipDigest,previousState=null,activatedAt=new Date()}={}){
  const at=new Date(activatedAt);const previousId=previousState==null?null:verifyContextJournalRuntimeState(previousState).ok?previousState.stateId:null;
  const reasons=[];
  if(!SHA64.test(String(archiveManifestId||''))||!SHA64.test(String(archiveTipDigest||'')))reasons.push('archive-manifest-and-tip-required');
  if(!Number.isSafeInteger(archiveEntryCount)||archiveEntryCount<1)reasons.push('positive-archive-entry-count-required');
  if(previousState!=null&&!previousId)reasons.push('verified-previous-runtime-state-required');
  if(!Number.isFinite(at.getTime()))reasons.push('valid-runtime-state-time-required');
  if(reasons.length)return fail(reasons);
  const generationId=digest({archiveManifestId,archiveEntryCount,archiveTipDigest,previousStateId:previousId,activatedAt:at.toISOString()});
  const state={schemaVersion:CONTEXT_JOURNAL_RUNTIME_STATE_SCHEMA,mode:'ARCHIVE_PLUS_TAIL',archiveManifestId,archiveEntryCount,archiveTipDigest,generationId,tailFile:`tail-${generationId}.jsonl`,previousStateId:previousId,activatedAt:at.toISOString(),consequenceAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};
  state.stateId=digest(payload(state));
  return{ok:true,policyVersion:CONTEXT_JOURNAL_RUNTIME_STATE_POLICY_VERSION,status:'CONTEXT_JOURNAL_RUNTIME_STATE_READY',state,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}
