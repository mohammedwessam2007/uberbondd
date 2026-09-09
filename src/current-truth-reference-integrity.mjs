import { verifyCurrentTruthRegeneration } from './current-truth-regeneration.mjs';
import { verifyEvidenceReferenceIntegrity } from './evidence-reference-integrity.mjs';

export const CURRENT_TRUTH_REFERENCE_INTEGRITY_VERSION='uberbond.current-truth-reference-integrity.v1';
const ZERO=Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});

export function bindReferenceIntegrityToTruthReceipt({baseReceipt={},referenceIntegrity={}}={}){
  if(referenceIntegrity?.ok!==true){
    return{ok:false,version:CURRENT_TRUTH_REFERENCE_INTEGRITY_VERSION,status:'CURRENT_TRUTH_REFERENCE_INTEGRITY_REFUSED',reasonCodes:['internal-evidence-reference-integrity-required',...(referenceIntegrity?.reasonCodes||[])],referenceIntegrity,businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO}};
  }
  if(baseReceipt?.ok!==true) return baseReceipt;
  return{
    ...baseReceipt,
    evidenceReferenceIntegrity:{version:CURRENT_TRUTH_REFERENCE_INTEGRITY_VERSION,status:referenceIntegrity.status,referenceDigest:referenceIntegrity.referenceDigest,trackedPathCount:referenceIntegrity.trackedPathCount,checkedRepositoryPathCount:referenceIntegrity.checkedRepositoryPaths.length},
    closureBoundary:{...baseReceipt.closureBoundary,internalEvidenceReferenceTruth:'EXACT_REPOSITORY_REFERENCES_RESOLVED_AND_BOUND_TO_CANONICAL_COVERAGE_STATE'},
    businessEffectAuthority:'NONE',
    externalEffectLedger:{...ZERO}
  };
}

export function verifyCurrentTruthRegenerationWithReferenceIntegrity(args={}){
  const referenceIntegrity=verifyEvidenceReferenceIntegrity({coverage:args.coverage,leafGraph:args.leafGraph,trackedPaths:args.trackedPaths});
  if(!referenceIntegrity.ok) return bindReferenceIntegrityToTruthReceipt({referenceIntegrity});
  const baseReceipt=verifyCurrentTruthRegeneration(args);
  return bindReferenceIntegrityToTruthReceipt({baseReceipt,referenceIntegrity});
}
