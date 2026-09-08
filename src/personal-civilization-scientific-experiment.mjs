import { osteogenesisForPossibility, experiencePlan } from './personal-civilization-possibility.mjs';
import { compileBoundedExperiment } from './bounded-experiment-compiler.mjs';
import { evaluateValueOfInformation } from './value-of-information-governor.mjs';

export const PERSONAL_CIVILIZATION_SCIENTIFIC_EXPERIMENT_VERSION = 'uberbond.personal-civilization-scientific-experiment.v1';

const ZERO = Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});
const text=(v,max=1600)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const fail=(status,reasons,extra={})=>({ok:false,status,reasonCodes:[...new Set(reasons.filter(Boolean))],businessEffectAuthority:'NONE',externalEffectLedger:{...ZERO},...extra});

/**
 * Compile one founder-selected life possibility into the smallest scientific
 * reality contact that could update the model. It never chooses a possibility
 * and never executes the experiment.
 */
export function compilePersonalScientificExperiment({
  founderSelection=null,
  requiredCapabilities=[],
  capabilities=[],
  experience=null,
  hypotheses=[],
  budget=null,
  effectAuthority=null,
  voi=null
}={}){
  const possibility=text(founderSelection?.possibility,500);
  const selectedAt=text(founderSelection?.selectedAt,80);
  const selectionEvidenceRef=text(founderSelection?.evidenceRef,500);
  if(founderSelection?.chosenByFounder!==true||!possibility||!selectedAt||!selectionEvidenceRef){
    return fail('PCE_EXPERIMENT_FOUNDER_SELECTION_REQUIRED',['explicit-founder-selection-with-provenance-required']);
  }

  const osteogenesis=osteogenesisForPossibility({possibility,requiredCapabilities,capabilities});
  if(!osteogenesis.ok)return fail('PCE_EXPERIMENT_CAPABILITY_ANALYSIS_REFUSED',osteogenesis.reasonCodes||['osteogenesis-refused'],{osteogenesis});

  const planned=experiencePlan({
    ...(experience||{}),
    forPossibility:possibility
  });
  if(!planned.ok)return fail('PCE_EXPERIMENT_EXPERIENCE_REFUSED',planned.reasonCodes||['experience-plan-refused'],{experiencePlan:planned});
  if(planned.experience?.requiresFounderAuthority&&planned.experience?.runnable!==true){
    return fail('PCE_EXPERIMENT_LIFE_AUTHORITY_REQUIRED',['life-experience-commitment-authority-required'],{experiencePlan:planned});
  }

  const costCents=Number(experience?.costCents??0);
  const timeMinutes=Number(experience?.timeMinutes??0);
  const effects=Array.isArray(experience?.effects)?experience.effects:[];
  const effectful=costCents>0||effects.length>0;

  const bounded=compileBoundedExperiment({
    mission:`Learn whether founder-selected possibility is better modeled after one reversible experience: ${possibility}`,
    hypotheses,
    budget,
    probe:{
      description:planned.experience.smallestReversibleExperience,
      costCents,
      timeMinutes,
      reversibility:'REVERSIBLE',
      effects,
      declaredEffectCount:effects.length
    },
    capabilities:effectful?['execute founder-authorized bounded life experiment']:[],
    resources:effectful?['founder-authorized bounded resources']:[],
    authority:effectAuthority
  });
  if(!bounded.ok)return fail('PCE_EXPERIMENT_FEASIBILITY_REFUSED',bounded.reasonCodes||['bounded-experiment-refused'],{boundedExperiment:bounded});

  const information=evaluateValueOfInformation({
    decision:`Whether to update confidence in possibility: ${possibility}`,
    ...(voi||{})
  });
  if(!information.ok)return fail('PCE_EXPERIMENT_VOI_INVALID',information.reasonCodes||['voi-invalid'],{valueOfInformation:information});

  const observeRecommended=information.status==='OBSERVE_ONE_JUSTIFIED';
  return {
    ok:true,
    status:observeRecommended?'PCE_REVERSIBLE_EXPERIMENT_READY_FOR_FOUNDER_DECISION':'PCE_EXPERIMENT_NOT_CURRENTLY_INFORMATION_WORTHWHILE',
    founderSelection:{possibility,selectedAt,evidenceRef:selectionEvidenceRef},
    capabilityAnalysis:{status:osteogenesis.status,bindingConstraint:osteogenesis.bindingConstraint,gaps:osteogenesis.gaps},
    experiencePlan:planned,
    boundedExperiment:bounded,
    valueOfInformation:information,
    experimentDossier:{
      uncertainty:planned.experience.uncertainty,
      wouldReveal:planned.experience.wouldReveal,
      wouldFalsify:planned.experience.wouldFalsify,
      rivalHypotheses:bounded.hypotheses,
      updateOnlyAfterObservation:true,
      chosenByFounder:true,
      runnableByThisModule:false
    },
    sovereigntyBoundary:'THE_FOUNDER_SELECTED_THE_POSSIBILITY__THIS MODULE ONLY COMPILES A REVERSIBLE LEARNING OPPORTUNITY__IT DOES NOT CHOOSE OR EXECUTE IT',
    privateBoundary:'PRIVATE_LIFE_INPUTS_REMAIN_FOUNDER_INTERACTIVE__NO_UNATTENDED_WORKER_AUTHORITY_IS_CREATED',
    businessEffectAuthority:'NONE',
    externalEffectLedger:{...ZERO}
  };
}
