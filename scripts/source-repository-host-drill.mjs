#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { compileSourceRepositoryHostReceipt } from '../src/source-repository-host-receipt.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const outputIndex=process.argv.indexOf('--output');
const outputPath=outputIndex>=0?String(process.argv[outputIndex+1]||'').trim():'';
const git=(args,cwd=root)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
const sha256File=path=>`sha256:${crypto.createHash('sha256').update(readFileSync(path)).digest('hex')}`;
function emit(receipt){if(outputPath){mkdirSync(dirname(outputPath),{recursive:true});writeFileSync(outputPath,`${JSON.stringify(receipt,null,2)}\n`,'utf8');}console.log(JSON.stringify(receipt,null,2));}
function runDrill(cwd){const result=spawnSync(process.execPath,['scripts/supplier-exit-drill.mjs'],{cwd,encoding:'utf8'});let parsed=null;try{parsed=JSON.parse(String(result.stdout||'').trim());}catch{}return{exitCode:result.status??1,digest:parsed?.drill?.digest?`sha256:${parsed.drill.digest}`:null};}

const independentHost=String(process.env.UBERBOND_RUNTIME_EVIDENCE_HOST||'').trim();
const primaryHost=String(process.env.UBERBOND_SOURCE_PRIMARY_HOST||'GITHUB').trim();
let sourceCommit=null,originalTree=null,trackedFileCount=0,temp=null,cleanupOk=false;
let exportExitCode=1,restoreExitCode=1,cutoverExitCode=1,rollbackExitCode=1,bundleDigest=null,restoredCommit=null,restoredTree=null,cutoverStateDigest=null,rollbackStateDigest=null;
const commands=['git bundle create <temp>/uberbond.bundle HEAD','git clone <temp>/uberbond.bundle <temp>/restored','node scripts/supplier-exit-drill.mjs # restored copy','node scripts/supplier-exit-drill.mjs # original copy'];
try{
  sourceCommit=git(['rev-parse','HEAD']).toLowerCase();
  originalTree=git(['rev-parse','HEAD^{tree}']).toLowerCase();
  const dirty=git(['status','--porcelain','--untracked-files=no']);
  if(dirty)throw new Error('tracked-working-tree-must-be-clean');
  trackedFileCount=git(['ls-files','-z']).split('\0').filter(Boolean).length;
  temp=mkdtempSync(join(tmpdir(),'uberbond-source-host-'));
  const bundle=join(temp,'uberbond.bundle'),restored=join(temp,'restored');
  const exportRun=spawnSync('git',['bundle','create',bundle,'HEAD'],{cwd:root,encoding:'utf8'});exportExitCode=exportRun.status??1;
  if(exportExitCode!==0)throw new Error(String(exportRun.stderr||'source-export-failed'));
  if(statSync(bundle).size<=0)throw new Error('source-export-empty');
  bundleDigest=sha256File(bundle);
  const restoreRun=spawnSync('git',['clone','--quiet',bundle,restored],{cwd:temp,encoding:'utf8'});restoreExitCode=restoreRun.status??1;
  if(restoreExitCode!==0)throw new Error(String(restoreRun.stderr||'source-restore-failed'));
  restoredCommit=git(['rev-parse','HEAD'],restored).toLowerCase();restoredTree=git(['rev-parse','HEAD^{tree}'],restored).toLowerCase();
  const cutover=runDrill(restored);cutoverExitCode=cutover.exitCode;cutoverStateDigest=cutover.digest;
  const rollback=runDrill(root);rollbackExitCode=rollback.exitCode;rollbackStateDigest=rollback.digest;
} catch(error) {
  process.stderr.write(`source-repository-host-drill: ${String(error?.message||error)}\n`);
} finally {
  if(temp){try{rmSync(temp,{recursive:true,force:true});cleanupOk=true;}catch{cleanupOk=false;}}
}
const receipt=compileSourceRepositoryHostReceipt({sourceCommit,primaryHost,independentHost,bundleDigest,originalTree,restoredCommit,restoredTree,trackedFileCount,exportExitCode,restoreExitCode,cutoverExitCode,rollbackExitCode,cutoverStateDigest,rollbackStateDigest,cleanupOk,commands});
emit(receipt);if(!receipt.ok)process.exitCode=1;
