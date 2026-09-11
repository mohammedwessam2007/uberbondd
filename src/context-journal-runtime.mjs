import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { readCognitiveJournal, appendCognitiveJournalEvent, compileCognitiveJournalEntry } from './cognitive-event-journal.mjs';
import { verifyCognitiveJournalSegments } from './cognitive-journal-segments.mjs';
import { verifyCognitiveJournalTail } from './cognitive-journal-layered-store.mjs';

export const CONTEXT_JOURNAL_RUNTIME_VERSION='context-journal-runtime-1.2.1';
export const CONTEXT_LAYERED_STORE_SCHEMA='uberbond.context-layered-journal-store.v1';
const MAX_JSON=128*1024*1024;
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');}
function descriptorPayload(value={}){const{descriptorId:_ignored,...rest}=value;return rest;}
function fail(reasonCodes,status='CONTEXT_JOURNAL_RUNTIME_REFUSED',extra={}){return{ok:false,runtimeVersion:CONTEXT_JOURNAL_RUNTIME_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function readJson(file){try{const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_JSON)return null;const out=JSON.parse(fs.readFileSync(file,'utf8'));return out&&typeof out==='object'&&!Array.isArray(out)?out:null;}catch{return null;}}
function readTail(file){if(!fs.existsSync(file))return null;try{const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_JSON)throw new Error('unsafe-tail-file');const raw=fs.readFileSync(file,'utf8');return raw.split('\n').filter(Boolean).map(line=>JSON.parse(line));}catch{return null;}}
function segmentName(row){return `segment-${String(row.segmentIndex).padStart(8,'0')}-${row.segmentDigest}.json`;}
function storeRoot(journalPath,layeredStorePath=null){return path.resolve(layeredStorePath||path.join(path.dirname(path.resolve(journalPath)),'journal-store'));}
function loadArchive(root,manifest){const segments=[];for(const row of manifest?.segments||[]){const value=readJson(path.join(root,'archive',manifest.manifestId,segmentName(row)));if(!value)throw new Error('archive-segment-read-failed');segments.push(value);}return segments;}
export function compileContextLayeredStoreDescriptor({archiveManifestId,archiveEntryCount,archiveTipDigest,legacyJournalPath=null}={}){const descriptor={schemaVersion:CONTEXT_LAYERED_STORE_SCHEMA,archiveManifestId,archiveEntryCount,archiveTipDigest,legacyJournalPath:legacyJournalPath?path.resolve(legacyJournalPath):null,tailFormat:'GLOBAL_COGNITIVE_JOURNAL_ENTRY_V1',consequenceAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'};descriptor.descriptorId=digest(descriptorPayload(descriptor));return descriptor;}
function verifyDescriptor(descriptor){if(!descriptor||descriptor.schemaVersion!==CONTEXT_LAYERED_STORE_SCHEMA)return false;if(!/^[a-f0-9]{64}$/.test(String(descriptor.descriptorId||''))||descriptor.descriptorId!==digest(descriptorPayload(descriptor)))return false;if(descriptor.consequenceAuthority!=='NONE'||descriptor.businessEffectAuthority!=='NONE'||descriptor.externalEffectAuthority!=='NONE')return false;if(descriptor.tailFormat!=='GLOBAL_COGNITIVE_JOURNAL_ENTRY_V1')return false;return true;}

export function readContextJournalRuntime({journalPath,layeredStorePath=null}={}){
  if(!journalPath)return fail(['journal-path-required'],'CONTEXT_JOURNAL_READ_REFUSED');const root=storeRoot(journalPath,layeredStorePath);const descriptorPath=path.join(root,'store.json');
  if(!fs.existsSync(descriptorPath)){const legacy=readCognitiveJournal(journalPath);return legacy.ok?{...legacy,runtimeVersion:CONTEXT_JOURNAL_RUNTIME_VERSION,storageMode:'LEGACY_JSONL',layeredStorePath:null}:legacy;}
  const descriptor=readJson(descriptorPath);if(!verifyDescriptor(descriptor))return fail(['canonical-layered-store-descriptor-required'],'CONTEXT_JOURNAL_LAYERED_INVALID');
  const manifest=readJson(path.join(root,'archive',descriptor.archiveManifestId,'manifest.json'));if(!manifest)return fail(['layered-archive-manifest-required'],'CONTEXT_JOURNAL_LAYERED_INVALID');
  let segments;try{segments=loadArchive(root,manifest);}catch{return fail(['layered-archive-segments-required'],'CONTEXT_JOURNAL_LAYERED_INVALID');}
  const archive=verifyCognitiveJournalSegments({manifest,segments});if(!archive.ok)return fail(['layered-archive-invalid',...(archive.reasonCodes||[])],'CONTEXT_JOURNAL_LAYERED_INVALID');
  if(archive.manifestId!==descriptor.archiveManifestId||archive.totalEntries!==descriptor.archiveEntryCount||archive.journalTipDigest!==descriptor.archiveTipDigest)return fail(['layered-store-archive-binding-mismatch'],'CONTEXT_JOURNAL_LAYERED_INVALID');
  const tailEntries=readTail(path.join(root,'tail.jsonl'));if(tailEntries===null)return fail(['layered-tail-read-failed'],'CONTEXT_JOURNAL_LAYERED_INVALID');
  const checked=verifyCognitiveJournalTail({archiveEntryCount:archive.totalEntries,archiveTipDigest:archive.journalTipDigest,tailEntries});if(!checked.ok)return fail(['layered-tail-anchor-invalid',...(checked.reasonCodes||[])],'CONTEXT_JOURNAL_LAYERED_INVALID');
  const entries=[...archive.entries,...tailEntries];return{ok:true,runtimeVersion:CONTEXT_JOURNAL_RUNTIME_VERSION,status:'CONTEXT_JOURNAL_READ',storageMode:'LAYERED_ARCHIVE_TAIL',path:root,descriptorId:descriptor.descriptorId,entries,entryCount:entries.length,tipDigest:checked.tipDigest,eventIds:entries.map(x=>x.eventId),archiveEntryCount:archive.totalEntries,tailEntryCount:tailEntries.length,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}

export function appendContextJournalRuntime({journalPath,layeredStorePath=null,compiledEvent}={}){
  if(!journalPath)return fail(['journal-path-required']);const root=storeRoot(journalPath,layeredStorePath);const descriptorPath=path.join(root,'store.json');if(!fs.existsSync(descriptorPath))return appendCognitiveJournalEvent({journalPath,compiledEvent});
  const current=readContextJournalRuntime({journalPath,layeredStorePath:root});if(!current.ok)return current;const descriptor=readJson(descriptorPath);const tailPath=path.join(root,'tail.jsonl');const global=compileCognitiveJournalEntry({compiledEvent,sequence:current.entryCount+1,previousEntryDigest:current.tipDigest});if(!global.ok)return global;
  fs.mkdirSync(root,{recursive:true,mode:0o700});const lock=`${tailPath}.lock`;let handle;
  try{try{handle=fs.openSync(lock,'wx',0o600);}catch(error){if(error?.code==='EEXIST')return fail(['journal-writer-lock-held'],'COGNITIVE_JOURNAL_BUSY');throw error;}const check=readContextJournalRuntime({journalPath,layeredStorePath:root});if(!check.ok||check.entryCount!==current.entryCount||check.tipDigest!==current.tipDigest||check.descriptorId!==descriptor.descriptorId)return fail(['layered-journal-changed-during-append'],'CONTEXT_JOURNAL_RACE_REFUSED');const fd=fs.openSync(tailPath,'a',0o600);try{fs.writeSync(fd,`${JSON.stringify(global.entry)}\n`,null,'utf8');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.chmodSync(tailPath,0o600);return{ok:true,runtimeVersion:CONTEXT_JOURNAL_RUNTIME_VERSION,status:'COGNITIVE_EVENT_JOURNALED',storageMode:'LAYERED_ARCHIVE_TAIL',path:tailPath,sequence:global.entry.sequence,eventId:global.entry.eventId,entryDigest:global.entry.entryDigest,previousEntryDigest:global.entry.previousEntryDigest,archiveEntryCount:descriptor.archiveEntryCount,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};}
  finally{if(handle!=null){try{fs.closeSync(handle);}catch{}try{fs.unlinkSync(lock);}catch{}}}
}
