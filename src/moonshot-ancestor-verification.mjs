import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileProofDag, assertObservedProof, inspectProofAncestry } from './content-addressed-proof-dag.mjs';
import {
  forecasterSubmission, effectiveIndependence, adversarialAttack,
  epistemicImmuneReview, modelEcology
} from './forecast-adversarial-ensemble.mjs';
import { compileDelegationGraph, revokeDelegationSubtree } from './recursive-revocation-graph.mjs';
import { enforceHumanAuthorityKernel } from './possibility-civilization-kernel.mjs';

export const MOONSHOT_ANCESTOR_VERIFICATION_VERSION='uberbond.moonshot-ancestor-verification.v1';

const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

export function verifyTruthEvidenceSubstrate(){
  const clean=compileProofDag({proofs:[
    {
      id:'observed-root',kind:'measurement',evidenceRef:'receipt:observed-root',
      parents:[],synthetic:false,sourceClass:'OBSERVED',observed:true,verifierRef:'independent-verifier'
    },
    {
      id:'observed-child',kind:'replication',evidenceRef:'receipt:observed-child',
      parents:['observed-root'],synthetic:false,sourceClass:'OBSERVED',observed:true,verifierRef:'second-verifier'
    }
  ]});
  const cleanObserved=clean.ok?assertObservedProof({dag:clean,proofId:'observed-child'}):clean;

  const contaminated=compileProofDag({proofs:[
    {
      id:'sim',kind:'simulation',evidenceRef:'artifact:synthetic',
      parents:[],synthetic:true,sourceClass:'SYNTHETIC',observed:false,verifierRef:'simulator'
    },
    {
      id:'claim',kind:'measurement',evidenceRef:'receipt:claim',
      parents:['sim'],synthetic:false,sourceClass:'OBSERVED',observed:true,verifierRef:'same-program'
    }
  ]});
  const contaminationCheck=contaminated.ok
    ?assertObservedProof({dag:contaminated,proofId:'claim'})
    :contaminated;
  const ancestry=contaminated.ok
    ?inspectProofAncestry({dag:contaminated,proofId:'claim'})
    :contaminated;

  const pass=
    clean.ok===true &&
    cleanObserved.ok===true &&
    contaminated.ok===true &&
    contaminationCheck.ok===false &&
    contaminationCheck.reasonCodes?.includes('synthetic-ancestry-visible-and-not-admissible-as-observed-proof') &&
    ancestry.containsSyntheticAncestry===true;

  return envelope({
    ok:pass,
    status:pass?'TRUTH_EVIDENCE_SUBSTRATE_VERIFIED':'TRUTH_EVIDENCE_SUBSTRATE_FAILED',
    cleanObservedStatus:cleanObserved.status,
    contaminatedObservedStatus:contaminationCheck.status,
    contaminationReasonCodes:contaminationCheck.reasonCodes||[],
    syntheticAncestryVisible:ancestry.containsSyntheticAncestry===true,
    proofDagDigest:clean.dagDigest||null,
    law:'OBSERVED_TRUTH_REQUIRES_CLEAN_OBSERVED_ANCESTRY__SYNTHETIC_ANCESTRY_MUST_REMAIN_VISIBLE'
  });
}

export function verifyAdversarialTribunal(){
  const correlatedA=forecasterSubmission({
    forecasterId:'clone-a',stance:'MAINSTREAM',
    distribution:{PASS:.9,FAIL:.1},
    evidenceAncestry:['source:shared-report'],
    updateTriggers:['new replication disagrees'],
    evidence:['same report']
  });
  const correlatedB=forecasterSubmission({
    forecasterId:'clone-b',stance:'MAINSTREAM',
    distribution:{PASS:.88,FAIL:.12},
    evidenceAncestry:['source:shared-report'],
    updateTriggers:['new replication disagrees'],
    evidence:['same report']
  });
  const dissent=forecasterSubmission({
    forecasterId:'dissent',stance:'MINORITY',
    distribution:{PASS:.2,FAIL:.8},
    evidenceAncestry:['source:independent-replication'],
    updateTriggers:['independent replication passes'],
    evidence:['independent replication']
  });
  const submissions=[correlatedA,correlatedB,dissent];
  const independence=effectiveIndependence(submissions);
  const ecology=modelEcology(submissions,'PASS');
  const attack=adversarialAttack({
    critic:'red-team',
    attackType:'COUNTEREXAMPLE',
    finding:'A held-out counterexample would falsify the dominant claim.',
    forecastSurvived:false
  });
  const immune=epistemicImmuneReview({
    conclusion:'candidate is correct',
    flags:['correlated-sources','consensus-masquerading-as-independent-evidence']
  });

  const dissentPreserved=ecology.ok===true &&
    ecology.minority?.some(row=>row.forecasterId==='dissent') &&
    ecology.dropped?.length===0;
  const correlationDiscounted=independence.ok===true &&
    independence.effectiveIndependentCount<independence.rawCount &&
    independence.correlated===true;
  const typedAttack=attack.ok===true&&attack.attackType==='COUNTEREXAMPLE';
  const biasVisible=immune.ok===true&&immune.flags.includes('correlated-sources');
  const pass=dissentPreserved&&correlationDiscounted&&typedAttack&&biasVisible;

  return envelope({
    ok:pass,
    status:pass?'ADVERSARIAL_TRIBUNAL_VERIFIED':'ADVERSARIAL_TRIBUNAL_FAILED',
    rawForecasterCount:independence.rawCount||0,
    effectiveIndependentCount:independence.effectiveIndependentCount||0,
    correlationDiscounted,
    dissentPreserved,
    attackRecorded:typedAttack,
    epistemicBiasVisible:biasVisible,
    law:'DISSENT_REMAINS_VISIBLE__CORRELATED_CONSENSUS_IS_DISCOUNTED__ATTACKS_REQUIRE_TYPED_FALSIFICATION_CONTENT'
  });
}

export function verifySovereigntyGovernor(){
  const authority=enforceHumanAuthorityKernel({
    capabilityBefore:['READ'],
    capabilityAfter:['READ','SIMULATE','COMPILE'],
    authorityBefore:['READ'],
    authorityAfter:['READ','SPEND'],
    explicitAuthorityGrants:[]
  });

  const widened=compileDelegationGraph({grants:[
    {id:'root',actions:['READ'],expiresAt:'2099-01-01T00:00:00Z'},
    {id:'child',parentId:'root',actions:['READ','SPEND'],expiresAt:'2098-01-01T00:00:00Z'}
  ]});

  const valid=compileDelegationGraph({grants:[
    {id:'root',actions:['READ','SIMULATE'],expiresAt:'2099-01-01T00:00:00Z'},
    {id:'child',parentId:'root',actions:['READ'],expiresAt:'2098-01-01T00:00:00Z'},
    {id:'grandchild',parentId:'child',actions:['READ'],expiresAt:'2097-01-01T00:00:00Z'}
  ]});
  const revoked=valid.ok?revokeDelegationSubtree({
    graph:valid,revokeId:'child',revokedAt:'2026-09-20T16:00:00Z',reason:'verification'
  }):valid;

  const authorityRejected=authority.ok===false &&
    authority.unauthorizedAuthorityAdded?.includes('SPEND');
  const wideningRejected=widened.ok===false &&
    widened.reasonCodes?.some(code=>code.includes('delegation-may-only-attenuate'));
  const recursiveRevocation=revoked.ok===true &&
    revoked.receipt?.revokedDelegationIds?.includes('child') &&
    revoked.receipt?.revokedDelegationIds?.includes('grandchild');
  const pass=authorityRejected&&wideningRejected&&recursiveRevocation;

  return envelope({
    ok:pass,
    status:pass?'SOVEREIGNTY_GOVERNOR_VERIFIED':'SOVEREIGNTY_GOVERNOR_FAILED',
    capabilityGrowthWithoutAuthorityGrowthRejected:authorityRejected,
    delegationWideningRejected:wideningRejected,
    recursiveRevocationVerified:recursiveRevocation,
    revokedDelegationIds:revoked.receipt?.revokedDelegationIds||[],
    law:'CAPABILITY_DOES_NOT_CREATE_AUTHORITY__DELEGATION_ONLY_ATTENUATES__REVOCATION_PROPAGATES_TO_DESCENDANTS'
  });
}

export function verifyMoonshotInternalAncestorDonors(){
  const truth=verifyTruthEvidenceSubstrate();
  const adversarial=verifyAdversarialTribunal();
  const sovereignty=verifySovereigntyGovernor();
  const pass=truth.ok&&adversarial.ok&&sovereignty.ok;
  return envelope({
    ok:pass,
    status:pass?'MOONSHOT_INTERNAL_ANCESTOR_DONORS_VERIFIED':'MOONSHOT_INTERNAL_ANCESTOR_DONOR_FAILURE',
    truthEvidence:truth,
    adversarialTribunal:adversarial,
    sovereigntyGovernor:sovereignty,
    law:'CANONICAL_ANCESTOR_NAMES_BECOME_READY_ONLY_AFTER_CURRENT_CALLABLE_DONORS_PASS_HOSTILE_RUNTIME_PROBES'
  });
}
