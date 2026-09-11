#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { readCognitiveJournal } from '../src/cognitive-event-journal.mjs';
import { readContextJournalRuntime, compileContextLayeredStoreDescriptor } from '../src/context-journal-runtime.mjs';
import { exportCognitiveJournalSegments } from './sovereign-context-segment-journal.mjs';

export const SOVEREIGN_CONTEXT_JOURNAL_MIGRATION_VERSION='sovereign-context-journal-migration-1.1.0';
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes,status='CONTEXT_JOURNAL_MIGRATION_REFUSED',extra={}){return{ok:false,migrationVersion:SOVEREIGN_CONTEXT_JOURNAL_MIGRATION_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function atomicJson(file,value){const tmp=`${file}.tmp.${process.pid}`;fs.writeFileSync(tmp,`${JSON.stringify(value,null,2)}\n`,{mode:0o600});const fd=fs.openSync(tmp,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);fs.chmodSync(file,0o600);}
function syncDir(dir){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}

export function migrateContextJournalToLayeredStore({journalPath,layeredStorePath=null,segmentSize=2048}={}){
  if(!journalPath)return fail(['journal-path-required']);
  const legacyPath=path.resolve(journalPath);const root=path.resolve(layeredStorePath||path.join(path.dirname(legacyPath),'journal-store'));
  if(fs.existsSync(root)){const existing=readContextJournalRuntime({journalPath:legacyPath,layeredStorePath:root});if(!existing.ok)return fail(['existing-layered-store-invalid',...(existing.reasonCodes||[])]);return{...existing,migrationVersion:SOVEREIGN_CONTEXT_JOURNAL_MIGRATION_VERSION,status:'CONTEXT_JOURNAL_LAYERED_ALREADY_ACTIVE'};}
  const legacy=readCognitiveJournal(legacyPath);if(!legacy.ok)return fail(['verified-legacy-journal-required',...(legacy.reasonCodes||[])]);
  fs.mkdirSync(path.dirname(root),{recursive:true,mode:0o700});const lock=`${legacyPath}.lock`;let lockFd;const stage=`${root}.stage.${process.pid}`;
  try{
    try{lockFd=fs.openSync(lock,'wx',0o600);}catch(error){if(error?.code==='EEXIST')return fail(['journal-writer-lock-held'],'CONTEXT_JOURNAL_MIGRATION_BUSY');throw error;}
    const recheck=readCognitiveJournal(legacyPath);if(!recheck.ok||recheck.entryCount!==legacy.entryCount||recheck.tipDigest!==legacy.tipDigest)return fail(['legacy-journal-changed-during-migration'],'CONTEXT_JOURNAL_MIGRATION_RACE_REFUSED');
    fs.rmSync(stage,{recursive:true,force:true});fs.mkdirSync(stage,{recursive:true,mode:0o700});
    const snapshot=exportCognitiveJournalSegments({journalPath:legacyPath,layeredStorePath:path.join(stage,'not-active'),outputRoot:path.join(stage,'archive'),segmentSize});if(!snapshot.ok)return fail(['archive-snapshot-export-failed',...(snapshot.reasonCodes||[])]);
    const descriptor=compileContextLayeredStoreDescriptor({archiveManifestId:snapshot.manifestId,archiveEntryCount:legacy.entryCount,archiveTipDigest:legacy.tipDigest,legacyJournalPath:legacyPath});
    atomicJson(path.join(stage,'store.json'),descriptor);fs.writeFileSync(path.join(stage,'tail.jsonl'),'',{mode:0o600});syncDir(stage);
    const staged=readContextJournalRuntime({journalPath:legacyPath,layeredStorePath:stage});if(!staged.ok||staged.entryCount!==legacy.entryCount||staged.tipDigest!==legacy.tipDigest)return fail(['staged-layered-store-verification-failed',...(staged.reasonCodes||[])],'CONTEXT_JOURNAL_MIGRATION_FAILED');
    fs.renameSync(stage,root);syncDir(path.dirname(root));
    const active=readContextJournalRuntime({journalPath:legacyPath,layeredStorePath:root});if(!active.ok||active.storageMode!=='LAYERED_ARCHIVE_TAIL'||active.entryCount!==legacy.entryCount||active.tipDigest!==legacy.tipDigest)return fail(['activated-layered-store-verification-failed'],'CONTEXT_JOURNAL_MIGRATION_FAILED');
    return{...active,migrationVersion:SOVEREIGN_CONTEXT_JOURNAL_MIGRATION_VERSION,status:'CONTEXT_JOURNAL_LAYERED_MIGRATION_VERIFIED',legacyJournalPath:legacyPath,legacyJournalPreserved:true,truthBoundary:'Migration holds the legacy journal writer lock for the complete cutover, atomically activates a verified immutable archive plus empty global tail, and leaves the original monolithic journal untouched as rollback evidence. It does not delete historical bytes.'};
  }finally{fs.rmSync(stage,{recursive:true,force:true});if(lockFd!=null){try{fs.closeSync(lockFd);}catch{}try{fs.unlinkSync(lock);}catch{}}}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const control=path.resolve(process.env.UBERBOND_CONTROL_DIR||'/var/lib/uberbond-control');const journal=process.env.UBERBOND_CONTEXT_JOURNAL_PATH||path.join(control,'context','events.jsonl');const result=migrateContextJournalToLayeredStore({journalPath:journal,layeredStorePath:process.env.UBERBOND_CONTEXT_LAYERED_STORE_PATH||null,segmentSize:Number(process.env.UBERBOND_CONTEXT_SEGMENT_SIZE||2048)});process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result.ok)process.exitCode=2;
}
