// Zero-upstream-import subset of the source-controlled Winnr HMAC contract.
import {createHmac,timingSafeEqual} from 'node:crypto';
function header(headers,name){return typeof headers?.get==='function'?headers.get(name)||'':Object.entries(headers||{}).find(([k])=>k.toLowerCase()===name)?.[1]||'';}
export function verifyWinnrWebhookSignature({rawBody='',headers={},secret='',now=Date.now(),toleranceSeconds=300}={}) {
  const timestamp=String(header(headers,'x-winnr-timestamp')||'').trim();
  const signatureHeader=String(header(headers,'x-winnr-signature')||'');
  const ts=Number(timestamp);
  if(!timestamp||!Number.isFinite(ts)||Math.abs(Number(now)/1000-ts)>toleranceSeconds)return {ok:false,reason:'invalid-or-stale-timestamp'};
  if(typeof secret!=='string'||!secret.startsWith('whsec_')||!signatureHeader)return {ok:false,reason:'signature-or-secret-missing'};
  const expected=createHmac('sha256',secret).update(`${timestamp}.`).update(Buffer.isBuffer(rawBody)?rawBody:Buffer.from(String(rawBody),'utf8')).digest('hex');
  const ok=signatureHeader.split(',').some(part=>{const c=part.trim();if(!c.startsWith('v1=')||c.length!==67)return false;try{return timingSafeEqual(Buffer.from(c.slice(3)),Buffer.from(expected))}catch{return false}});
  return {ok,reason:ok?null:'signature-mismatch'};
}
export function normalizeWinnrEvent(event={}) {
  // Only the exact recipient is used for one-way bounce/complaint protection.
  const recipient=typeof event?.data?.recipient==='string'?event.data.recipient.trim().toLowerCase():null;
  return {recipient};
}
