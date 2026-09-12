import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostgresStore } from '../src/store.mjs';
import { compileRestartRecoveryReceipt } from '../src/deploy-restart-recovery-receipt.mjs';

const DATABASE_URL=process.env.OMNIA_V9_TEST_DATABASE_URL || '';
const self=fileURLToPath(import.meta.url);
const uid=()=>crypto.randomUUID();
const outputIndex=process.argv.indexOf('--output');
const outputPath=outputIndex>=0?String(process.argv[outputIndex+1]||'').trim():'';
function emit(receipt){
  if(outputPath){mkdirSync(dirname(outputPath),{recursive:true});writeFileSync(outputPath,`${JSON.stringify(receipt,null,2)}\n`,'utf8');}
  console.log(JSON.stringify(receipt,null,2));
}

async function insertActive(store,{id,type,recoveryPolicy,maxAttempts}){
  const stale=new Date(Date.now()-10_000).toISOString();
  const data={id,type,queue:type,status:'active',attempts:1,maxAttempts,recoveryPolicy,lockedBy:'crashed-worker',lockedAt:stale,heartbeatAt:stale,startedAt:stale,createdAt:stale,updatedAt:stale};
  await store.pool.query(`INSERT INTO jobs (id,type,queue,status,priority,attempts,max_attempts,run_at,locked_at,locked_by,heartbeat_at,started_at,data,created_at,updated_at) VALUES ($1,$2,$2,'active',0,1,$3,now(),$4::timestamptz,'crashed-worker',$4::timestamptz,$4::timestamptz,$5::jsonb,$4::timestamptz,$4::timestamptz)`,[id,type,maxAttempts,stale,JSON.stringify(data)]);
}

if (process.argv.includes('--seed-crash')) {
  if (!DATABASE_URL) process.exit(78);
  const store=new PostgresStore({databaseUrl:DATABASE_URL,ssl:false});
  await store.init();
  const replayId=uid(); const reconcileId=uid(); const suffix=uid();
  await insertActive(store,{id:replayId,type:`deploy06-replay-${suffix}`,recoveryPolicy:'replay-safe',maxAttempts:3});
  await insertActive(store,{id:reconcileId,type:`deploy06-reconcile-${suffix}`,recoveryPolicy:'reconcile',maxAttempts:1});
  console.log(JSON.stringify({replayId,reconcileId,replayType:`deploy06-replay-${suffix}`,reconcileType:`deploy06-reconcile-${suffix}`}));
  process.exit(91);
}

if (!DATABASE_URL) {
  emit({ok:false,status:'REAL_POSTGRES_REQUIRED',reasonCodes:['OMNIA_V9_TEST_DATABASE_URL-required'],businessEffectAuthority:'NONE'});
  process.exitCode=2;
} else {
  const child=spawnSync(process.execPath,[self,'--seed-crash'],{env:process.env,encoding:'utf8'});
  let seed={};
  try { seed=JSON.parse(String(child.stdout||'').trim().split(/\r?\n/).filter(Boolean).at(-1)||'{}'); } catch {}
  const storeA=new PostgresStore({databaseUrl:DATABASE_URL,ssl:false});
  const storeB=new PostgresStore({databaseUrl:DATABASE_URL,ssl:false});
  await storeA.init(); await storeB.init();
  let cleanupOk=false;
  try {
    const recovery=await storeA.recoverStaleJobs(1_000);
    const [a,b]=await Promise.all([
      storeA.claimJobsByType(seed.replayType,'','replacement-a',1,1_000),
      storeB.claimJobsByType(seed.replayType,'','replacement-b',1,1_000)
    ]);
    const replacementClaimCount=[...a,...b].filter(j=>j.id===seed.replayId).length;
    const reconcile=await storeA.get('jobs',seed.reconcileId);
    const reconcileClaims=await storeB.claimJobsByType(seed.reconcileType,'','replacement-c',1,1_000);
    await storeA.pool.query('DELETE FROM jobs WHERE id = ANY($1::text[])',[[seed.replayId,seed.reconcileId]]);
    cleanupOk=true;
    let sourceCommit=process.env.SOURCE_COMMIT || null;
    if (!sourceCommit) { try { sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(); } catch {} }
    const receipt=compileRestartRecoveryReceipt({
      sourceCommit,
      environment:'POSTGRES',
      crashExitCode:child.status,
      replaySafeRecovered:recovery.recovered,
      replacementClaimCount,
      reconcileDeadLettered:reconcile?.status==='dead-letter',
      reconcileReplacementClaimCount:reconcileClaims.filter(j=>j.id===seed.reconcileId).length,
      cleanupOk,
      commands:[`${process.execPath} ${self} --seed-crash`,`${process.execPath} ${self}`]
    });
    emit(receipt);
    if (!receipt.ok) process.exitCode=1;
  } finally {
    if (!cleanupOk && seed.replayId && seed.reconcileId) await storeA.pool.query('DELETE FROM jobs WHERE id = ANY($1::text[])',[[seed.replayId,seed.reconcileId]]).catch(()=>{});
    await storeB.close(); await storeA.close();
  }
}
