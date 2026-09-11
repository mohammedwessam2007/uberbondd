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
