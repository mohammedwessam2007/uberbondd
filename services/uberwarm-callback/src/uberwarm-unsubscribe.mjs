/** Permanent, self-service global opt-out capability. HMAC tokens are created
 * ONLY by a protected campaign sender after a specific recipient was approved.
 * GET never opts out (mail security scanners prefetch GET). POST suppresses at
 * once in canonical Postgres. No external sending, revival or automation. */
import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
const isEmail = value=>typeof value==='string'&&value.length<=320&&value===value.toLowerCase()&&
  /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(value);
const validSecret=s=>typeof s==='string'&&s.length>=32&&s.length<=512;
const mac=(body,secret)=>createHmac('sha256',secret).update(body,'utf8').digest('base64url');

export function createUberWarmUnsubscribeToken({recipientEmail,secret}={}) {
 if(!isEmail(recipientEmail)||!validSecret(secret))throw Error('exact-recipient-and-protected-optout-secret-required');
 // Never expires while the same protected key is retained: no grace-window
 // loophole in which an old recipient cannot decline marketing.
 const body=Buffer.from(JSON.stringify({v:1,email:recipientEmail,scope:'ALL_COMMERCIAL'})).toString('base64url');
 return `${body}.${mac(body,secret)}`;
}

export function verifyUberWarmUnsubscribeToken({token,secret}={}) {
 if(!validSecret(secret)||typeof token!=='string'||token.length>1200||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(token))return null;
 const point=token.lastIndexOf('.'),body=token.slice(0,point),signature=token.slice(point+1);
 const expected=mac(body,secret);
 try{
  if(!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;
  const data=JSON.parse(Buffer.from(body,'base64url').toString('utf8'));
  if(!data||Object.keys(data).sort().join(',')!=='email,scope,v'||
     data.v!==1||data.scope!=='ALL_COMMERCIAL'||!isEmail(data.email)||
     createUberWarmUnsubscribeToken({recipientEmail:data.email,secret})!==token)return null;
  return Object.freeze({recipientEmail:data.email,scope:'ALL_COMMERCIAL'});
 }catch{return null;}
}

export async function persistUberWarmUnsubscribe(pool,{recipientEmail}={}) {
 if(!isEmail(recipientEmail)||!pool||typeof pool.query!=='function')
   throw Error('verified-recipient-and-shared-postgres-required');
 const id='optout_'+createHash('sha256').update(recipientEmail).digest('hex').slice(0,40);
 const row={id,value:recipientEmail,reason:'recipient-self-service-unsubscribe',scope:'ALL_COMMERCIAL'};
 // If the recipient already appeared as bounced/complained, preserve the
 // original hold; never convert adverse evidence to a weaker state.
 await pool.query(`INSERT INTO suppressions(id,value,created_at,updated_at,data)
   VALUES($1,$2,now(),now(),$3::jsonb) ON CONFLICT (value) DO NOTHING`,
 [id,recipientEmail,JSON.stringify(row)]);
 const result=await pool.query('SELECT value FROM suppressions WHERE value=$1',[recipientEmail]);
 if(result.rows.length!==1||result.rows[0].value!==recipientEmail)
   throw Error('unsubscribe-suppression-readback-failed');
 return Object.freeze({ok:true,status:'UNSUBSCRIBED',suppressionHeld:true,sendAuthority:'NONE'});
}
