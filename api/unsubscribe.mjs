import {Pool} from 'pg';
import {verifyUberWarmUnsubscribeToken,persistUberWarmUnsubscribe} from '../src/uberwarm-unsubscribe.mjs';
let pool;
const htmlHeaders={'cache-control':'no-store','referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
  'x-content-type-options':'nosniff','content-type':'text/html; charset=utf-8'};
const html=(text,status)=>new Response(text,{status,headers:htmlHeaders});
const json=(body,status)=>Response.json(body,{status,headers:{'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}});
function db(env){if(!pool)pool=new Pool({connectionString:env.DATABASE_URL,max:1,idleTimeoutMillis:10000});return pool;}
const fail='Unable to process this request. No email settings were changed.';
export function createHandlers({env=process.env,poolFactory=db,persist=persistUberWarmUnsubscribe}={}){
 const read=request=>{
   let token;
   try{token=new URL(request.url).searchParams.get('token')||'';}catch{return null;}
   return verifyUberWarmUnsubscribeToken({token,secret:env.UBERWARM_UNSUBSCRIBE_SECRET});
 };
 const GET=async request=>{
  if(!read(request))return html(fail,400);
  // Escaping is unnecessary here: no user-controlled value or recipient email
  // is interpolated into the markup; the form preserves its signed URL action.
  return html(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe from UberBond</title><main><h1>Stop UberBond commercial emails</h1><p>You can stop all future UberBond commercial emails to the address associated with this link.</p><form method="post"><button type="submit">Unsubscribe</button></form></main></html>`,200);
 };
 const POST=async request=>{
  if(!env.UBERWARM_UNSUBSCRIBE_SECRET||!env.DATABASE_URL)return json({ok:false,status:'UNAVAILABLE'},503);
  const proof=read(request);
  if(!proof)return html(fail,400);
  try{
   await persist(poolFactory(env),proof);
   // Both form POST and standardized one-click List-Unsubscribe-Post receive
   // a complete 2xx only after DB readback. No queued/deferred opt-out.
   return html('<!doctype html><html lang="en"><meta charset="utf-8"><title>Unsubscribed</title><h1>You have been unsubscribed</h1><p>No further UberBond commercial email will be sent to this address.</p></html>',200);
  }catch{return html('Your request could not be confirmed. Please try again.',503);}
 };
 return {GET,POST};
}
export const {GET,POST}=createHandlers();
