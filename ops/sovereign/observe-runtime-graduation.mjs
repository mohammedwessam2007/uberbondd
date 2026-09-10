#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {compileSovereignRuntimeGraduation} from '../../src/sovereign-runtime-graduation.mjs';

const MAX=4_000_000;
const text=(value,max=2000)=>String(value??'').trim().slice(0,max);
const run=(command,args=[])=>{const out=spawnSync(command,args,{encoding:'utf8',timeout:15_000,windowsHide:true,env:{...process.env,TZ:'UTC',LC_ALL:'C'}});return{ok:out.status===0,status:out.status,stdout:text(out.stdout,10000),stderr:text(out.stderr,10000)};};
async function regular(file){try{const s=await fs.lstat(file);return s.isFile()&&!s.isSymbolicLink()&&s.size<=MAX;}catch{return false;}}
async function directory(file){try{const s=await fs.lstat(file);return s.isDirectory()&&!s.isSymbolicLink();}catch{return false;}}
async function readJson(file){try{if(!await regular(file))return null;const out=JSON.parse(await fs.readFile(file,'utf8'));return out&&typeof out==='object'&&!Array.isArray(out)?out:null;}catch{return null;}}
async function readEnv(file){const out={};try{if(!await regular(file))return out;for(const raw of (await fs.readFile(file,'utf8')).split(/\r?\n/)){const line=raw.trim();if(!line||line.startsWith('#'))continue;const i=line.indexOf('=');if(i<1)continue;const key=line.slice(0,i);if(!/^[A-Z0-9_]+$/.test(key))continue;out[key]=line.slice(i+1).trim();}return out;}catch{return out;}}
async function atomic(file,body){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=`${file}.tmp.${process.pid}`;await fs.writeFile(tmp,body,{mode:0o600});await fs.rename(tmp,file);}
function markerEpoch(name){const m=/-(\d{8}T\d{6}Z)$/.exec(name);if(!m)return NaN;const v=m[1];return Date.UTC(Number(v.slice(0,4)),Number(v.slice(4,6))-1,Number(v.slice(6,8)),Number(v.slice(9,11)),Number(v.slice(11,13)),Number(v.slice(13,15)));}
function systemdShow(unit){const r=run('systemctl',['show',unit,'--property=Result','--property=ExecMainStatus','--property=ExecMainStartTimestamp','--no-pager']);const out={};if(!r.ok)return{ok:false,values:out};for(const line of r.stdout.split(/\r?\n/)){const i=line.indexOf('=');if(i>0)out[line.slice(0,i)]=line.slice(i+1);}return{ok:true,values:out};}
function inspectContainer(name,wantHealth){const r=run('docker',['inspect','-f','{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}',name]);if(!r.ok)return{running:false,healthy:false};const [running,health]=r.stdout.split('|');return{running:running==='true',healthy:wantHealth?health==='healthy':undefined};}

export async function observeSovereignRuntimeGraduation({env=process.env}={}){
  const controlDir=path.resolve(env.UBERBOND_CONTROL_DIR||'/var/lib/uberbond-control');
  const inbox=path.resolve(env.UBERBOND_RUNTIME_INBOX||path.join(controlDir,'inbox'));
  const signerOutbox=path.resolve(env.UBERBOND_SIGNER_OUTBOX||'/mnt/uberbond-signer-outbox');
  const signerReceipt=await readJson(path.join(signerOutbox,'signer-receipt.json'));
  const courierReceipt=await readJson(path.join(inbox,'courier-receipt.json'));
  const releaseName=text(signerReceipt?.releaseName,120);
  let appliedMarkerName='',appliedMarkerContent='';
  if(releaseName&&await directory(inbox)){
    const names=(await fs.readdir(inbox)).filter(name=>name.startsWith(`APPLIED-${releaseName}-`)).sort().reverse();
    for(const name of names){const file=path.join(inbox,name);if(!await regular(file))continue;appliedMarkerName=name;appliedMarkerContent=text(await fs.readFile(file,'utf8'),160);break;}
  }
  const releaseDir=releaseName?path.join(inbox,releaseName):'';
  const releaseEnv=releaseDir?await readEnv(path.join(releaseDir,'release.env')):{};
  const runtimeState=await readEnv(path.join(controlDir,'state.env'));
  const timerActive=run('systemctl',['is-active','--quiet','uberbond-reconcile.timer']).ok;
  const service=systemdShow('uberbond-reconcile.service');
  const serviceAt=Date.parse(String(service.values.ExecMainStartTimestamp||''));
  const appliedAt=markerEpoch(appliedMarkerName);
  const reconciliationObserved=Boolean(timerActive&&service.ok&&service.values.Result==='success'&&service.values.ExecMainStatus==='0'&&Number.isFinite(serviceAt)&&Number.isFinite(appliedAt)&&serviceAt>=appliedAt);
  const containers={
    postgres:inspectContainer('uberbond-postgres',true),
    web:inspectContainer('uberbond-web',true),
    worker:inspectContainer('uberbond-worker',false)
  };
  const receipt=compileSovereignRuntimeGraduation({
    signerReceipt,courierReceipt,appliedMarkerName,appliedMarkerContent,releaseEnv,runtimeState,
    runtimeObserved:Boolean(appliedMarkerName&&releaseName&&await directory(releaseDir)),reconciliationObserved,containers
  });
  const out={...receipt,collector:'ops/sovereign/observe-runtime-graduation.mjs',observedAt:new Date().toISOString(),observedPaths:{controlDir,inbox,signerOutbox},evidence:{reconcileTimerActive:timerActive,reconcileServiceResult:service.values.Result||null,reconcileServiceStart:service.values.ExecMainStartTimestamp||null}};
  if(out.ok)await atomic(path.join(controlDir,'runtime-receipt.json'),`${JSON.stringify(out,null,2)}\n`);
  return out;
}

observeSovereignRuntimeGraduation().then(out=>{process.stdout.write(`${JSON.stringify(out,null,2)}\n`);if(!out.ok)process.exitCode=2;}).catch(error=>{process.stdout.write(`${JSON.stringify({ok:false,status:'SOVEREIGN_RUNTIME_GRADUATION_OBSERVER_CRASH',reasonCodes:[text(error?.message||error,300)],businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'},null,2)}\n`);process.exitCode=2;});
