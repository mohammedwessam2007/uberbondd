import fs from 'node:fs';
import path from 'node:path';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileCognitiveJournalSegments, verifyCognitiveJournalSegments } from './cognitive-journal-segments.mjs';

export const COGNITIVE_JOURNAL_SEGMENT_STORE_POLICY_VERSION='cognitive-journal-segment-store-1.0.0';
const SHA64=/^[a-f0-9]{64}$/;
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes,status='COGNITIVE_JOURNAL_SEGMENT_STORE_REFUSED',extra={}){return{ok:false,policyVersion:COGNITIVE_JOURNAL_SEGMENT_STORE_POLICY_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function atomicJson(file,value){const tmp=`${file}.tmp.${process.pid}`;fs.writeFileSync(tmp,`${JSON.stringify(value,null,2)}\n`,{mode:0o600});const fd=fs.openSync(tmp,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);fs.chmodSync(file,0o600);}
function syncDir(dir){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
export function cognitiveJournalSegmentFilename(segment){return `segment-${String(segment.segmentIndex).padStart(8,'0')}-${segment.segmentDigest}.json`;}

export function verifyCognitiveJournalSegmentSnapshot(snapshotPath){
  const root=path.resolve(String(snapshotPath||''));if(!snapshotPath||!fs.existsSync(root)||!fs.lstatSync(root).isDirectory()||fs.lstatSync(root).isSymbolicLink())return fail(['regular-segment-snapshot-directory-required'],'COGNITIVE_JOURNAL_SEGMENT_SNAPSHOT_INVALID');
  let manifest;try{const file=path.join(root,'manifest.json');const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>16*1024*1024)return fail(['safe-segment-manifest-required'],'COGNITIVE_JOURNAL_SEGMENT_SNAPSHOT_INVALID');manifest=JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fail(['segment-manifest-read-failed'],'COGNITIVE_JOURNAL_SEGMENT_SNAPSHOT_INVALID');}
  if(!SHA64.test(String(manifest?.manifestId||'')))return fail(['content-addressed-segment-manifest-required'],'COGNITIVE_JOURNAL_SEGMENT_SNAPSHOT_INVALID');
  const segments=[];
  try{for(const descriptor of manifest.segments||[]){const file=path.join(root,cognitiveJournalSegmentFilename(descriptor));const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>128*1024*1024)return fail(['unsafe-segment-file'],'COGNITIVE_JOURNAL_SEGMENT_SNAPSHOT_INVALID');segments.push(JSON.parse(fs.readFileSync(file,'utf8')));}}catch{return fail(['segment-file-read-failed'],'COGNITIVE_JOURNAL_SEGMENT_SNAPSHOT_INVALID');}
  const verified=verifyCognitiveJournalSegments({manifest,segments});if(!verified.ok)return verified;
  if(path.basename(root)!==verified.manifestId)return fail(['snapshot-directory-must-equal-manifest-id'],'COGNITIVE_JOURNAL_SEGMENT_SNAPSHOT_INVALID');
  return{...verified,policyVersion:COGNITIVE_JOURNAL_SEGMENT_STORE_POLICY_VERSION,status:'COGNITIVE_JOURNAL_SEGMENT_SNAPSHOT_VERIFIED',snapshotPath:root,manifest,segments};
}

export function writeCognitiveJournalSegmentSnapshot({entries,outputRoot,segmentSize=2048}={}){
  if(!Array.isArray(entries)||!outputRoot)return fail(['journal-entries-and-output-root-required']);
  const compiled=compileCognitiveJournalSegments(entries,{segmentSize});if(!compiled.ok)return compiled;
  const root=path.resolve(outputRoot);fs.mkdirSync(root,{recursive:true,mode:0o700});const final=path.join(root,compiled.manifest.manifestId);const stage=path.join(root,`.stage-${compiled.manifest.manifestId}-${process.pid}`);
  if(fs.existsSync(final)){const existing=verifyCognitiveJournalSegmentSnapshot(final);if(!existing.ok)return fail(['existing-segment-snapshot-invalid',...(existing.reasonCodes||[])]);return{...existing,status:'COGNITIVE_JOURNAL_SEGMENT_SNAPSHOT_ALREADY_PRESENT'};}
  fs.mkdirSync(stage,{mode:0o700});
  try{for(const segment of compiled.segments)atomicJson(path.join(stage,cognitiveJournalSegmentFilename(segment)),segment);atomicJson(path.join(stage,'manifest.json'),compiled.manifest);syncDir(stage);fs.renameSync(stage,final);syncDir(root);}catch(error){fs.rmSync(stage,{recursive:true,force:true});return fail(['segment-snapshot-write-failed'],'COGNITIVE_JOURNAL_SEGMENT_SNAPSHOT_WRITE_FAILED',{detail:String(error?.message||error).slice(0,300)});}
  const verified=verifyCognitiveJournalSegmentSnapshot(final);if(!verified.ok)return fail(['written-segment-snapshot-failed-verification',...(verified.reasonCodes||[])],'COGNITIVE_JOURNAL_SEGMENT_SNAPSHOT_WRITE_FAILED');
  return{...verified,status:'COGNITIVE_JOURNAL_SEGMENT_SNAPSHOT_WRITTEN',truthBoundary:'This is an immutable content-addressed snapshot of verified cognitive journal entries. It does not itself activate, truncate, or delete any live journal generation.'};
}
