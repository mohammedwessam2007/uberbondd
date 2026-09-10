#!/usr/bin/env node
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const MAX_BODY=350_000;
const MAX_RESPONSE=1_500_000;
const SOCKET=path.resolve(process.env.UBERBOND_MODEL_PROXY_SOCKET || '/run/uberbond-model/proxy.sock');
const ENDPOINT=String(process.env.OPEN_MODEL_ENDPOINT || '').trim();
const MODEL=String(process.env.OPEN_MODEL_MODEL || '').trim();
const API_KEY=String(process.env.OPEN_MODEL_API_KEY || '');
const ENABLED=String(process.env.OPEN_MODEL_AGENT_ENABLED || '').toLowerCase()==='true';
const text=(v,max=1000)=>String(v??'').trim().slice(0,max);
function config(){
  const reasons=[];let url=null;
  try { url=new URL(ENDPOINT); } catch { reasons.push('valid-local-model-endpoint-required'); }
  if(url && !(url.protocol==='http:' && ['127.0.0.1','localhost','::1','[::1]'].includes(url.hostname))) reasons.push('model-proxy-endpoint-must-be-host-loopback-http');
  if(!MODEL) reasons.push('local-model-identity-required');
  if(!ENABLED) reasons.push('local-model-explicit-enable-required');
  return {ok:reasons.length===0,reasons,url};
}
function targetUrl(base){
  const url=new URL(base.toString());
  const normalized=url.pathname.replace(/\/$/,'');
  if(!/\/v1\/chat\/completions$/.test(normalized)) url.pathname=`${normalized}/v1/chat/completions`.replace(/\/+/g,'/');
  return url.toString();
}
function json(res,status,payload){const body=JSON.stringify(payload);res.writeHead(status,{'content-type':'application/json','content-length':Buffer.byteLength(body),'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(body);}
async function readBody(req){let total=0;const chunks=[];for await(const chunk of req){total+=chunk.length;if(total>MAX_BODY)throw new Error('model-proxy-request-too-large');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
const cfg=config();
if(!cfg.ok){process.stderr.write(`${JSON.stringify({ok:false,status:'SOVEREIGN_LOCAL_MODEL_PROXY_REFUSED',reasonCodes:cfg.reasons})}\n`);process.exit(2);}
await fs.mkdir(path.dirname(SOCKET),{recursive:true});await fs.rm(SOCKET,{force:true}).catch(()=>{});
const server=http.createServer(async(req,res)=>{
  try{
    if(req.method!=='POST'||req.url!=='/v1/chat/completions')return json(res,404,{ok:false,status:'MODEL_PROXY_ROUTE_REFUSED'});
    const incoming=await readBody(req);
    if(!Array.isArray(incoming.messages)||!incoming.messages.length)return json(res,400,{ok:false,status:'MODEL_PROXY_MESSAGES_REQUIRED'});
    const body={...incoming,model:MODEL,stream:false};
    const headers={'content-type':'application/json'};if(API_KEY)headers.authorization=`Bearer ${API_KEY}`;
    const upstream=await fetch(targetUrl(cfg.url),{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(180_000)});
    const raw=await upstream.text();
    if(Buffer.byteLength(raw)>MAX_RESPONSE)return json(res,502,{ok:false,status:'MODEL_PROXY_RESPONSE_TOO_LARGE'});
    if(upstream.ok){
      let observed;try{observed=JSON.parse(raw);}catch{return json(res,502,{ok:false,status:'MODEL_PROXY_RESPONSE_JSON_INVALID'});}
      const observedModel=text(observed?.model,400);
      if(observedModel && observedModel!==MODEL)return json(res,502,{ok:false,status:'MODEL_PROXY_IDENTITY_MISMATCH',configuredModel:MODEL,observedModel});
    }
    res.writeHead(upstream.status,{'content-type':upstream.headers.get('content-type')||'application/json','content-length':Buffer.byteLength(raw),'cache-control':'no-store','x-content-type-options':'nosniff'});res.end(raw);
  }catch(error){json(res,502,{ok:false,status:'SOVEREIGN_LOCAL_MODEL_PROXY_FAILURE',reasonCodes:[text(error?.message||error,300)]});}
});
server.on('error',error=>{process.stderr.write(`${JSON.stringify({ok:false,status:'SOVEREIGN_LOCAL_MODEL_PROXY_FAILURE',reasonCodes:[text(error?.message||error,300)]})}\n`);process.exitCode=2;});
server.listen(SOCKET,()=>{fs.chmod(SOCKET,0o660).catch(()=>{});process.stdout.write(`${JSON.stringify({ok:true,status:'SOVEREIGN_LOCAL_MODEL_PROXY_LISTENING',socket:SOCKET,model:MODEL,endpointClass:'HOST_LOOPBACK_ONLY',publicNetworkAuthority:'NONE',loopbackModelAuthority:'CONFIGURED_LOCAL_ONLY'})}\n`);});
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>fs.rm(SOCKET,{force:true}).finally(()=>process.exit(0))));
