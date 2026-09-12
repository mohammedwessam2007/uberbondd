import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { verifyCognitiveJournalEntries } from './cognitive-event-journal.mjs';
import { compileContextCognitiveEvent } from './sovereign-context-fabric.mjs';

export const CONTEXT_PRIVACY_POLICY_VERSION='context-privacy-1.1.0';
export const FOUNDER_CONTEXT_AUTH_SCHEMA='uberbond.founder-context-authorization.v1';
const EVENT_ID=/^brain_evt_[a-f0-9]{24}$/;
const SHA64=/^[a-f0-9]{64}$/;
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
function fail(reasonCodes,status='CONTEXT_PRIVACY_REFUSED',extra={}){return{ok:false,policyVersion:CONTEXT_PRIVACY_POLICY_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function authPayload(receipt={}){const{authorizationId:_ignored,...rest}=receipt;return rest;}
function authorizationIdFrom(event){const refs=Array.isArray(event?.evidenceRefs)?event.evidenceRefs:[];const matches=refs.map(ref=>/^founder-context-authorization:\/\/([a-f0-9]{64})$/.exec(String(ref))).filter(Boolean);return matches.length===1?matches[0][1]:null;}
function suppressionTarget(event){
  if(event?.kind!=='MEMORY_UPDATE'||event?.sourceNodeId!=='context-spine'||event?.subjectType!=='COGNITIVE_EVENT_SUPPRESSION')return null;
  const target=String(event.subjectId||'');
  if(!EVENT_ID.test(target))return false;
  if(!Array.isArray(event.parentEventIds)||event.parentEventIds.length!==1||event.parentEventIds[0]!==target)return false;
  if(event.truthClass!=='FOUNDER_AUTHORIZED_PRIVACY_DIRECTIVE'||event.payloadRef!==null)return false;
  if(event.summary!==`Suppress ${target} from ordinary Context retrieval by founder authorization.`)return false;
  if(!authorizationIdFrom(event))return false;
  return target;
}

export function compileFounderContextAuthorization({targetEventId,founderConfirmed=false,issuedAt=new Date()}={}){
  const target=String(targetEventId||'');const issued=new Date(issuedAt);
  const reasons=[];if(!EVENT_ID.test(target))reasons.push('canonical-target-event-id-required');if(founderConfirmed!==true)reasons.push('explicit-founder-confirmation-required');if(!Number.isFinite(issued.getTime()))reasons.push('valid-authorization-time-required');if(reasons.length)return fail(reasons,'FOUNDER_CONTEXT_AUTHORIZATION_REFUSED');
  const receipt={schemaVersion:FOUNDER_CONTEXT_AUTH_SCHEMA,authorized:true,action:'SUPPRESS_COGNITIVE_EVENT',targetEventId:target,issuedAt:issued.toISOString(),businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:'This receipt records explicit local founder confirmation for one retrieval suppression target. It is content-addressed intent evidence, not cryptographic identity attestation.'};
  receipt.authorizationId=digest(authPayload(receipt));
  return{ok:true,policyVersion:CONTEXT_PRIVACY_POLICY_VERSION,status:'FOUNDER_CONTEXT_AUTHORIZATION_READY',receipt,externalEffectLedger:zeroEffects()};
}

export function verifyFounderContextAuthorization(receipt,{targetEventId=null}={}){
  if(!receipt||typeof receipt!=='object'||Array.isArray(receipt)||receipt.schemaVersion!==FOUNDER_CONTEXT_AUTH_SCHEMA)return fail(['founder-context-authorization-receipt-required'],'FOUNDER_CONTEXT_AUTHORIZATION_INVALID');
  if(receipt.authorized!==true||receipt.action!=='SUPPRESS_COGNITIVE_EVENT'||!EVENT_ID.test(String(receipt.targetEventId||'')))return fail(['canonical-founder-suppression-authorization-required'],'FOUNDER_CONTEXT_AUTHORIZATION_INVALID');
  if(!Number.isFinite(Date.parse(String(receipt.issuedAt||''))))return fail(['founder-authorization-time-required'],'FOUNDER_CONTEXT_AUTHORIZATION_INVALID');
  if(receipt.businessEffectAuthority!=='NONE'||receipt.externalEffectAuthority!=='NONE')return fail(['zero-founder-authorization-authority-required'],'FOUNDER_CONTEXT_AUTHORIZATION_INVALID');
  if(!SHA64.test(String(receipt.authorizationId||''))||receipt.authorizationId!==digest(authPayload(receipt)))return fail(['founder-authorization-digest-mismatch'],'FOUNDER_CONTEXT_AUTHORIZATION_INVALID');
  if(targetEventId&&receipt.targetEventId!==String(targetEventId))return fail(['founder-authorization-target-mismatch'],'FOUNDER_CONTEXT_AUTHORIZATION_INVALID');
  return{ok:true,policyVersion:CONTEXT_PRIVACY_POLICY_VERSION,status:'FOUNDER_CONTEXT_AUTHORIZATION_VERIFIED',authorizationId:receipt.authorizationId,targetEventId:receipt.targetEventId,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}

export function compileFounderContextSuppression({targetEventId,founderAuthorizationReceipt,observedAt=new Date()}={}){
  const target=String(targetEventId||'');const auth=verifyFounderContextAuthorization(founderAuthorizationReceipt,{targetEventId:target});
  if(!EVENT_ID.test(target)||!auth.ok)return fail(['matching-founder-suppression-authorization-required',...(auth.reasonCodes||[])]);
  const compiled=compileContextCognitiveEvent({kind:'MEMORY_UPDATE',sourceNodeId:'context-spine',subjectType:'COGNITIVE_EVENT_SUPPRESSION',subjectId:target,summary:`Suppress ${target} from ordinary Context retrieval by founder authorization.`,evidenceRefs:[`founder-context-authorization://${auth.authorizationId}`],payloadRef:null,truthClass:'FOUNDER_AUTHORIZED_PRIVACY_DIRECTIVE',observedAt,parentEventIds:[target]});
  if(!compiled.ok)return fail(['canonical-suppression-event-refused',...(compiled.reasonCodes||[])]);
  return{ok:true,policyVersion:CONTEXT_PRIVACY_POLICY_VERSION,status:'CONTEXT_PRIVACY_SUPPRESSION_READY',compiledEvent:compiled,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'SUPPRESSION CHANGES ORDINARY RETRIEVAL ONLY. IT DOES NOT REWRITE THE APPEND-ONLY JOURNAL OR CLAIM PHYSICAL DELETION FROM BACKUPS, REPLICAS, OR PRIOR EXPORTS.'};
}

export function applyContextPrivacyView(entries=[]){
  const verified=verifyCognitiveJournalEntries(entries);if(!verified.ok)return fail(['verified-cognitive-journal-required',...(verified.reasonCodes||[])],'CONTEXT_PRIVACY_JOURNAL_REFUSED');
  const seen=new Set();const suppressed=new Set();const directives=[];
  for(const entry of entries){const target=suppressionTarget(entry.event);if(target===false)return fail(['malformed-context-privacy-directive'],'CONTEXT_PRIVACY_DIRECTIVE_INVALID',{eventId:entry.eventId});if(typeof target==='string'){if(!seen.has(target))return fail(['suppression-target-must-precede-directive'],'CONTEXT_PRIVACY_DIRECTIVE_INVALID',{eventId:entry.eventId,targetEventId:target});suppressed.add(target);directives.push(entry.eventId);}seen.add(entry.eventId);}
  const visibleEntries=entries.filter(entry=>!suppressed.has(entry.eventId)&&!directives.includes(entry.eventId));
  return{ok:true,policyVersion:CONTEXT_PRIVACY_POLICY_VERSION,status:'CONTEXT_PRIVACY_VIEW_READY',visibleEntries,suppressedEventIds:[...suppressed],privacyDirectiveEventIds:directives,totalJournalEntries:entries.length,retrievableJournalEntries:visibleEntries.length,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'The verified journal remains append-only and complete. This view suppresses founder-authorized events from ordinary retrieval without claiming historical byte erasure.'};
}
