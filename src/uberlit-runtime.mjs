import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';

export const UBERLIT_RELEASE_SCHEMA = 'uberbond.uberlit.release.v1';
export const UBERLIT_POINTER_SCHEMA = 'uberbond.uberlit.pointer.v1';
export const UBERLIT_PROCESS_SCHEMA = 'uberbond.uberlit.process.v1';
export const UBERLIT_POLICY = 'uberlit-1.0.0';

const SHA40=/^[0-9a-f]{40}$/;
const ARG_MAX=128;
const ARG_LEN=4096;
const ENV_NAME=/^[A-Z_][A-Z0-9_]{0,127}$/;
const PORT_MIN=1024;
const PORT_MAX=65535;
const MAX_LOG_BYTES=32*1024*1024;

const canonical=value=>JSON.stringify(value);
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
const digest=value=>`sha256:${sha256(value)}`;
const exactObject=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));

function atomicJsonWrite(file,value,mode=0o600){
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const temp=`${file}.tmp.${process.pid}.${crypto.randomBytes(6).toString('hex')}`;
  fs.writeFileSync(temp,`${JSON.stringify(value,null,2)}\n`,{mode});
  fs.renameSync(temp,file);
}
function safeJson(file){
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2_000_000)throw new Error('uberlit-unsafe-json');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function normalizeArgv(argv,{allowEmpty=false}={}){
  if(!Array.isArray(argv)||(!allowEmpty&&argv.length<1)||argv.length>ARG_MAX)throw new Error('uberlit-argv-invalid');
  return argv.map(item=>{
    const value=String(item??'');
    if(!value||value.length>ARG_LEN||value.includes('\0')||/[\r\n]/.test(value))throw new Error('uberlit-argv-item-invalid');
    return value;
  });
}
function normalizeEnvAllowlist(names=[]){
  if(!Array.isArray(names)||names.length>256)throw new Error('uberlit-env-allowlist-invalid');
  return [...new Set(names.map(name=>String(name).trim()).filter(Boolean))].sort().map(name=>{
    if(!ENV_NAME.test(name))throw new Error('uberlit-env-name-invalid');
    return name;
  });
}
function normalizeHealthPath(value='/api/health'){
  const raw=String(value||'').trim();
  if(!raw.startsWith('/')||raw.includes('..')||raw.includes('\0')||raw.length>512)throw new Error('uberlit-health-path-invalid');
  return raw;
}
function normalizePort(value){
  const port=Number(value);
  if(!Number.isSafeInteger(port)||port<PORT_MIN||port>PORT_MAX)throw new Error('uberlit-port-invalid');
  return port;
}
function normalizeCommit(value){
  const commit=String(value||'').trim().toLowerCase();
  if(!SHA40.test(commit))throw new Error('uberlit-source-commit-invalid');
  return commit;
}
function releaseDir(rootDir,releaseId){
  if(!/^uberlit_[0-9a-f]{32}$/.test(String(releaseId||'')))throw new Error('uberlit-release-id-invalid');
  return path.join(path.resolve(rootDir),'releases',releaseId);
}
function pointerDigest(pointer){
  const {pointerDigest:_,...body}=pointer;
  return digest(canonical(body));
}
function releaseDigest(manifest){
  const {releaseId:_,releaseDigest:__,...body}=manifest;
  return digest(canonical(body));
}

export function compileUberLitRelease({sourceCommit,buildArgv=['npm','ci'],startArgv=['node','server.mjs'],healthPath='/api/health',envAllowlist=[],processRole='web'}={}){
  const body={
    schemaVersion:UBERLIT_RELEASE_SCHEMA,
    policyVersion:UBERLIT_POLICY,
    sourceCommit:normalizeCommit(sourceCommit),
    buildArgv:normalizeArgv(buildArgv,{allowEmpty:true}),
    startArgv:normalizeArgv(startArgv),
    healthPath:normalizeHealthPath(healthPath),
    envAllowlist:normalizeEnvAllowlist(envAllowlist),
    processRole:String(processRole||'web').trim().slice(0,80),
    businessEffectAuthority:'NONE'
  };
  if(!body.processRole)throw new Error('uberlit-process-role-required');
  const fullDigest=digest(canonical(body));
  return {...body,releaseId:`uberlit_${fullDigest.slice(7,39)}`,releaseDigest:fullDigest};
}

export function verifyUberLitReleaseManifest(manifest){
  try{
    if(!exactObject(manifest)||manifest.schemaVersion!==UBERLIT_RELEASE_SCHEMA||manifest.policyVersion!==UBERLIT_POLICY)return false;
    if(!/^uberlit_[0-9a-f]{32}$/.test(String(manifest.releaseId||''))||!/^sha256:[0-9a-f]{64}$/.test(String(manifest.releaseDigest||'')))return false;
    if(!SHA40.test(String(manifest.sourceCommit||'')))return false;
    normalizeArgv(manifest.buildArgv,{allowEmpty:true});normalizeArgv(manifest.startArgv);normalizeHealthPath(manifest.healthPath);normalizeEnvAllowlist(manifest.envAllowlist);
    if(typeof manifest.processRole!=='string'||!manifest.processRole||manifest.businessEffectAuthority!=='NONE')return false;
    const expected=releaseDigest(manifest);
    return expected===manifest.releaseDigest&&manifest.releaseId===`uberlit_${expected.slice(7,39)}`;
  }catch{return false;}
}

function git(repoDir,args,options={}){
  return execFileSync('git',args,{cwd:repoDir,encoding:'utf8',maxBuffer:16*1024*1024,...options}).trim();
}

export function stageUberLitRelease({rootDir,repoDir,manifest}={}){
  if(!verifyUberLitReleaseManifest(manifest))throw new Error('uberlit-valid-release-manifest-required');
  const repo=path.resolve(repoDir);
  const target=releaseDir(rootDir,manifest.releaseId);
  const resolved=git(repo,['rev-parse',`${manifest.sourceCommit}^{commit}`]).toLowerCase();
  if(resolved!==manifest.sourceCommit)throw new Error('uberlit-exact-source-commit-required');
  if(fs.existsSync(target)){
    const verified=verifyStagedUberLitRelease({rootDir,releaseId:manifest.releaseId});
    if(!verified.ok)throw new Error('uberlit-existing-release-corrupt');
    return {...verified,status:'UBERLIT_RELEASE_ALREADY_STAGED'};
  }
  const parent=path.dirname(target);fs.mkdirSync(parent,{recursive:true,mode:0o700});
  const temp=`${target}.tmp.${process.pid}.${crypto.randomBytes(6).toString('hex')}`;
  const source=path.join(temp,'source');
  fs.mkdirSync(source,{recursive:true,mode:0o700});
  try{
    const archive=execFileSync('git',['archive','--format=tar',manifest.sourceCommit],{cwd:repo,maxBuffer:256*1024*1024});
    const untar=spawnSync('tar',['-xf','-','-C',source],{input:archive,encoding:'utf8',maxBuffer:16*1024*1024});
    if((untar.status??1)!==0)throw new Error(`uberlit-source-extract-failed:${String(untar.stderr||'')}`);
    atomicJsonWrite(path.join(temp,'manifest.json'),manifest,0o600);
    const tree=git(repo,['rev-parse',`${manifest.sourceCommit}^{tree}`]).toLowerCase();
    atomicJsonWrite(path.join(temp,'source.json'),{sourceCommit:manifest.sourceCommit,sourceTree:tree},0o600);
    fs.renameSync(temp,target);
  }catch(error){fs.rmSync(temp,{recursive:true,force:true});throw error;}
  const verified=verifyStagedUberLitRelease({rootDir,releaseId:manifest.releaseId});
  if(!verified.ok)throw new Error(`uberlit-stage-postverify-failed:${verified.reasonCodes.join(',')}`);
  return {...verified,status:'UBERLIT_RELEASE_STAGED'};
}

export function verifyStagedUberLitRelease({rootDir,releaseId}={}){
  try{
    const dir=releaseDir(rootDir,releaseId);
    const manifest=safeJson(path.join(dir,'manifest.json'));
    if(!verifyUberLitReleaseManifest(manifest)||manifest.releaseId!==releaseId)return{ok:false,status:'UBERLIT_RELEASE_REFUSED',reasonCodes:['release-manifest-integrity-failed']};
    const source=safeJson(path.join(dir,'source.json'));
    if(source.sourceCommit!==manifest.sourceCommit||!SHA40.test(String(source.sourceTree||'')))return{ok:false,status:'UBERLIT_RELEASE_REFUSED',reasonCodes:['source-binding-invalid']};
    const sourceDir=path.join(dir,'source');const stat=fs.lstatSync(sourceDir);if(!stat.isDirectory()||stat.isSymbolicLink())return{ok:false,status:'UBERLIT_RELEASE_REFUSED',reasonCodes:['source-directory-invalid']};
    return{ok:true,status:'UBERLIT_RELEASE_VERIFIED',releaseId,manifest,sourceTree:source.sourceTree,businessEffectAuthority:'NONE'};
  }catch(error){return{ok:false,status:'UBERLIT_RELEASE_REFUSED',reasonCodes:[String(error?.message||error)]};}
}

function filteredEnv(manifest,env,port,dataDir){
  const base={PATH:process.env.PATH||'',HOME:process.env.HOME||'',TMPDIR:process.env.TMPDIR||'/tmp',LANG:process.env.LANG||'C.UTF-8',NODE_ENV:'production',PORT:String(port),DATA_DIR:dataDir,PROCESS_ROLE:manifest.processRole,UBERLIT_RELEASE_ID:manifest.releaseId,UBERLIT_SOURCE_COMMIT:manifest.sourceCommit};
  for(const name of manifest.envAllowlist){if(Object.prototype.hasOwnProperty.call(env,name))base[name]=String(env[name]);}
  return base;
}
function runArgv(argv,{cwd,env,timeoutMs=10*60_000,stdio='pipe'}={}){
  const result=spawnSync(argv[0],argv.slice(1),{cwd,env,encoding:'utf8',timeout:timeoutMs,stdio,maxBuffer:32*1024*1024});
  return{exitCode:result.status??1,signal:result.signal||null,stdout:String(result.stdout||''),stderr:String(result.stderr||''),error:result.error?String(result.error.message||result.error):null};
}

export function buildUberLitRelease({rootDir,releaseId,env=process.env,port=3000}={}){
  const verified=verifyStagedUberLitRelease({rootDir,releaseId});if(!verified.ok)throw new Error('uberlit-build-release-invalid');
  const dir=releaseDir(rootDir,releaseId),source=path.join(dir,'source'),data=path.join(path.resolve(rootDir),'data',releaseId);fs.mkdirSync(data,{recursive:true,mode:0o700});
  const buildEnv=filteredEnv(verified.manifest,env,normalizePort(port),data);
  let execution={exitCode:0,stdout:'',stderr:'',signal:null,error:null};
  if(verified.manifest.buildArgv.length)execution=runArgv(verified.manifest.buildArgv,{cwd:source,env:buildEnv});
  const receipt={schemaVersion:'uberbond.uberlit.build-receipt.v1',releaseId,sourceCommit:verified.manifest.sourceCommit,sourceTree:verified.sourceTree,buildArgv:verified.manifest.buildArgv,exitCode:execution.exitCode,signal:execution.signal,error:execution.error,stdoutDigest:digest(execution.stdout),stderrDigest:digest(execution.stderr),businessEffectAuthority:'NONE'};
  receipt.receiptDigest=digest(canonical(receipt));atomicJsonWrite(path.join(dir,'build-receipt.json'),receipt,0o600);
  if(execution.exitCode!==0)throw Object.assign(new Error('uberlit-build-failed'),{receipt});
  return{ok:true,status:'UBERLIT_RELEASE_BUILT',receipt};
}

export function readUberLitPointer({rootDir}={}){
  const file=path.join(path.resolve(rootDir),'state','current.json');if(!fs.existsSync(file))return null;
  const pointer=safeJson(file);
  if(!exactObject(pointer)||pointer.schemaVersion!==UBERLIT_POINTER_SCHEMA||!/^uberlit_[0-9a-f]{32}$/.test(String(pointer.releaseId||''))||!/^sha256:[0-9a-f]{64}$/.test(String(pointer.pointerDigest||''))||pointer.pointerDigest!==pointerDigest(pointer))throw new Error('uberlit-pointer-integrity-failed');
  return pointer;
}
function writePointer(rootDir,{releaseId,previousReleaseId,port,sourceCommit,activatedAt}){
  const body={schemaVersion:UBERLIT_POINTER_SCHEMA,releaseId,previousReleaseId:previousReleaseId||null,port:normalizePort(port),sourceCommit:normalizeCommit(sourceCommit),activatedAt:new Date(activatedAt||Date.now()).toISOString(),businessEffectAuthority:'LOCAL_RUNTIME_ONLY'};
  const pointer={...body,pointerDigest:digest(canonical(body))};
  atomicJsonWrite(path.join(path.resolve(rootDir),'state','current.json'),pointer,0o600);
  atomicJsonWrite(path.join(path.resolve(rootDir),'activations',`${pointer.pointerDigest.slice(7)}.json`),pointer,0o600);
  return pointer;
}
function pidAlive(pid){try{process.kill(pid,0);return true;}catch{return false;}}
function processFile(rootDir){return path.join(path.resolve(rootDir),'state','process.json');}
export function readUberLitProcess({rootDir}={}){
  const file=processFile(rootDir);if(!fs.existsSync(file))return null;const state=safeJson(file);
  if(!exactObject(state)||state.schemaVersion!==UBERLIT_PROCESS_SCHEMA||!Number.isSafeInteger(state.pid)||state.pid<=1)return null;
  return{...state,alive:pidAlive(state.pid)};
}
export async function waitForUberLitHealth({port,healthPath='/api/health',timeoutMs=30_000,fetchImpl=globalThis.fetch}={}){
  const until=Date.now()+timeoutMs;const url=`http://127.0.0.1:${normalizePort(port)}${normalizeHealthPath(healthPath)}`;
  let last=null;
  while(Date.now()<until){try{const res=await fetchImpl(url,{signal:AbortSignal.timeout(1500)});const text=await res.text();last={status:res.status,text};if(res.ok)return{ok:true,status:res.status,bodyDigest:digest(text),url};}catch(error){last={error:String(error?.message||error)};}await new Promise(r=>setTimeout(r,200));}
  return{ok:false,last,url};
}
export function startUberLitRelease({rootDir,releaseId,port=3000,env=process.env}={}){
  const existing=readUberLitProcess({rootDir});if(existing?.alive)throw new Error('uberlit-process-already-running');
  const verified=verifyStagedUberLitRelease({rootDir,releaseId});if(!verified.ok)throw new Error('uberlit-start-release-invalid');
  const dir=releaseDir(rootDir,releaseId),source=path.join(dir,'source'),data=path.join(path.resolve(rootDir),'data',releaseId);fs.mkdirSync(data,{recursive:true,mode:0o700});
  const logDir=path.join(path.resolve(rootDir),'logs');fs.mkdirSync(logDir,{recursive:true,mode:0o700});const logFile=path.join(logDir,`${releaseId}.log`);
  if(fs.existsSync(logFile)&&fs.statSync(logFile).size>MAX_LOG_BYTES)fs.renameSync(logFile,`${logFile}.${Date.now()}`);
  const fd=fs.openSync(logFile,'a',0o600);const runtimeEnv=filteredEnv(verified.manifest,env,normalizePort(port),data);
  const child=spawn(verified.manifest.startArgv[0],verified.manifest.startArgv.slice(1),{cwd:source,env:runtimeEnv,detached:true,stdio:['ignore',fd,fd]});child.unref();fs.closeSync(fd);
  const state={schemaVersion:UBERLIT_PROCESS_SCHEMA,releaseId,sourceCommit:verified.manifest.sourceCommit,pid:child.pid,port:normalizePort(port),startedAt:new Date().toISOString(),logFile,businessEffectAuthority:'LOCAL_RUNTIME_ONLY'};state.processDigest=digest(canonical(state));atomicJsonWrite(processFile(rootDir),state,0o600);
  return{ok:true,status:'UBERLIT_PROCESS_STARTED',state};
}
export async function stopUberLitProcess({rootDir,graceMs=8000}={}){
  const state=readUberLitProcess({rootDir});if(!state)return{ok:true,status:'UBERLIT_PROCESS_ABSENT'};
  if(state.alive){try{process.kill(-state.pid,'SIGTERM');}catch{try{process.kill(state.pid,'SIGTERM');}catch{}}
    const until=Date.now()+graceMs;while(Date.now()<until&&pidAlive(state.pid))await new Promise(r=>setTimeout(r,100));
    if(pidAlive(state.pid)){try{process.kill(-state.pid,'SIGKILL');}catch{try{process.kill(state.pid,'SIGKILL');}catch{}}}
  }
  fs.rmSync(processFile(rootDir),{force:true});return{ok:true,status:'UBERLIT_PROCESS_STOPPED',releaseId:state.releaseId};
}
export async function promoteUberLitRelease({rootDir,releaseId,port=3000,env=process.env,healthTimeoutMs=30_000}={}){
  const verified=verifyStagedUberLitRelease({rootDir,releaseId});if(!verified.ok)throw new Error('uberlit-promotion-release-invalid');
  const previous=readUberLitPointer({rootDir});await stopUberLitProcess({rootDir});
  const started=startUberLitRelease({rootDir,releaseId,port,env});const health=await waitForUberLitHealth({port,healthPath:verified.manifest.healthPath,timeoutMs:healthTimeoutMs});
  if(!health.ok){await stopUberLitProcess({rootDir});if(previous){startUberLitRelease({rootDir,releaseId:previous.releaseId,port:previous.port,env});}throw Object.assign(new Error('uberlit-health-admission-failed'),{health});}
  const pointer=writePointer(rootDir,{releaseId,previousReleaseId:previous?.releaseId||null,port,sourceCommit:verified.manifest.sourceCommit});
  return{ok:true,status:'UBERLIT_RELEASE_PROMOTED',pointer,process:started.state,health,businessEffectAuthority:'LOCAL_RUNTIME_ONLY'};
}
export async function rollbackUberLitRelease({rootDir,env=process.env,healthTimeoutMs=30_000}={}){
  const current=readUberLitPointer({rootDir});if(!current?.previousReleaseId)throw new Error('uberlit-no-rollback-target');
  const target=current.previousReleaseId;const verified=verifyStagedUberLitRelease({rootDir,releaseId:target});if(!verified.ok)throw new Error('uberlit-rollback-target-invalid');
  await stopUberLitProcess({rootDir});startUberLitRelease({rootDir,releaseId:target,port:current.port,env});const health=await waitForUberLitHealth({port:current.port,healthPath:verified.manifest.healthPath,timeoutMs:healthTimeoutMs});
  if(!health.ok)throw Object.assign(new Error('uberlit-rollback-health-failed'),{health});
  const pointer=writePointer(rootDir,{releaseId:target,previousReleaseId:current.releaseId,port:current.port,sourceCommit:verified.manifest.sourceCommit});
  return{ok:true,status:'UBERLIT_RELEASE_ROLLED_BACK',pointer,health,businessEffectAuthority:'LOCAL_RUNTIME_ONLY'};
}

export function tailUberLitLog({rootDir,releaseId,maxBytes=64_000}={}){
  const file=path.join(path.resolve(rootDir),'logs',`${releaseId}.log`);if(!fs.existsSync(file))return'';const stat=fs.statSync(file);const start=Math.max(0,stat.size-Math.max(1,Math.min(Number(maxBytes)||64_000,1_000_000)));const fd=fs.openSync(file,'r');try{const buf=Buffer.alloc(stat.size-start);fs.readSync(fd,buf,0,buf.length,start);return buf.toString('utf8');}finally{fs.closeSync(fd);}
}
