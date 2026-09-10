import crypto from 'node:crypto';

export const SOVEREIGN_RUNTIME_REHEARSAL_RECEIPT_VERSION='uberbond.sovereign-runtime-rehearsal.v1';
const SHA40=/^[0-9a-f]{40}$/;
const SHA256=/^sha256:[0-9a-f]{64}$/;
const RECEIPT_KEYS=Object.freeze(['businessEffectAuthority','commands','externalEffectAuthority','observed','ok','reasonCodes','receiptDigest','rehearsalObserved','schemaVersion','sourceCommit','status','truthBoundary']);
const OBSERVED_KEYS=Object.freeze(['backupObserved','durableRestartRecoveryReceiptDigest','explicitRollbackRoundTripObserved','failedPromotionRollbackObserved','finalCurrentReleaseId','finalCurrentSourceCommit','finalPreviousReleaseId','finalPreviousSourceCommit','restoreDrillObserved','webReconciledToExactImage','workerReconciledToExactImage']);
const TRUTH_BOUNDARY='This receipt proves one bounded fail-closed rehearsal on an owned/authorized sovereign runtime host: backup, restore drill, durable Postgres crash/recovery, exact-image reconciliation, failed-promotion rollback, and reversible explicit rollback. It does not prove customer/payment outcomes, provider independence beyond the observed host, Personal Civilization outcomes, or ASI.';

const digest=value=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
const exactKeys=(value,expected)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join('\0')===[...expected].sort().join('\0');
const text=(value,max=1000)=>{const s=String(value??'').trim();return s&&s.length<=max?s:null;};

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
  for(const key of ['backupObserved','restoreDrillObserved','webReconciledToExactImage','workerReconciledToExactImage','failedPromotionRollbackObserved','explicitRollbackRoundTripObserved'])if(o[key]!==true)return false;
  if(!SHA256.test(String(o.durableRestartRecoveryReceiptDigest||'')))return false;
  if(!SHA256.test(String(o.finalCurrentReleaseId||''))||!SHA256.test(String(o.finalPreviousReleaseId||'')))return false;
  if(String(o.finalCurrentSourceCommit||'').toLowerCase()!==source||!SHA40.test(String(o.finalPreviousSourceCommit||'').toLowerCase()))return false;
  if(!Array.isArray(receipt.commands)||receipt.commands.length<8||receipt.commands.some(command=>!text(command,1000)))return false;
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
  const restartDigest=String(input.durableRestartRecoveryReceiptDigest||'').toLowerCase();
  const commands=Array.isArray(input.commands)?input.commands.map(command=>text(command,1000)).filter(Boolean):[];
  if(!SHA40.test(sourceCommit))reasons.push('exact-current-source-commit-required');
  if(!SHA40.test(previousSourceCommit))reasons.push('exact-previous-source-commit-required');
  if(!SHA256.test(finalCurrentReleaseId)||!SHA256.test(finalPreviousReleaseId))reasons.push('exact-final-image-identities-required');
  if(!SHA256.test(restartDigest))reasons.push('durable-restart-recovery-receipt-required');
  for(const [field,reason] of [
    ['backupObserved','backup-not-observed'],
    ['restoreDrillObserved','restore-drill-not-observed'],
    ['webReconciledToExactImage','web-exact-image-reconciliation-not-observed'],
    ['workerReconciledToExactImage','worker-exact-image-reconciliation-not-observed'],
    ['failedPromotionRollbackObserved','failed-promotion-rollback-not-observed'],
    ['explicitRollbackRoundTripObserved','explicit-rollback-roundtrip-not-observed']
  ])if(input[field]!==true)reasons.push(reason);
  if(commands.length<8)reasons.push('executed-command-chain-required');
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
      durableRestartRecoveryReceiptDigest:SHA256.test(restartDigest)?restartDigest:null,
      explicitRollbackRoundTripObserved:input.explicitRollbackRoundTripObserved===true,
      failedPromotionRollbackObserved:input.failedPromotionRollbackObserved===true,
      finalCurrentReleaseId:SHA256.test(finalCurrentReleaseId)?finalCurrentReleaseId:null,
      finalCurrentSourceCommit:SHA40.test(sourceCommit)?sourceCommit:null,
      finalPreviousReleaseId:SHA256.test(finalPreviousReleaseId)?finalPreviousReleaseId:null,
      finalPreviousSourceCommit:SHA40.test(previousSourceCommit)?previousSourceCommit:null,
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
