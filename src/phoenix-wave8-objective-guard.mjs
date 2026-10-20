import {verifyObjectiveEscrow} from './phoenix-objective-escrow.mjs';
import {ZERO_EXTERNAL_EFFECTS} from './effect-ledgers.mjs';

export const PHOENIX_WAVE8_OBJECTIVE_GUARD_VERSION='phoenix.wave8.objective-guard.v1';
const envelope=extra=>({
  externalEffectAuthority:'NONE',businessEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra
});
export function gateWave8CandidatePromotion({candidateCommitSha,objectiveEscrow}={}){
  if(typeof candidateCommitSha!=='string'||!/^[a-f0-9]{40}$/.test(candidateCommitSha))
    return envelope({ok:false,status:'WAVE8_PROMOTION_HELD',reason:'PINNED_CANDIDATE_SHA_REQUIRED',
      promotionAuthority:'NONE'});
  const proof=verifyObjectiveEscrow(objectiveEscrow||{});
  if(!proof.ok)
    return envelope({ok:false,status:'WAVE8_PROMOTION_HELD',
      reason:'EVALUATOR_OBJECTIVE_ESCROW_FAILED',sourceReason:proof.reason,
      candidateCommitSha,sourceProposalId:'phoenix-wave8-0001',
      promotionAuthority:'NONE'});
  return envelope({ok:true,status:'WAVE8_OBJECTIVE_INTEGRITY_PRECONDITION_PASSED',
    candidateCommitSha,sourceProposalId:'phoenix-wave8-0001',
    objectiveDigest:proof.originalObjectiveDigest,
    promotionAuthority:'NONE',canPromote:false,
    truthBoundary:'ONLY_SIGNED_OBJECTIVE_INTEGRITY_PRECONDITION_CHECKED__CANDIDATE_COMMIT_EXISTENCE_AND_TRUST_ANCHOR_MUST_BE_INDEPENDENTLY_VERIFIED'});
}
