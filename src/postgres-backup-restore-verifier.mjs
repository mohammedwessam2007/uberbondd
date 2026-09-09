import crypto from 'node:crypto';
import { POSTGRES_BACKUP_RESTORE_RECEIPT_VERSION, verifyPostgresBackupRestoreObservedReceiptIntegrity } from './postgres-backup-restore-receipt.mjs';

export const POSTGRES_BACKUP_RESTORE_VERIFIER_VERSION='uberbond.postgres-backup-restore-verifier.v1';
const SHA256=/^sha256:[0-9a-f]{64}$/;
const ZERO=Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});
const text=(v,max=500)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const norm=(v,max=500)=>text(v,max)?.toLowerCase()||null;
const digest=v=>`sha256:${crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex')}`;
const uniq=a=>[...new Set(a.filter(Boolean))];
const fail=(reasons,extra={})=>({ok:false,schemaVersion:POSTGRES_BACKUP_RESTORE_VERIFIER_VERSION,status:'POSTGRES_BACKUP_RESTORE_INDEPENDENT_VERIFICATION_REFUSED',reasonCodes:uniq(reasons),businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO},...extra});

export function postgresBackupRestoreVerificationPreimage(receipt={}){
  return {
    sourceCommit:receipt.sourceCommit,
    observedReceiptDigest:receipt.observedReceiptDigest,
    verifierRef:receipt.independentVerifierRef,
    verificationEvidenceRef:receipt.verificationEvidenceRef,
    runtimeIdentity:receipt.runtimeIdentity,
    manifestDigest:receipt.manifestDigest||null
  };
}

export function verifyIndependentPostgresBackupRestoreReceiptIntegrity(receipt={}){
  if(receipt?.ok!==true||receipt?.schemaVersion!==POSTGRES_BACKUP_RESTORE_RECEIPT_VERSION) return false;
  if(receipt?.status!=='POSTGRES_BACKUP_RESTORE_REHEARSAL_INDEPENDENTLY_VERIFIED'||receipt?.independentlyVerified!==true) return false;
  const observed={...receipt,status:'POSTGRES_BACKUP_RESTORE_REHEARSAL_OBSERVED_AWAITING_INDEPENDENT_VERIFICATION',independentlyVerified:false,independentVerifierRef:null,c23RestoreReceipt:null,verificationEvidenceRef:undefined,observedReceiptDigest:undefined,verificationDigest:undefined};
  observed.receiptDigest=receipt.observedReceiptDigest;
  if(!verifyPostgresBackupRestoreObservedReceiptIntegrity(observed)) return false;
  const preimage=postgresBackupRestoreVerificationPreimage(receipt);
  return text(receipt.verificationDigest,80)?.toLowerCase()===digest(preimage);
}

export function independentlyVerifyPostgresBackupRestoreReceipt({observedReceipt,verifierRef,verificationEvidenceRef}={}){
  const reasons=[];
  if(!verifyPostgresBackupRestoreObservedReceiptIntegrity(observedReceipt)) reasons.push('valid-observed-postgres-restore-receipt-required');
  const verifier=text(verifierRef);
  const evidence=text(verificationEvidenceRef);
  if(!verifier) reasons.push('independent-verifier-reference-required');
  if(!evidence) reasons.push('verification-evidence-reference-required');
  if(verifier&&observedReceipt?.observerRef&&norm(verifier)===norm(observedReceipt.observerRef)) reasons.push('observer-cannot-self-verify');
  if(verifier&&observedReceipt?.runtimeIdentity&&norm(verifier)===norm(observedReceipt.runtimeIdentity)) reasons.push('runtime-cannot-self-verify');
  if(reasons.length) return fail(reasons,{sourceCommit:observedReceipt?.sourceCommit||null});

  const verified={
    ...observedReceipt,
    status:'POSTGRES_BACKUP_RESTORE_REHEARSAL_INDEPENDENTLY_VERIFIED',
    independentlyVerified:true,
    independentVerifierRef:verifier,
    observedReceiptDigest:observedReceipt.receiptDigest,
    verificationEvidenceRef:evidence,
    c23RestoreReceipt:{
      evidenceClass:'OBSERVED_RUNTIME',
      receiptClass:'RESTORE',
      evidenceRef:observedReceipt.evidenceRef,
      independentVerifierRef:verifier,
      verificationEvidenceRef:evidence,
      manifestDigest:observedReceipt.manifestDigest||null,
      runtimeIdentity:observedReceipt.runtimeIdentity,
      checksumMatch:true,
      boundedWorkloadVerified:true,
      rollbackRef:observedReceipt.rollbackRef
    },
    truthBoundary:'Independent verification binds a distinct verifier to the exact observed PostgreSQL restore receipt digest. It proves only this recorded rehearsal scope and does not prove provider independence, production cutover, future restoreability, customer outcomes or elapsed autonomy.',
    businessEffectAuthority:'NONE',
    externalEffectLedger:{...ZERO}
  };
  const preimage=postgresBackupRestoreVerificationPreimage(verified);
  return {...verified,verificationDigest:digest(preimage)};
}
