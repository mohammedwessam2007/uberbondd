#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { compileContextReplicationBundle, verifyContextReplicationBundle } from '../src/context-replication-bundle.mjs';
import { verifyCognitiveJournalSegmentSnapshot } from './sovereign-context-segment-journal.mjs';

export const SOVEREIGN_CONTEXT_REPLICATION_BUNDLE_VERSION='sovereign-context-replication-bundle-1.0.0';
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes,status='CONTEXT_REPLICATION_EXPORT_REFUSED',extra={}){return{ok:false,exportVersion:SOVEREIGN_CONTEXT_REPLICATION_BUNDLE_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function readJson(file,max=128*1024*1024){try{const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>max)return null;const value=JSON.parse(fs.readFileSync(file,'utf8'));return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}catch{return null;}}
function atomicJson(file,value){const tmp=`${file}.tmp.${process.pid}`;fs.writeFileSync(tmp,`${JSON.stringify(value,null,2)}\n`,{mode:0o600});const fd=fs.openSync(tmp,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);fs.chmodSync(file,0o600);}
function syncDir(dir){const fd=fs.openSync(dir,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function copySnapshot(source,target){const src=path.resolve(source);const st=fs.lstatSync(src);if(!st.isDirectory()||st.isSymbolicLink())throw new Error('regular-journal-snapshot-directory-required');fs.cpSync(src,target,{recursive:true,errorOnExist:true,force:false,dereference:false});for(const entry of fs.readdirSync(target,{withFileTypes:true})){const file=path.join(target,entry.name);const s=fs.lstatSync(file);if(s.isSymbolicLink())throw new Error('replication-bundle-symlink-refused');}}

export function verifyContextReplicationDirectory(bundlePath,{expectedSourceCommit=null,currentBundle=null}={}){
  const root=path.resolve(String(bundlePath||''));if(!bundlePath||!fs.existsSync(root)||!fs.lstatSync(root).isDirectory()||fs.lstatSync(root).isSymbolicLink())return fail(['regular-replication-bundle-directory-required'],'CONTEXT_REPLICATION_DIRECTORY_INVALID');
  const bundle=readJson(path.join(root,'bundle.json'));const brainstate=readJson(path.join(root,'brainstate.json'));
  if(!bundle||!brainstate)return fail(['bundle-and-brainstate-files-required'],'CONTEXT_REPLICATION_DIRECTORY_INVALID');
  if(path.basename(root)!==bundle.bundleId)return fail(['replication-directory-must-equal-bundle-id'],'CONTEXT_REPLICATION_DIRECTORY_INVALID');
  const journalRoot=path.join(root,'journal',bundle.journalManifestId);const journal=verifyCognitiveJournalSegmentSnapshot(journalRoot);if(!journal.ok)return fail(['replication-journal-snapshot-invalid',...(journal.reasonCodes||[])],'CONTEXT_REPLICATION_DIRECTORY_INVALID');
  const verified=verifyContextReplicationBundle(bundle,{brainstate,manifest:readJson(path.join(journalRoot,'manifest.json')),segments:journal.entries?loadSegments(journalRoot,readJson(path.join(journalRoot,'manifest.json'))):[],expectedSourceCommit,currentBundle});
  if(!verified.ok)return verified;
  return{...verified,exportVersion:SOVEREIGN_CONTEXT_REPLICATION_BUNDLE_VERSION,status:'CONTEXT_REPLICATION_DIRECTORY_VERIFIED',bundlePath:root};
}
function loadSegments(journalRoot,manifest){const out=[];for(const descriptor of manifest?.segments||[]){const name=`segment-${String(descriptor.segmentIndex).padStart(8,'0')}-${descriptor.segmentDigest}.json`;const value=readJson(path.join(journalRoot,name));if(!value)throw new Error('segment-read-failed');out.push(value);}return out;}

export function exportContextReplicationDirectory({brainstatePath,journalSnapshotPath,outputRoot}={}){
  if(!brainstatePath||!journalSnapshotPath||!outputRoot)return fail(['brainstate-journal-snapshot-and-output-root-required']);
  const brainstate=readJson(brainstatePath);if(!brainstate)return fail(['regular-brainstate-file-required']);
  const journal=verifyCognitiveJournalSegmentSnapshot(journalSnapshotPath);if(!journal.ok)return fail(['verified-journal-snapshot-required',...(journal.reasonCodes||[])]);
  let manifest;let segments;try{manifest=readJson(path.join(journalSnapshotPath,'manifest.json'));segments=loadSegments(journalSnapshotPath,manifest);}catch{return fail(['journal-segment-load-failed']);}
  const compiled=compileContextReplicationBundle({brainstate,manifest,segments});if(!compiled.ok)return compiled;
  const root=path.resolve(outputRoot);fs.mkdirSync(root,{recursive:true,mode:0o700});const final=path.join(root,compiled.bundle.bundleId);const stage=path.join(root,`.stage-${compiled.bundle.bundleId}-${process.pid}`);
  if(fs.existsSync(final)){const existing=verifyContextReplicationDirectory(final);if(!existing.ok)return fail(['existing-replication-bundle-invalid',...(existing.reasonCodes||[])]);return{...existing,status:'CONTEXT_REPLICATION_DIRECTORY_ALREADY_PRESENT'};}
  fs.mkdirSync(stage,{mode:0o700});fs.mkdirSync(path.join(stage,'journal'),{mode:0o700});
  try{atomicJson(path.join(stage,'bundle.json'),compiled.bundle);atomicJson(path.join(stage,'brainstate.json'),brainstate);copySnapshot(journalSnapshotPath,path.join(stage,'journal',manifest.manifestId));syncDir(path.join(stage,'journal'));syncDir(stage);fs.renameSync(stage,final);syncDir(root);}catch(error){fs.rmSync(stage,{recursive:true,force:true});return fail(['replication-directory-write-failed'],'CONTEXT_REPLICATION_EXPORT_FAILED',{detail:String(error?.message||error).slice(0,300)});}
  const verified=verifyContextReplicationDirectory(final);if(!verified.ok)return fail(['written-replication-directory-failed-verification',...(verified.reasonCodes||[])],'CONTEXT_REPLICATION_EXPORT_FAILED');
  return{...verified,status:'CONTEXT_REPLICATION_DIRECTORY_WRITTEN',truthBoundary:'Portable bundle integrity is verified locally. Transport authenticity, second-host identity, source ancestry, and actual failover remain separate evidence requirements.'};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=process.argv.includes('--verify')?verifyContextReplicationDirectory(process.argv.at(-1),{expectedSourceCommit:process.env.UBERBOND_EXPECTED_SOURCE_COMMIT||null}):exportContextReplicationDirectory({brainstatePath:process.env.UBERBOND_BRAINSTATE_PATH,journalSnapshotPath:process.env.UBERBOND_CONTEXT_SEGMENT_SNAPSHOT_PATH,outputRoot:process.env.UBERBOND_CONTEXT_REPLICATION_ROOT});
  process.stdout.write(`${JSON.stringify(result,null,2)}\n`);if(!result.ok)process.exitCode=2;
}
