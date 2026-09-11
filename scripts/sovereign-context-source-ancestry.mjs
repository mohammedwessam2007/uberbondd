#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';
import { compileContextSourceAncestryReceipt, verifyContextSourceAncestryReceipt } from '../src/context-source-ancestry.mjs';

export const SOVEREIGN_CONTEXT_SOURCE_ANCESTRY_VERSION='sovereign-context-source-ancestry-1.0.0';
const SHA40=/^[a-f0-9]{40}$/;
const zeroEffects=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
function fail(reasonCodes,status='CONTEXT_SOURCE_ANCESTRY_PROBE_REFUSED',extra={}){return{ok:false,probeVersion:SOVEREIGN_CONTEXT_SOURCE_ANCESTRY_VERSION,status,reasonCodes:[...new Set((reasonCodes||[]).filter(Boolean))],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zeroEffects(),...extra};}
function git(root,args){return execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:2_000_000}).trim();}
function ancestor(root,a,b){const out=spawnSync('git',['-C',root,'merge-base','--is-ancestor',a,b],{encoding:'utf8'});if(out.status===0)return true;if(out.status===1)return false;throw new Error(`git-ancestry-probe-failed:${String(out.stderr||'').trim().slice(0,200)}`);}

export function probeContextSourceAncestry({repoRoot,currentSourceCommit,candidateSourceCommit}={}){
  const root=path.resolve(String(repoRoot||''));
  const current=String(currentSourceCommit||'').toLowerCase();const candidate=String(candidateSourceCommit||'').toLowerCase();
  if(!repoRoot||!fs.existsSync(root)||!fs.lstatSync(root).isDirectory()||fs.lstatSync(root).isSymbolicLink())return fail(['regular-source-repository-required']);
  if(!SHA40.test(current)||!SHA40.test(candidate))return fail(['exact-current-and-candidate-source-required']);
  try{
    git(root,['rev-parse','--git-dir']);
    git(root,['cat-file','-e',`${current}^{commit}`]);
    git(root,['cat-file','-e',`${candidate}^{commit}`]);
    const mergeBase=git(root,['merge-base',current,candidate]).toLowerCase();
    const head=git(root,['rev-parse','HEAD']).toLowerCase();
    if(!SHA40.test(mergeBase)||!SHA40.test(head))return fail(['exact-git-observations-required']);
    const compiled=compileContextSourceAncestryReceipt({currentSourceCommit:current,candidateSourceCommit:candidate,mergeBase,currentIsAncestorOfCandidate:ancestor(root,current,candidate),candidateIsAncestorOfCurrent:ancestor(root,candidate,current),repositoryHead:head});
    if(!compiled.ok)return compiled;
    return{...compiled,probeVersion:SOVEREIGN_CONTEXT_SOURCE_ANCESTRY_VERSION,status:'CONTEXT_SOURCE_ANCESTRY_PROBED',truthBoundary:'The relation was observed from the local Git object graph. This does not authenticate a remote transport or repository host.'};
  }catch(error){return fail(['local-git-ancestry-probe-failed'],'CONTEXT_SOURCE_ANCESTRY_PROBE_FAILED',{detail:String(error?.message||error).slice(0,300)});}
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const current=process.argv[2];const candidate=process.argv[3];const root=process.env.UBERBOND_SOURCE_ROOT||process.cwd();const result=probeContextSourceAncestry({repoRoot:root,currentSourceCommit:current,candidateSourceCommit:candidate});
  const checked=result.ok?verifyContextSourceAncestryReceipt(result.receipt,{currentSourceCommit:current,candidateSourceCommit:candidate}):result;
  process.stdout.write(`${JSON.stringify(checked,null,2)}\n`);if(!checked.ok)process.exitCode=2;
}
