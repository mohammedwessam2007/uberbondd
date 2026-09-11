import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileCognitiveJournalEntry } from './cognitive-event-journal.mjs';
import { verifyCognitiveJournalSegments } from './cognitive-journal-segments.mjs';

export const COGNITIVE_JOURNAL_LAYERED_POLICY_VERSION='cognitive-journal-layered-store-1.0.0';
export const COGNITIVE_JOURNAL_LAYERED_SCHEMA='uberbond.cognitive-journal-layered-store.v1';
const SHA64=/^[a-f0-9]{64}$/;
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
function fail(reasonCodes,status='COGNITIVE_JOURNAL_LAYERED_REFUSED',extra={}){return{ok:false,policyVersion:COGNITIVE_JOURNAL_LAYERED_POLICY_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}

export function verifyCognitiveJournalTail({archiveEntryCount=0,archiveTipDigest=null,tailEntries=[]}={}){
  const count=Number(archiveEntryCount);if(!Number.isSafeInteger(count)||count<0)return fail(['valid-archive-entry-count-required'],'COGNITIVE_JOURNAL_TAIL_INVALID');
  if((count===0&&archiveTipDigest!==null)||(count>0&&!SHA64.test(String(archiveTipDigest||''))))return fail(['archive-tip-anchor-invalid'],'COGNITIVE_JOURNAL_TAIL_INVALID');
  if(!Array.isArray(tailEntries)||tailEntries.length>1_000_000)return fail(['bounded-tail-entry-list-required'],'COGNITIVE_JOURNAL_TAIL_INVALID');
  let previous=archiveTipDigest;
  for(let i=0;i<tailEntries.length;i+=1){
    const entry=tailEntries[i];const sequence=count+i+1;
    if(!entry||typeof entry!=='object'||Array.isArray(entry))return fail(['tail-entry-object-required'],'COGNITIVE_JOURNAL_TAIL_INVALID',{index:i});
    const compiled=compileCognitiveJournalEntry({compiledEvent:{ok:true,status:'COGNITIVE_EVENT_READY',eventId:entry.eventId,event:entry.event},sequence,previousEntryDigest:previous});
    if(!compiled.ok)return fail(['tail-entry-canonical-recompile-failed',...(compiled.reasonCodes||[])],'COGNITIVE_JOURNAL_TAIL_INVALID',{index:i});
    if(compiled.entry.entryDigest!==entry.entryDigest||entry.sequence!==sequence||entry.previousEntryDigest!==previous)return fail(['tail-entry-chain-or-digest-mismatch'],'COGNITIVE_JOURNAL_TAIL_INVALID',{index:i});
    previous=entry.entryDigest;
  }
  return{ok:true,policyVersion:COGNITIVE_JOURNAL_LAYERED_POLICY_VERSION,status:'COGNITIVE_JOURNAL_TAIL_VERIFIED',archiveEntryCount:count,tailEntryCount:tailEntries.length,totalEntries:count+tailEntries.length,tipDigest:previous,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}

export function compileLayeredCognitiveJournalStore({manifest,segments,tailEntries=[]}={}){
  const archive=verifyCognitiveJournalSegments({manifest,segments});if(!archive.ok)return fail(['verified-archive-segments-required',...(archive.reasonCodes||[])]);
  const tail=verifyCognitiveJournalTail({archiveEntryCount:archive.totalEntries,archiveTipDigest:archive.journalTipDigest,tailEntries});if(!tail.ok)return tail;
  const tailDigest=digest(tailEntries.map(entry=>entry.entryDigest));
  const descriptor={schemaVersion:COGNITIVE_JOURNAL_LAYERED_SCHEMA,archiveManifestId:manifest.manifestId,archiveEntryCount:archive.totalEntries,archiveTipDigest:archive.journalTipDigest,tailEntryCount:tail.tailEntryCount,tailEntriesDigest:tailDigest,totalEntries:tail.totalEntries,journalTipDigest:tail.tipDigest,consequenceAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};
  descriptor.storeId=digest(descriptor);
  return{ok:true,policyVersion:COGNITIVE_JOURNAL_LAYERED_POLICY_VERSION,status:'COGNITIVE_JOURNAL_LAYERED_STORE_READY',descriptor,tailEntries,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'Archived segments are immutable. New events may extend only the verified tail anchored to the archived journal tip. This contract does not itself delete or truncate the original active journal.'};
}
