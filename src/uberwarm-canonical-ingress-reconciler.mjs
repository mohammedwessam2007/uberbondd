/** One bounded authenticated ingress snapshot -> existing canonical stop list.
 * No networking, credential handling, schema creation, deletion or send authority.
 * readAuthenticatedSnapshot must be an authenticated private-ledger adapter;
 * the public health/count endpoint is deliberately insufficient.
 */
import {createHash} from 'node:crypto';
import {DEFAULT_INGRESS_URL} from './uberwarm-ingress-fence.mjs';
const sha=x=>'sha256:'+createHash('sha256').update(x).digest('hex');
const id=x=>typeof x==='string'&&/^[A-Za-z0-9._:-]{1,240}$/.test(x);
const email=x=>typeof x==='string'&&x.length<=320&&x===x.toLowerCase()&&/^[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(x);
const digest=x=>typeof x==='string'&&/^sha256:[a-f0-9]{64}$/.test(x);

export async function reconcileCanonicalIngress({
 pool, expectedDatabase, readAuthenticatedSnapshot, now=()=>new Date(), maxAgeMs=300000
}={}) {
 if(!pool?.connect||typeof expectedDatabase!=='string'||!expectedDatabase||
    typeof readAuthenticatedSnapshot!=='function'||!Number.isFinite(maxAgeMs)||maxAgeMs<=0||maxAgeMs>300000)
  throw Error('canonical-binding-and-authenticated-reader-required');
 const snapshot=structuredClone(await readAuthenticatedSnapshot());
 const at=Date.parse(snapshot?.observedAt||''), current=new Date(now()).getTime();
 if(snapshot?.sourceUrl!==DEFAULT_INGRESS_URL||!Number.isFinite(at)||!Number.isFinite(current)||
    current-at>maxAgeMs||at-current>60000||snapshot.complete!==true||
    !Array.isArray(snapshot.events)||snapshot.events.length>1000||
    snapshot.adverseEventCount!==snapshot.events.length)
  throw Error('fresh-complete-authenticated-snapshot-required');
 const seen=new Set();
 for(const e of snapshot.events) {
  if(!e||!id(e.eventId)||seen.has(e.eventId)||!['email.bounced','email.complained'].includes(e.eventType)||
     !email(e.recipient)||!digest(e.payloadDigest)||e.recipientDigest!==sha(e.recipient))
   throw Error('invalid-or-duplicate-adverse-event');
  seen.add(e.eventId);
 }
 const stillFresh=()=>{const t=new Date(now()).getTime();
  if(!Number.isFinite(t)||t-at>maxAgeMs||at-t>60000)throw Error('snapshot-expired-during-reconciliation');};
 const client=await pool.connect();let transaction=false;
 try {
  await client.query('BEGIN');transaction=true;stillFresh();
  const binding=await client.query(`SELECT current_database() AS database, pg_is_in_recovery() AS recovery,
   to_regclass('public.suppressions') IS NOT NULL AS suppressions_ready,
   to_regclass('public.winnr_webhook_events') IS NOT NULL AS events_ready`);
  const b=binding.rows[0];
  if(binding.rows.length!==1||b.database!==expectedDatabase||b.recovery!==false||
     b.suppressions_ready!==true||b.events_ready!==true)
   throw Error('canonical-database-not-ready');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['uberwarm-canonical-ingress-reconciliation']);
  for(const e of snapshot.events) {
   await client.query(`INSERT INTO public.winnr_webhook_events
    (event_id,event_type,payload_digest,recipient_digest,action,provider_occurred_at)
    VALUES($1,$2,$3,$4,'SUPPRESSED_RECIPIENT',NULL)
    ON CONFLICT(event_id) DO NOTHING`,[e.eventId,e.eventType,e.payloadDigest,e.recipientDigest]);
   const prior=await client.query(`SELECT event_type,payload_digest,recipient_digest,action
    FROM public.winnr_webhook_events WHERE event_id=$1`,[e.eventId]);
   const p=prior.rows[0];
   if(prior.rows.length!==1||p.event_type!==e.eventType||p.payload_digest!==e.payloadDigest||
      p.recipient_digest!==e.recipientDigest||p.action!=='SUPPRESSED_RECIPIENT')
    throw Error('canonical-event-identity-conflict');
   const key='winnr_'+sha(e.recipient).slice(7,47);
   const data={id:key,value:e.recipient,reason:'winnr-provider-signed-adverse-event',
    eventType:e.eventType,sourceEventId:e.eventId};
   await client.query(`INSERT INTO public.suppressions(id,value,created_at,updated_at,data)
    VALUES($1,$2,now(),now(),$3::jsonb) ON CONFLICT(value) DO NOTHING`,[key,e.recipient,JSON.stringify(data)]);
   const found=await client.query('SELECT value FROM public.suppressions WHERE value=$1',[e.recipient]);
   if(found.rows.length!==1||found.rows[0].value!==e.recipient)
    throw Error('canonical-suppression-readback-failed');
  }
  stillFresh();await client.query('COMMIT');transaction=false;
  return Object.freeze({status:'SNAPSHOT_RECONCILED',reconciledAdverseEventCount:snapshot.events.length,
   observedAt:snapshot.observedAt,sendAuthority:'NONE',canonicalDatabaseVerified:true});
 } catch(error) {if(transaction)await client.query('ROLLBACK').catch(()=>{});throw error;}
 finally {client.release();}
}
