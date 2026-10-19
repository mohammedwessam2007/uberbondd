/**
 * Scoped custody of separately observed source receipts by an owner-delegated
 * operator. This does NOT make that operator the provider or recipient.
 * Trust/delegation comes only from protected runtime configuration, never the
 * evidence manifest. Missing source facts still fail the downstream gates.
 */
import {createPublicKey,verify} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {ONE_SHOT_EVIDENCE_ROLES,attestedOneShotSigningPayload} from './uberwarm2-attested-one-shot-readers.mjs';
const kinds=Object.keys(ONE_SHOT_EVIDENCE_ROLES);
const senderKinds=new Set(kinds.slice(0,3));
const text=(v,n=500)=>typeof v==='string'&&v.length>0&&v.length<=n&&v===v.trim();
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const email=v=>text(v,320)&&/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(v);
function delegation(input,now){
 try{
  // Snapshot plain JSON, so caller mutation cannot change a validation in flight.
  const d=JSON.parse(JSON.stringify(input));
  if(d?.version!=='uberbond.uberwarm2-evidence-custody.v1'||d.revoked!==false||
    !text(d.delegationId,120)||!text(d.authorityRef)||!text(d.signerId,120)||
    !email(d.senderEmail)||!email(d.recipientEmail)||d.senderEmail===d.recipientEmail||
    d.domain!==d.senderEmail.split('@')[1]||!text(d.probeId,250)||
    !iso(d.validAfter)||!iso(d.expiresAt)||!Number.isFinite(now)||
    Date.parse(d.validAfter)>now||Date.parse(d.expiresAt)<=now||
    Date.parse(d.expiresAt)-Date.parse(d.validAfter)>2700000||
    typeof d.publicKeyPem!=='string'||d.publicKeyPem.length>1000||
    !d.sourceAuthorities||Object.keys(d.sourceAuthorities).length!==kinds.length||
    !kinds.every(k=>text(d.sourceAuthorities[k])))return null;
  const key=createPublicKey(d.publicKeyPem);if(key.asymmetricKeyType!=='ed25519')return null;
  return {d,key};
 }catch{return null;}
}
function validReceipt(x,kind,d,key,now){
 try{
  const r=x?.row;
  if(x?.kind!==kind||x.signerId!==d.signerId||!text(x.signature,200)||
    !r||Array.isArray(r)||typeof r!=='object'||
    Object.hasOwn(r,'signed')||Object.hasOwn(r,'verified')||
    r.delegationId!==d.delegationId||r.authorityRef!==d.authorityRef||
    r.sourceAuthority!==d.sourceAuthorities[kind]||
    r.probeId!==d.probeId||r.senderEmail!==d.senderEmail||r.recipientEmail!==d.recipientEmail||
    r.email!==(senderKinds.has(kind)?d.senderEmail:d.recipientEmail)||
    senderKinds.has(kind)&&r.domain!==d.domain||
    !text(r.receiptId,250)||!text(r.evidenceRef)||!/^sha256:[a-f0-9]{64}$/.test(r.sourceDigest)||
    r.observedAt!==x.observedAt||!iso(x.observedAt)||!iso(x.expiresAt))return false;
  const observed=Date.parse(x.observedAt),expires=Date.parse(x.expiresAt);
  if(observed>now||now-observed>60000||expires<=now||expires-observed>60000||
    observed<Date.parse(d.validAfter)||expires>Date.parse(d.expiresAt))return false;
  const sig=Buffer.from(x.signature,'base64url');
  return sig.length===64&&verify(null,attestedOneShotSigningPayload(x),key,sig);
 }catch{return false;}
}
/** No issuer, no key generation, no source assertions and no sending here. */
export function createUberWarm2DelegatedEvidenceCustodyReaders({readEvidence,readTrustedDelegation,clock=Date.now}={}){
 let configured=false;
 try{configured=typeof readEvidence==='function'&&typeof readTrustedDelegation==='function'&&
   typeof clock==='function'&&delegation(readTrustedDelegation(),Number(clock()))!==null;}catch{}
 const readers={};
 for(const kind of kinds)readers[kind]=async(query={})=>{
  if(!configured)return [];
  try{
   const manifest=JSON.parse(await readEvidence());
   // Recheck time and delegation AFTER asynchronous source I/O.
   const now=Number(clock()),trusted=delegation(readTrustedDelegation(),now);
   if(!trusted)return [];
   const {d,key}=trusted;
   if(query.email!==(senderKinds.has(kind)?d.senderEmail:d.recipientEmail)||
     query.domain!==undefined&&query.domain!==d.domain||
     query.probeId!==undefined&&query.probeId!==d.probeId)return [];
   if(!manifest?.attestations||Object.keys(manifest.attestations).length!==kinds.length)return [];
   const rows=[];
   // All six receipts must be present and coherent on EVERY read. A partial
   // manifest cannot satisfy an early callback and later introduce another set.
   for(const k of kinds){
    const list=manifest.attestations[k];
    if(!Array.isArray(list)||list.length!==1||!validReceipt(list[0],k,d,key,now))return [];
    rows.push(list[0].row);
   }
   if(new Set(rows.map(r=>r.receiptId)).size!==kinds.length||
      new Set(rows.map(r=>r.evidenceRef)).size!==kinds.length)return [];
   const row=manifest.attestations[kind][0].row;
   return [Object.freeze({...row,verified:true,signed:true,
     verificationMode:'OWNER_DELEGATED_SOURCE_CUSTODY'})];
  }catch{return [];}
 };
 return Object.freeze({configured,reasonCodes:configured?[]:['protected-exact-scoped-source-custody-delegation-required'],
   readers:Object.freeze(readers)});
}
export function createUberWarm2DelegatedEvidenceCustodyFileReaders({path,readTrustedDelegation,clock}={}){
 return createUberWarm2DelegatedEvidenceCustodyReaders({
   readEvidence:async()=>readFileSync(path,'utf8'),readTrustedDelegation,clock});
}
