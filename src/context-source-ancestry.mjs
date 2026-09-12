import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const CONTEXT_SOURCE_ANCESTRY_POLICY_VERSION='context-source-ancestry-1.0.0';
export const CONTEXT_SOURCE_ANCESTRY_SCHEMA='uberbond.context-source-ancestry.v1';
const SHA40=/^[a-f0-9]{40}$/;
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
function fail(reasonCodes,status='CONTEXT_SOURCE_ANCESTRY_REFUSED',extra={}){return{ok:false,policyVersion:CONTEXT_SOURCE_ANCESTRY_POLICY_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function payload(receipt={}){const{receiptId:_ignored,...rest}=receipt;return rest;}

export function compileContextSourceAncestryReceipt({currentSourceCommit,candidateSourceCommit,mergeBase,currentIsAncestorOfCandidate=false,candidateIsAncestorOfCurrent=false,repositoryHead=null}={}){
  const current=String(currentSourceCommit||'').toLowerCase();
  const candidate=String(candidateSourceCommit||'').toLowerCase();
  const base=String(mergeBase||'').toLowerCase();
  const head=repositoryHead==null?null:String(repositoryHead).toLowerCase();
  const reasons=[];
  if(!SHA40.test(current)||!SHA40.test(candidate)||!SHA40.test(base))reasons.push('exact-source-commits-and-merge-base-required');
  if(head!==null&&!SHA40.test(head))reasons.push('exact-repository-head-required');
  if(typeof currentIsAncestorOfCandidate!=='boolean'||typeof candidateIsAncestorOfCurrent!=='boolean')reasons.push('boolean-ancestry-observations-required');
  if(reasons.length)return fail(reasons);
  let relation='DIVERGED';
  if(current===candidate)relation='SAME';
  else if(currentIsAncestorOfCandidate===true&&candidateIsAncestorOfCurrent===false)relation='FAST_FORWARD';
  else if(candidateIsAncestorOfCurrent===true&&currentIsAncestorOfCandidate===false)relation='ROLLBACK';
  else if(currentIsAncestorOfCandidate===true&&candidateIsAncestorOfCurrent===true)return fail(['distinct-commits-cannot-be-mutual-ancestors'],'CONTEXT_SOURCE_ANCESTRY_INVALID');
  const receipt={schemaVersion:CONTEXT_SOURCE_ANCESTRY_SCHEMA,currentSourceCommit:current,candidateSourceCommit:candidate,mergeBase:base,relation,repositoryHead:head,consequenceAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};
  receipt.receiptId=digest(payload(receipt));
  return{ok:true,policyVersion:CONTEXT_SOURCE_ANCESTRY_POLICY_VERSION,status:'CONTEXT_SOURCE_ANCESTRY_READY',receipt,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}

export function verifyContextSourceAncestryReceipt(receipt,{currentSourceCommit=null,candidateSourceCommit=null,allowSame=true,allowFastForward=true}={}){
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||receipt.schemaVersion!==CONTEXT_SOURCE_ANCESTRY_SCHEMA)return fail(['canonical-context-source-ancestry-receipt-required'],'CONTEXT_SOURCE_ANCESTRY_INVALID');
  if(!/^[a-f0-9]{64}$/.test(String(receipt.receiptId||''))||receipt.receiptId!==digest(payload(receipt)))return fail(['context-source-ancestry-digest-mismatch'],'CONTEXT_SOURCE_ANCESTRY_INVALID');
  if(!SHA40.test(String(receipt.currentSourceCommit||''))||!SHA40.test(String(receipt.candidateSourceCommit||''))||!SHA40.test(String(receipt.mergeBase||'')))return fail(['exact-source-ancestry-identities-required'],'CONTEXT_SOURCE_ANCESTRY_INVALID');
  if(receipt.consequenceAuthority!=='NONE'||receipt.businessEffectAuthority!=='NONE'||receipt.externalEffectAuthority!=='NONE')return fail(['zero-source-ancestry-authority-required'],'CONTEXT_SOURCE_ANCESTRY_INVALID');
  if(currentSourceCommit&&receipt.currentSourceCommit!==String(currentSourceCommit).toLowerCase())return fail(['context-source-ancestry-current-mismatch'],'CONTEXT_SOURCE_ANCESTRY_INVALID');
  if(candidateSourceCommit&&receipt.candidateSourceCommit!==String(candidateSourceCommit).toLowerCase())return fail(['context-source-ancestry-candidate-mismatch'],'CONTEXT_SOURCE_ANCESTRY_INVALID');
  if(receipt.relation==='ROLLBACK')return fail(['context-source-rollback-refused'],'CONTEXT_SOURCE_ROLLBACK_REFUSED');
  if(receipt.relation==='DIVERGED')return fail(['context-source-divergence-refused'],'CONTEXT_SOURCE_DIVERGENCE_REFUSED');
  if(receipt.relation==='SAME'&&allowSame!==true)return fail(['same-source-context-import-not-allowed'],'CONTEXT_SOURCE_ANCESTRY_REFUSED');
  if(receipt.relation==='FAST_FORWARD'&&allowFastForward!==true)return fail(['fast-forward-context-import-not-allowed'],'CONTEXT_SOURCE_ANCESTRY_REFUSED');
  if(!['SAME','FAST_FORWARD'].includes(receipt.relation))return fail(['recognized-safe-source-relation-required'],'CONTEXT_SOURCE_ANCESTRY_INVALID');
  if(receipt.relation==='SAME'&&!(receipt.currentSourceCommit===receipt.candidateSourceCommit&&receipt.mergeBase===receipt.currentSourceCommit))return fail(['same-source-receipt-inconsistent'],'CONTEXT_SOURCE_ANCESTRY_INVALID');
  if(receipt.relation==='FAST_FORWARD'&&receipt.mergeBase!==receipt.currentSourceCommit)return fail(['fast-forward-merge-base-must-equal-current-source'],'CONTEXT_SOURCE_ANCESTRY_INVALID');
  return{ok:true,policyVersion:CONTEXT_SOURCE_ANCESTRY_POLICY_VERSION,status:'CONTEXT_SOURCE_ANCESTRY_VERIFIED',receiptId:receipt.receiptId,relation:receipt.relation,currentSourceCommit:receipt.currentSourceCommit,candidateSourceCommit:receipt.candidateSourceCommit,mergeBase:receipt.mergeBase,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'The receipt integrity is content-addressed. Git ancestry truth must come from a real local probe over commits present in the trusted repository.'};
}
