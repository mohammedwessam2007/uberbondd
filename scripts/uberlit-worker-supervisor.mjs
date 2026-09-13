#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readUberLitPointer, verifyStagedUberLitRelease, verifyUberLitBuild } from '../src/uberlit-runtime.mjs';
import { assessUberLitWorkerLiveness, buildUberLitWorkerLivenessReceipt } from '../src/uberlit-worker-liveness.mjs';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=name=>{const i=process.argv.indexOf(`--${name}`);return i>=0?String(process.argv[i+1]||''):'';};
const runtimeRoot=path.resolve(arg('root')||process.env.UBERLIT_ROOT||'/var/lib/uberlit/uberbond');
const webPort=Number(arg('web-port')||process.env.UBERLIT_WEB_PORT||32123);
const dbPort=Number(arg('db-port')||process.env.UBERLIT_DB_PORT||35432);
const tlsPort=Number(process.env.UBERLIT_TLS_PORT||32443);
const startupTimeoutMs=Number(arg('timeout')||60_000);
const livenessIntervalMs=Math.max(1_000,Number(process.env.UBERLIT_WORKER_LIVENESS_INTERVAL_MS||5_000));
const wealthStartupGraceMs=Math.max(30_000,Number(process.env.UBERLIT_WEALTH_STARTUP_GRACE_MS||120_000));
const wealthStaleMs=Math.max(30_000,Number(process.env.UBERLIT_WEALTH_STALE_MS||300_000));
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:repoRoot,encoding:'utf8'}).trim().toLowerCase();
const dirty=execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:repoRoot,encoding:'utf8'}).trim();
if(dirty)throw new Error('uberlit-worker-supervisor-source-must-be-clean');
for(const value of [webPort,dbPort,tlsPort])if(!Number.isSafeInteger(value)||value<1024||value>65535)throw new Error('uberlit-worker-supervisor-port-invalid');
for(const value of [startupTimeoutMs,livenessIntervalMs,wealthStartupGraceMs,wealthStaleMs])if(!Number.isFinite(value)||value<=0)throw new Error('uberlit-worker-supervisor-timeout-invalid');

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitForRelease(){
  const deadline=Date.now()+startupTimeoutMs;let last='release-not-ready';
  while(Date.now()<deadline){
    try{
      const pointer=readUberLitPointer({rootDir:runtimeRoot});
      if(!pointer){last='release-pointer-absent';await sleep(250);continue;}
      if(pointer.sourceCommit!==sourceCommit){last='release-pointer-source-mismatch';await sleep(250);continue;}
      const staged=verifyStagedUberLitRelease({rootDir:runtimeRoot,releaseId:pointer.releaseId});
      if(!staged.ok){last=`staged-release-invalid:${staged.reasonCodes.join(',')}`;await sleep(250);continue;}
      const built=verifyUberLitBuild({rootDir:runtimeRoot,releaseId:pointer.releaseId});
      if(!built.ok){last=`release-build-invalid:${built.reasonCodes.join(',')}`;await sleep(250);continue;}
      const response=await fetch(`http://127.0.0.1:${webPort}/api/health`,{signal:AbortSignal.timeout(1200)});
      if(response.status!==200){last=`web-health-${response.status}`;await sleep(250);continue;}
      return{pointer,staged};
    }catch(error){last=String(error?.message||error);await sleep(250);}
  }
  throw new Error(`uberlit-worker-release-readiness-timeout:${last}`);
}
function readSecret(name,key){
  const file=path.join(runtimeRoot,'secrets',name);const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)throw new Error(`uberlit-worker-secret-unsafe:${name}`);
  const value=String(JSON.parse(fs.readFileSync(file,'utf8'))[key]||'');if(value.length<32)throw new Error(`uberlit-worker-secret-invalid:${name}`);return value;
}
function atomicJson(file,value){
  const dir=path.dirname(file);fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const tmp=`${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp,`${JSON.stringify(value,null,2)}\n`,{encoding:'utf8',mode:0o600});
  fs.renameSync(tmp,file);
}
function systemdNotify(...args){
  if(!process.env.NOTIFY_SOCKET)return false;
  execFileSync('systemd-notify',args,{stdio:'ignore'});
  return true;
}

const {pointer}=await waitForRelease();
const postgresPassword=readSecret('postgres.json','password');
const adminToken=process.env.ADMIN_TOKEN||readSecret('admin.json','token');
const releaseSource=path.join(runtimeRoot,'releases',pointer.releaseId,'source');
const dataDir=path.join(runtimeRoot,'worker-data');const screenshotDir=path.join(dataDir,'screenshots');fs.mkdirSync(screenshotDir,{recursive:true,mode:0o700});
const databaseUrl=`postgresql://postgres:${encodeURIComponent(postgresPassword)}@127.0.0.1:${dbPort}/uberbond`;
const workerEnv={...process.env,NODE_ENV:'production',PROCESS_ROLE:'worker',STORE_BACKEND:'postgres',DATABASE_URL:databaseUrl,DATABASE_SSL:'false',ADMIN_TOKEN:adminToken,APP_BASE_URL:process.env.APP_BASE_URL||`https://127.0.0.1:${tlsPort}`,TRUST_PROXY_HOPS:process.env.TRUST_PROXY_HOPS||'1',AUTOPILOT_ENABLED:'true',OUTBOUND_ENABLED:process.env.OUTBOUND_ENABLED||'false',DISCOVERY_ENABLED:process.env.DISCOVERY_ENABLED||'false',UBERBOND_RUNTIME_ROOT:runtimeRoot,DATA_DIR:dataDir,SCREENSHOT_DIR:screenshotDir};
const child=spawn(process.execPath,['worker.mjs'],{cwd:releaseSource,env:workerEnv,stdio:'inherit'});
const startedAtMs=Date.now();
const livenessFile=path.join(runtimeRoot,'runtime','worker-liveness.json');
const wealthReceiptFile=path.join(runtimeRoot,'artifacts','universal-wealth-latest.json');
const externalEffectsDisabled=workerEnv.OUTBOUND_ENABLED!=='true'&&workerEnv.DISCOVERY_ENABLED!=='true';
let stopping=false;
let forcedRestartReason=null;
let livenessTimer=null;

function wealthReceiptMtime(){
  try{return fs.statSync(wealthReceiptFile).mtimeMs;}
  catch(error){if(error?.code==='ENOENT')return null;throw error;}
}
function writeLiveness({forceStatus=null}={}){
  const receipt=buildUberLitWorkerLivenessReceipt({
    nowMs:Date.now(),
    startedAtMs,
    sourceCommit,
    releaseId:pointer.releaseId,
    supervisorPid:process.pid,
    childPid:child.pid,
    childAlive:child.exitCode===null,
    wealthReceiptMtimeMs:wealthReceiptMtime(),
    startupGraceMs:wealthStartupGraceMs,
    wealthStaleMs,
    externalEffectsDisabled
  });
  if(forceStatus)receipt.status=forceStatus;
  atomicJson(livenessFile,receipt);
  return receipt;
}
function requestRecycle(reason){
  if(stopping||forcedRestartReason||child.exitCode!==null)return;
  forcedRestartReason=reason;
  process.stderr.write(`${JSON.stringify({ok:false,status:'UBERLIT_WORKER_RECYCLE_REQUESTED',reason,sourceCommit,releaseId:pointer.releaseId})}\n`);
  child.kill('SIGTERM');
  const killer=setTimeout(()=>{if(child.exitCode===null)child.kill('SIGKILL');},10_000);killer.unref?.();
}
function livenessTick(){
  const assessment=assessUberLitWorkerLiveness({nowMs:Date.now(),startedAtMs,childAlive:child.exitCode===null,wealthReceiptMtimeMs:wealthReceiptMtime(),startupGraceMs:wealthStartupGraceMs,wealthStaleMs});
  const receipt=writeLiveness();
  if(assessment.shouldRestart){requestRecycle(assessment.status);return;}
  systemdNotify('WATCHDOG=1',`STATUS=UberLit worker ${receipt.status}; wealthReceiptAgeMs=${receipt.wealthReceiptAgeMs??'none'}`);
}

writeLiveness();
systemdNotify('--ready',`--status=UberLit worker started; release=${pointer.releaseId}; source=${sourceCommit}`);
livenessTimer=setInterval(()=>{
  try{livenessTick();}
  catch(error){process.stderr.write(`${JSON.stringify({ok:false,status:'UBERLIT_WORKER_LIVENESS_TICK_FAILED',reason:String(error?.message||error)})}\n`);requestRecycle('LIVENESS_TICK_FAILED');}
},livenessIntervalMs);
livenessTimer.unref?.();
process.stdout.write(`${JSON.stringify({ok:true,status:'UBERLIT_WORKER_PROCESS_STARTED',sourceCommit,releaseId:pointer.releaseId,pid:child.pid,autopilotEnabled:true,livenessFile,wealthReceiptFile,externalEffectsDisabled,businessEffectAuthority:'LOCAL_RUNTIME_ONLY'})}\n`);

async function stop(signal){
  if(stopping)return;stopping=true;
  if(livenessTimer)clearInterval(livenessTimer);
  try{const receipt=writeLiveness({forceStatus:'STOPPING'});receipt.shouldRestart=false;atomicJson(livenessFile,receipt);}catch{}
  try{systemdNotify('STOPPING=1','STATUS=UberLit worker stopping');}catch{}
  if(child.exitCode===null)child.kill(signal);
}
process.once('SIGTERM',()=>stop('SIGTERM'));process.once('SIGINT',()=>stop('SIGINT'));
const exitCode=await new Promise(resolve=>child.once('exit',(code,signal)=>resolve(code??(signal?1:0))));
if(livenessTimer)clearInterval(livenessTimer);
try{const receipt=writeLiveness({forceStatus:'DEAD_CHILD'});receipt.shouldRestart=!stopping;atomicJson(livenessFile,receipt);}catch{}
if(!stopping)process.exitCode=exitCode||1;
