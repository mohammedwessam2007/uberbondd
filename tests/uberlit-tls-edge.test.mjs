import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function freePort(){return new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const {port}=server.address();server.close(error=>error?reject(error):resolve(port));});});}
function waitForReady(child,timeoutMs=10000){return new Promise((resolve,reject)=>{let buffer='';const timer=setTimeout(()=>reject(new Error('uberlit-tls-edge-ready-timeout')),timeoutMs);child.stdout.on('data',chunk=>{buffer+=chunk.toString();const line=buffer.split('\n').find(value=>value.includes('UBERLIT_TLS_EDGE_READY'));if(line){clearTimeout(timer);try{resolve(JSON.parse(line));}catch(error){reject(error);}}});child.once('exit',code=>{clearTimeout(timer);reject(new Error(`uberlit-tls-edge-exited:${code}`));});});}
function httpsGet(port){return new Promise((resolve,reject)=>{const request=https.request({hostname:'127.0.0.1',port,path:'/api/health',method:'GET',rejectUnauthorized:false,timeout:3000},response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode,body}));});request.once('error',reject);request.once('timeout',()=>request.destroy(new Error('https-timeout')));request.end();});}
function waitExit(child,timeoutMs=5000){return new Promise((resolve,reject)=>{if(child.exitCode!==null)return resolve(child.exitCode);const timer=setTimeout(()=>reject(new Error('child-exit-timeout')),timeoutMs);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});}

test('UberLit TLS edge serves a loopback upstream over HTTPS with protected key material',async()=>{
  const upstreamPort=await freePort();const tlsPort=await freePort();const root=fs.mkdtempSync(path.join(os.tmpdir(),'uberlit-tls-test-'));
  const upstream=http.createServer((request,response)=>{if(request.url==='/api/health'){response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({ok:true,via:'uberlit-tls-edge',forwardedProto:request.headers['x-forwarded-proto']||null}));return;}response.writeHead(404);response.end('missing');});
  await new Promise((resolve,reject)=>{upstream.once('error',reject);upstream.listen(upstreamPort,'127.0.0.1',resolve);});
  const child=spawn(process.execPath,['scripts/uberlit-tls-edge.mjs','--root',root,'--bind','127.0.0.1','--port',String(tlsPort),'--upstream-port',String(upstreamPort)],{cwd:repoRoot,stdio:['ignore','pipe','pipe']});
  try{
    const ready=await waitForReady(child);assert.equal(ready.ok,true);assert.equal(ready.status,'UBERLIT_TLS_EDGE_READY');assert.equal(ready.certificateMode,'SELF_SIGNED_LOCAL');
    const response=await httpsGet(tlsPort);assert.equal(response.status,200);const body=JSON.parse(response.body);assert.equal(body.ok,true);assert.equal(body.via,'uberlit-tls-edge');assert.equal(body.forwardedProto,'https');
    const key=path.join(root,'tls','local.key.pem');const cert=path.join(root,'tls','local.cert.pem');assert.equal(fs.existsSync(key),true);assert.equal(fs.existsSync(cert),true);assert.equal(fs.statSync(key).mode&0o077,0);
    child.kill('SIGTERM');assert.equal(await waitExit(child),0);
    await assert.rejects(()=>httpsGet(tlsPort));
  }finally{
    if(child.exitCode===null)child.kill('SIGKILL');await new Promise(resolve=>upstream.close(()=>resolve()));fs.rmSync(root,{recursive:true,force:true});
  }
});
