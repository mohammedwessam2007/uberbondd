import crypto from 'node:crypto';

export const SOVEREIGN_RUNTIME_REHEARSAL_RECEIPT_VERSION='uberbond.sovereign-runtime-rehearsal.v1';
export const SOVEREIGN_RUNTIME_REHEARSAL_COMMANDS=Object.freeze([
  'status','backup','restore-drill','durable-worker-crash-recovery-via-postgres','kill-postgres+reconcile','kill-web+reconcile','kill-worker+reconcile',
  'deploy-valid-signed-failing-candidate','failed-promotion-rollback','explicit-rollback-out','explicit-rollback-return'
]);
const SHA40=/^[0-9a-f]{40}$/;
const SHA256=/^sha256:[0-9a-f]{64}$/;
const RECEIPT_KEYS=Object.freeze(['businessEffectAuthority','commands','externalEffectAuthority','observed','ok','reasonCodes','receiptDigest','rehearsalObserved','schemaVersion','sourceCommit','status','truthBoundary']);
const OBSERVED_KEYS=Object.freeze(['backupObserved','durableWorkerRecoveryReceiptDigest','explicitRollbackRoundTripObserved','failedPromotionRollbackObserved','finalCurrentReleaseId','finalCurrentSourceCommit','finalPreviousReleaseId','finalPreviousSourceCommit','postgresReconciledToExactImage','restoreDrillObserved','webReconciledToExactImage','workerReconciledToExactImage']);
const TRUTH_BOUNDARY='This receipt proves one bounded fail-closed rehearsal on an owned/authorized sovereign runtime host: backup, restore drill, durable worker crash recovery from Postgres-backed state, exact-image Postgres/web/worker reconciliation, failed-promotion rollback, and reversible explicit rollback. It does not prove customer/payment outcomes, provider independence beyond the observed host, Personal Civilization outcomes, or ASI.';

const digest=value=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const exactKeys=(value,expected)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('\0')===[...expected].sort().join('\0');
const text=(value,max=1000)=>{const s=String(value??'').trim();return s&&s.length<=max?s:null;};
const exactCommands=value=>Array.isArray(value)&&value.length===SOVEREIGN_RUNTIME_REHEARSAL_COMMANDS.length&&value.every((command,index)=>command===SOVEREIGN_RUNTIME_REHEARSAL_COMMANDS[index]);

export function sovereignRuntimeRehearsalPreimage(receipt={}){
  return {
    ok:receipt.ok,
    schemaVersion:receipt.schemaVersion,
    status:receipt.status,
    reasonCodes:receipt.reasonCodes,
    rehearsalObserved:receipt.rehearsalObserved,
    sourceCommit:receipt.sourceCommit,
    observed:receipt.observed,
    commands:receipt.commands,
    businessEffectAuthority:receipt.businessEffectAuthority,
    externalEffectAuthority:receipt.externalEffectAuthority,
    truthBoundary:receipt.truthBoundary
  };
}

export function verifySovereignRuntimeRehearsalReceipt(receipt={}){
  if(!exactKeys(receipt,RECEIPT_KEYS))return false;
  if(receipt.ok!==true||receipt.schemaVersion!==SOVEREIGN_RUNTIME_REHEARSAL_RECEIPT_VERSION||receipt.status!=='SOVEREIGN_RUNTIME_REHEARSAL_OBSERVED'||receipt.rehearsalObserved!==true)return false;
  if(!Array.isArray(receipt.reasonCodes)||receipt.reasonCodes.length!==0)return false;
  const source=String(receipt.sourceCommit||'').toLowerCase();if(!SHA40.test(source))return false;
  const o=receipt.observed;if(!exactKeys(o,OBSERVED_KEYS))return false;
  for(const key of ['backupObserved','restoreDrillObserved','postgresReconciledToExactImage','webReconciledToExactImage','workerReconciledToExactImage','failedPromotionRollbackObserved','explicitRollbackRoundTripObserved'])if(o[key]!==true)return false;
  if(!SHA256.test(String(o.durableWorkerRecoveryReceiptDigest||'')))return false;
  const currentId=String(o.finalCurrentReleaseId||'').toLowerCase();
  const previousId=String(o.finalPreviousReleaseId||'').toLowerCase();
  const previousSource=String(o.finalPreviousSourceCommit||'').toLowerCase();
  if(!SHA256.test(currentId)||!SHA256.test(previousId))return false;
  if(String(o.finalCurrentSourceCommit||'').toLowerCase()!==source||!SHA40.test(previousSource))return false;
  if(source===previousSource&&currentId===previousId)return false;
  if(!exactCommands(receipt.commands))return false;
  if(receipt.businessEffectAuthority!=='NONE'||receipt.externalEffectAuthority!=='NONE'||receipt.truthBoundary!==TRUTH_BOUNDARY)return false;
  if(!SHA256.test(String(receipt.receiptDigest||'')))return false;
  return receipt.receiptDigest===digest(sovereignRuntimeRehearsalPreimage(receipt));
}

export function compileSovereignRuntimeRehearsalReceipt(input={}){
  const reasons=[];
  const sourceCommit=String(input.sourceCommit||'').toLowerCase();
  const previousSourceCommit=String(input.previousSourceCommit||'').toLowerCase();
  const finalCurrentReleaseId=String(input.finalCurrentReleaseId||'').toLowerCase();
  const finalPreviousReleaseId=String(input.finalPreviousReleaseId||'').toLowerCase();
  const workerRecoveryDigest=String(input.durableWorkerRecoveryReceiptDigest||'').toLowerCase();
  const commands=Array.isArray(input.commands)?input.commands.map(command=>text(command,1000)).filter(Boolean):[];
  if(!SHA40.test(sourceCommit))reasons.push('exact-current-source-commit-required');
  if(!SHA40.test(previousSourceCommit))reasons.push('exact-previous-source-commit-required');
  if(!SHA256.test(finalCurrentReleaseId)||!SHA256.test(finalPreviousReleaseId))reasons.push('exact-final-image-identities-required');
  if(SHA40.test(sourceCommit)&&SHA40.test(previousSourceCommit)&&SHA256.test(finalCurrentReleaseId)&&SHA256.test(finalPreviousReleaseId)&&sourceCommit===previousSourceCommit&&finalCurrentReleaseId===finalPreviousReleaseId)reasons.push('two-distinct-good-release-history-required');
  if(!SHA256.test(workerRecoveryDigest))reasons.push('durable-worker-recovery-receipt-required');
  for(const [field,reason] of [
    ['backupObserved','backup-not-observed'],
    ['restoreDrillObserved','restore-drill-not-observed'],
    ['postgresReconciledToExactImage','postgres-exact-image-reconciliation-not-observed'],
    ['webReconciledToExactImage','web-exact-image-reconciliation-not-observed'],
    ['workerReconciledToExactImage','worker-exact-image-reconciliation-not-observed'],
    ['failedPromotionRollbackObserved','failed-promotion-rollback-not-observed'],
    ['explicitRollbackRoundTripObserved','explicit-rollback-roundtrip-not-observed']
  ])if(input[field]!==true)reasons.push(reason);
  if(!exactCommands(commands))reasons.push('exact-executed-command-chain-required');
  const ok=reasons.length===0;
  const receipt={
    ok,
    schemaVersion:SOVEREIGN_RUNTIME_REHEARSAL_RECEIPT_VERSION,
    status:ok?'SOVEREIGN_RUNTIME_REHEARSAL_OBSERVED':'SOVEREIGN_RUNTIME_REHEARSAL_REFUSED',
    reasonCodes:reasons,
    rehearsalObserved:ok,
    sourceCommit:SHA40.test(sourceCommit)?sourceCommit:null,
    observed:{
      backupObserved:input.backupObserved===true,
      durableWorkerRecoveryReceiptDigest:SHA256.test(workerRecoveryDigest)?workerRecoveryDigest:null,
      explicitRollbackRoundTripObserved:input.explicitRollbackRoundTripObserved===true,
      failedPromotionRollbackObserved:input.failedPromotionRollbackObserved===true,
      finalCurrentReleaseId:SHA256.test(finalCurrentReleaseId)?finalCurrentReleaseId:null,
      finalCurrentSourceCommit:SHA40.test(sourceCommit)?sourceCommit:null,
      finalPreviousReleaseId:SHA256.test(finalPreviousReleaseId)?finalPreviousReleaseId:null,
      finalPreviousSourceCommit:SHA40.test(previousSourceCommit)?previousSourceCommit:null,
      postgresReconciledToExactImage:input.postgresReconciledToExactImage===true,
      restoreDrillObserved:input.restoreDrillObserved===true,
      webReconciledToExactImage:input.webReconciledToExactImage===true,
      workerReconciledToExactImage:input.workerReconciledToExactImage===true
    },
    commands,
    businessEffectAuthority:'NONE',
    externalEffectAuthority:'NONE',
    truthBoundary:TRUTH_BOUNDARY
  };
  if(ok)receipt.receiptDigest=digest(sovereignRuntimeRehearsalPreimage(receipt));
  return receipt;
}
