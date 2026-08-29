import { Pool } from 'pg';
import { verifyLemonSqueezyWebhook } from '../../src/billing-webhook-boundary.mjs';
import { persistVerifiedBillingEvent } from '../../src/billing-webhook-repository.mjs';

let pool;
function getPool(env){
  if(!pool) pool=new Pool({connectionString:env.DATABASE_URL,max:2,idleTimeoutMillis:10000});
  return pool;
}
function json(payload,status=200){
  return Response.json(payload,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
}

export function createFetchHandler(deps={}){
  const env=deps.env||process.env;
  const poolFactory=deps.getPool||getPool;
  const persist=deps.persistVerifiedBillingEvent||persistVerifiedBillingEvent;
  const now=deps.now||(()=>new Date());
  return async function handler(request){
    if(!env.LEMONSQUEEZY_WEBHOOK_SECRET&&!env.BILLING_WEBHOOK_SECRET){
      return json({ok:false,status:'REFUSED',reasonCodes:['billing-webhook-secret-not-configured']},503);
    }
    if(!env.DATABASE_URL){
      return json({ok:false,status:'REFUSED',reasonCodes:['database-url-required']},503);
    }
    let rawText;
    try{rawText=await request.text();}catch{return json({ok:false,status:'REFUSED',reasonCodes:['raw-body-read-failed']},400);}
    if(Buffer.byteLength(rawText,'utf8')>1024*1024){
      return json({ok:false,status:'REFUSED',reasonCodes:['body-too-large']},413);
    }
    const verified=verifyLemonSqueezyWebhook({
      rawBody:Buffer.from(rawText,'utf8'),
      signingSecret:env.LEMONSQUEEZY_WEBHOOK_SECRET||env.BILLING_WEBHOOK_SECRET,
      signature:request.headers.get('x-signature'),
      eventName:request.headers.get('x-event-name')
    });
    if(!verified.ok)return json(verified,verified.httpStatus||400);
    try{
      const persisted=await persist(poolFactory(env),verified.event,{receivedAt:now()});
      return json({ok:true,status:persisted.status,duplicate:persisted.duplicate,providerEventKey:verified.event.providerEventKey,reconciliationRequired:true,businessEffectAuthority:'NONE'},200);
    }catch{
      return json({ok:false,status:'REFUSED',reasonCodes:['verified-webhook-not-durably-persisted']},503);
    }
  };
}

export const POST=createFetchHandler();
