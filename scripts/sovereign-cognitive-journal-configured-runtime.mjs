#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { verifyContextJournalRuntimeState } from '../src/context-journal-runtime-state.mjs';
import { verifyCognitiveJournalSegmentSnapshot } from '../src/cognitive-journal-segment-store.mjs';
import { appendRuntimeCognitiveJournalEvent, readRuntimeCognitiveJournal } from './sovereign-cognitive-journal-runtime.mjs';

export const SOVEREIGN_CONFIGURED_COGNITIVE_JOURNAL_RUNTIME_VERSION='sovereign-configured-cognitive-journal-runtime-1.0.0';
export const LAYERED_REQUIRED_SENTINEL='UBERBOND_CONTEXT_LAYERED_REQUIRED_V1';
const MAX_STATE_BYTES=128*1024;
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes,status='CONFIGURED_COGNITIVE_JOURNAL_RUNTIME_REFUSED',extra={}){return{ok:false,runtimeVersion:SOVEREIGN_CONFIGURED_COGNITIVE_JOURNAL_RUNTIME_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function regularFile(file,max=MAX_STATE_BYTES){try{const st=fs.lstatSync(file);return st.isFile()&&!st.isSymbolicLink()&&st.size<=max;}catch{return false;}}
function safeState(file){if(!regularFile(file))return null;try{const value=JSON.parse(fs.readFileSync(file,'utf8'));return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}}
function safeSentinel(file){if(!regularFile(file,1024))return false;return fs.readFileSync(file,'utf8').trim()===LAYERED_REQUIRED_SENTINEL;}

export function resolveConfiguredCognitiveJournalRuntime({journalPath,archiveSnapshotPath=null,tailPath=null}={}){
  if(!journalPath)return fail(['journal-path-required']);
  if(archiveSnapshotPath||tailPath){if(!archiveSnapshotPath||!tailPath)return fail(['archive-and-tail-must-be-configured-together'],'CONFIGURED_COGNITIVE_JOURNAL_RUNTIME_INVALID');return{ok:true,runtimeVersion:SOVEREIGN_CONFIGURED_COGNITIVE_JOURNAL_RUNTIME_VERSION,status:'COGNITIVE_JOURNAL_RUNTIME_EXPLICIT_LAYERED',journalPath:path.resolve(journalPath),archiveSnapshotPath:path.resolve(archiveSnapshotPath),tailPath:path.resolve(tailPath),runtimeState:null,runtimeStatePath:null,configurationSource:'EXPLICIT'};}
  const journal=path.resolve(journalPath);const contextDir=path.dirname(journal);const statePath=path.join(contextDir,'journal-runtime.json');const sentinelPath=path.join(contextDir,'layered-required');
  const stateExists=fs.existsSync(statePath);const sentinelExists=fs.existsSync(sentinelPath);
  if(!stateExists&&!sentinelExists)return{ok:true,runtimeVersion:SOVEREIGN_CONFIGURED_COGNITIVE_JOURNAL_RUNTIME_VERSION,status:'COGNITIVE_JOURNAL_RUNTIME_LEGACY',journalPath:journal,archiveSnapshotPath:null,tailPath:null,runtimeState:null,runtimeStatePath:null,configurationSource:'LEGACY_DEFAULT'};
  if(!stateExists||!sentinelExists||!safeSentinel(sentinelPath))return fail(['complete-layered-runtime-state-and-sentinel-required'],'CONFIGURED_COGNITIVE_JOURNAL_RUNTIME_DOWNGRADE_REFUSED');
  const state=safeState(statePath);if(!state)return fail(['safe-layered-runtime-state-required'],'CONFIGURED_COGNITIVE_JOURNAL_RUNTIME_STATE_REFUSED');
  const checked=verifyContextJournalRuntimeState(state);if(!checked.ok)return fail(['verified-layered-runtime-state-required',...(checked.reasonCodes||[])],'CONFIGURED_COGNITIVE_JOURNAL_RUNTIME_STATE_REFUSED');
  const archive=path.join(contextDir,'segments',state.archiveManifestId);const tail=path.join(contextDir,state.tailFile);
  if(path.dirname(tail)!==contextDir||path.dirname(archive)!==path.join(contextDir,'segments'))return fail(['runtime-state-path-containment-required'],'CONFIGURED_COGNITIVE_JOURNAL_RUNTIME_STATE_REFUSED');
  const snapshot=verifyCognitiveJournalSegmentSnapshot(archive);if(!snapshot.ok)return fail(['runtime-state-archive-invalid',...(snapshot.reasonCodes||[])],'CONFIGURED_COGNITIVE_JOURNAL_RUNTIME_STATE_REFUSED');
  if(snapshot.manifestId!==state.archiveManifestId||snapshot.totalEntries!==state.archiveEntryCount||snapshot.journalTipDigest!==state.archiveTipDigest)return fail(['runtime-state-archive-binding-mismatch'],'CONFIGURED_COGNITIVE_JOURNAL_RUNTIME_STATE_REFUSED');
  return{ok:true,runtimeVersion:SOVEREIGN_CONFIGURED_COGNITIVE_JOURNAL_RUNTIME_VERSION,status:'COGNITIVE_JOURNAL_RUNTIME_LAYERED_STATE_RESOLVED',journalPath:journal,archiveSnapshotPath:archive,tailPath:tail,runtimeState:state,runtimeStatePath:statePath,configurationSource:'RUNTIME_STATE'};
}

export function readConfiguredRuntimeCognitiveJournal(options={}){
  const resolved=resolveConfiguredCognitiveJournalRuntime(options);if(!resolved.ok)return resolved;
  const read=readRuntimeCognitiveJournal({journalPath:resolved.journalPath,archiveSnapshotPath:resolved.archiveSnapshotPath,tailPath:resolved.tailPath});if(!read.ok)return read;
  if(resolved.runtimeState&&read.runtimeMode==='ARCHIVE_PLUS_TAIL'&&(read.archiveManifestId!==resolved.runtimeState.archiveManifestId||read.archiveEntryCount!==resolved.runtimeState.archiveEntryCount))return fail(['resolved-runtime-state-readback-mismatch'],'CONFIGURED_COGNITIVE_JOURNAL_RUNTIME_STATE_REFUSED');
  return{...read,configuredRuntimeVersion:SOVEREIGN_CONFIGURED_COGNITIVE_JOURNAL_RUNTIME_VERSION,configurationSource:resolved.configurationSource,runtimeStateId:resolved.runtimeState?.stateId||null,runtimeGenerationId:resolved.runtimeState?.generationId||null,runtimeStatePath:resolved.runtimeStatePath};
}

export function appendConfiguredRuntimeCognitiveJournalEvent({...options}={}){
  const resolved=resolveConfiguredCognitiveJournalRuntime(options);if(!resolved.ok)return resolved;
  const appended=appendRuntimeCognitiveJournalEvent({journalPath:resolved.journalPath,archiveSnapshotPath:resolved.archiveSnapshotPath,tailPath:resolved.tailPath,compiledEvent:options.compiledEvent});if(!appended.ok)return appended;
  return{...appended,configuredRuntimeVersion:SOVEREIGN_CONFIGURED_COGNITIVE_JOURNAL_RUNTIME_VERSION,configurationSource:resolved.configurationSource,runtimeStateId:resolved.runtimeState?.stateId||null,runtimeGenerationId:resolved.runtimeState?.generationId||null,runtimeStatePath:resolved.runtimeStatePath};
}
