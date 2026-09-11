import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  buildUberLitRelease,
  compileUberLitRelease,
  promoteUberLitRelease,
  readUberLitPointer,
  readUberLitProcess,
  rollbackUberLitRelease,
  stageUberLitRelease,
  startUberLitRelease,
  stopUberLitProcess,
  verifyStagedUberLitRelease,
  verifyUberLitBuild,
  verifyUberLitReleaseManifest
} from '../src/uberlit-runtime.mjs';

const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
function fixture(){
  const base=fs.mkdtempSync(path.join(os.tmpdir(),'uberlit-test-')),repo=path.join(base,'repo'),root=path.join(base,'runtime');fs.mkdirSync(repo);
  git(repo,['init','-q']);git(repo,['config','user.email','uberlit@example.test']);git(repo,['config','user.name','UberLit Test']);
  const server=label=>`import http from 'node:http';\nconst port=Number(process.env.PORT);\nconst server=http.createServer((req,res)=>{if(req.url==='/api/health'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({ok:true,label:${JSON.stringify(label)},releaseId:process.env.UBERLIT_RELEASE_ID,sourceCommit:process.env.UBERLIT_SOURCE_COMMIT}));return;}if(req.url==='/'){res.writeHead(200);res.end(${JSON.stringify(label)});return;}res.writeHead(404);res.end('not found');});server.listen(port,'127.0.0.1');process.on('SIGTERM',()=>server.close(()=>process.exit(0)));`;
  fs.writeFileSync(path.join(repo,'server.mjs'),server('v1'));fs.writeFileSync(path.join(repo,'package.json'),'{"type":"module"}\n');git(repo,['add','.']);git(repo,['commit','-qm','v1']);const v1=git(repo,['rev-parse','HEAD']);
  fs.writeFileSync(path.join(repo,'server.mjs'),server('v2'));git(repo,['add','server.mjs']);git(repo,['commit','-qm','v2']);const v2=git(repo,['rev-parse','HEAD']);
  return{base,repo,root,v1,v2,cleanup:async()=>{try{await stopUberLitProcess({rootDir:root,graceMs:500});}catch{}fs.rmSync(base,{recursive:true,force:true});}};
}
const manifest=commit=>compileUberLitRelease({sourceCommit:commit,buildArgv:[],startArgv:[process.execPath,'server.mjs'],healthPath:'/api/health',envAllowlist:[],processRole:'web'});
async function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(error=>error?reject(error):resolve(port));});});}

test('release identity is deterministic and tamper evident',()=>{const m=manifest('a'.repeat(40));assert.equal(verifyUberLitReleaseManifest(m),true);assert.deepEqual(m,manifest('a'.repeat(40)));const bad=structuredClone(m);bad.startArgv=['node','evil.mjs'];assert.equal(verifyUberLitReleaseManifest(bad),false);});

test('staged source is archive-bound and tracked mutation refuses',async()=>{const f=fixture();try{const m=manifest(f.v1);const staged=stageUberLitRelease({rootDir:f.root,repoDir:f.repo,manifest:m});assert.equal(staged.ok,true);const release=path.join(f.root,'releases',m.releaseId),source=path.join(release,'source');assert.equal(fs.existsSync(path.join(source,'.git')),false);assert.equal(fs.existsSync(path.join(release,'source.tar')),true);fs.appendFileSync(path.join(source,'server.mjs'),'\n// tamper');const refused=verifyStagedUberLitRelease({rootDir:f.root,releaseId:m.releaseId});assert.equal(refused.ok,false);assert.ok(refused.reasonCodes.some(code=>code.startsWith('tracked-source-drift:')));}finally{await f.cleanup();}});

test('process cannot start before a verified build receipt exists',async()=>{const f=fixture();try{const m=manifest(f.v1),port=await freePort();stageUberLitRelease({rootDir:f.root,repoDir:f.repo,manifest:m});assert.throws(()=>startUberLitRelease({rootDir:f.root,releaseId:m.releaseId,port}),/verified-build-required/);}finally{await f.cleanup();}});

test('build receipt is exact release bound and source remains clean',async()=>{const f=fixture();try{const m=manifest(f.v1);stageUberLitRelease({rootDir:f.root,repoDir:f.repo,manifest:m});const built=buildUberLitRelease({rootDir:f.root,releaseId:m.releaseId,port:await freePort()});assert.equal(built.ok,true);assert.equal(verifyUberLitBuild({rootDir:f.root,releaseId:m.releaseId}).ok,true);const file=path.join(f.root,'releases',m.releaseId,'build-receipt.json');const receipt=JSON.parse(fs.readFileSync(file,'utf8'));receipt.sourceCommit=f.v2;fs.writeFileSync(file,JSON.stringify(receipt));assert.equal(verifyUberLitBuild({rootDir:f.root,releaseId:m.releaseId}).ok,false);}finally{await f.cleanup();}});

test('tampered process state is refused before any process-control action',async()=>{const f=fixture();try{const m=manifest(f.v1);stageUberLitRelease({rootDir:f.root,repoDir:f.repo,manifest:m});buildUberLitRelease({rootDir:f.root,releaseId:m.releaseId,port:await freePort()});const file=path.join(f.root,'state','process.json');fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({schemaVersion:'uberbond.uberlit.process.v1',releaseId:m.releaseId,sourceCommit:f.v1,pid:process.pid,port:3000,startedAt:new Date().toISOString(),logFile:'/tmp/x',businessEffectAuthority:'LOCAL_RUNTIME_ONLY',processDigest:'sha256:'+('0'.repeat(64))}));assert.throws(()=>readUberLitProcess({rootDir:f.root}),/process-state-integrity-failed/);await assert.rejects(()=>stopUberLitProcess({rootDir:f.root}),/process-state-integrity-failed/);}finally{fs.rmSync(path.join(f.root,'state','process.json'),{force:true});await f.cleanup();}});

test('health-gated promotion runs exact source and rollback restores previous release',async()=>{const f=fixture();const port=await freePort();try{const m1=manifest(f.v1),m2=manifest(f.v2);for(const m of [m1,m2]){stageUberLitRelease({rootDir:f.root,repoDir:f.repo,manifest:m});buildUberLitRelease({rootDir:f.root,releaseId:m.releaseId,port});}const first=await promoteUberLitRelease({rootDir:f.root,releaseId:m1.releaseId,port,healthTimeoutMs:5000});assert.equal(first.ok,true);assert.equal(first.pointer.sourceCommit,f.v1);let response=await fetch(`http://127.0.0.1:${port}/`);assert.equal(await response.text(),'v1');const second=await promoteUberLitRelease({rootDir:f.root,releaseId:m2.releaseId,port,healthTimeoutMs:5000});assert.equal(second.pointer.sourceCommit,f.v2);response=await fetch(`http://127.0.0.1:${port}/`);assert.equal(await response.text(),'v2');const rolled=await rollbackUberLitRelease({rootDir:f.root,healthTimeoutMs:5000});assert.equal(rolled.pointer.sourceCommit,f.v1);response=await fetch(`http://127.0.0.1:${port}/`);assert.equal(await response.text(),'v1');}finally{await f.cleanup();}});

test('failed health admission never advances active pointer',async()=>{const f=fixture();const port=await freePort();try{const good=manifest(f.v1);stageUberLitRelease({rootDir:f.root,repoDir:f.repo,manifest:good});buildUberLitRelease({rootDir:f.root,releaseId:good.releaseId,port});await promoteUberLitRelease({rootDir:f.root,releaseId:good.releaseId,port,healthTimeoutMs:5000});const before=readUberLitPointer({rootDir:f.root});const bad=compileUberLitRelease({sourceCommit:f.v2,buildArgv:[],startArgv:[process.execPath,'server.mjs'],healthPath:'/never-healthy',processRole:'web'});stageUberLitRelease({rootDir:f.root,repoDir:f.repo,manifest:bad});buildUberLitRelease({rootDir:f.root,releaseId:bad.releaseId,port});await assert.rejects(()=>promoteUberLitRelease({rootDir:f.root,releaseId:bad.releaseId,port,healthTimeoutMs:700}),/health-admission-failed/);const after=readUberLitPointer({rootDir:f.root});assert.equal(after.releaseId,before.releaseId);assert.equal(after.sourceCommit,f.v1);}finally{await f.cleanup();}});
