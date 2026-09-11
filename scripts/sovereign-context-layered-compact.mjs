#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { writeCognitiveJournalSegmentSnapshot } from '../src/cognitive-journal-segment-store.mjs';
import { compileContextJournalRuntimeState } from '../src/context-journal-runtime-state.mjs';
import { readConfiguredRuntimeCognitiveJournal, resolveConfiguredCognitiveJournalRuntime } from './sovereign-cognitive-journal-configured-runtime.mjs';
import { readRuntimeCognitiveJournal } from './sovereign-cognitive-journal-runtime.mjs';

export const SOVEREIGN_CONTEXT_LAYERED_COMPACT_VERSION='sovereign-context-layered-compact-1.0.0';
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes,status='CONTEXT_LAYERED_COMPACTION_REFUSED',extra={}){return{ok:false,compactionVersion:SOVEREIGN_CONTEXT_LAYERED_COMPACT_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function syncDir(dir){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function atomicJson(file,value){const tmp=`${file}.tmp.${process.pid}`;fs.writeFileSync(tmp,`${JSON.stringify(value,null,2)}\n`,{mode:0o600});const fd=fs.openSync(tmp,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);fs.chmodSync(file,0o600);}

export function compactLayeredContextJournal({journalPath,segmentSize=2048,activatedAt=new Date(),force=false}={}){
  if(!journalPath)return fail(['journal-path-required']);
  const resolved=resolveConfiguredCognitiveJournalRuntime({journalPath});if(!resolved.ok)return fail(['configured-runtime-required',...(resolved.reasonCodes||[])],'CONTEXT_LAYERED_COMPACTION_RUNTIME_REFUSED');
  if(!resolved.runtimeState||resolved.configurationSource!=='RUNTIME_STATE')return fail(['activated-layered-runtime-required'],'CONTEXT_LAYERED_COMPACTION_NOT_LAYERED');
  const oldState=resolved.runtimeState;const oldTail=resolved.tailPath;const contextDir=path.dirname(path.resolve(journalPath));const statePath=resolved.runtimeStatePath;
  const lockPath=`${oldTail}.lock`;let lock;
  try{
    try{lock=fs.openSync(lockPath,'wx',0o600);}catch(error){if(error?.code==='EEXIST')return fail(['current-generation-tail-lock-held'],'CONTEXT_LAYERED_COMPACTION_BUSY');throw error;}
    const current=readConfiguredRuntimeCognitiveJournal({journalPath});if(!current.ok)return fail(['verified-current-layered-journal-required',...(current.reasonCodes||[])]);
    if(current.runtimeStateId!==oldState.stateId)return fail(['runtime-state-changed-before-compaction'],'CONTEXT_LAYERED_COMPACTION_RACE_REFUSED');
    if(current.tailEntryCount===0&&force!==true)return{ok:true,compactionVersion:SOVEREIGN_CONTEXT_LAYERED_COMPACT_VERSION,status:'CONTEXT_LAYERED_COMPACTION_NOT_NEEDED',runtimeStateId:oldState.stateId,archiveManifestId:oldState.archiveManifestId,entryCount:current.entryCount,journalTipDigest:current.tipDigest,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
    const snapshot=writeCognitiveJournalSegmentSnapshot({entries:current.entries,outputRoot:path.join(contextDir,'segments'),segmentSize});if(!snapshot.ok)return fail(['new-immutable-archive-required',...(snapshot.reasonCodes||[])],'CONTEXT_LAYERED_COMPACTION_ARCHIVE_REFUSED');
    const stateCompiled=compileContextJournalRuntimeState({archiveManifestId:snapshot.manifestId,archiveEntryCount:snapshot.totalEntries,archiveTipDigest:snapshot.journalTipDigest,previousState:oldState,activatedAt});if(!stateCompiled.ok)return fail(['next-runtime-state-required',...(stateCompiled.reasonCodes||[])]);
    const next=stateCompiled.state;const newTail=path.join(contextDir,next.tailFile);
    if(fs.existsSync(newTail)){const st=fs.lstatSync(newTail);if(!st.isFile()||st.isSymbolicLink()||st.size!==0)return fail(['empty-next-generation-tail-required'],'CONTEXT_LAYERED_COMPACTION_TAIL_REFUSED');fs.chmodSync(newTail,0o600);}else{const fd=fs.openSync(newTail,'wx',0o600);fs.fsyncSync(fd);fs.closeSync(fd);}
    const candidate=readRuntimeCognitiveJournal({journalPath,archiveSnapshotPath:snapshot.snapshotPath,tailPath:newTail});if(!candidate.ok)return fail(['next-generation-verification-required',...(candidate.reasonCodes||[])],'CONTEXT_LAYERED_COMPACTION_CANDIDATE_REFUSED');
    if(candidate.entryCount!==current.entryCount||candidate.tipDigest!==current.tipDigest)return fail(['next-generation-identity-mismatch'],'CONTEXT_LAYERED_COMPACTION_CANDIDATE_REFUSED');
    atomicJson(statePath,next);syncDir(contextDir);
    const rebound=readConfiguredRuntimeCognitiveJournal({journalPath});if(!rebound.ok)return fail(['compacted-runtime-rebind-required',...(rebound.reasonCodes||[])],'CONTEXT_LAYERED_COMPACTION_REBIND_FAILED');
    if(rebound.runtimeStateId!==next.stateId||rebound.entryCount!==current.entryCount||rebound.tipDigest!==current.tipDigest)return fail(['compacted-runtime-rebind-identity-mismatch'],'CONTEXT_LAYERED_COMPACTION_REBIND_FAILED');
    return{ok:true,compactionVersion:SOVEREIGN_CONTEXT_LAYERED_COMPACT_VERSION,status:'CONTEXT_LAYERED_COMPACTION_ACTIVATED',previousStateId:oldState.stateId,runtimeStateId:next.stateId,runtimeGenerationId:next.generationId,previousArchiveManifestId:oldState.archiveManifestId,archiveManifestId:next.archiveManifestId,previousTailFile:oldState.tailFile,tailFile:next.tailFile,entryCount:rebound.entryCount,journalTipDigest:rebound.tipDigest,priorGenerationRetained:true,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'Compaction creates and activates a new immutable archive plus empty tail generation. Prior archive, prior tail, legacy journal, and prior runtime-state identity are not deleted or rewritten.'};
  }finally{if(lock!=null){try{fs.closeSync(lock);}catch{}try{fs.unlinkSync(lockPath);}catch{}}}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=compactLayeredContextJournal({journalPath:process.env.UBERBOND_CONTEXT_JOURNAL_PATH||process.argv[2]||null,segmentSize:Number(process.env.UBERBOND_CONTEXT_SEGMENT_SIZE||2048),force:process.argv.includes('--force')});process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result.ok)process.exitCode=2;
}
