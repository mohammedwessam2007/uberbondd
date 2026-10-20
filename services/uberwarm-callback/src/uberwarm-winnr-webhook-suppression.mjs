/**
 * Winnr verified webhook effects. A provider-signed bounce/complaint may only
 * add a canonical global suppression. Positive events never unsuppress, resume,
 * make mailboxes ready or submit mail. Event IDs and payload digests are durable
 * and replay-idempotent. All body fields except the minimal suppression email
 * are excluded from persistence. The environment must have the real shared
 * canonical Postgres suppressions table; an empty shadow database fails closed.
 */
import {createHash} from 'node:crypto';
import {normalizeWinnrEvent} from './winnr-events.mjs';

const sha = x => 'sha256:'+createHash('sha256').update(x).digest('hex');
const validId = s => typeof s==='string' && /^[a-zA-Z0-9._:-]{1,240}$/.test(s);
const validEmail = s => typeof s==='string'&&s.length<=320&&
  /^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(s)&&s===s.toLowerCase();
const adverse = new Set(['email.bounced','email.complained']);

export function parseAuthenticatedWinnrEvent(raw) {
  let json;
  try{json=JSON.parse(raw.toString('utf8'));}catch{return {ok:false,reason:'invalid-event-json'};}
  if(!json||typeof json!=='object'||Array.isArray(json)||!validId(json.id)||
     typeof json.type!=='string'||json.type.length>120||json.object!=='event'||
     !json.data||typeof json.data!=='object'||Array.isArray(json.data))
    return {ok:false,reason:'invalid-provider-event-envelope'};
  const normalized=normalizeWinnrEvent(json);
  const type=json.type;
  const target=adverse.has(type)?normalized.recipient:null;
  if(adverse.has(type)&&!validEmail(target))
    return {ok:false,reason:'adverse-recipient-identity-invalid'};
  // A signed inbound event is just a reply *candidate*, not proof that this
  // account sent the original email or that the prospect wants unsubscribe.
  const action=adverse.has(type)?'SUPPRESSED_RECIPIENT':
    type==='email.received'?'REPLY_REQUIRES_REVIEW':'RECORDED_NO_SUPPRESSION';
  const when=json.created;
  if(when!==undefined && (typeof when!=='string'||!Number.isFinite(Date.parse(when))))
    return {ok:false,reason:'invalid-provider-event-time'};
  return {ok:true,eventId:json.id,eventType:type,action,target,
    payloadDigest:sha(raw),recipientDigest:target?sha(target):null,
    providerOccurredAt:when||null};
}

export async function persistAuthenticatedWinnrEvent(pool,parsed) {
  if(!parsed?.ok||!validId(parsed.eventId)||!pool||typeof pool.connect!=='function')
    throw Error('verified-event-and-transactional-postgres-required');
  const client=await pool.connect();
  let transaction=false;
  try{
    await client.query('BEGIN');transaction=true;
    // Lock event id to serialize competing deliveries and detection of changed
    // content under the same provider id. Never skip suppression on failed DB IO.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`winnr:${parsed.eventId}`]);
    const inserted=await client.query(`INSERT INTO winnr_webhook_events
      (event_id,event_type,payload_digest,recipient_digest,action,provider_occurred_at)
      VALUES($1,$2,$3,$4,$5,$6::timestamptz)
      ON CONFLICT(event_id) DO NOTHING RETURNING event_id`,
      [parsed.eventId,parsed.eventType,parsed.payloadDigest,parsed.recipientDigest,parsed.action,parsed.providerOccurredAt]);
    let duplicate=inserted.rowCount===0;
    if(duplicate){
      const old=await client.query('SELECT payload_digest FROM winnr_webhook_events WHERE event_id=$1',[parsed.eventId]);
      if(old.rows.length!==1||old.rows[0].payload_digest!==parsed.payloadDigest)
        throw Error('provider-event-id-payload-conflict');
    }else if(parsed.action==='SUPPRESSED_RECIPIENT'){
      const id=`winnr_${createHash('sha256').update(parsed.target).digest('hex').slice(0,40)}`;
      const row={id,value:parsed.target,reason:'winnr-provider-signed-adverse-event',
        eventType:parsed.eventType,sourceEventId:parsed.eventId};
      await client.query(`INSERT INTO suppressions(id,value,created_at,updated_at,data)
          VALUES($1,$2,now(),now(),$3::jsonb) ON CONFLICT (value) DO NOTHING`,
        [id,parsed.target,JSON.stringify(row)]);
      // An index conflict on the deterministic suppression ID is not expected;
      // no silent replace of an existing suppression is ever allowed.
      const found=await client.query('SELECT value FROM suppressions WHERE value=$1',[parsed.target]);
      if(found.rows.length!==1||found.rows[0].value!==parsed.target)
        throw Error('suppression-readback-failed');
    }
    await client.query('COMMIT');transaction=false;
    return Object.freeze({ok:true,status:duplicate?'DUPLICATE':parsed.action,
      duplicate,suppressionHeld:parsed.action==='SUPPRESSED_RECIPIENT',
      sendAuthority:'NONE',businessEffectAuthority:'NONE'});
  }catch(e){if(transaction)await client.query('ROLLBACK').catch(()=>{});throw e;}
  finally{client.release();}
}
