export const PROSPECT_IDENTITY_REPOSITORY_VERSION='uberbond.prospect-identity-repository.v1';

export async function registerProspectIdentity(pool,{prospectRef,identity}){
 if(!pool?.query) throw new Error('postgres-pool-required');
 if(!prospectRef || !identity?.keys?.length) throw new Error('prospect-ref-and-identity-keys-required');
 const client=await pool.connect();
 try{
   await client.query('BEGIN');
   for(const key of identity.keys){
     await client.query(`INSERT INTO prospect_identity_keys(identity_kind,identity_digest,canonical_value,prospect_ref) VALUES($1,$2,$3,$4) ON CONFLICT(identity_kind,identity_digest) DO NOTHING`,[key.kind,key.digest,key.canonical,prospectRef]);
   }
   const digests=identity.keys.map(k=>k.digest);
   const owners=await client.query(`SELECT identity_kind,identity_digest,prospect_ref FROM prospect_identity_keys WHERE identity_digest = ANY($1::text[])`,[digests]);
   const conflict=owners.rows.find(r=>r.prospect_ref!==prospectRef);
   if(conflict){await client.query('ROLLBACK'); return {ok:false,status:'DUPLICATE_IDENTITY',existingProspectRef:conflict.prospect_ref,identityKind:conflict.identity_kind,identityDigest:conflict.identity_digest};}
   await client.query('COMMIT'); return {ok:true,status:'IDENTITY_REGISTERED',prospectRef,registered:owners.rows.length};
 }catch(error){try{await client.query('ROLLBACK');}catch{} throw error;}finally{client.release();}
}

export async function reserveOutboundDailyGuard(pool,{guard,prospectRef}){
 if(!pool?.query) throw new Error('postgres-pool-required');
 const result=await pool.query(`INSERT INTO outbound_contact_guard(guard_key,guard_day,channel,offer_ref,campaign_ref,prospect_ref,primary_identity_digest,contact_digest) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(guard_key) DO NOTHING RETURNING guard_key`,[guard.guardKey,guard.day,guard.channel,guard.offerRef,guard.campaignRef,prospectRef||null,guard.primaryIdentityDigest,guard.contactDigest]);
 return result.rowCount===1?{ok:true,status:'OUTBOUND_GUARD_RESERVED',guardKey:guard.guardKey}:{ok:false,status:'DUPLICATE_OUTBOUND_GUARD',guardKey:guard.guardKey};
}
