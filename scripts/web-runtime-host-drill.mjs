#!/usr/bin/env node
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { compileWebRuntimeHostReceipt } from '../src/web-runtime-host-receipt.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const outputIndex=process.argv.indexOf('--output');
const outputPath=outputIndex>=0?String(process.argv[outputIndex+1]||'').trim():'';
const independentHost=String(process.env.UBERBOND_RUNTIME_EVIDENCE_HOST||'').trim();
const primaryHost=String(process.env.UBERBOND_WEB_PRIMARY_HOST||'VERCEL').trim();
const hash=value=>`sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const delay=ms=>new Promise(resolveDelay=>setTimeout(resolveDelay,ms));
function emit(receipt){if(outputPath){mkdirSync(dirname(outputPath),{recursive:true});writeFileSync(outputPath,`${JSON.stringify(receipt,null,2)}\n`,'utf8');}console.log(JSON.stringify(receipt,null,2));}
async function freePort(){return new Promise((resolvePort,reject)=>{const server=net.createServer();server.unref();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(error=>error?reject(error):resolvePort(port));});});}
async function portReleased(port){return new Promise(resolveCheck=>{const socket=net.createConnection({host:'127.0.0.1',port});const done=value=>{socket.destroy();resolveCheck(value);};socket.setTimeout(500);socket.once('connect',()=>done(false));socket.once('error',()=>done(true));socket.once('timeout',()=>done(true));});}
async function waitExit(child,ms=8000){if(child.exitCode!==null)return true;return new Promise(resolveExit=>{let done=false;const finish=value=>{if(done)return;done=true;resolveExit(value);};child.once('exit',()=>finish(true));setTimeout(()=>finish(false),ms).unref();});}

let sourceCommit=null,temp=null,child=null,cleanupOk=false,healthHttpStatus=null,healthOk=false,healthBodyDigest=null,processRole=null,storeBackend=null,version=null,shutdownObserved=false,released=false;
try{
  sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim().toLowerCase();
  const dirty=execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:root,encoding:'utf8'}).trim();
  if(dirty)throw new Error('tracked-working-tree-must-be-clean');
  const port=await freePort();
  temp=mkdtempSync(join(tmpdir(),'uberbond-web-host-'));
  const env={...process.env,PORT:String(port),APP_BASE_URL:`http://127.0.0.1:${port}`,DATA_DIR:join(temp,'data'),SCREENSHOT_DIR:join(temp,'screenshots'),ADMIN_TOKEN:'runtime-proof-disposable-token',OUTBOUND_ENABLED:'false',DISCOVERY_ENABLED:'false',PROCESS_ROLE:'web'};
  child=spawn(process.execPath,['server.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let body='';
  for(let attempt=0;attempt<60;attempt+=1){
    if(child.exitCode!==null)break;
    try{const response=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(1000)});body=await response.text();healthHttpStatus=response.status;if(response.status===200){const parsed=JSON.parse(body);healthOk=parsed?.ok===true;processRole=parsed?.processRole||null;storeBackend=parsed?.storeBackend||null;version=parsed?.version||null;if(healthOk)break;}}catch{}
    await delay(200);
  }
  if(body)healthBodyDigest=hash(body);
  child.kill('SIGTERM');shutdownObserved=await waitExit(child,8000);
  if(!shutdownObserved){child.kill('SIGKILL');shutdownObserved=await waitExit(child,3000);}
  released=await portReleased(port);
} catch(error) {
  process.stderr.write(`web-runtime-host-drill: ${String(error?.message||error)}\n`);
} finally {
  if(child&&child.exitCode===null){try{child.kill('SIGKILL');}catch{}}
  if(temp){try{rmSync(temp,{recursive:true,force:true});cleanupOk=true;}catch{cleanupOk=false;}}
}
const receipt=compileWebRuntimeHostReceipt({sourceCommit,primaryHost,independentHost,healthHttpStatus,healthOk,healthBodyDigest,processRole,storeBackend,version,outboundDisabled:true,discoveryDisabled:true,isolatedStateObserved:Boolean(temp),shutdownObserved,portReleased:released,primaryRouteMutated:false,cleanupOk,command:'node server.mjs # isolated loopback exact-source web runtime'});
emit(receipt);if(!receipt.ok)process.exitCode=1;
