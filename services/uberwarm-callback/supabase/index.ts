// Supabase Edge fallback for Winnr signed delivery events. No sending ability.
// Public verify_jwt=false route authenticates using Winnr HMAC over RAW bytes.
import postgres from "npm:postgres@3.4.5";
const enc=new TextEncoder();
const json=(body,status=200)=>Response.json(body,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"}});
const hex=buf=>Array.from(new Uint8Array(buf)).map(x=>x.toString(16).padStart(2,"0")).join("");
let sql;
function client(){if(!sql){const uri=Deno.env.get("SUPABASE_DB_URL");if(!uri)throw Error("database-not-configured");sql=postgres(uri,{max:1,prepare:false,connect_timeout:8,idle_timeout:5});}return sql;}
async function verify(req,raw,secret){
 const stamp=req.headers.get("x-winnr-timestamp")||"";
 const header=req.headers.get("x-winnr-signature")||"";
 const s=Number(stamp);
 if(!/^\d{10}$/.test(stamp)||!Number.isFinite(s)||Math.abs(Date.now()/1000-s)>300)return false;
 const signature=header.split(",").map(v=>v.trim()).find(x=>/^v1=[a-f0-9]{64}$/.test(x));
 if(!signature)return false;
 const mac=enc.encode(stamp+".");
 const full=new Uint8Array(mac.length+raw.length);full.set(mac);full.set(raw,mac.length);
 const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
 const candidate=new Uint8Array(signature.slice(3).match(/../g).map(x=>parseInt(x,16)));
 return crypto.subtle.verify("HMAC",key,candidate,full);
}
const isEmail=x=>typeof x==="string"&&x.length<=320&&/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(x)&&x===x.toLowerCase();
export async function handle(req){
 const method=req.method.toUpperCase();
 if(method==="GET"){
  let databaseReadback=false;
  try{
   const row=await client()`SELECT to_regclass('uberwarm_ingress.signed_events') IS NOT NULL AS events_ready, to_regclass('uberwarm_ingress.suppressions') IS NOT NULL AS suppressions_ready`;
   databaseReadback=row.length===1&&row[0].events_ready===true&&row[0].suppressions_ready===true;
  }catch{databaseReadback=false;}
  return json({service:"uberwarm-ingress",httpReady:true,signingConfigured:!!Deno.env.get("WINNR_WEBHOOK_SECRET"),dbConfigured:!!Deno.env.get("SUPABASE_DB_URL"),databaseReadback,outboundAuthority:"NONE",canonicalSuppressionReconciled:false});
 }
 if(method!=="POST")return json({ok:false,status:"METHOD_NOT_ALLOWED"},405);
 const secret=Deno.env.get("WINNR_WEBHOOK_SECRET");
 if(!secret||!secret.startsWith("whsec_")||!Deno.env.get("SUPABASE_DB_URL"))return json({ok:false,status:"UNCONFIGURED"},503);
 const announced=Number(req.headers.get("content-length"));
 if(Number.isFinite(announced)&&announced>65536)return json({ok:false,status:"BODY_TOO_LARGE"},413);
 let raw;try{raw=new Uint8Array(await req.arrayBuffer());}catch{return json({ok:false,status:"BAD_BODY"},400);}
 if(raw.byteLength>65536)return json({ok:false,status:"BODY_TOO_LARGE"},413);
 if(!await verify(req,raw,secret))return json({ok:false,status:"BAD_SIGNATURE"},401);
 let event;try{event=JSON.parse(new TextDecoder().decode(raw));}catch{return json({ok:false,status:"BAD_JSON"},422);}
 if(!event||event.object!=="event"||typeof event.id!=="string"||! /^[A-Za-z0-9._:-]{1,240}$/.test(event.id)||
   typeof event.type!=="string"||event.type.length>120||!event.data||typeof event.data!=="object"||Array.isArray(event.data))
   return json({ok:false,status:"BAD_EVENT_ENVELOPE"},422);
 const adverse=event.type==="email.bounced"||event.type==="email.complained";
 const recipient=adverse?String(event.data.recipient||"").trim().toLowerCase():null;
 if(adverse&&!isEmail(recipient))return json({ok:false,status:"BAD_ADVERSE_RECIPIENT"},422);
 const digest="sha256:"+hex(await crypto.subtle.digest("SHA-256",raw));
 const rDigest=recipient?"sha256:"+hex(await crypto.subtle.digest("SHA-256",enc.encode(recipient))):null;
 const action=event.type==="email.bounced"?"BOUNCE_SUPPRESSED":event.type==="email.complained"?"COMPLAINT_SUPPRESSED":event.type==="email.received"?"REPLY_REVIEW":"OBSERVED";
 try{
  let duplicate=false;
  await client().begin(async tx=>{
   await tx`SELECT pg_advisory_xact_lock(hashtext(${`winnr:${event.id}`}))`;
   const written=await tx`INSERT INTO uberwarm_ingress.signed_events(event_id,event_type,payload_digest,recipient_digest,action)
     VALUES(${event.id},${event.type},${digest},${rDigest},${action}) ON CONFLICT(event_id) DO NOTHING RETURNING event_id`;
   if(!written.length){
    const prior=await tx`SELECT payload_digest FROM uberwarm_ingress.signed_events WHERE event_id=${event.id}`;
    if(prior.length!==1||prior[0].payload_digest!==digest)throw Error("replay-id-payload-conflict");
    duplicate=true;return;
   }
   if(adverse){
    await tx`INSERT INTO uberwarm_ingress.suppressions(recipient,first_event_id,reason)
      VALUES(${recipient},${event.id},${event.type==="email.bounced"?"BOUNCE":"COMPLAINT"}) ON CONFLICT(recipient) DO NOTHING`;
    const check=await tx`SELECT recipient FROM uberwarm_ingress.suppressions WHERE recipient=${recipient}`;
    if(check.length!==1)throw Error("suppression-not-durable");
   }
  });
  return json({ok:true,status:duplicate?"DUPLICATE":action,sendAuthority:"NONE",canonicalSuppressionReconciled:false});
 }catch{return json({ok:false,status:"DURABLE_LEDGER_UNAVAILABLE"},503);}
}
Deno.serve(handle);
