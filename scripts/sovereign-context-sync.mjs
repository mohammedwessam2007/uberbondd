#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { readContextJournalRuntime } from '../src/context-journal-runtime.mjs';
import { checkpointSovereignContext } from './sovereign-context-checkpoint.mjs';
import { mountSovereignContext } from './sovereign-context-mount.mjs';

export const SOVEREIGN_CONTEXT_SYNC_VERSION='sovereign-context-sync-1.1.0';
function zeroEffects(){return structuredClone(ZERO_EXTERNAL_EFFECTS);}
function fail(reasonCodes,status='CONTEXT_SYNC_REFUSED',extra={}){return{ok:false,syncVersion:SOVEREIGN_CONTEXT_SYNC_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function lastCheckpoint(entries=[]){for(let index=entries.length-1;index>=0;index-=1){const entry=entries[index];if(entry?.event?.kind==='CONTEXT_CHECKPOINT'&&entry?.event?.subjectType==='BRAINSTATE')return entry;}return null;}

export function syncSovereignContext({rootDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),journalPath,layeredStorePath=null,capsuleCachePath=null,mountCachePath=null,mission=null,maxHistoricalEvents=24,generatedAt=new Date()}={}){
  if(!journalPath)return fail(['journal-path-required']);
  const mounted=mountSovereignContext({rootDir,journalPath,layeredStorePath,capsuleCachePath,mountCachePath,mission,maxHistoricalEvents,generatedAt});
  if(!mounted.ok)return fail(['context-mount-required',...(mounted.reasonCodes||[])],'CONTEXT_SYNC_MOUNT_REFUSED',{contextMountStatus:mounted.status});
  const journal=readContextJournalRuntime({journalPath,layeredStorePath});if(!journal.ok)return fail(['verified-cognitive-journal-required',...(journal.reasonCodes||[])],'CONTEXT_SYNC_JOURNAL_REFUSED');
  const checkpoint=lastCheckpoint(journal.entries);const currentBrainstateId=mounted.mount?.brainstateId;if(!currentBrainstateId)return fail(['current-brainstate-id-required']);
  if(checkpoint?.event?.subjectId===currentBrainstateId)return{ok:true,syncVersion:SOVEREIGN_CONTEXT_SYNC_VERSION,status:'CONTEXT_SYNC_CURRENT_NO_CHECKPOINT',sourceCommit:mounted.mount.sourceCommit,brainstateId:currentBrainstateId,contextMountId:mounted.mount.contextMountId,journalEntryCount:journal.entryCount,journalTipDigest:journal.tipDigest,journalStorageMode:journal.storageMode||'LEGACY_JSONL',lastCheckpointEventId:checkpoint.eventId,checkpointAppended:false,recompiledFromStale:mounted.mount.recompiledFromStale===true,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
  const appended=checkpointSovereignContext({rootDir,journalPath,layeredStorePath,capsulePath:capsuleCachePath,mission:mission||mounted.mount?.mission,generatedAt});if(!appended.ok)return fail(['context-checkpoint-required',...(appended.reasonCodes||[])],'CONTEXT_SYNC_CHECKPOINT_REFUSED',{checkpointStatus:appended.status});
  if(appended.brainstateId!==currentBrainstateId)return fail(['mounted-and-checkpointed-brainstate-mismatch'],'CONTEXT_SYNC_RACE_REFUSED',{mountedBrainstateId:currentBrainstateId,checkpointedBrainstateId:appended.brainstateId});
  const remounted=mountSovereignContext({rootDir,journalPath,layeredStorePath,capsuleCachePath,mountCachePath,mission,maxHistoricalEvents,generatedAt});if(!remounted.ok)return fail(['post-checkpoint-remount-required',...(remounted.reasonCodes||[])],'CONTEXT_SYNC_REMOUNT_REFUSED');
  return{ok:true,syncVersion:SOVEREIGN_CONTEXT_SYNC_VERSION,status:'CONTEXT_SYNC_CHECKPOINT_APPENDED',sourceCommit:remounted.mount.sourceCommit,brainstateId:remounted.mount.brainstateId,contextMountId:remounted.mount.contextMountId,checkpointEventId:appended.eventId,checkpointSequence:appended.journalSequence,checkpointEntryDigest:appended.journalEntryDigest,journalStorageMode:appended.journalStorageMode||remounted.journalStorageMode||'LEGACY_JSONL',checkpointAppended:true,recompiledFromStale:mounted.mount.recompiledFromStale===true,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
}
function argValue(name){const index=process.argv.indexOf(name);return index>=0&&index+1<process.argv.length?process.argv[index+1]:null;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const controlDir=path.resolve(process.env.UBERBOND_CONTROL_DIR||'/var/lib/uberbond-control');const journalPath=argValue('--journal')||process.env.UBERBOND_CONTEXT_JOURNAL_PATH||path.join(controlDir,'context','events.jsonl');const layeredStorePath=argValue('--layered-store')||process.env.UBERBOND_CONTEXT_LAYERED_STORE_PATH||null;const capsuleCachePath=argValue('--capsule-cache')||process.env.UBERBOND_BRAINSTATE_PATH||path.join(controlDir,'context','brainstate.json');const mountCachePath=argValue('--mount-cache')||process.env.UBERBOND_CONTEXT_MOUNT_PATH||path.join(controlDir,'context','mount.json');const mission=argValue('--mission');const result=syncSovereignContext({journalPath,layeredStorePath,capsuleCachePath,mountCachePath,mission});process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result.ok)process.exitCode=2;}
  catch(error){process.stderr.write(`${JSON.stringify({ok:false,status:'CONTEXT_SYNC_FAILED',reason:error?.message||'unknown-error',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()},null,2)}\n`);process.exitCode=1;}
}
