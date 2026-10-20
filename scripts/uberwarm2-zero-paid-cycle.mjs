#!/usr/bin/env node
/**
 * Reuse the existing paid-for Railway cron for ONE privately approved,
 * owner-controlled placement canary; no bulk mailing or paid warmer.
 * The read monitor runs first. Missing or stale receipts never turn into
 * permission. The existing signed six-source one-shot executor is the final
 * authority, not this scheduler. Any claim (including uncertain) prevents
 * recurrence on following cron runs.
 */
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import {fileURLToPath} from 'node:url';
import {compileUberWarm2ZeroPaidCronGate} from '../src/uberwarm2-zero-paid-cycle-gate.mjs';
const script = url => fileURLToPath(new URL(url, import.meta.url));
const safeJson = value => process.stdout.write(JSON.stringify(value)+'\n');
const monitor = spawnSync(process.execPath,[script('./uberwarm2-railway-read-monitor.mjs')],{
  encoding:'utf8',timeout:90000,maxBuffer:131072,env:process.env
});
let receipt=null;
try {receipt=JSON.parse(monitor.stdout.trim().split('\n').at(-1));}catch{}
if (monitor.status !== 0 || !receipt) {
  safeJson({status:'UBERWARM2_MONITOR_REFUSED',providerSubmissions:0,
    automaticRetryAuthorized:false,providerWarmupAddonEnabled:false});
  process.exitCode=1;
} else {
  // Preserve operational monitor receipt without echoing any sensitive vendor
  // response, local environment, or input manifests.
  safeJson({status:'UBERWARM2_MONITOR_EXECUTED',monitorStatus:receipt.status,
    providerCalls:receipt.provider?.providerCalls||0,monitorSends:receipt.sends||0});
  const gate=compileUberWarm2ZeroPaidCronGate({monitor:receipt,environment:process.env});
  if (gate.status !== 'UBERWARM2_ONE_SHOT_CADENCE_ELIGIBLE_FOR_PROTECTED_PREFLIGHT') {
    safeJson(gate);
  } else {
    let pool;
    try {
      pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:9000,
        query_timeout:12000,statement_timeout:10000,options:'-c default_transaction_read_only=on'});
      const res=await pool.query('SELECT count(*)::int AS claims FROM public.uberwarm2_seed_probe_claims WHERE probe_id=$1',
        [process.env.UBERWARM_ONE_SHOT_PROBE_ID]);
      if (res.rows.length!==1 || !Number.isInteger(res.rows[0].claims)) throw Error('untrusted-ledger');
      if (res.rows[0].claims!==0) {
        safeJson({status:'UBERWARM2_PROBE_ALREADY_CLAIMED_NO_RETRY',providerSubmissions:0,
          automaticRetryAuthorized:false});
      } else {
        const result=spawnSync(process.execPath,[script('../operator-tools/uberwarm2-execute-approved-once.mjs'),
          `--execute=${process.env.UBERWARM_ONE_SHOT_PROBE_ID}`],{
          encoding:'utf8',timeout:90000,maxBuffer:8192,env:process.env});
        let parsed=null;
        try {parsed=JSON.parse(result.stdout.trim().split('\n').at(-1));}catch{}
        // Output is a strict allowlist. A failure after dispatch may be uncertain;
        // NEVER resubmit from this process and never hide an uncertain result.
        safeJson({status:parsed?.status||'UBERWARM2_PROTECTED_LAUNCH_OUTCOME_UNCERTAIN',
          providerSubmissions:Number.isInteger(parsed?.providerSubmissions)?parsed.providerSubmissions:null,
          reasonCodes:Array.isArray(parsed?.reasonCodes)?parsed.reasonCodes.slice(0,12):[],
          automaticRetryAuthorized:false});
        if(result.status!==0)process.exitCode=3;
      }
    } catch {
      safeJson({status:'UBERWARM2_CADENCE_PRIMARY_READ_UNAVAILABLE',providerSubmissions:0,
        automaticRetryAuthorized:false});
      process.exitCode=2;
    } finally {await pool?.end().catch(()=>{});}
  }
}
