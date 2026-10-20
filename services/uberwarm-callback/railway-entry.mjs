import {Pool} from 'pg';
import {createFetchHandler} from './api/webhooks/winnr.mjs';
import {createHandlers} from './api/unsubscribe.mjs';
const env=process.env;
let pool;
function rawDb(){
 if(!pool){pool=new Pool({connectionString:env.DATABASE_URL,max:2,connectionTimeoutMillis:8000,statement_timeout:10000});pool.on('error',()=>{});}
 return pool;
}
export async function close(){if(pool)await pool.end();}
async function verifiedClient(){
 const client=await rawDb().connect();
 try{
  const q=await client.query("SELECT current_database() AS database,pg_is_in_recovery() AS recovery,to_regclass('public.suppressions') IS NOT NULL AS stops,to_regclass('public.winnr_webhook_events') IS NOT NULL AS events");
  const r=q.rows[0];
  if(env.UBERWARM_EXPECTED_CANONICAL_DATABASE!=='railway'||q.rows.length!==1||r.database!=='railway'||r.recovery!==false||r.stops!==true||r.events!==true)throw Error('canonical-binding-required');
  return client;
 }catch(error){client.release();throw error;}
}
const db=()=>({connect:verifiedClient,async query(sql,values){const c=await verifiedClient();try{return await c.query(sql,values);}finally{c.release();}}});
const webhook=createFetchHandler({env,poolFactory:db});
const unsubscribe=createHandlers({env,poolFactory:db});
const json=(data,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
export async function fetch(request) {
 const path=new URL(request.url).pathname;
 if(path==='/api/health'&&request.method==='GET'){
  let canonicalDatabaseVerified=false;
  try{
   if(env.DATABASE_URL&&env.UBERWARM_EXPECTED_CANONICAL_DATABASE==='railway'){
    const result=await db().query("SELECT current_database() AS database,pg_is_in_recovery() AS recovery,to_regclass('public.suppressions') IS NOT NULL AS stops,to_regclass('public.winnr_webhook_events') IS NOT NULL AS events");
    const r=result.rows[0];
    canonicalDatabaseVerified=result.rows.length===1&&r.database==='railway'&&r.recovery===false&&r.stops===true&&r.events===true;
   }
  }catch{}
  return json({service:'uberwarm-canonical-callback',httpReady:true,canonicalDatabaseVerified,
   signingConfigured:typeof env.WINNR_WEBHOOK_SECRET==='string'&&env.WINNR_WEBHOOK_SECRET.startsWith('whsec_'),
   unsubscribeConfigured:typeof env.UBERWARM_UNSUBSCRIBE_SECRET==='string'&&env.UBERWARM_UNSUBSCRIBE_SECRET.length>=32,
   historicalBaseline:true,currentSuppressionContinuityVerified:false,sendAuthority:'NONE'});
 }
 if(path==='/api/webhooks/winnr')return request.method==='POST'?webhook(request):json({ok:false,status:'METHOD_NOT_ALLOWED'},405);
 if(path==='/api/unsubscribe'){
  if(request.method==='GET')return unsubscribe.GET(request);
  if(request.method==='POST'){
   const local=await unsubscribe.POST(request.clone());
   if(local.status!==200)return local;
   const secret=env.UBERWARM_NEON_ORIGIN_SECRET;
   if(typeof secret!=='string'||secret.length<32)return json({ok:false,status:'CROSS_STORE_OPTOUT_UNCONFIRMED',sendAuthority:'NONE'},503);
   try{
    const target=new URL('https://br-long-glade-at2hwz37-uberwarmoptout.compute.c-9.us-east-1.aws.neon.tech/unsubscribe');
    target.searchParams.set('token',new URL(request.url).searchParams.get('token')||'');
    const remote=await globalThis.fetch(target,{method:'POST',headers:{'x-secret':secret,'content-type':'application/x-www-form-urlencoded'},body:'List-Unsubscribe=One-Click',redirect:'error',signal:AbortSignal.timeout(12000)});
    if(remote.status!==200)throw Error('mirror-unavailable');
    const receipt=await remote.json();
    if(receipt.ok!==true||receipt.status!=='UNSUBSCRIBED'||receipt.canonicalDatabaseVerified!==true||receipt.sendAuthority!=='NONE')throw Error('mirror-readback-unverified');
    return local;
   }catch{return json({ok:false,status:'CROSS_STORE_OPTOUT_UNCONFIRMED',sendAuthority:'NONE'},503);}
  }
  return json({ok:false,status:'METHOD_NOT_ALLOWED'},405);
 }
 return json({ok:false,status:'NOT_FOUND'},404);
}
export default {port:Number(env.PORT||3000),fetch};
