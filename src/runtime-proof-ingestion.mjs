import { readFileSync } from 'node:fs';
import { verifyRestartRecoveryReceiptIntegrity } from './deploy-restart-recovery-receipt.mjs';

export const RUNTIME_PROOF_INGESTION_VERSION='uberbond.runtime-proof-ingestion.v1';
const SHA40=/^[0-9a-f]{40}$/;
const ZERO=Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});

export function validateRestartRecoveryRuntimeEvidence({receipt,expectedSourceCommit,evidenceRef}={}){
  const expected=String(expectedSourceCommit||'').trim().toLowerCase();
  const ref=String(evidenceRef||'').trim();
  const reasons=[];
  if(!SHA40.test(expected)) reasons.push('exact-expected-source-commit-required');
  if(!ref) reasons.push('runtime-evidence-reference-required');
  if(!verifyRestartRecoveryReceiptIntegrity(receipt)) reasons.push('canonical-restart-recovery-receipt-required');
  if(receipt?.sourceCommit!==expected) reasons.push('restart-recovery-source-mismatch');
  const accepted=reasons.length===0;
  return {
    ok:true,
    version:RUNTIME_PROOF_INGESTION_VERSION,
    status:accepted?'EXACT_SOURCE_RESTART_RECOVERY_RUNTIME_EVIDENCE_ACCEPTED':'RESTART_RECOVERY_RUNTIME_EVIDENCE_REJECTED',
    accepted,
    reasonCodes:reasons,
    sourceCommit:receipt?.sourceCommit||null,
    receiptDigest:receipt?.receiptDigest||null,
    evidenceRef:accepted?ref:null,
    businessEffectAuthority:'NONE',
    externalEffectLedger:{...ZERO},
    truthBoundary:'ONLY_CANONICAL_DIGEST_INTACT_EXACT_SOURCE_RUNTIME_RECEIPTS_MAY_CHANGE_RUNTIME_CUT_STATUS'
  };
}

export function loadRestartRecoveryRuntimeEvidence({path,expectedSourceCommit}={}){
  const file=String(path||'').trim();
  if(!file) return validateRestartRecoveryRuntimeEvidence({receipt:null,expectedSourceCommit,evidenceRef:''});
  let receipt=null;
  try{receipt=JSON.parse(readFileSync(file,'utf8'));}
  catch{return {...validateRestartRecoveryRuntimeEvidence({receipt:null,expectedSourceCommit,evidenceRef:`file:${file}`}),reasonCodes:['runtime-evidence-file-unreadable-or-invalid-json']};}
  return validateRestartRecoveryRuntimeEvidence({receipt,expectedSourceCommit,evidenceRef:`file:${file}#${receipt?.receiptDigest||'missing-digest'}`});
}
