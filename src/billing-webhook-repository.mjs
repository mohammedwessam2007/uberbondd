export const BILLING_WEBHOOK_REPOSITORY_VERSION='uberbond.billing-webhook-repository.v2';

const boundedInt=(value,fallback,min,max)=>{const n=Math.floor(Number(value));return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;};

// The conflict target is deliberately absent, and that is the whole point.
//
// This clause used to name `provider_event_key`, which was correct when that was
// the only unique index. Migration 101 added a second one on the content itself
// -- (provider, event_name, object_type, object_id, payload_hash) -- and a
// conflict there is not covered by a targeted clause, so it raised 23505.
//
// The caller in api/webhooks/billing.mjs catches everything and answers 503
// `verified-webhook-not-durably-persisted`. That is both an outage and a false
// statement: the evidence IS durably persisted, in the row this delivery
// duplicates. A provider reading 503 retries, gets 503 again, and providers
// disable endpoints that keep failing -- so a duplicate delivery could cost the
// future events that are not duplicates.
//
// Untargeted, the clause covers every unique constraint on the table, including
// any added later, and a duplicate under either index reports WEBHOOK_DUPLICATE
// like the duplicate it is.
export async function persistVerifiedBillingEvent(pool,event,{receivedAt=new Date()}={}){
 if(!pool?.query) throw new Error('postgres-pool-required');
 const result=await pool.query(`INSERT INTO billing_webhook_inbox(provider_event_key,provider,event_name,object_type,object_id,payload_hash,custom_data,status,received_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,'RECEIVED',$8) ON CONFLICT DO NOTHING RETURNING provider_event_key`,[event.providerEventKey,event.provider,event.eventName,event.objectType,event.objectId,event.payloadHash,JSON.stringify(event.customData||{}),receivedAt]);
 return {ok:true,status:result.rowCount===1?'WEBHOOK_PERSISTED':'WEBHOOK_DUPLICATE',duplicate:result.rowCount!==1,providerEventKey:event.providerEventKey};
}

export async function claimBillingEvents(pool,{workerRef,limit=10,staleClaimMs=15*60*1000,maxAttempts=5}={}){
 const bounded=Math.max(1,Math.min(50,Number(limit)||10));
 const attempts=boundedInt(maxAttempts,5,1,20);
 const cutoff=new Date(Date.now()-Math.max(60000,Number(staleClaimMs)||15*60*1000));
 const worker=String(workerRef||'').trim().slice(0,160);
 if(!worker) throw new Error('billing-worker-required');
 const client=await pool.connect();
 try{
   await client.query('BEGIN');
   await client.query(`UPDATE billing_webhook_inbox SET status='UNCERTAIN',error_code='claim-attempt-cap-reached',last_error_at=now(),claimed_at=NULL,claimed_by=NULL,updated_at=now() WHERE status='CLAIMED' AND claimed_at<=$1 AND claim_attempts>=$2`,[cutoff,attempts]);
   await client.query(`UPDATE billing_webhook_inbox SET status='UNCERTAIN',error_code='claim-attempt-cap-reached',last_error_at=now(),claimed_at=NULL,claimed_by=NULL,next_attempt_at=NULL,updated_at=now() WHERE status IN ('RECEIVED','RETRYABLE') AND claim_attempts>=$1`,[attempts]);
   const result=await client.query(`WITH picked AS (
     SELECT provider_event_key FROM billing_webhook_inbox
     WHERE (
       (status IN ('RECEIVED','RETRYABLE') AND claim_attempts<$3 AND (next_attempt_at IS NULL OR next_attempt_at<=now()))
       OR (status='CLAIMED' AND claimed_at<=$2 AND claim_attempts<$3)
     )
     ORDER BY received_at ASC FOR UPDATE SKIP LOCKED LIMIT $1
   )
   UPDATE billing_webhook_inbox b SET status='CLAIMED',claimed_at=now(),claimed_by=$4,claim_attempts=b.claim_attempts+1,next_attempt_at=NULL,error_code=NULL,updated_at=now()
   FROM picked WHERE b.provider_event_key=picked.provider_event_key
   RETURNING b.provider_event_key,b.provider,b.event_name,b.object_type,b.object_id,b.payload_hash,b.custom_data,b.received_at,b.claimed_at,b.claimed_by,b.claim_attempts`,[bounded,cutoff,attempts,worker]);
   await client.query('COMMIT'); return result.rows;
 }catch(error){try{await client.query('ROLLBACK');}catch{} throw error;}finally{client.release();}
}

export async function finishBillingEvent(pool,{providerEventKey,status,canonicalReceiptRef=null,errorCode=null,retryAfterMs=0,workerRef}={}){
 const normalized=String(status||'').toUpperCase();
 if(!['RECONCILED','IGNORED','RETRYABLE','FAILED','UNCERTAIN'].includes(normalized)) throw new Error('invalid-billing-terminal-status');
 if(normalized==='RECONCILED'&&!String(canonicalReceiptRef||'').trim()) throw new Error('canonical-receipt-ref-required');
 if(!String(providerEventKey||'').trim()) throw new Error('billing-event-key-required');
 const worker=String(workerRef||'').trim().slice(0,160);
 if(!worker) throw new Error('billing-worker-required');
 const retryDelay=Math.max(0,Math.min(24*60*60*1000,Number(retryAfterMs)||0));
 const nextAttemptAt=normalized==='RETRYABLE'?new Date(Date.now()+retryDelay):null;
 const result=await pool.query(`UPDATE billing_webhook_inbox SET status=$2,canonical_receipt_ref=$3,error_code=$4,next_attempt_at=$5,last_error_at=CASE WHEN $4::text IS NOT NULL THEN now() ELSE last_error_at END,claimed_at=CASE WHEN $2 IN ('RETRYABLE','UNCERTAIN') THEN NULL ELSE claimed_at END,claimed_by=CASE WHEN $2 IN ('RETRYABLE','UNCERTAIN') THEN NULL ELSE claimed_by END,completed_at=CASE WHEN $2 IN ('RECONCILED','IGNORED','FAILED') THEN now() ELSE completed_at END,updated_at=now() WHERE provider_event_key=$1 AND status='CLAIMED' AND claimed_by=$6`,[providerEventKey,normalized,canonicalReceiptRef,errorCode,nextAttemptAt,worker]);
 if(result.rowCount!==1) throw new Error('billing-claim-not-owned-or-missing');
 return {ok:true,status:normalized,providerEventKey,nextAttemptAt:nextAttemptAt?.toISOString()||null};
}

export async function billingBacklogSummary(pool){
 if(!pool?.query) throw new Error('postgres-pool-required');
 const result=await pool.query(`SELECT status,count(*)::integer AS count,min(received_at) AS oldest_received_at FROM billing_webhook_inbox GROUP BY status ORDER BY status`);
 return {ok:true,states:Object.fromEntries(result.rows.map(row=>[row.status,{count:Number(row.count||0),oldestReceivedAt:row.oldest_received_at||null}]))};
}
