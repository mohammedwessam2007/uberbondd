export const BILLING_WEBHOOK_REPOSITORY_VERSION='uberbond.billing-webhook-repository.v1';

export async function persistVerifiedBillingEvent(pool,event,{receivedAt=new Date()}={}){
 if(!pool?.query) throw new Error('postgres-pool-required');
 const result=await pool.query(`INSERT INTO billing_webhook_inbox(provider_event_key,provider,event_name,object_type,object_id,payload_hash,custom_data,status,received_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,'RECEIVED',$8) ON CONFLICT(provider_event_key) DO NOTHING RETURNING provider_event_key`,[event.providerEventKey,event.provider,event.eventName,event.objectType,event.objectId,event.payloadHash,JSON.stringify(event.customData||{}),receivedAt]);
 return {ok:true,status:result.rowCount===1?'WEBHOOK_PERSISTED':'WEBHOOK_DUPLICATE',duplicate:result.rowCount!==1,providerEventKey:event.providerEventKey};
}

export async function claimBillingEvents(pool,{workerRef,limit=10}={}){
 const bounded=Math.max(1,Math.min(50,Number(limit)||10));
 const client=await pool.connect();
 try{
   await client.query('BEGIN');
   const result=await client.query(`WITH picked AS (SELECT provider_event_key FROM billing_webhook_inbox WHERE status IN ('RECEIVED','RETRYABLE') ORDER BY received_at ASC FOR UPDATE SKIP LOCKED LIMIT $1) UPDATE billing_webhook_inbox b SET status='CLAIMED',claimed_at=now(),claimed_by=$2,updated_at=now() FROM picked WHERE b.provider_event_key=picked.provider_event_key RETURNING b.provider_event_key,b.provider,b.event_name,b.object_type,b.object_id,b.payload_hash,b.custom_data,b.received_at`,[bounded,String(workerRef||'billing-worker').slice(0,160)]);
   await client.query('COMMIT'); return result.rows;
 }catch(error){try{await client.query('ROLLBACK');}catch{} throw error;}finally{client.release();}
}

export async function finishBillingEvent(pool,{providerEventKey,status,canonicalReceiptRef=null,errorCode=null}){
 const normalized=String(status||'').toUpperCase();
 if(!['RECONCILED','IGNORED','RETRYABLE','FAILED','UNCERTAIN'].includes(normalized)) throw new Error('invalid-billing-terminal-status');
 await pool.query(`UPDATE billing_webhook_inbox SET status=$2,canonical_receipt_ref=$3,error_code=$4,completed_at=CASE WHEN $2 IN ('RECONCILED','IGNORED','FAILED') THEN now() ELSE completed_at END,updated_at=now() WHERE provider_event_key=$1`,[providerEventKey,normalized,canonicalReceiptRef,errorCode]);
 return {ok:true,status:normalized,providerEventKey};
}
