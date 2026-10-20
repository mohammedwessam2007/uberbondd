import {Pool} from 'pg';
import {timingSafeEqual} from 'node:crypto';
import {attachDatabasePool} from '@neon/functions';
import {createHandlers} from './api/unsubscribe.mjs';
const origin=process.env.ORIGIN_SECRET;
if(typeof origin!=='string'||origin.length<32)throw Error('protected-origin-key-required');
const expected=Buffer.from(origin);
const pool=new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:8000,statement_timeout:10000});
attachDatabasePool(pool,{onUnexpectedError:()=>{console.error('database-idle-error-redacted');}});
async function client(){
 const c=await pool.connect();
 try{
  const q=await c.query("SELECT current_database() AS database,pg_is_in_recovery() AS recovery,to_regclass('public.suppressions') IS NOT NULL AS stops,to_regclass('public.winnr_webhook_events') IS NOT NULL AS events");
  const r=q.rows[0];
  if(q.rows.length!==1||r.database!=='neondb'||r.recovery!==false||r.stops!==true||r.events!==true)throw Error('canonical-binding-required');
  return c;
 }catch(e){c.release();throw e;}
}
const db={async query(sql,values){const c=await client();try{return await c.query(sql,values);}finally{c.release();}}};
const handlers=createHandlers({env:process.env,poolFactory:()=>db});
export async function close(){await pool.end();}
export async function fetch(request){
 const provided=request.headers.get('x-secret');
 if(provided===null)return new Response('Unauthorized',{status:401});
 const bytes=Buffer.from(provided);
 if(bytes.length!==expected.length||!timingSafeEqual(bytes,expected))return new Response('Unauthorized',{status:401});
 const path=new URL(request.url).pathname;
 if(path==='/health'&&request.method==='GET'){
  let ready=false;try{const c=await client();c.release();ready=true;}catch{}
  return Response.json({service:'uberwarm-private-optout',canonicalDatabaseVerified:ready,sendAuthority:'NONE'},{status:ready?200:503,headers:{'cache-control':'no-store'}});
 }
 if(path==='/unsubscribe'&&request.method==='POST'){
  const response=await handlers.POST(request);
  if(response.status!==200)return response;
  return Response.json({ok:true,status:'UNSUBSCRIBED',canonicalDatabaseVerified:true,sendAuthority:'NONE'},{headers:{'cache-control':'no-store'}});
 }
 return new Response('Not found',{status:404});
}
export default {fetch};
