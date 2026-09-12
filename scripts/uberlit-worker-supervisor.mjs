#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readUberLitPointer, verifyStagedUberLitRelease, verifyUberLitBuild } from '../src/uberlit-runtime.mjs';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=name=>{const i=process.argv.indexOf(`--${name}`);return i>=0?String(process.argv[i+1]||''):'';};
const runtimeRoot=path.resolve(arg('root')||process.env.UBERLIT_ROOT||'/var/lib/uberlit/uberbond');
const webPort=Number(arg('web-port')||process.env.UBERLIT_WEB_PORT||32123);
const dbPort=Number(arg('db-port')||process.env.UBERLIT_DB_PORT||35432);
const tlsPort=Number(process.env.UBERLIT_TLS_PORT||32443);
const startupTimeoutMs=Number(arg('timeout')||60_000);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:repoRoot,encoding:'utf8'}).trim().toLowerCase();
const dirty=execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:repoRoot,encoding:'utf8'}).trim();
if(dirty)throw new Error('uberlit-worker-supervisor-source-must-be-clean');
for(const value of [webPort,dbPort,tlsPort])if(!Number.isSafeInteger(value)||value<1024||value>65535)throw new Error('uberlit-worker-supervisor-port-invalid');

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

const {pointer}=await waitForRelease();
const postgresPassword=readSecret('postgres.json','password');
const adminToken=process.env.ADMIN_TOKEN||readSecret('admin.json','token');
const releaseSource=path.join(runtimeRoot,'releases',pointer.releaseId,'source');
const dataDir=path.join(runtimeRoot,'worker-data');const screenshotDir=path.join(dataDir,'screenshots');fs.mkdirSync(screenshotDir,{recursive:true,mode:0o700});
const databaseUrl=`postgresql://postgres:${encodeURIComponent(postgresPassword)}@127.0.0.1:${dbPort}/uberbond`;
const workerEnv={...process.env,NODE_ENV:'production',PROCESS_ROLE:'worker',STORE_BACKEND:'postgres',DATABASE_URL:databaseUrl,DATABASE_SSL:'false',ADMIN_TOKEN:adminToken,APP_BASE_URL:process.env.APP_BASE_URL||`https://127.0.0.1:${tlsPort}`,TRUST_PROXY_HOPS:process.env.TRUST_PROXY_HOPS||'1',OUTBOUND_ENABLED:process.env.OUTBOUND_ENABLED||'false',DISCOVERY_ENABLED:process.env.DISCOVERY_ENABLED||'false',DATA_DIR:dataDir,SCREENSHOT_DIR:screenshotDir};
const child=spawn(process.execPath,['worker.mjs'],{cwd:releaseSource,env:workerEnv,stdio:'inherit'});
process.stdout.write(`${JSON.stringify({ok:true,status:'UBERLIT_WORKER_PROCESS_STARTED',sourceCommit,releaseId:pointer.releaseId,pid:child.pid,externalEffectsDisabled:workerEnv.OUTBOUND_ENABLED!=='true'&&workerEnv.DISCOVERY_ENABLED!=='true',businessEffectAuthority:'LOCAL_RUNTIME_ONLY'})}\n`);
let stopping=false;
async function stop(signal){if(stopping)return;stopping=true;if(child.exitCode===null)child.kill(signal);}
process.once('SIGTERM',()=>stop('SIGTERM'));process.once('SIGINT',()=>stop('SIGINT'));
const exitCode=await new Promise(resolve=>child.once('exit',(code,signal)=>resolve(code??(signal?1:0))));
if(!stopping&&exitCode!==0)process.exitCode=exitCode||1;
