#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { verifySovereignReleaseRequest } from '../../src/sovereign-release-handoff.mjs';

const MAX=4_000_000;
const text=(v,max=1000)=>String(v??'').trim().slice(0,max);
const fail=(reasonCodes,extra={})=>({ok:false,status:'OFFLINE_SIGNER_PIPELINE_REFUSED',reasonCodes:[...new Set(reasonCodes.filter(Boolean))],signingAuthority:'SEPARATE_OFFLINE_SIGNER_ONLY',deploymentAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',...extra});
const run=(exe,args,{cwd,env,timeoutMs=90*60_000}={})=>new Promise(resolve=>execFile(exe,args,{cwd,env,timeout:timeoutMs,maxBuffer:8_000_000,windowsHide:true},(error,stdout,stderr)=>resolve({exitCode:typeof error?.code==='number'?error.code:(error?1:0),stdout:String(stdout||''),stderr:String(stderr||'')})));
async function readJson(file){try{const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.size>MAX)return null;const v=JSON.parse(await fs.readFile(file,'utf8'));return v&&typeof v==='object'&&!Array.isArray(v)?v:null;}catch{return null;}}
async function atomic(file,body,mode=0o640){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=`${file}.tmp.${process.pid}`;await fs.writeFile(tmp,body,{mode});await fs.rename(tmp,file);}
async function regular(file){try{const s=await fs.lstat(file);return s.isFile()&&!s.isSymbolicLink();}catch{return false;}}
async function directory(file){try{const s=await fs.lstat(file);return s.isDirectory()&&!s.isSymbolicLink();}catch{return false;}}

export async function runOfflineSignerPipeline({env=process.env,runProcess=run}={}){
  const inbox=path.resolve(env.UBERBOND_OFFLINE_SIGNER_INBOX||'/var/lib/uberbond-offline-signer/inbox');
  const outbox=path.resolve(env.UBERBOND_OFFLINE_SIGNER_OUTBOX||'/var/lib/uberbond-offline-signer/outbox');
  const source=path.resolve(env.UBERBOND_OFFLINE_SIGNER_SOURCE_ROOT||'/opt/uberbond/offline-source');
  const requestPath=path.resolve(env.UBERBOND_OFFLINE_SIGNER_REQUEST||path.join(inbox,'sovereign-release-request.json'));
  const key=path.resolve(text(env.UBERBOND_RELEASE_SIGNING_KEY,2000)||'/var/lib/uberbond-offline-signer/keys/release-private.pem');
  if(!requestPath.startsWith(`${inbox}${path.sep}`)||requestPath===inbox)return fail(['safe-signer-request-path-required']);
  if(!await regular(requestPath))return fail(['regular-release-request-required']);
  if(!await regular(key))return fail(['regular-offline-signing-key-required']);
  if(!await directory(source))return fail(['offline-source-checkout-required']);
  const request=await readJson(requestPath);const verified=verifySovereignReleaseRequest(request||{});if(!verified.ok)return fail(verified.reasonCodes||['verified-release-request-required']);
  const head=await runProcess('git',['rev-parse','HEAD'],{cwd:source,env:{PATH:env.PATH||''},timeoutMs:30_000});
  const clean=await runProcess('git',['status','--porcelain'],{cwd:source,env:{PATH:env.PATH||''},timeoutMs:30_000});
  const observed=text(head.stdout,80).toLowerCase();
  if(head.exitCode!==0||observed!==String(request.sourceCommit).toLowerCase())return fail(['offline-signer-source-must-equal-request-source'],{observedSourceCommit:observed||null});
  if(clean.exitCode!==0||text(clean.stdout,20000))return fail(['clean-offline-signer-source-required']);
  const safeName=`release-${String(request.sourceCommit).slice(0,12)}-${String(request.requestDigest).slice(0,16)}`;
  if(!/^release-[a-f0-9]{12}-[a-f0-9]{16}$/.test(safeName))return fail(['safe-release-name-required']);
  const target=path.join(outbox,safeName);const marker=path.join(outbox,'NEXT_RELEASE');const receiptPath=path.join(outbox,'signer-receipt.json');
  const prior=await readJson(receiptPath);if(prior?.ok===true&&prior.requestDigest===request.requestDigest&&await directory(target))return{...prior,status:'OFFLINE_SIGNER_ALREADY_PACKED'};
  await fs.mkdir(outbox,{recursive:true,mode:0o750});
  if(await directory(target))await fs.rm(target,{recursive:true,force:true});
  const packed=await runProcess(process.execPath,['ops/sovereign/pack-release-request.mjs',requestPath,target],{cwd:source,env:{...env,UBERBOND_RELEASE_SIGNING_KEY:key},timeoutMs:Number(env.UBERBOND_OFFLINE_SIGNER_TIMEOUT_MS||90*60_000)});
  if(packed.exitCode!==0)return fail(['offline-release-pack-failed'],{detail:text(packed.stderr||packed.stdout,600)});
  for(const required of ['release.env','SHA256SUMS','release.sig','images.oci.tar'])if(!await regular(path.join(target,required)))return fail([`packed-release-missing:${required}`]);
  const receipt={ok:true,status:'SIGNED_RELEASE_READY_IN_OFFLINE_OUTBOX',requestDigest:request.requestDigest,sourceCommit:request.sourceCommit,releaseName:safeName,outbox:target,signingAuthority:'SEPARATE_OFFLINE_SIGNER_ONLY',deploymentAuthority:'NONE',businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',truthBoundary:'A separate offline signer packed one verified exact-source release into an owner-controlled outbox. This does not prove transport, runtime admission, deployment, recovery, customer, payment, life-outcome, or ASI evidence.'};
  await atomic(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,0o640);
  await atomic(marker,`${safeName}\n`,0o640);
  return receipt;
}

runOfflineSignerPipeline().then(r=>{process.stdout.write(`${JSON.stringify(r,null,2)}\n`);if(!r.ok)process.exitCode=2;}).catch(e=>{process.stdout.write(`${JSON.stringify(fail([`unexpected:${text(e?.message||e,300)}`]),null,2)}\n`);process.exitCode=2;});
