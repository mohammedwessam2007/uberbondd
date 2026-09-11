#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { readCognitiveJournal } from '../src/cognitive-event-journal.mjs';
import { writeCognitiveJournalSegmentSnapshot } from '../src/cognitive-journal-segment-store.mjs';
import { compileContextJournalRuntimeState } from '../src/context-journal-runtime-state.mjs';
import { LAYERED_REQUIRED_SENTINEL, readConfiguredRuntimeCognitiveJournal } from './sovereign-cognitive-journal-configured-runtime.mjs';
import { readRuntimeCognitiveJournal } from './sovereign-cognitive-journal-runtime.mjs';

export const SOVEREIGN_CONTEXT_LAYERED_MIGRATE_VERSION='sovereign-context-layered-migrate-1.0.0';
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes,status='CONTEXT_LAYERED_MIGRATION_REFUSED',extra={}){return{ok:false,migrationVersion:SOVEREIGN_CONTEXT_LAYERED_MIGRATE_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function syncDir(dir){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function atomicText(file,text,mode=0o600){const tmp=`${file}.tmp.${process.pid}`;fs.writeFileSync(tmp,text,{mode});const fd=fs.openSync(tmp,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);fs.chmodSync(file,mode);}
function atomicJson(file,value){atomicText(file,`${JSON.stringify(value,null,2)}\n`);}
function safeSentinel(file){try{const st=fs.lstatSync(file);return st.isFile()&&!st.isSymbolicLink()&&st.size<=1024&&fs.readFileSync(file,'utf8').trim()===LAYERED_REQUIRED_SENTINEL;}catch{return false;}}

export function migrateContextJournalToLayered({journalPath,segmentSize=2048,activatedAt=new Date()}={}){
  if(!journalPath)return fail(['journal-path-required']);
  const journal=path.resolve(journalPath);const contextDir=path.dirname(journal);fs.mkdirSync(contextDir,{recursive:true,mode:0o700});
  const statePath=path.join(contextDir,'journal-runtime.json');const sentinelPath=path.join(contextDir,'layered-required');const lockPath=`${journal}.lock`;
  if(fs.existsSync(statePath)){
    const current=readConfiguredRuntimeCognitiveJournal({journalPath:journal});
    if(!current.ok)return fail(['existing-layered-runtime-invalid',...(current.reasonCodes||[])],'CONTEXT_LAYERED_MIGRATION_EXISTING_STATE_REFUSED');
    return{ok:true,migrationVersion:SOVEREIGN_CONTEXT_LAYERED_MIGRATE_VERSION,status:'CONTEXT_LAYERED_MIGRATION_ALREADY_ACTIVE',runtimeStateId:current.runtimeStateId,runtimeGenerationId:current.runtimeGenerationId,archiveManifestId:current.archiveManifestId,entryCount:current.entryCount,journalTipDigest:current.tipDigest,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
  }
  if(fs.existsSync(sentinelPath)&&!safeSentinel(sentinelPath))return fail(['valid-layered-required-sentinel-required'],'CONTEXT_LAYERED_MIGRATION_SENTINEL_REFUSED');
  let lock;
  try{
    try{lock=fs.openSync(lockPath,'wx',0o600);}catch(error){if(error?.code==='EEXIST')return fail(['legacy-journal-writer-lock-held'],'CONTEXT_LAYERED_MIGRATION_BUSY');throw error;}
    const legacy=readCognitiveJournal(journal);if(!legacy.ok)return fail(['verified-legacy-journal-required',...(legacy.reasonCodes||[])],'CONTEXT_LAYERED_MIGRATION_LEGACY_REFUSED');
    if(legacy.entryCount<1)return fail(['nonempty-legacy-journal-required'],'CONTEXT_LAYERED_MIGRATION_NOT_NEEDED');
    const snapshot=writeCognitiveJournalSegmentSnapshot({entries:legacy.entries,outputRoot:path.join(contextDir,'segments'),segmentSize});if(!snapshot.ok)return fail(['immutable-archive-snapshot-required',...(snapshot.reasonCodes||[])],'CONTEXT_LAYERED_MIGRATION_ARCHIVE_REFUSED');
    const stateCompiled=compileContextJournalRuntimeState({archiveManifestId:snapshot.manifestId,archiveEntryCount:snapshot.totalEntries,archiveTipDigest:snapshot.journalTipDigest,activatedAt});if(!stateCompiled.ok)return fail(['runtime-state-compile-required',...(stateCompiled.reasonCodes||[])]);
    const state=stateCompiled.state;const tailPath=path.join(contextDir,state.tailFile);
    if(fs.existsSync(tailPath)){const st=fs.lstatSync(tailPath);if(!st.isFile()||st.isSymbolicLink()||st.size!==0)return fail(['empty-existing-generation-tail-required'],'CONTEXT_LAYERED_MIGRATION_TAIL_REFUSED');fs.chmodSync(tailPath,0o600);}else{const fd=fs.openSync(tailPath,'wx',0o600);fs.fsyncSync(fd);fs.closeSync(fd);}
    const candidate=readRuntimeCognitiveJournal({journalPath:journal,archiveSnapshotPath:snapshot.snapshotPath,tailPath});if(!candidate.ok)return fail(['candidate-layered-runtime-verification-required',...(candidate.reasonCodes||[])],'CONTEXT_LAYERED_MIGRATION_CANDIDATE_REFUSED');
    if(candidate.entryCount!==legacy.entryCount||candidate.tipDigest!==legacy.tipDigest)return fail(['candidate-layered-runtime-identity-mismatch'],'CONTEXT_LAYERED_MIGRATION_CANDIDATE_REFUSED');
    if(!fs.existsSync(sentinelPath))atomicText(sentinelPath,`${LAYERED_REQUIRED_SENTINEL}\n`);syncDir(contextDir);
    atomicJson(statePath,state);syncDir(contextDir);
    const rebound=readConfiguredRuntimeCognitiveJournal({journalPath:journal});if(!rebound.ok)return fail(['activated-layered-runtime-verification-required',...(rebound.reasonCodes||[])],'CONTEXT_LAYERED_MIGRATION_ACTIVATION_FAILED');
    if(rebound.entryCount!==legacy.entryCount||rebound.tipDigest!==legacy.tipDigest||rebound.runtimeStateId!==state.stateId)return fail(['activated-layered-runtime-identity-mismatch'],'CONTEXT_LAYERED_MIGRATION_ACTIVATION_FAILED');
    return{ok:true,migrationVersion:SOVEREIGN_CONTEXT_LAYERED_MIGRATE_VERSION,status:'CONTEXT_LAYERED_MIGRATION_ACTIVATED',runtimeStateId:state.stateId,runtimeGenerationId:state.generationId,archiveManifestId:state.archiveManifestId,archiveEntryCount:state.archiveEntryCount,tailFile:state.tailFile,entryCount:rebound.entryCount,journalTipDigest:rebound.tipDigest,legacyJournalRetained:true,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'The verified legacy journal remains retained and unchanged. The layered-required sentinel prevents silent downgrade if runtime state is lost. No archive, prior generation, backup, or source history is deleted.'};
  }finally{if(lock!=null){try{fs.closeSync(lock);}catch{}try{fs.unlinkSync(lockPath);}catch{}}}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const journalPath=process.env.UBERBOND_CONTEXT_JOURNAL_PATH||process.argv[2]||null;const result=migrateContextJournalToLayered({journalPath,segmentSize:Number(process.env.UBERBOND_CONTEXT_SEGMENT_SIZE||2048)});process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result.ok)process.exitCode=2;
}
