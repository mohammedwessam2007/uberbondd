export const DEPLOY_RESTART_RECOVERY_RECEIPT_VERSION = 'uberbond.deploy-restart-recovery.v1';

function text(v, max=1000){ const s=String(v??'').trim(); return s && s.length<=max ? s : null; }
function bool(v){ return v === true; }
function int(v){ const n=Number(v); return Number.isSafeInteger(n) ? n : null; }

export function compileRestartRecoveryReceipt(input={}) {
  const reasons=[];
  const sourceCommit=text(input.sourceCommit,120);
  const environment=text(input.environment,120)?.toUpperCase();
  const crashExitCode=int(input.crashExitCode);
  const replaySafeRecovered=int(input.replaySafeRecovered);
  const replacementClaimCount=int(input.replacementClaimCount);
  const reconcileDeadLettered=bool(input.reconcileDeadLettered);
  const reconcileReplacementClaimCount=int(input.reconcileReplacementClaimCount);
  const cleanupOk=bool(input.cleanupOk);
  const commands=Array.isArray(input.commands) ? input.commands.map(x=>text(x,1000)).filter(Boolean) : [];
  if (!sourceCommit) reasons.push('source-commit-required');
  if (environment !== 'POSTGRES') reasons.push('real-postgres-environment-required');
  if (crashExitCode !== 91) reasons.push('abrupt-worker-termination-not-observed');
  if (replaySafeRecovered !== 1) reasons.push('exactly-one-replay-safe-recovery-required');
  if (replacementClaimCount !== 1) reasons.push('exactly-one-replacement-claim-required');
  if (!reconcileDeadLettered) reasons.push('uncertain-reconcile-work-must-dead-letter');
  if (reconcileReplacementClaimCount !== 0) reasons.push('uncertain-reconcile-work-must-not-replay');
  if (!cleanupOk) reasons.push('synthetic-rehearsal-cleanup-required');
  if (!commands.length) reasons.push('executed-command-receipt-required');
  const ok=reasons.length===0;
  return {
    ok,
    schemaVersion:DEPLOY_RESTART_RECOVERY_RECEIPT_VERSION,
    status:ok?'RESTART_RECOVERY_REHEARSAL_PASSED':'RESTART_RECOVERY_REHEARSAL_REFUSED',
    reasonCodes:reasons,
    sourceCommit:sourceCommit||null,
    environment:environment||null,
    observed:{ crashExitCode, replaySafeRecovered, replacementClaimCount, reconcileDeadLettered, reconcileReplacementClaimCount, cleanupOk },
    commands,
    noDuplicateEffectClaim: ok ? 'QUEUE_REPLAY_SAFE_WORK_RECLAIMED_ONCE__UNCERTAIN_RECONCILE_WORK_NOT_REPLAYED' : 'NOT_PROVEN',
    rollbackBoundary:'SYNTHETIC_ROWS_REMOVED_AFTER_REHEARSAL__DEPLOYMENT_ROLLBACK_IS_PROVEN_SEPARATELY_BY_SUPPLIER_EXIT_DRILL',
    businessEffectAuthority:'NONE'
  };
}
