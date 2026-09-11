import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { verifyCognitiveJournalEntries } from './cognitive-event-journal.mjs';
import { compileContextCognitiveEvent } from './sovereign-context-fabric.mjs';

export const CONTEXT_PRIVACY_POLICY_VERSION='context-privacy-1.0.0';
export const FOUNDER_CONTEXT_AUTH_SCHEMA='uberbond.founder-context-authorization.v1';
const EVENT_ID=/^brain_evt_[a-f0-9]{24}$/;
const SHA64=/^[a-f0-9]{64}$/;
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes,status='CONTEXT_PRIVACY_REFUSED',extra={}){return{ok:false,policyVersion:CONTEXT_PRIVACY_POLICY_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function authorizationIdFrom(event){
  const refs=Array.isArray(event?.evidenceRefs)?event.evidenceRefs:[];
  const matches=refs.map(ref=>/^founder-context-authorization:\/\/([a-f0-9]{64})$/.exec(String(ref))).filter(Boolean);
  return matches.length===1?matches[0][1]:null;
}
function suppressionTarget(event){
  if(event?.kind!=='MEMORY_UPDATE'||event?.sourceNodeId!=='context-spine'||event?.subjectType!=='COGNITIVE_EVENT_SUPPRESSION')return null;
  const target=String(event.subjectId||'');
  if(!EVENT_ID.test(target))return false;
  if(!Array.isArray(event.parentEventIds)||event.parentEventIds.length!==1||event.parentEventIds[0]!==target)return false;
  if(event.truthClass!=='FOUNDER_AUTHORIZED_PRIVACY_DIRECTIVE')return false;
  if(event.payloadRef!==null)return false;
  if(event.summary!==`Suppress ${target} from ordinary Context retrieval by founder authorization.`)return false;
  if(!authorizationIdFrom(event))return false;
  return target;
}

export function compileFounderContextSuppression({targetEventId,founderAuthorizationReceipt,observedAt=new Date()}={}){
  const target=String(targetEventId||'');
  const auth=founderAuthorizationReceipt;
  const reasons=[];
  if(!EVENT_ID.test(target))reasons.push('canonical-target-event-id-required');
  if(!auth||typeof auth!=='object'||Array.isArray(auth)||auth.schemaVersion!==FOUNDER_CONTEXT_AUTH_SCHEMA)reasons.push('founder-context-authorization-receipt-required');
  if(auth?.authorized!==true||auth?.action!=='SUPPRESS_COGNITIVE_EVENT'||auth?.targetEventId!==target)reasons.push('matching-founder-suppression-authorization-required');
  if(!SHA64.test(String(auth?.authorizationId||'')))reasons.push('founder-authorization-id-required');
  if(!Number.isFinite(Date.parse(String(auth?.issuedAt||''))))reasons.push('founder-authorization-time-required');
  if(reasons.length)return fail(reasons);
  const compiled=compileContextCognitiveEvent({
    kind:'MEMORY_UPDATE',sourceNodeId:'context-spine',subjectType:'COGNITIVE_EVENT_SUPPRESSION',subjectId:target,
    summary:`Suppress ${target} from ordinary Context retrieval by founder authorization.`,
    evidenceRefs:[`founder-context-authorization://${auth.authorizationId}`],payloadRef:null,
    truthClass:'FOUNDER_AUTHORIZED_PRIVACY_DIRECTIVE',observedAt,parentEventIds:[target]
  });
  if(!compiled.ok)return fail(['canonical-suppression-event-refused',...(compiled.reasonCodes||[])]);
  return{ok:true,policyVersion:CONTEXT_PRIVACY_POLICY_VERSION,status:'CONTEXT_PRIVACY_SUPPRESSION_READY',compiledEvent:compiled,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'SUPPRESSION CHANGES ORDINARY RETRIEVAL ONLY. IT DOES NOT REWRITE THE APPEND-ONLY JOURNAL OR CLAIM PHYSICAL DELETION FROM BACKUPS, REPLICAS, OR PRIOR EXPORTS.'};
}

export function applyContextPrivacyView(entries=[]){
  const verified=verifyCognitiveJournalEntries(entries);
  if(!verified.ok)return fail(['verified-cognitive-journal-required',...(verified.reasonCodes||[])],'CONTEXT_PRIVACY_JOURNAL_REFUSED');
  const seen=new Set();const suppressed=new Set();const directives=[];
  for(const entry of entries){
    const target=suppressionTarget(entry.event);
    if(target===false)return fail(['malformed-context-privacy-directive'],'CONTEXT_PRIVACY_DIRECTIVE_INVALID',{eventId:entry.eventId});
    if(typeof target==='string'){
      if(!seen.has(target))return fail(['suppression-target-must-precede-directive'],'CONTEXT_PRIVACY_DIRECTIVE_INVALID',{eventId:entry.eventId,targetEventId:target});
      suppressed.add(target);directives.push(entry.eventId);
    }
    seen.add(entry.eventId);
  }
  const visibleEntries=entries.filter(entry=>!suppressed.has(entry.eventId)&&!directives.includes(entry.eventId));
  return{ok:true,policyVersion:CONTEXT_PRIVACY_POLICY_VERSION,status:'CONTEXT_PRIVACY_VIEW_READY',visibleEntries,suppressedEventIds:[...suppressed],privacyDirectiveEventIds:directives,totalJournalEntries:entries.length,retrievableJournalEntries:visibleEntries.length,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'The verified journal remains append-only and complete. This view suppresses founder-authorized events from ordinary retrieval without claiming historical byte erasure.'};
}
