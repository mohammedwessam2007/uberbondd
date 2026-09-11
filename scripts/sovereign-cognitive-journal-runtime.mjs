#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import {
  appendCognitiveJournalEvent,
  compileCognitiveJournalEntry,
  readCognitiveJournal,
  verifyCognitiveJournalEntries
} from '../src/cognitive-event-journal.mjs';
import { verifyCognitiveJournalTail } from '../src/cognitive-journal-layered-store.mjs';
import { verifyCognitiveJournalSegmentSnapshot } from './sovereign-context-segment-journal.mjs';

export const SOVEREIGN_COGNITIVE_JOURNAL_RUNTIME_VERSION='sovereign-cognitive-journal-runtime-1.0.0';
const MAX_TAIL_BYTES=128*1024*1024;
const MAX_TAIL_ENTRIES=1_000_000;
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes,status='COGNITIVE_JOURNAL_RUNTIME_REFUSED',extra={}){return{ok:false,runtimeVersion:SOVEREIGN_COGNITIVE_JOURNAL_RUNTIME_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function syncDirectory(directory){let fd;try{fd=fs.openSync(directory,'r');fs.fsyncSync(fd);}finally{if(fd!=null)fs.closeSync(fd);}}
function readTailFile(tailPath){
  const absolute=path.resolve(String(tailPath||''));
  if(!tailPath)return fail(['layered-tail-path-required'],'COGNITIVE_JOURNAL_RUNTIME_TAIL_REFUSED');
  if(!fs.existsSync(absolute))return{ok:true,entries:[],path:absolute};
  const stat=fs.lstatSync(absolute);
  if(!stat.isFile()||stat.isSymbolicLink())return fail(['regular-nonsymlink-layered-tail-required'],'COGNITIVE_JOURNAL_RUNTIME_TAIL_REFUSED');
  if(stat.size>MAX_TAIL_BYTES)return fail(['layered-tail-size-limit-exceeded'],'COGNITIVE_JOURNAL_RUNTIME_TAIL_REFUSED');
  const lines=fs.readFileSync(absolute,'utf8').split('\n').filter(Boolean);
  if(lines.length>MAX_TAIL_ENTRIES)return fail(['layered-tail-entry-limit-exceeded'],'COGNITIVE_JOURNAL_RUNTIME_TAIL_REFUSED');
  const entries=[];try{for(const line of lines)entries.push(JSON.parse(line));}catch{return fail(['layered-tail-jsonl-parse-failed'],'COGNITIVE_JOURNAL_RUNTIME_TAIL_REFUSED');}
  return{ok:true,entries,path:absolute};
}

export function readRuntimeCognitiveJournal({journalPath,archiveSnapshotPath=null,tailPath=null}={}){
  if(!archiveSnapshotPath){
    const legacy=readCognitiveJournal(journalPath);
    if(!legacy.ok)return legacy;
    return{...legacy,runtimeVersion:SOVEREIGN_COGNITIVE_JOURNAL_RUNTIME_VERSION,runtimeMode:'LEGACY_JSONL',archiveManifestId:null,archiveEntryCount:0,tailEntryCount:legacy.entryCount};
  }
  if(!tailPath)return fail(['layered-tail-path-required'],'COGNITIVE_JOURNAL_RUNTIME_CONFIGURATION_REFUSED');
  const archive=verifyCognitiveJournalSegmentSnapshot(archiveSnapshotPath);
  if(!archive.ok)return fail(['verified-layered-archive-required',...(archive.reasonCodes||[])],'COGNITIVE_JOURNAL_RUNTIME_ARCHIVE_REFUSED');
  const tailFile=readTailFile(tailPath);if(!tailFile.ok)return tailFile;
  const tail=verifyCognitiveJournalTail({archiveEntryCount:archive.totalEntries,archiveTipDigest:archive.journalTipDigest,tailEntries:tailFile.entries});
  if(!tail.ok)return fail(['verified-layered-tail-required',...(tail.reasonCodes||[])],'COGNITIVE_JOURNAL_RUNTIME_TAIL_REFUSED');
  const entries=[...archive.entries,...tailFile.entries];
  const complete=verifyCognitiveJournalEntries(entries);
  if(!complete.ok)return fail(['reconstructed-layered-journal-invalid',...(complete.reasonCodes||[])],'COGNITIVE_JOURNAL_RUNTIME_LAYERED_INVALID');
  return{...complete,runtimeVersion:SOVEREIGN_COGNITIVE_JOURNAL_RUNTIME_VERSION,status:'COGNITIVE_JOURNAL_RUNTIME_READ',runtimeMode:'ARCHIVE_PLUS_TAIL',path:tailFile.path,entries,archiveManifestId:archive.manifestId,archiveEntryCount:archive.totalEntries,tailEntryCount:tail.tailEntryCount};
}

export function appendRuntimeCognitiveJournalEvent({journalPath,archiveSnapshotPath=null,tailPath=null,compiledEvent}={}){
  if(!archiveSnapshotPath)return appendCognitiveJournalEvent({journalPath,compiledEvent});
  if(!tailPath)return fail(['layered-tail-path-required'],'COGNITIVE_JOURNAL_RUNTIME_CONFIGURATION_REFUSED');
  const absolute=path.resolve(tailPath);const directory=path.dirname(absolute);fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const lockPath=`${absolute}.lock`;let lockHandle;
  try{
    try{lockHandle=fs.openSync(lockPath,'wx',0o600);}catch(error){if(error?.code==='EEXIST')return fail(['layered-tail-writer-lock-held'],'COGNITIVE_JOURNAL_RUNTIME_BUSY');throw error;}
    const current=readRuntimeCognitiveJournal({journalPath,archiveSnapshotPath,tailPath:absolute});if(!current.ok)return current;
    if(current.entries.some(entry=>entry.eventId===compiledEvent?.eventId))return fail(['duplicate-cognitive-event'],'COGNITIVE_JOURNAL_RUNTIME_DUPLICATE',{eventId:compiledEvent?.eventId||null});
    const compiled=compileCognitiveJournalEntry({compiledEvent,sequence:current.entryCount+1,previousEntryDigest:current.tipDigest});if(!compiled.ok)return compiled;
    if(fs.existsSync(absolute)){const stat=fs.lstatSync(absolute);if(!stat.isFile()||stat.isSymbolicLink())return fail(['regular-nonsymlink-layered-tail-required']);}
    const handle=fs.openSync(absolute,'a',0o600);try{fs.writeSync(handle,`${JSON.stringify(compiled.entry)}\n`,null,'utf8');fs.fsyncSync(handle);}finally{fs.closeSync(handle);}fs.chmodSync(absolute,0o600);syncDirectory(directory);
    const rebound=readRuntimeCognitiveJournal({journalPath,archiveSnapshotPath,tailPath:absolute});
    if(!rebound.ok||rebound.tipDigest!==compiled.entry.entryDigest||rebound.entryCount!==compiled.entry.sequence)return fail(['layered-tail-post-append-verification-failed'],'COGNITIVE_JOURNAL_RUNTIME_APPEND_FAILED');
    return{ok:true,runtimeVersion:SOVEREIGN_COGNITIVE_JOURNAL_RUNTIME_VERSION,status:'COGNITIVE_EVENT_JOURNALED_LAYERED',runtimeMode:'ARCHIVE_PLUS_TAIL',path:absolute,sequence:compiled.entry.sequence,eventId:compiled.entry.eventId,entryDigest:compiled.entry.entryDigest,previousEntryDigest:compiled.entry.previousEntryDigest,archiveManifestId:rebound.archiveManifestId,archiveEntryCount:rebound.archiveEntryCount,tailEntryCount:rebound.tailEntryCount,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
  }finally{if(lockHandle!=null){try{fs.closeSync(lockHandle);}catch{}try{fs.unlinkSync(lockPath);}catch{}}}
}
