#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { compileCognitiveJournalSegments } from '../src/cognitive-journal-segments.mjs';
import { readContextJournalRuntime, compileContextLayeredGenerationDescriptor, contextLayeredRequiredPath, CONTEXT_LAYERED_REQUIRED_SENTINEL } from '../src/context-journal-runtime.mjs';
import { exportCognitiveJournalSegments } from './sovereign-context-segment-journal.mjs';

export const SOVEREIGN_CONTEXT_JOURNAL_COMPACTION_VERSION='sovereign-context-journal-compaction-1.1.0';
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes,status='CONTEXT_JOURNAL_COMPACTION_REFUSED',extra={}){return{ok:false,compactionVersion:SOVEREIGN_CONTEXT_JOURNAL_COMPACTION_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function readJson(file){try{const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>1024*1024)return null;const value=JSON.parse(fs.readFileSync(file,'utf8'));return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}}
function atomicJson(file,value){const tmp=`${file}.tmp.${process.pid}`;fs.writeFileSync(tmp,`${JSON.stringify(value,null,2)}\n`,{mode:0o600});const fd=fs.openSync(tmp,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);fs.chmodSync(file,0o600);}
function atomicText(file,value){const tmp=`${file}.tmp.${process.pid}`;fs.writeFileSync(tmp,value,{mode:0o600});const fd=fs.openSync(tmp,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);fs.chmodSync(file,0o600);}
function syncDir(dir){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function tailPathFor(root,descriptor){return descriptor?.generationId?path.join(root,'generations',descriptor.generationId,'tail.jsonl'):path.join(root,'tail.jsonl');}
function acquireLock(file){try{return{ok:true,fd:fs.openSync(file,'wx',0o600)}}catch(error){if(error?.code==='EEXIST')return{ok:false,busy:true};throw error;}}
function releaseLock(lock){if(!lock)return;try{fs.closeSync(lock.fd);}catch{}try{fs.unlinkSync(lock.file);}catch{}}
function preserveDescriptor(root,descriptor){if(!descriptor?.descriptorId)return false;const dir=path.join(root,'descriptors');fs.mkdirSync(dir,{recursive:true,mode:0o700});const file=path.join(dir,`${descriptor.descriptorId}.json`);if(fs.existsSync(file)){const existing=readJson(file);if(!existing||JSON.stringify(existing)!==JSON.stringify(descriptor))return false;}else atomicJson(file,descriptor);syncDir(dir);return true;}

export function compactContextJournalLayeredStore({journalPath,layeredStorePath=null,segmentSize=2048,activatedAt=new Date(),force=false}={}){
  if(!journalPath)return fail(['journal-path-required']);const legacy=path.resolve(journalPath);const root=path.resolve(layeredStorePath||path.join(path.dirname(legacy),'journal-store'));const descriptorPath=path.join(root,'store.json');
  if(!fs.existsSync(descriptorPath))return fail(['active-layered-store-required'],'CONTEXT_JOURNAL_COMPACTION_NOT_LAYERED');
  const before=readContextJournalRuntime({journalPath:legacy,layeredStorePath:root});if(!before.ok)return fail(['verified-active-layered-store-required',...(before.reasonCodes||[])]);if(before.tailEntryCount===0&&before.generationId&&force!==true)return{ok:true,compactionVersion:SOVEREIGN_CONTEXT_JOURNAL_COMPACTION_VERSION,status:'CONTEXT_JOURNAL_COMPACTION_NOT_NEEDED',descriptorId:before.descriptorId,generationId:before.generationId,entryCount:before.entryCount,tipDigest:before.tipDigest,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
  const oldDescriptor=readJson(descriptorPath);if(!oldDescriptor)return fail(['readable-current-store-descriptor-required']);const oldTail=tailPathFor(root,oldDescriptor);const oldLockPath=`${oldTail}.lock`;let oldLock=null;let newLock=null;
  try{
    const acquired=acquireLock(oldLockPath);if(!acquired.ok)return fail(['current-tail-writer-lock-held'],'CONTEXT_JOURNAL_COMPACTION_BUSY');oldLock={fd:acquired.fd,file:oldLockPath};
    const current=readContextJournalRuntime({journalPath:legacy,layeredStorePath:root});if(!current.ok||current.descriptorId!==before.descriptorId||current.entryCount!==before.entryCount||current.tipDigest!==before.tipDigest)return fail(['layered-store-changed-before-compaction'],'CONTEXT_JOURNAL_COMPACTION_RACE_REFUSED');
    if(!preserveDescriptor(root,oldDescriptor))return fail(['current-descriptor-history-conflict'],'CONTEXT_JOURNAL_COMPACTION_HISTORY_REFUSED');
    const planned=compileCognitiveJournalSegments(current.entries,{segmentSize});if(!planned.ok)return fail(['compaction-segment-plan-required',...(planned.reasonCodes||[])]);
    const next=compileContextLayeredGenerationDescriptor({archiveManifestId:planned.manifest.manifestId,archiveEntryCount:current.entryCount,archiveTipDigest:current.tipDigest,legacyJournalPath:legacy,previousDescriptorId:current.descriptorId,activatedAt});if(!next)return fail(['next-generation-descriptor-required']);
    if(!preserveDescriptor(root,next))return fail(['next-descriptor-history-conflict'],'CONTEXT_JOURNAL_COMPACTION_HISTORY_REFUSED');
    const generationRoot=path.join(root,'generations',next.generationId);if(fs.existsSync(generationRoot))return fail(['next-generation-must-not-preexist'],'CONTEXT_JOURNAL_COMPACTION_GENERATION_COLLISION');fs.mkdirSync(generationRoot,{recursive:true,mode:0o700});
    const snapshot=exportCognitiveJournalSegments({journalPath:legacy,layeredStorePath:root,outputRoot:path.join(generationRoot,'archive'),segmentSize});if(!snapshot.ok||snapshot.manifestId!==next.archiveManifestId)return fail(['next-generation-archive-required',...(snapshot.reasonCodes||[])]);
    const newTail=path.join(generationRoot,'tail.jsonl');const fd=fs.openSync(newTail,'wx',0o600);fs.fsyncSync(fd);fs.closeSync(fd);syncDir(generationRoot);
    const newLockPath=`${newTail}.lock`;const nextLock=acquireLock(newLockPath);if(!nextLock.ok)return fail(['next-generation-tail-lock-held'],'CONTEXT_JOURNAL_COMPACTION_BUSY');newLock={fd:nextLock.fd,file:newLockPath};
    const requiredPath=contextLayeredRequiredPath(legacy,root);if(!fs.existsSync(requiredPath)){atomicText(requiredPath,`${CONTEXT_LAYERED_REQUIRED_SENTINEL}\n`);syncDir(path.dirname(requiredPath));}
    atomicJson(descriptorPath,next);syncDir(root);
    const rebound=readContextJournalRuntime({journalPath:legacy,layeredStorePath:root});if(!rebound.ok||rebound.descriptorId!==next.descriptorId||rebound.entryCount!==current.entryCount||rebound.tipDigest!==current.tipDigest||rebound.tailEntryCount!==0){atomicJson(descriptorPath,oldDescriptor);syncDir(root);const restored=readContextJournalRuntime({journalPath:legacy,layeredStorePath:root});return fail(['next-generation-rebind-failed'],'CONTEXT_JOURNAL_COMPACTION_ROLLED_BACK',{rollbackVerified:restored.ok&&restored.descriptorId===current.descriptorId});}
    return{ok:true,compactionVersion:SOVEREIGN_CONTEXT_JOURNAL_COMPACTION_VERSION,status:'CONTEXT_JOURNAL_COMPACTION_VERIFIED',previousDescriptorId:current.descriptorId,descriptorId:next.descriptorId,generationId:next.generationId,archiveManifestId:next.archiveManifestId,previousDescriptorHistoryPath:path.join(root,'descriptors',`${oldDescriptor.descriptorId}.json`),descriptorHistoryPath:path.join(root,'descriptors',`${next.descriptorId}.json`),entryCount:rebound.entryCount,tipDigest:rebound.tipDigest,tailEntryCount:0,priorGenerationRetained:true,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'Compaction builds and verifies a new immutable generation, preserves exact old and new descriptor documents as immutable lineage, atomically flips only the descriptor pointer, and retains the prior archive, tail, legacy journal, and descriptor history. No historical bytes are deleted.'};
  }finally{releaseLock(newLock);releaseLock(oldLock);}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const control=path.resolve(process.env.UBERBOND_CONTROL_DIR||'/var/lib/uberbond-control');const journal=process.env.UBERBOND_CONTEXT_JOURNAL_PATH||path.join(control,'context','events.jsonl');const result=compactContextJournalLayeredStore({journalPath:journal,layeredStorePath:process.env.UBERBOND_CONTEXT_LAYERED_STORE_PATH||null,segmentSize:Number(process.env.UBERBOND_CONTEXT_SEGMENT_SIZE||2048),force:process.argv.includes('--force')});process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result.ok)process.exitCode=2;}
