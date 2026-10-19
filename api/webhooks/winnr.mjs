/** Signed Winnr webhook receiver: immutable idempotency + one-way suppression. */
import {Pool} from 'pg';
import {verifyWinnrWebhookSignature} from '../../src/uberwinnr-adapter.mjs';
import {parseAuthenticatedWinnrEvent,persistAuthenticatedWinnrEvent} from '../../src/uberwarm-winnr-webhook-suppression.mjs';
let pool;
function getPool(env){if(!pool)pool=new Pool({connectionString:env.DATABASE_URL,max:2,idleTimeoutMillis:10000});return pool;}
const result=(payload,status)=>Response.json(payload,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
export function createFetchHandler({env=process.env,poolFactory=getPool,persist=persistAuthenticatedWinnrEvent,clock=Date.now}={}) {
 return async request=>{
  if(!env.WINNR_WEBHOOK_SECRET?.startsWith('whsec_'))
    return result({ok:false,status:'REFUSED',reasonCodes:['verified-winnr-webhook-secret-required']},503);
  if(!env.DATABASE_URL)
    return result({ok:false,status:'REFUSED',reasonCodes:['canonical-database-url-required']},503);
  const length=Number(request.headers.get('content-length'));
  if(Number.isFinite(length)&&length>65536)
    return result({ok:false,status:'REFUSED',reasonCodes:['body-too-large']},413);
  let raw;
  try{raw=Buffer.from(await request.arrayBuffer());}
  catch{return result({ok:false,status:'REFUSED',reasonCodes:['raw-body-unavailable']},400);}
  if(raw.length>65536)return result({ok:false,status:'REFUSED',reasonCodes:['body-too-large']},413);
  const proof=verifyWinnrWebhookSignature({rawBody:raw,headers:request.headers,
    secret:env.WINNR_WEBHOOK_SECRET,now:Number(clock()),toleranceSeconds:300});
  if(proof.ok!==true)
    return result({ok:false,status:'REFUSED',reasonCodes:['invalid-or-stale-signature']},401);
  const parsed=parseAuthenticatedWinnrEvent(raw);
  if(!parsed.ok)return result({ok:false,status:'REFUSED',reasonCodes:[parsed.reason]},422);
  try{
    const outcome=await persist(poolFactory(env),parsed);
    return result({ok:true,status:outcome.status,duplicate:outcome.duplicate,
      suppressionHeld:outcome.suppressionHeld,sendAuthority:'NONE',businessEffectAuthority:'NONE'},200);
  }catch{
    // 503 causes provider retry; never ACK an adverse event that wasn't durably
    // inserted and suppressed. Never expose PII or private error messages.
    return result({ok:false,status:'REFUSED',reasonCodes:['webhook-ledger-or-suppression-unavailable']},503);
  }
 };
}
export const POST=createFetchHandler();
