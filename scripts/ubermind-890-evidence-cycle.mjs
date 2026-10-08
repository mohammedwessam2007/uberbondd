import {
 recover890FounderIdeaUniverse,compileUberMindEvidenceFlywheel
} from '../src/ubermind-890-evidence-flywheel.mjs';
import { runAchievedOpusEquivalenceDoctor } from './infinite-opus-achieved-equivalence-doctor.mjs';
import { summarizeHistoricalSealedReference } from '../src/ubermind-sealed-reference-bridge.mjs';

export const UBERMIND_890_DOCTOR_SCHEMA='uberbond.ubermind-890-proof-cycle.v1';

export function runUberMind890ProofCycle({root=process.cwd(),clock=Date.now(),historicalMeasuredReferenceDominance=null}={}){
  let universe,exact;
  try{universe=recover890FounderIdeaUniverse({root});}
  catch(error){
    return {ok:false,status:'FOUNDER_890_RECOVERY_INCOMPLETE',
      errorClass:String(error?.message??'source-unavailable').slice(0,180),
      originalFounderIdeasScanned:null,paidCallsPerformed:0,spendAuthorized:false};
  }
  try{exact=runAchievedOpusEquivalenceDoctor({root});}
  catch(error){exact={ok:false,status:'SOURCE_EXACT_DOCTOR_UNAVAILABLE',
    reason:String(error?.message??'source-unavailable').slice(0,180)};}
  const historical=summarizeHistoricalSealedReference(historicalMeasuredReferenceDominance);
  const portfolio=compileUberMindEvidenceFlywheel({
    founderCorpus:universe,observations:[],
    expectedTaskClasses:[
      'SOURCE_GROUNDED_EXACT_JSON_RETRIEVAL',
      'BOUNDED_PUBLIC_JEV_DECISIONS',
      'FRONTIER_OPEN_ENDED_REASONING'
    ],
    now:clock()
  });
  if(!portfolio.ok)return {...portfolio,exactSourceDoctorOk:exact.ok===true};
  // The 231/231 exact retrieval doctor proves only an exact task-family island,
  // NOT 231 independent blind frontier comparisons. Keep them separate.
  return {
    schemaVersion:UBERMIND_890_DOCTOR_SCHEMA,ok:universe.ok&&portfolio.ok,
    status:'UBERMIND_890_EVIDENCE_CYCLE_COMPLETE_NO_PAID_EFFECTS',
    founderIdeasVerified:universe.scannedIdeas,
    shardDigestsVerified:universe.shardsVerified,
    donorIds:portfolio.donorIdeaIds,
    exactIslandDoctorStatus:exact.status??'UNKNOWN',
    exactIslandDoctorOk:exact.ok===true,
    exactIslandObligations:exact.exactObligationCount??null,
    actualIndependentFrontierHoldoutsInCycle:portfolio.observedDistinctHoldouts,
    historicalSealedPairSummaryStatus:historical.status,
    historicalSealedDistinctTaskCount:historical.historicDistinctTaskCount,
    historicalCandidateOnlyFactor:historical.candidateOnlyFactor??null,
    historicalProofInclusiveFactor:historical.proofInclusiveFactor??null,
    remainingFreshHoldoutsIfHistoricalPairIndependentlyAudited:
      historical.ok?71:null,
    historicalPairConfersNoGeneralAdmission:true,
    proposedDistinctHoldoutTargets:portfolio.nextWork,
    globalCrownAdmission:'NONE',
    generalFrontierEquivalenceProven:false,
    global33333xConfirmed:false,
    possibleInternalWorkRemaining:true,
    stateDigest:portfolio.recordDigest+':'+(historical.sourceSummaryDigest??'HISTORICAL_NONE'),
    paidCallsPerformed:0,actualSpendUsd:0,spendAuthorized:false,
    automaticPaidRepetition:false,externalEffectAuthority:'NONE',
    truthBoundary:'Verifies 890 literal original idea shards and rechecks already-existing E1 exact source proof. Does NOT silently transform exact source obligations or donor ideas into independent general-quality holdouts.'
  };
}
