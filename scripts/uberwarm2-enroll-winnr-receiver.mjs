#!/usr/bin/env node
// Explicit one-mailbox enrollment. Encrypted credentials stay within Railway PostgreSQL.
import pg from 'pg';
import {createWinnrApiClient} from '../src/uberwinnr-adapter.mjs';
import {parseCsv} from '../src/csv.mjs';
import {saveReceiverBinding,observeReceiverBinding,inspectOwnedImapReceiver} from '../src/uberwarm2-receiver-binding.mjs';
if(process.argv[2]!=='--enroll'||process.env.UBERWARM_RECEIVER_AUTH_PROBE_AUTHORIZED!=='1'){
  console.error('receiver-enrollment-not-authorized');process.exit(1);
}
const receiverEmail='hello@uberbond.site',userId='YWUjU6jaEXFKkMM9Hw91';
const encryptionKey=process.env.UBERWARM_RECEIVER_ENCRYPTION_KEY||'';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1,
  connectionTimeoutMillis:10000,statement_timeout:10000,options:'-c default_transaction_read_only=off'});
let phase='CONFIG';
try{
  if(!/^[a-f0-9]{64}$/.test(encryptionKey)||process.env.UBERWARM_RECEIVER_EMAIL!==receiverEmail)throw Error('config');
  const state=(await pool.query(`SELECT current_database() AS database,pg_is_in_recovery() AS recovery,
    to_regclass('public.uberwarm2_seed_probe_claims') IS NOT NULL AS ledger_present`)).rows[0];
  if(state.database!=='railway'||state.recovery||!state.ledger_present)throw Error('primary');
  phase='EXISTING_BINDING';
  const existing=await pool.query('SELECT receiver_email FROM public.uberwarm2_receiver_bindings WHERE receiver_email=$1',[receiverEmail]);
  if(existing.rows.length){
    const observation=await observeReceiverBinding({pool,receiverEmail,encryptionKey});
    console.log(JSON.stringify({receipt:'UBERWARM_RECEIVER_BINDING_ALREADY_PRESENT',...observation}));
    if(!observation.authenticated)process.exitCode=1;
  }else{
    const client=createWinnrApiClient({token:process.env.WINNR_API_TOKEN||'',
      authorized:process.env.WINNR_PROVIDER_AUTHORIZED==='true',
      termsCompatible:process.env.WINNR_TERMS_COMPATIBLE==='true',
      evidenceRef:process.env.WINNR_EVIDENCE_REF||''});
    if(!client.ok)throw Error('client');
    const mailbox=await client.getMailbox({userId});
    if(!mailbox.ok||mailbox.data?.full_address!==receiverEmail||mailbox.data.status!=='active')throw Error('identity');
    phase='SELECTED_EXPORT';
    const exported=await client.exportMailboxes({format:'default',emails:[receiverEmail],writeAuthorized:true});
    if(!exported.ok)throw Error('export');
    const url=new URL(exported.data?.url??exported.data?.download_url);
    if(url.protocol!=='https:'||url.hostname!=='winnr-csv-storage.s3.amazonaws.com'||url.username||url.password)throw Error('host');
    phase='PRIVATE_DOWNLOAD';
    const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!r.ok||!r.body)throw Error('download');
    const reader=r.body.getReader(),chunks=[];let size=0;
    while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;
      if(size>65536){await reader.cancel();throw Error('size');}chunks.push(Buffer.from(part.value));}
    const rows=parseCsv(Buffer.concat(chunks).toString('utf8')).map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k.toLowerCase(),v])));
    if(rows.length!==1||(rows[0].from_email??rows[0].email)?.toLowerCase()!==receiverEmail)throw Error('cardinality');
    const row=rows[0],credential={host:row.imap_host,port:Number(row.imap_port||993),
      username:row.imap_username||receiverEmail,password:row.imap_password||row.password};
    if(credential.host!==mailbox.data.imap_host)throw Error('host-binding');
    phase='AUTHENTICATED_RECEIVER';
    const observation=await inspectOwnedImapReceiver({credential,receiverEmail});
    if(!observation.authenticated||!observation.inboxReadOnlyAccessible)throw Error('auth');
    phase='ENCRYPTED_STORAGE';
    await saveReceiverBinding({pool,receiverEmail,userId,credential,encryptionKey,
      authorizationRef:'github:uberbondd/1188/6239838382'});
    const readback=await observeReceiverBinding({pool,receiverEmail,encryptionKey});
    if(!readback.authenticated)throw Error('readback');
    console.log(JSON.stringify({receipt:'UBERWARM_ENCRYPTED_RECEIVER_ENROLLED',receiverEmail,
      observedAt:new Date().toISOString(),exportDigest:exported.receipt?.responseDigest,
      encryptedStorageVerified:true,...readback}));
  }
}catch{console.error(JSON.stringify({receipt:'UBERWARM_RECEIVER_ENROLLMENT_FAILED',phase,sends:0,credentialsLogged:false}));process.exitCode=1;}
finally{await pool.end();}
