import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { verifyCognitiveJournalEntries } from './cognitive-event-journal.mjs';

export const COGNITIVE_JOURNAL_SEGMENT_POLICY_VERSION='cognitive-journal-segments-1.0.0';
export const COGNITIVE_JOURNAL_SEGMENT_SCHEMA='uberbond.cognitive-journal-segment.v1';
export const COGNITIVE_JOURNAL_MANIFEST_SCHEMA='uberbond.cognitive-journal-manifest.v1';
const SHA64=/^[a-f0-9]{64}$/;
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
function fail(reasonCodes,status='COGNITIVE_JOURNAL_SEGMENT_REFUSED',extra={}){return{ok:false,policyVersion:COGNITIVE_JOURNAL_SEGMENT_POLICY_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function segmentPayload(segment={}){const{segmentDigest:_ignored,entries:_entries,...rest}=segment;return rest;}
function manifestPayload(manifest={}){const{manifestId:_ignored,...rest}=manifest;return rest;}

export function compileCognitiveJournalSegments(entries=[], {segmentSize=2048}={}){
  const verified=verifyCognitiveJournalEntries(entries);if(!verified.ok)return fail(['verified-cognitive-journal-required',...(verified.reasonCodes||[])]);
  const size=Number(segmentSize);if(!Number.isSafeInteger(size)||size<1||size>50000)return fail(['valid-segment-size-required']);
  const segments=[];let previousSegmentDigest=null;
  for(let offset=0;offset<entries.length;offset+=size){
    const slice=entries.slice(offset,offset+size);
    const first=slice[0];const last=slice.at(-1);
    const entryDigests=slice.map(entry=>entry.entryDigest);
    const descriptor={schemaVersion:COGNITIVE_JOURNAL_SEGMENT_SCHEMA,segmentIndex:segments.length+1,startSequence:first.sequence,endSequence:last.sequence,entryCount:slice.length,previousSegmentDigest,firstEntryDigest:first.entryDigest,lastEntryDigest:last.entryDigest,entriesDigest:digest(entryDigests)};
    descriptor.segmentDigest=digest(segmentPayload(descriptor));
    segments.push({...descriptor,entries:slice});previousSegmentDigest=descriptor.segmentDigest;
  }
  const descriptors=segments.map(({entries:_entries,...descriptor})=>descriptor);
  const manifest={schemaVersion:COGNITIVE_JOURNAL_MANIFEST_SCHEMA,segmentSize:size,totalEntries:entries.length,segmentCount:segments.length,journalTipDigest:verified.tipDigest,lastSegmentDigest:previousSegmentDigest,segments:descriptors};
  manifest.manifestId=digest(manifestPayload(manifest));
  return{ok:true,policyVersion:COGNITIVE_JOURNAL_SEGMENT_POLICY_VERSION,status:'COGNITIVE_JOURNAL_SEGMENTS_COMPILED',manifest,segments,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}

export function verifyCognitiveJournalSegments({manifest,segments}={}){
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||manifest.schemaVersion!==COGNITIVE_JOURNAL_MANIFEST_SCHEMA)return fail(['canonical-journal-manifest-required'],'COGNITIVE_JOURNAL_SEGMENTS_INVALID');
  if(!Array.isArray(segments)||segments.length!==manifest.segmentCount||!Array.isArray(manifest.segments)||manifest.segments.length!==segments.length)return fail(['manifest-segment-count-mismatch'],'COGNITIVE_JOURNAL_SEGMENTS_INVALID');
  if(!SHA64.test(String(manifest.manifestId||''))||manifest.manifestId!==digest(manifestPayload(manifest)))return fail(['journal-manifest-digest-mismatch'],'COGNITIVE_JOURNAL_SEGMENTS_INVALID');
  const entries=[];let previousSegmentDigest=null;
  for(let i=0;i<segments.length;i+=1){
    const segment=segments[i];const descriptor=manifest.segments[i];
    if(!segment||typeof segment!=='object'||Array.isArray(segment)||segment.schemaVersion!==COGNITIVE_JOURNAL_SEGMENT_SCHEMA)return fail(['canonical-journal-segment-required'],'COGNITIVE_JOURNAL_SEGMENTS_INVALID',{segmentIndex:i+1});
    if(segment.segmentIndex!==i+1||descriptor.segmentIndex!==i+1||segment.previousSegmentDigest!==previousSegmentDigest||descriptor.previousSegmentDigest!==previousSegmentDigest)return fail(['journal-segment-chain-broken'],'COGNITIVE_JOURNAL_SEGMENTS_INVALID',{segmentIndex:i+1});
    if(!Array.isArray(segment.entries)||segment.entries.length!==segment.entryCount||segment.entryCount!==descriptor.entryCount)return fail(['journal-segment-entry-count-mismatch'],'COGNITIVE_JOURNAL_SEGMENTS_INVALID',{segmentIndex:i+1});
    const entryDigests=segment.entries.map(entry=>entry.entryDigest);
    if(segment.entriesDigest!==digest(entryDigests)||descriptor.entriesDigest!==segment.entriesDigest)return fail(['journal-segment-entries-digest-mismatch'],'COGNITIVE_JOURNAL_SEGMENTS_INVALID',{segmentIndex:i+1});
    const withoutEntries={...segment};delete withoutEntries.entries;
    if(!SHA64.test(String(segment.segmentDigest||''))||segment.segmentDigest!==digest(segmentPayload(segment))||digest(withoutEntries)!==digest(descriptor))return fail(['journal-segment-descriptor-mismatch'],'COGNITIVE_JOURNAL_SEGMENTS_INVALID',{segmentIndex:i+1});
    entries.push(...segment.entries);previousSegmentDigest=segment.segmentDigest;
  }
  const verified=verifyCognitiveJournalEntries(entries);if(!verified.ok)return fail(['reconstructed-journal-invalid',...(verified.reasonCodes||[])],'COGNITIVE_JOURNAL_SEGMENTS_INVALID');
  if(entries.length!==manifest.totalEntries||verified.tipDigest!==manifest.journalTipDigest||previousSegmentDigest!==manifest.lastSegmentDigest)return fail(['journal-manifest-tip-or-count-mismatch'],'COGNITIVE_JOURNAL_SEGMENTS_INVALID');
  return{ok:true,policyVersion:COGNITIVE_JOURNAL_SEGMENT_POLICY_VERSION,status:'COGNITIVE_JOURNAL_SEGMENTS_VERIFIED',manifestId:manifest.manifestId,totalEntries:entries.length,segmentCount:segments.length,journalTipDigest:verified.tipDigest,entries,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}
