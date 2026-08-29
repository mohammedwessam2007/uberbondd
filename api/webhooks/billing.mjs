import { Pool } from 'pg';
import { verifyLemonSqueezyWebhook } from '../../src/billing-webhook-boundary.mjs';
import { persistVerifiedBillingEvent } from '../../src/billing-webhook-repository.mjs';

const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
let pool;
function getPool(env){if(!pool) pool=new Pool({connectionString:env.DATABASE_URL,max:2,idleTimeoutMillis:10000}); return pool;}
function send(res,status,payload){if(typeof res.status==='function'&&typeof res.json==='function')return res.status(status).json(payload);res.writeHead(status,JSON_HEADERS);res.end(JSON.stringify(payload));}
async function rawBody(req,max=1024*1024){if(Buffer.isBuffer(req?.rawBody))return req.rawBody;if(Buffer.isBuffer(req?.body))return req.body;if(typeof req?.body==='string')return Buffer.from(req.body);if(req?.body&&typeof req.body==='object')throw new Error('raw-body-unavailable-after-parser');const chunks=[];let n=0;for await(const chunk of req){n+=chunk.length;if(n>max)throw new Error('body-too-large');chunks.push(chunk);}return Buffer.concat(chunks);}

export function createHandler(deps={}){
 const env=deps.env||process.env; const poolFactory=deps.getPool||getPool; const persist=deps.persistVerifiedBillingEvent||persistVerifiedBillingEvent; const readRawBody=deps.readRawBody||rawBody;
 return async function handler(req,res){
   if(String(req?.method||'').toUpperCase()!=='POST')return send(res,405,{ok:false,status:'REFUSED',reasonCodes:['post-required']});
   if(!env.BILLING_WEBHOOK_SECRET||!env.DATABASE_URL)return send(res,503,{ok:false,status:'REFUSED',reasonCodes:['billing-webhook-runtime-not-configured']});
   let raw; try{raw=await readRawBody(req);}catch{return send(res,400,{ok:false,status:'REFUSED',reasonCodes:['raw-body-required-and-must-remain-unparsed']});}
   const verified=verifyLemonSqueezyWebhook({rawBody:raw,signingSecret:env.BILLING_WEBHOOK_SECRET,signature:req?.headers?.['x-signature'],eventName:req?.headers?.['x-event-name']});
   if(!verified.ok)return send(res,verified.httpStatus||400,verified);
   try{const persisted=await persist(poolFactory(env),verified.event,{receivedAt:new Date()});return send(res,200,{ok:true,status:persisted.status,duplicate:persisted.duplicate,providerEventKey:verified.event.providerEventKey,reconciliationRequired:true,businessEffectAuthority:'NONE'});}catch{return send(res,503,{ok:false,status:'REFUSED',reasonCodes:['verified-webhook-not-durably-persisted']});}
 };
}
export default createHandler();
