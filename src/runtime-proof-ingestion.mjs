import { readFileSync } from 'node:fs';
import { verifyRestartRecoveryReceiptIntegrity } from './deploy-restart-recovery-receipt.mjs';
import { verifySourceRepositoryHostReceiptIntegrity } from './source-repository-host-receipt.mjs';
import { verifyWebRuntimeHostReceiptIntegrity } from './web-runtime-host-receipt.mjs';

export const RUNTIME_PROOF_INGESTION_VERSION='uberbond.runtime-proof-ingestion.v2';
const SHA40=/^[0-9a-f]{40}$/;
const ZERO=Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});

function validate({receipt,expectedSourceCommit,evidenceRef,verify,kind,statusAccepted,statusRejected,mismatchReason}){
  const expected=String(expectedSourceCommit||'').trim().toLowerCase();const ref=String(evidenceRef||'').trim();const reasons=[];
  if(!SHA40.test(expected))reasons.push('exact-expected-source-commit-required');
  if(!ref)reasons.push('runtime-evidence-reference-required');
  if(!verify(receipt))reasons.push(`canonical-${kind}-receipt-required`);
  if(String(receipt?.sourceCommit||'').toLowerCase()!==expected)reasons.push(mismatchReason);
  const accepted=reasons.length===0;
  return{ok:true,version:RUNTIME_PROOF_INGESTION_VERSION,kind,status:accepted?statusAccepted:statusRejected,accepted,reasonCodes:reasons,sourceCommit:receipt?.sourceCommit||null,receiptDigest:receipt?.receiptDigest||null,evidenceRef:accepted?ref:null,businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO},truthBoundary:'ONLY_CANONICAL_DIGEST_INTACT_EXACT_SOURCE_RUNTIME_RECEIPTS_MAY_CHANGE_RUNTIME_CUT_STATUS'};
}
function load({path,expectedSourceCommit,validator}){const file=String(path||'').trim();if(!file)return validator({receipt:null,expectedSourceCommit,evidenceRef:''});let receipt=null;try{receipt=JSON.parse(readFileSync(file,'utf8'));}catch{return{...validator({receipt:null,expectedSourceCommit,evidenceRef:`file:${file}`}),reasonCodes:['runtime-evidence-file-unreadable-or-invalid-json']};}return validator({receipt,expectedSourceCommit,evidenceRef:`file:${file}#${receipt?.receiptDigest||'missing-digest'}`});}

export function validateRestartRecoveryRuntimeEvidence(args={}){return validate({...args,verify:verifyRestartRecoveryReceiptIntegrity,kind:'restart-recovery',statusAccepted:'EXACT_SOURCE_RESTART_RECOVERY_RUNTIME_EVIDENCE_ACCEPTED',statusRejected:'RESTART_RECOVERY_RUNTIME_EVIDENCE_REJECTED',mismatchReason:'restart-recovery-source-mismatch'});}
export function validateSourceRepositoryHostRuntimeEvidence(args={}){return validate({...args,verify:verifySourceRepositoryHostReceiptIntegrity,kind:'source-repository-host',statusAccepted:'EXACT_SOURCE_REPOSITORY_HOST_RUNTIME_EVIDENCE_ACCEPTED',statusRejected:'SOURCE_REPOSITORY_HOST_RUNTIME_EVIDENCE_REJECTED',mismatchReason:'source-repository-host-source-mismatch'});}
export function validateWebRuntimeHostRuntimeEvidence(args={}){return validate({...args,verify:verifyWebRuntimeHostReceiptIntegrity,kind:'web-runtime-host',statusAccepted:'EXACT_SOURCE_WEB_RUNTIME_HOST_EVIDENCE_ACCEPTED',statusRejected:'WEB_RUNTIME_HOST_EVIDENCE_REJECTED',mismatchReason:'web-runtime-host-source-mismatch'});}
export function loadRestartRecoveryRuntimeEvidence({path,expectedSourceCommit}={}){return load({path,expectedSourceCommit,validator:validateRestartRecoveryRuntimeEvidence});}
export function loadSourceRepositoryHostRuntimeEvidence({path,expectedSourceCommit}={}){return load({path,expectedSourceCommit,validator:validateSourceRepositoryHostRuntimeEvidence});}
export function loadWebRuntimeHostRuntimeEvidence({path,expectedSourceCommit}={}){return load({path,expectedSourceCommit,validator:validateWebRuntimeHostRuntimeEvidence});}
