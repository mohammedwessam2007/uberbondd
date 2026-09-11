#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const arg=name=>{const i=process.argv.indexOf(`--${name}`);return i>=0?String(process.argv[i+1]||''):'';};
const root=path.resolve(arg('root')||process.env.UBERLIT_ROOT||'/var/lib/uberlit/uberbond');
const bind=String(arg('bind')||process.env.UBERLIT_TLS_BIND||'127.0.0.1').trim();
const port=Number(arg('port')||process.env.UBERLIT_TLS_PORT||32443);
const upstreamPort=Number(arg('upstream-port')||process.env.UBERLIT_WEB_PORT||32123);
if(!['127.0.0.1','0.0.0.0','::1','::'].includes(bind))throw new Error('uberlit-tls-bind-refused');
for(const value of [port,upstreamPort])if(!Number.isSafeInteger(value)||value<1024||value>65535)throw new Error('uberlit-tls-port-invalid');
if(port===upstreamPort)throw new Error('uberlit-tls-port-collision');

const tlsDir=path.join(root,'tls');fs.mkdirSync(tlsDir,{recursive:true,mode:0o700});
const configuredKey=String(process.env.UBERLIT_TLS_KEY_PATH||'').trim();
const configuredCert=String(process.env.UBERLIT_TLS_CERT_PATH||'').trim();
if(Boolean(configuredKey)!==Boolean(configuredCert))throw new Error('uberlit-tls-key-and-cert-must-be-paired');
const keyPath=configuredKey?path.resolve(configuredKey):path.join(tlsDir,'local.key.pem');
const certPath=configuredCert?path.resolve(configuredCert):path.join(tlsDir,'local.cert.pem');
const mode=configuredKey?'EXTERNAL_CERTIFICATE':'SELF_SIGNED_LOCAL';

function safeFile(file,{privateFile=false}={}){
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink())throw new Error('uberlit-tls-file-unsafe');
  if(privateFile&&(stat.mode&0o077)!==0)throw new Error('uberlit-tls-key-permissions-unsafe');
  return fs.readFileSync(file);
}

if(!configuredKey&&(!fs.existsSync(keyPath)||!fs.existsSync(certPath))){
  const generated=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-sha256','-nodes','-keyout',keyPath,'-out',certPath,'-days','3650','-subj','/CN=uberlit.local','-addext','subjectAltName=DNS:uberlit.local,DNS:localhost,IP:127.0.0.1'],{encoding:'utf8',stdio:['ignore','ignore','pipe']});
  if((generated.status??1)!==0)throw new Error(`uberlit-tls-generation-failed:${String(generated.stderr||'').slice(0,300)}`);
  fs.chmodSync(keyPath,0o600);fs.chmodSync(certPath,0o600);
}
const key=safeFile(keyPath,{privateFile:true});const cert=safeFile(certPath);

const server=https.createServer({key,cert},(request,response)=>{
  const headers={...request.headers,'x-forwarded-proto':'https'};
  const upstream=http.request({hostname:'127.0.0.1',port:upstreamPort,path:request.url,method:request.method,headers},upstreamResponse=>{
    response.writeHead(upstreamResponse.statusCode||502,upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on('error',()=>{if(!response.headersSent)response.writeHead(502);response.end('UberLit upstream unavailable');});
  request.pipe(upstream);
});
server.on('clientError',(_,socket)=>socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'));
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,bind,resolve);});
const certDigest=`sha256:${crypto.createHash('sha256').update(cert).digest('hex')}`;
process.stdout.write(`${JSON.stringify({ok:true,status:'UBERLIT_TLS_EDGE_READY',bind,port,upstreamPort,certificateMode:mode,certificateDigest:certDigest,businessEffectAuthority:'LOCAL_RUNTIME_ONLY'})}\n`);
await new Promise(resolve=>{const done=()=>resolve();process.once('SIGTERM',done);process.once('SIGINT',done);});
await new Promise(resolve=>server.close(()=>resolve()));
