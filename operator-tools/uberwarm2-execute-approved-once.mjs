#!/usr/bin/env node
/**
 * Dedicated, manually invoked, SINGLE probe execution, NEVER a cron hook.
 * No external effect without authenticated provider transport, six separately
 * signed and freshly verified evidence readers, fresh recipient consent,
 * an owner-HMAC-signed exact batch and atomic Postgres claim.
 *
 * `node scripts/uberwarm2-execute-approved-once.mjs --execute=PROBE_ID`
 * No --help or --dry-run path sends anything. Every default is deny.
 */
import {readFileSync} from 'node:fs';
import pg from 'pg';
import {createWinnrApiClient} from '../src/uberwinnr-adapter.mjs';
import {createUberWarm2AttestedFileReaders} from '../src/uberwarm2-attested-one-shot-readers.mjs';
import {createUberWarm2DelegatedEvidenceCustodyFileReaders} from '../src/uberwarm2-delegated-evidence-custody.mjs';
import {createUberWarm2AuthorizedOneShotRuntime} from '../src/uberwarm2-authorized-one-shot-runtime.mjs';

const reason = (status, codes) => Object.freeze({
  status, reasonCodes: codes, providerSubmissions: 0,
  verifiedPlacements: 0, automaticRetryAuthorized: false
});
const safe = value => JSON.stringify(value) + '\n';
const env = process.env;
const args = process.argv.slice(2);
const exact=String(env.UBERWARM_ONE_SHOT_PROBE_ID||'');
let pool;
try {
  if(args.length!==1||!/^--execute=[A-Za-z0-9._:-]{1,250}$/.test(args[0])||
    args[0]!==`--execute=${exact}`||
    env.UBERWARM_ONE_SHOT_EXECUTION_ALLOWED!=='true'||
    env.OUTBOUND_ENABLED==='true'||env.UBERWARM_SEND_ENABLED==='true') {
    process.stdout.write(safe(reason('UBERWARM2_EXECUTION_NOT_ENABLED',['exact-single-probe-execution-approval-required'])));
    process.exitCode=2;
  } else {
    const sender=env.UBERWARM_ONE_SHOT_SENDER||'';
    const recipient=env.UBERWARM_ONE_SHOT_RECIPIENT||'';
    const userId=env.UBERWARM_ONE_SHOT_WINNR_USER_ID||'';
    const evidencePath=env.UBERWARM_ONE_SHOT_EVIDENCE_PATH||'';
    const ownerKey=env.UBERWARM_ONE_SHOT_APPROVAL_VERIFICATION_KEY||'';
    if(!sender||!recipient||!userId||!evidencePath.startsWith('/')||
       !env.DATABASE_URL||!env.WINNR_API_TOKEN||ownerKey.length<32) {
      process.stdout.write(safe(reason('UBERWARM2_EXECUTION_NOT_CONFIGURED',['protected-provider-database-operator-and-approval-config-required'])));
      process.exitCode=2;
    } else {
      const envelope=JSON.parse(readFileSync(evidencePath,'utf8'));
      const batch=envelope.batch;
      const probe=batch?.probes?.[0];
      if(batch?.probes?.length!==1||probe?.probeId!==exact||probe?.senderEmail!==sender||
         probe?.seedEmail!==recipient||Date.parse(probe?.permissionExpiresAt)<=Date.now()||
         envelope.approval?.probeId!==exact) {
        process.stdout.write(safe(reason('UBERWARM2_EXECUTION_INVALID_SCOPE',['immutable-batch-consent-or-expiry-mismatch'])));
        process.exitCode=2;
      } else {
        let keys;
        try {keys=JSON.parse(env.UBERWARM_ONE_SHOT_TRUSTED_PUBLIC_KEYS_JSON||'null')}catch{}
        // Explicit protected mode only. An invalid delegation NEVER falls back to
        // weaker evidence, and the untrusted manifest cannot select this mode.
        const custody=env.UBERWARM_ONE_SHOT_EVIDENCE_MODE==='OWNER_DELEGATED_SOURCE_CUSTODY';
        const proof=custody?createUberWarm2DelegatedEvidenceCustodyFileReaders({
          path:evidencePath,readTrustedDelegation:()=>JSON.parse(env.UBERWARM_ONE_SHOT_CUSTODY_DELEGATION_JSON||'null')
        }):createUberWarm2AttestedFileReaders({path:evidencePath,publicKeys:keys});
        if(!proof.configured){
          process.stdout.write(safe(reason('UBERWARM2_EXECUTION_NO_TRUSTED_ATTESTORS',proof.reasonCodes)));
          process.exitCode=2;
        } else {
          const client=createWinnrApiClient({token:env.WINNR_API_TOKEN,
            authorized:env.WINNR_PROVIDER_AUTHORIZED==='true',
            termsCompatible:env.WINNR_TERMS_COMPATIBLE==='true',
            evidenceRef:env.WINNR_EVIDENCE_REF||''});
          if(client.ok!==true){
            process.stdout.write(safe(reason('UBERWARM2_EXECUTION_PROVIDER_UNAVAILABLE',['authenticated-provider-client-not-ready'])));
            process.exitCode=2;
          } else {
            pool=new pg.Pool({connectionString:env.DATABASE_URL,max:1,connectionTimeoutMillis:9000,
              statement_timeout:12000,query_timeout:14000,options:'-c default_transaction_read_only=off'});
            const check=await pool.query("SELECT pg_is_in_recovery() AS standby, to_regclass('public.uberwarm2_seed_probe_claims') IS NOT NULL AS ledger");
            if(check.rows?.length!==1||check.rows[0].standby!==false||check.rows[0].ledger!==true){
              process.stdout.write(safe(reason('UBERWARM2_EXECUTION_LEDGER_UNAVAILABLE',['primary-one-shot-ledger-not-verified'])));
              process.exitCode=2;
            } else {
              const runtime=createUberWarm2AuthorizedOneShotRuntime({client,pool,senderEmail:sender,userId,
                trustedReaders:proof.readers,approvalVerificationKey:ownerKey,operatorExecutionEnabled:true});
              const result=await runtime.executeApprovedOneShot({batch,probeId:exact,approval:envelope.approval});
              process.stdout.write(safe({status:result?.status||'UBERWARM2_RESULT_UNAVAILABLE',
                providerSubmissions:Number(result?.providerSubmissions||0),
                verifiedPlacements:Number(result?.verifiedPlacements||0),
                providerMessageId:typeof result?.providerMessageId==='string'?result.providerMessageId:null,
                reasonCodes:(result?.reasonCodes||[]).slice(0,12),
                automaticRetryAuthorized:false}));
              if(result?.ok!==true) process.exitCode=3;
            }
          }
        }
      }
    }
  }
}catch{
  process.stdout.write(safe(reason('UBERWARM2_EXECUTION_FAILURE_HELD',['protected-preflight-or-outcome-uncertain-no-automatic-retry'])));
  process.exitCode=3;
}finally{await pool?.end().catch(()=>{});}
