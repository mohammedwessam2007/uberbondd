#!/usr/bin/env node
import http from 'node:http';
import { compileFounderPrivateGatewayBinding, founderGatewayAuthorized } from '../src/sovereign-founder-private-gateway.mjs';

const HOST=String(process.env.UBERBOND_FOUNDER_GATEWAY_HOST||'').trim();
const PORT=Number(process.env.UBERBOND_FOUNDER_GATEWAY_PORT||8788);
const TOKEN=String(process.env.UBERBOND_FOUNDER_GATEWAY_TOKEN||'');
const UPSTREAM_HOST='127.0.0.1';
const UPSTREAM_PORT=8787;
const MAX_BODY=16_384;
const ALLOWED=new Set(['/','/api/status','/api/command']);
const binding=compileFounderPrivateGatewayBinding({host:HOST,port:PORT,token:TOKEN});

function reply(res,status,payload,extra={}){
  const body=`${JSON.stringify(payload,null,2)}\n`;
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body),'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; frame-ancestors 'none'",...extra});
  res.end(body);
}
function authenticate(req,res){
  if(founderGatewayAuthorized(TOKEN,req.headers.authorization))return true;
  reply(res,401,{ok:false,status:'FOUNDER_PRIVATE_GATEWAY_AUTH_REQUIRED',publicExposureAuthorized:false,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'},{'www-authenticate':'Basic realm="UberBond Founder Console", charset="UTF-8"'});
  return false;
}
async function readBody(req){
  if(req.method!=='POST')return Buffer.alloc(0);
  let size=0;const chunks=[];
  for await(const chunk of req){size+=chunk.length;if(size>MAX_BODY)throw new Error('request-body-too-large');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
async function proxy(req,res){
  const body=await readBody(req);
  const headers={host:`${UPSTREAM_HOST}:${UPSTREAM_PORT}`,origin:`http://${UPSTREAM_HOST}:${UPSTREAM_PORT}`,accept:String(req.headers.accept||'*/*')};
  if(body.length){headers['content-type']=String(req.headers['content-type']||'application/json');headers['content-length']=String(body.length);}
  const upstream=http.request({host:UPSTREAM_HOST,port:UPSTREAM_PORT,path:req.url,method:req.method,headers,timeout:65*60_000},up=>{
    const safeHeaders={};
    for(const key of ['content-type','content-length','cache-control','x-content-type-options','content-security-policy'])if(up.headers[key]!=null)safeHeaders[key]=up.headers[key];
    res.writeHead(up.statusCode||502,safeHeaders);up.pipe(res);
  });
  upstream.on('timeout',()=>upstream.destroy(new Error('loopback-founder-console-timeout')));
  upstream.on('error',error=>{if(!res.headersSent)reply(res,502,{ok:false,status:'FOUNDER_PRIVATE_GATEWAY_UPSTREAM_REFUSED',reasonCodes:[String(error?.message||error).slice(0,200)],publicExposureAuthorized:false,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'});else res.destroy();});
  if(body.length)upstream.write(body);upstream.end();
}
if(!binding.ok){process.stderr.write(`${JSON.stringify(binding,null,2)}\n`);process.exit(2);}
const server=http.createServer(async(req,res)=>{
  try{
    if(!authenticate(req,res))return;
    if(!['GET','POST'].includes(req.method||''))return reply(res,405,{ok:false,status:'FOUNDER_PRIVATE_GATEWAY_METHOD_REFUSED'});
    if(!ALLOWED.has(String(req.url||'')))return reply(res,404,{ok:false,status:'FOUNDER_PRIVATE_GATEWAY_ROUTE_REFUSED'});
    if(req.method==='POST'&&req.url!=='/api/command')return reply(res,405,{ok:false,status:'FOUNDER_PRIVATE_GATEWAY_METHOD_REFUSED'});
    if(req.method==='GET'&&req.url==='/api/command')return reply(res,405,{ok:false,status:'FOUNDER_PRIVATE_GATEWAY_METHOD_REFUSED'});
    await proxy(req,res);
  }catch(error){reply(res,400,{ok:false,status:'FOUNDER_PRIVATE_GATEWAY_REQUEST_REFUSED',reasonCodes:[String(error?.message||error).slice(0,200)],publicExposureAuthorized:false,businessEffectAuthority:'NONE',externalEffectAuthority:'NONE'});}
});
server.listen(PORT,HOST,()=>process.stdout.write(`${JSON.stringify({ok:true,status:'FOUNDER_PRIVATE_GATEWAY_LISTENING',host:HOST,port:PORT,upstream:'127.0.0.1:8787',hostClass:binding.hostClass,tokenRequired:true,publicExposureAuthorized:false},null,2)}\n`));
