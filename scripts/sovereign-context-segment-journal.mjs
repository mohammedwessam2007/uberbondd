#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { readCognitiveJournal } from '../src/cognitive-event-journal.mjs';
import { compileCognitiveJournalSegments, verifyCognitiveJournalSegments } from '../src/cognitive-journal-segments.mjs';

export const SOVEREIGN_CONTEXT_SEGMENT_JOURNAL_VERSION='sovereign-context-segment-journal-1.0.0';
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes,status='CONTEXT_JOURNAL_SEGMENT_EXPORT_REFUSED',extra={}){return{ok:false,exportVersion:SOVEREIGN_CONTEXT_SEGMENT_JOURNAL_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function atomicJson(file,value){const tmp=`${file}.tmp.${process.pid}`;fs.writeFileSync(tmp,`${JSON.stringify(value,null,2)}\n`,{mode:0o600});const fd=fs.openSync(tmp,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);fs.chmodSync(file,0o600);}
function syncDir(dir){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function segmentFilename(segment){return `segment-${String(segment.segmentIndex).padStart(8,'0')}-${segment.segmentDigest}.json`;}

export function exportCognitiveJournalSegments({journalPath,outputRoot,segmentSize=2048}={}){
  if(!journalPath||!outputRoot)return fail(['journal-and-output-root-required']);
  const journal=readCognitiveJournal(journalPath);if(!journal.ok)return fail(['verified-journal-required',...(journal.reasonCodes||[])]);
  const compiled=compileCognitiveJournalSegments(journal.entries,{segmentSize});if(!compiled.ok)return compiled;
  const root=path.resolve(outputRoot);fs.mkdirSync(root,{recursive:true,mode:0o700});const final=path.join(root,compiled.manifest.manifestId);const stage=path.join(root,`.stage-${compiled.manifest.manifestId}-${process.pid}`);
  if(fs.existsSync(final))return{ok:true,exportVersion:SOVEREIGN_CONTEXT_SEGMENT_JOURNAL_VERSION,status:'CONTEXT_JOURNAL_SEGMENT_SNAPSHOT_ALREADY_PRESENT',manifestId:compiled.manifest.manifestId,snapshotPath:final,totalEntries:compiled.manifest.totalEntries,segmentCount:compiled.manifest.segmentCount,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects()};
  fs.mkdirSync(stage,{mode:0o700});
  try{
    for(const segment of compiled.segments)atomicJson(path.join(stage,segmentFilename(segment)),segment);
    atomicJson(path.join(stage,'manifest.json'),compiled.manifest);syncDir(stage);fs.renameSync(stage,final);syncDir(root);
  }catch(error){fs.rmSync(stage,{recursive:true,force:true});return fail(['segment-snapshot-write-failed'],'CONTEXT_JOURNAL_SEGMENT_EXPORT_FAILED',{detail:String(error?.message||error).slice(0,300)});}
  return{ok:true,exportVersion:SOVEREIGN_CONTEXT_SEGMENT_JOURNAL_VERSION,status:'CONTEXT_JOURNAL_SEGMENT_SNAPSHOT_WRITTEN',manifestId:compiled.manifest.manifestId,snapshotPath:final,totalEntries:compiled.manifest.totalEntries,segmentCount:compiled.manifest.segmentCount,journalTipDigest:compiled.manifest.journalTipDigest,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),truthBoundary:'This is an immutable content-addressed snapshot of the verified journal. It does not replace or truncate the active journal.'};
}

export function verifyCognitiveJournalSegmentSnapshot(snapshotPath){
  const root=path.resolve(String(snapshotPath||''));if(!snapshotPath||!fs.existsSync(root)||!fs.lstatSync(root).isDirectory()||fs.lstatSync(root).isSymbolicLink())return fail(['regular-segment-snapshot-directory-required'],'CONTEXT_JOURNAL_SEGMENT_SNAPSHOT_INVALID');
  let manifest;try{manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));}catch{return fail(['segment-manifest-read-failed'],'CONTEXT_JOURNAL_SEGMENT_SNAPSHOT_INVALID');}
  const segments=[];
  try{for(const descriptor of manifest.segments||[]){const file=path.join(root,segmentFilename(descriptor));const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>128*1024*1024)return fail(['unsafe-segment-file'],'CONTEXT_JOURNAL_SEGMENT_SNAPSHOT_INVALID');segments.push(JSON.parse(fs.readFileSync(file,'utf8')));}}catch{return fail(['segment-file-read-failed'],'CONTEXT_JOURNAL_SEGMENT_SNAPSHOT_INVALID');}
  const verified=verifyCognitiveJournalSegments({manifest,segments});if(!verified.ok)return verified;
  if(path.basename(root)!==verified.manifestId)return fail(['snapshot-directory-must-equal-manifest-id'],'CONTEXT_JOURNAL_SEGMENT_SNAPSHOT_INVALID');
  return{...verified,exportVersion:SOVEREIGN_CONTEXT_SEGMENT_JOURNAL_VERSION,status:'CONTEXT_JOURNAL_SEGMENT_SNAPSHOT_VERIFIED',snapshotPath:root};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=process.argv.includes('--verify')?verifyCognitiveJournalSegmentSnapshot(process.argv.at(-1)):exportCognitiveJournalSegments({journalPath:process.env.UBERBOND_CONTEXT_JOURNAL_PATH,outputRoot:process.env.UBERBOND_CONTEXT_SEGMENT_ROOT,segmentSize:Number(process.env.UBERBOND_CONTEXT_SEGMENT_SIZE||2048)});
  process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result.ok)process.exitCode=2;
}
