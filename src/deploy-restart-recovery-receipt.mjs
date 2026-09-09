import crypto from 'node:crypto';

export const DEPLOY_RESTART_RECOVERY_RECEIPT_VERSION = 'uberbond.deploy-restart-recovery.v1.1';
const SHA40=/^[0-9a-f]{40}$/;
const SHA256=/^sha256:[0-9a-f]{64}$/;

function text(v, max=1000){ const s=String(v??'').trim(); return s && s.length<=max ? s : null; }
function bool(v){ return v === true; }
function int(v){ const n=Number(v); return Number.isSafeInteger(n) ? n : null; }
const digest=value=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

export function restartRecoveryReceiptPreimage(receipt={}){
  return {
    sourceCommit:receipt.sourceCommit,
    environment:receipt.environment,
    observed:receipt.observed,
    commands:receipt.commands,
    noDuplicateEffectClaim:receipt.noDuplicateEffectClaim,
    rollbackBoundary:receipt.rollbackBoundary,
    businessEffectAuthority:receipt.businessEffectAuthority
  };
}

export function verifyRestartRecoveryReceiptIntegrity(receipt={}){
  if(receipt?.ok!==true) return false;
  if(receipt?.schemaVersion!==DEPLOY_RESTART_RECOVERY_RECEIPT_VERSION) return false;
  if(receipt?.status!=='RESTART_RECOVERY_REHEARSAL_PASSED') return false;
  if(!SHA40.test(String(receipt?.sourceCommit||'').toLowerCase())) return false;
  if(receipt?.environment!=='POSTGRES') return false;
  const o=receipt?.observed||{};
  if(o.crashExitCode!==91||o.replaySafeRecovered!==1||o.replacementClaimCount!==1||o.reconcileDeadLettered!==true||o.reconcileReplacementClaimCount!==0||o.cleanupOk!==true) return false;
  if(!Array.isArray(receipt?.commands)||receipt.commands.length===0||receipt.commands.some(command=>!text(command,1000))) return false;
  if(receipt?.noDuplicateEffectClaim!=='QUEUE_REPLAY_SAFE_WORK_RECLAIMED_ONCE__UNCERTAIN_RECONCILE_WORK_NOT_REPLAYED') return false;
  if(receipt?.rollbackBoundary!=='SYNTHETIC_ROWS_REMOVED_AFTER_REHEARSAL__DEPLOYMENT_ROLLBACK_IS_PROVEN_SEPARATELY_BY_SUPPLIER_EXIT_DRILL') return false;
  if(receipt?.businessEffectAuthority!=='NONE') return false;
  if(!SHA256.test(String(receipt?.receiptDigest||''))) return false;
  return receipt.receiptDigest===digest(restartRecoveryReceiptPreimage(receipt));
}

export function compileRestartRecoveryReceipt(input={}) {
  const reasons=[];
  const sourceCommit=text(input.sourceCommit,40)?.toLowerCase()||null;
  const environment=text(input.environment,120)?.toUpperCase();
  const crashExitCode=int(input.crashExitCode);
  const replaySafeRecovered=int(input.replaySafeRecovered);
  const replacementClaimCount=int(input.replacementClaimCount);
  const reconcileDeadLettered=bool(input.reconcileDeadLettered);
  const reconcileReplacementClaimCount=int(input.reconcileReplacementClaimCount);
  const cleanupOk=bool(input.cleanupOk);
  const commands=Array.isArray(input.commands) ? input.commands.map(x=>text(x,1000)).filter(Boolean) : [];
  if (!sourceCommit||!SHA40.test(sourceCommit)) reasons.push('exact-source-commit-required');
  if (environment !== 'POSTGRES') reasons.push('real-postgres-environment-required');
  if (crashExitCode !== 91) reasons.push('abrupt-worker-termination-not-observed');
  if (replaySafeRecovered !== 1) reasons.push('exactly-one-replay-safe-recovery-required');
  if (replacementClaimCount !== 1) reasons.push('exactly-one-replacement-claim-required');
  if (!reconcileDeadLettered) reasons.push('uncertain-reconcile-work-must-dead-letter');
  if (reconcileReplacementClaimCount !== 0) reasons.push('uncertain-reconcile-work-must-not-replay');
  if (!cleanupOk) reasons.push('synthetic-rehearsal-cleanup-required');
  if (!commands.length) reasons.push('executed-command-receipt-required');
  const ok=reasons.length===0;
  const receipt={
    ok,
    schemaVersion:DEPLOY_RESTART_RECOVERY_RECEIPT_VERSION,
    status:ok?'RESTART_RECOVERY_REHEARSAL_PASSED':'RESTART_RECOVERY_REHEARSAL_REFUSED',
    reasonCodes:reasons,
    sourceCommit,
    environment:environment||null,
    observed:{ crashExitCode, replaySafeRecovered, replacementClaimCount, reconcileDeadLettered, reconcileReplacementClaimCount, cleanupOk },
    commands,
    noDuplicateEffectClaim: ok ? 'QUEUE_REPLAY_SAFE_WORK_RECLAIMED_ONCE__UNCERTAIN_RECONCILE_WORK_NOT_REPLAYED' : 'NOT_PROVEN',
    rollbackBoundary:'SYNTHETIC_ROWS_REMOVED_AFTER_REHEARSAL__DEPLOYMENT_ROLLBACK_IS_PROVEN_SEPARATELY_BY_SUPPLIER_EXIT_DRILL',
    businessEffectAuthority:'NONE'
  };
  if(ok) receipt.receiptDigest=digest(restartRecoveryReceiptPreimage(receipt));
  return receipt;
}
