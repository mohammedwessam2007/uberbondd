/**
 * Winnr signed, direct-to-canonical Neon webhook. Zero outbound sending.
 * Uses only Neon-injected DATABASE_URL and encrypted provider whsec_ env.
 * Event receipt and canonical suppressions commit atomically in the SAME DB.
 */
const { Pool }=require('pg');
const { createHash,createHmac,timingSafeEqual }=require('node:crypto');
let pool;
const sha=v=>'sha256:'+createHash('sha256').update(v).digest('hex');
const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}});
function db(){if(!process.env.DATABASE_URL)throw Error('missing-canonical-database');return pool??=new Pool({connectionString:process.env.DATABASE_URL,max:2,connectionTimeoutMillis:8000,idleTimeoutMillis:10000});}
const adverse=new Set(['email.bounced','email.complained']);
const validEmail=s=>typeof s==='string'&&s.length<=320&&s===s.toLowerCase()&&/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(s);
const validId=s=>typeof s==='string'&&/^[a-zA-Z0-9._:-]{1,240}$/.test(s);
function signed(body,request,secret){
 const stamp=request.headers.get('x-winnr-timestamp')||'',sig=request.headers.get('x-winnr-signature')||'';
 if(!/^\d{10}$/.test(stamp)||Math.abs(Date.now()/1000-Number(stamp))>300)return false;
 if(!secret.startsWith('whsec_'))return false;
 const expected=createHmac('sha256',secret).update(stamp+'.').update(body).digest('hex');
 return sig.split(',').some(x=>{const m=x.trim().match(/^v1=([a-f0-9]{64})$/);return Boolean(m)&&timingSafeEqual(Buffer.from(m[1]),Buffer.from(expected));});
}
async function canonicalState(){
 const c=db();
 const r=await c.query(`SELECT to_regclass('public.suppressions') IS NOT NULL AS suppressions,
  to_regclass('public.winnr_webhook_events') IS NOT NULL AS events,
  current_database() AS db`);
 if(!r.rows[0]?.suppressions||!r.rows[0]?.events)return null;
 const a=await c.query("SELECT count(*)::int AS n FROM winnr_webhook_events WHERE action='SUPPRESSED_RECIPIENT'");
 // For every adverse event, a matching canonical stop-list recipient digest
 // must remain present. pgcrypto digest is supplied by the Neon Postgres DB.
 const b=await c.query(`SELECT count(*)::int AS n FROM winnr_webhook_events e
  WHERE e.action='SUPPRESSED_RECIPIENT' AND EXISTS (
   SELECT 1 FROM suppressions s
   WHERE e.recipient_digest='sha256:'||encode(digest(lower(s.value),'sha256'),'hex'))`);
 const pending=await c.query("SELECT count(*)::int AS n FROM winnr_webhook_events WHERE action='REPLY_REQUIRES_REVIEW'");
 return {adverse:a.rows[0].n,reconciled:b.rows[0].n,pendingReplies:pending.rows[0].n,canonicalDatabaseReadback:true};
}
async function handler(request){
 const method=request.method.toUpperCase();
 if(method==='GET'){
  let state;try{state=await canonicalState();}catch{state=null;}
  return json({service:'uberwarm-ingress',httpReady:true,
   signingConfigured:!!process.env.WINNR_WEBHOOK_SECRET?.startsWith('whsec_'),
   dbConfigured:!!process.env.DATABASE_URL,
   databaseReadback:!!state,
   adverseEventCount:state?.adverse??null,
   canonicalReconciledAdverseEventCount:state?.reconciled??null,
   pendingReplyReviewCount:state?.pendingReplies??null,
   canonicalSuppressionReconciled:!!state&&state.adverse===state.reconciled,
   outboundAuthority:'NONE'});
 }
 if(method!=='POST')return json({ok:false,status:'METHOD_NOT_ALLOWED'},405);
 const secret=process.env.WINNR_WEBHOOK_SECRET;
 if(!secret?.startsWith('whsec_')||!process.env.DATABASE_URL)return json({ok:false,status:'UNCONFIGURED'},503);
 if(Number(request.headers.get('content-length'))>65536)return json({ok:false,status:'BODY_TOO_LARGE'},413);
 let raw;try{raw=Buffer.from(await request.arrayBuffer());}catch{return json({ok:false,status:'BAD_BODY'},400);}
 if(raw.length>65536)return json({ok:false,status:'BODY_TOO_LARGE'},413);
 if(!signed(raw,request,secret))return json({ok:false,status:'INVALID_SIGNATURE'},401);
 let e;try{e=JSON.parse(raw.toString('utf8'));}catch{return json({ok:false,status:'INVALID_JSON'},422);}
 if(!e||e.object!=='event'||!validId(e.id)||typeof e.type!=='string'||e.type.length>120||!e.data||typeof e.data!=='object'||Array.isArray(e.data))return json({ok:false,status:'INVALID_ENVELOPE'},422);
 const target=adverse.has(e.type)?String(e.data.recipient||'').trim().toLowerCase():null;
 if(adverse.has(e.type)&&!validEmail(target))return json({ok:false,status:'INVALID_RECIPIENT'},422);
 const action=adverse.has(e.type)?'SUPPRESSED_RECIPIENT':e.type==='email.received'?'REPLY_REQUIRES_REVIEW':'RECORDED_NO_SUPPRESSION';
 let occurred=null;
 if(e.created!==undefined){if(typeof e.created!=='string'||!Number.isFinite(Date.parse(e.created)))return json({ok:false,status:'INVALID_TIMESTAMP'},422);occurred=e.created;}
 let client;
 try{
  client=await db().connect();await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`winnr:${e.id}`]);
  const digest=sha(raw),recipientDigest=target?sha(target):null;
  const insert=await client.query(`INSERT INTO winnr_webhook_events(event_id,event_type,payload_digest,recipient_digest,action,provider_occurred_at)
   VALUES($1,$2,$3,$4,$5,$6::timestamptz) ON CONFLICT(event_id) DO NOTHING RETURNING event_id`,
   [e.id,e.type,digest,recipientDigest,action,occurred]);
  const duplicate=insert.rowCount===0;
  if(duplicate){const old=await client.query('SELECT payload_digest FROM winnr_webhook_events WHERE event_id=$1',[e.id]);if(old.rows.length!==1||old.rows[0].payload_digest!==digest)throw Error('event-id-collision');}
  if(target){
   const row={id:'winnr_'+sha(target).slice(7,47),value:target,reason:'winnr-signed-adverse-event',sourceEventId:e.id,eventType:e.type};
   await client.query(`INSERT INTO suppressions(id,value,created_at,updated_at,data)
    VALUES($1,$2,now(),now(),$3::jsonb) ON CONFLICT (value) DO NOTHING`,[row.id,target,JSON.stringify(row)]);
   const found=await client.query('SELECT value FROM suppressions WHERE value=$1',[target]);if(found.rows.length!==1||found.rows[0].value!==target)throw Error('suppression-readback-failed');
  }
  await client.query('COMMIT');
  return json({ok:true,status:duplicate?'DUPLICATE':action,suppressionHeld:!!target,sendAuthority:'NONE'});
 }catch{if(client)await client.query('ROLLBACK').catch(()=>{});return json({ok:false,status:'CANONICAL_DATABASE_UNAVAILABLE'},503);}
 finally{client?.release();}
}
module.exports={fetch:handler,__testing:{signed,validEmail,validId,sha}};
