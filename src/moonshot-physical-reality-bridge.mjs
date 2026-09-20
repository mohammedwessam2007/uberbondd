import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { routeMissingProofs } from './external-proof-router.mjs';
import { compileProofDag, assertObservedProof } from './content-addressed-proof-dag.mjs';

export const MOONSHOT_PHYSICAL_REALITY_BRIDGE_VERSION='uberbond.moonshot-physical-reality-bridge.v1';

export const REALITY_ADAPTER_CLASSES=Object.freeze([
  'SOFTWARE_RUNTIME',
  'SENSOR_OR_INSTRUMENT',
  'PHYSICAL_LAB',
  'BIOLOGICAL_LAB',
  'HUMAN_STUDY',
  'INSTITUTIONAL_PILOT',
  'FIELD_OBSERVATION',
  'LONGITUDINAL_OBSERVATION',
  'MIXED_REALITY_PROGRAM'
]);

export const REALITY_RISK_CLASSES=Object.freeze(['LOW','MODERATE','HIGH','UNKNOWN']);

const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});
const fail=(status,reasons,extra={})=>envelope({
  ok:false,status,reasonCodes:[...new Set(reasons.filter(Boolean))],...extra
});
const text=(v,max=2000)=>{
  const s=String(v??'').trim();
  return s&&s.length<=max?s:null;
};
const uniq=a=>[...new Set((Array.isArray(a)?a:[]).map(String).filter(Boolean))];

function adapterForSurface(surface){
  const s=String(surface||'').toUpperCase();
  if(s==='PHYSICAL') return 'PHYSICAL_LAB';
  if(s==='BIOLOGICAL') return 'BIOLOGICAL_LAB';
  if(s==='HUMAN') return 'HUMAN_STUDY';
  if(s==='INSTITUTIONAL') return 'INSTITUTIONAL_PILOT';
  if(s==='CIVILIZATION') return 'LONGITUDINAL_OBSERVATION';
  if(s==='SOFTWARE'||s==='FORMAL') return 'SOFTWARE_RUNTIME';
  return 'MIXED_REALITY_PROGRAM';
}

function proofClassesFor({surface,interventionType}){
  const out=['REAL_WORLD_OBSERVATION'];
  const s=String(surface||'').toUpperCase();
  const intervention=String(interventionType||'OBSERVATION_ONLY').toUpperCase();
  if(['PHYSICAL','BIOLOGICAL'].includes(s)||intervention!=='OBSERVATION_ONLY') out.push('RUNTIME_PHYSICAL');
  if(s==='CIVILIZATION') out.push('ELAPSED_TIME');
  return [...new Set(out)];
}

export function compileRealityBridgeShellFromPacket(packet={}){
  const id=text(packet.stableId,200);
  const title=text(packet.literalTitle,500);
  const surface=String(packet.realizationSurface||'MIXED').toUpperCase();
  if(!id||!title) return fail('REALITY_BRIDGE_SHELL_INVALID',['stable-id-and-title-required']);

  const adapterClass=adapterForSurface(surface);
  const requiresHumanConsent=['HUMAN','INSTITUTIONAL','CIVILIZATION'].includes(surface);
  const requiresSpecialistProtocol=['BIOLOGICAL','PHYSICAL'].includes(surface);
  const proofClasses=proofClassesFor({surface,interventionType:'UNSPECIFIED'});

  const proofRouting=routeMissingProofs({requirements:proofClasses.map((proofClass,index)=>({
    id:`${id}-external-proof-${index+1}`,
    proofClass,
    description:`${title}: external evidence required for ${proofClass}`,
    satisfied:false,
    evidenceRefs:[]
  }))});

  return envelope({
    ok:true,
    status:'EXTERNAL_REALITY_BRIDGE_SHELL_READY',
    stableId:id,
    literalTitle:title,
    realizationSurface:surface,
    adapterClass,
    measurementSpecificationState:'DOMAIN_SPECIFIC_MEASUREMENT_REQUIRED',
    interventionSpecificationState:'DOMAIN_SPECIFIC_INTERVENTION_OR_OBSERVATION_REQUIRED',
    authorityState:'EXPLICIT_AUTHORITY_REQUIRED_BEFORE_EFFECTFUL_EXECUTION',
    consentState:requiresHumanConsent?'RECORDED_CONSENT_REQUIRED':'NOT_INFERRED',
    specialistProtocolState:requiresSpecialistProtocol?'DOMAIN_SPECIALIST_PROTOCOL_REQUIRED':'STANDARD_BOUNDED_PROTOCOL_POSSIBLE',
    riskState:'UNCLASSIFIED_UNTIL_PROTOCOL_EXISTS',
    proofRouting,
    executionAuthority:'NONE',
    nextAction:'FORMALIZE_ONE_DISCRIMINATING_MEASUREMENT_AND_SMALLEST_REVERSIBLE_AUTHORIZED_REALITY_PROBE',
    truthBoundary:'A_REALITY_BRIDGE_SHELL_IS_AN_EXECUTION_INTERFACE_REQUIREMENT__IT_IS_NOT_AN_EXPERIMENT_RESULT'
  });
}

export function compileRealityProbeContract({
  stableId,
  title,
  realizationSurface='MIXED',
  hypothesis,
  rivalHypothesis,
  predictedObservation,
  rivalPredictedObservation,
  measurement,
  interventionType='OBSERVATION_ONLY',
  interventionDescription='Observe without intervening.',
  reversibility='REVERSIBLE',
  riskClass='UNKNOWN',
  adapterClass=null,
  estimatedCostCents=0,
  estimatedTimeMinutes=0,
  authorityRef=null,
  consentRefs=[],
  specialistProtocolRef=null,
  rollbackPlan=null
}={}){
  const id=text(stableId,200),name=text(title,500);
  const h=text(hypothesis,4000),rh=text(rivalHypothesis,4000);
  const p=text(predictedObservation,2000),rp=text(rivalPredictedObservation,2000);
  const measure=text(measurement,3000),intervention=text(interventionDescription,3000);
  const surface=String(realizationSurface||'MIXED').toUpperCase();
  const type=String(interventionType||'OBSERVATION_ONLY').toUpperCase();
  const risk=String(riskClass||'UNKNOWN').toUpperCase();
  const adapter=adapterClass||adapterForSurface(surface);
  const cost=Number(estimatedCostCents),time=Number(estimatedTimeMinutes);

  const reasons=[];
  if(!id||!name) reasons.push('stable-id-and-title-required');
  if(!h||!rh||h===rh) reasons.push('two-distinct-hypotheses-required');
  if(!p||!rp||p===rp) reasons.push('discriminating-predictions-required');
  if(!measure) reasons.push('measurement-definition-required');
  if(!intervention) reasons.push('intervention-or-observation-description-required');
  if(!REALITY_ADAPTER_CLASSES.includes(adapter)) reasons.push('known-adapter-class-required');
  if(!REALITY_RISK_CLASSES.includes(risk)) reasons.push('known-risk-class-required');
  if(!Number.isSafeInteger(cost)||cost<0) reasons.push('nonnegative-integer-cost-required');
  if(!Number.isSafeInteger(time)||time<0) reasons.push('nonnegative-integer-time-required');
  if(reversibility!=='REVERSIBLE') reasons.push('only-reversible-probe-contracts-admitted');
  if(reasons.length) return fail('REALITY_PROBE_CONTRACT_INVALID',reasons);

  const effectful=type!=='OBSERVATION_ONLY'||cost>0;
  const humanSurface=['HUMAN','INSTITUTIONAL','CIVILIZATION'].includes(surface);
  const bioPhysical=['BIOLOGICAL','PHYSICAL'].includes(surface);
  const authorityPresent=Boolean(text(authorityRef,1000));
  const consents=uniq(consentRefs);
  const specialistPresent=Boolean(text(specialistProtocolRef,1000));
  const rollback=text(rollbackPlan,3000);

  const gateReasons=[];
  if(effectful&&!authorityPresent) gateReasons.push('explicit-authority-ref-required');
  if(humanSurface&&effectful&&!consents.length) gateReasons.push('recorded-consent-required');
  if(bioPhysical&&!specialistPresent) gateReasons.push('domain-specialist-protocol-required');
  if(effectful&&!rollback) gateReasons.push('rollback-plan-required');
  if(risk==='HIGH') gateReasons.push('high-risk-probe-not-admitted-by-generic-bridge');
  if(risk==='UNKNOWN') gateReasons.push('risk-classification-required');

  const proofClasses=proofClassesFor({surface,interventionType:type});
  const proofRouting=routeMissingProofs({requirements:proofClasses.map((proofClass,index)=>({
    id:`${id}-proof-${index+1}`,
    proofClass,
    description:`${name}: obtain ${proofClass} evidence from the declared external executor`,
    satisfied:false,
    evidenceRefs:[]
  }))});

  return envelope({
    ok:true,
    status:gateReasons.length?'REALITY_PROBE_CONTRACT_GATED':'REALITY_PROBE_CONTRACT_READY_FOR_SEPARATE_EXTERNAL_EXECUTOR',
    contract:{
      stableId:id,title:name,realizationSurface:surface,adapterClass:adapter,
      hypothesis:h,rivalHypothesis:rh,
      predictedObservation:p,rivalPredictedObservation:rp,
      measurement:measure,
      interventionType:type,interventionDescription:intervention,
      reversibility,riskClass:risk,
      estimatedCostCents:cost,estimatedTimeMinutes:time,
      authorityRef:text(authorityRef,1000),
      consentRefs:consents,
      specialistProtocolRef:text(specialistProtocolRef,1000),
      rollbackPlan:rollback,
      proofRequirements:proofRouting.requirements||[]
    },
    gateReasons,
    proofRouting,
    executionAuthority:'NONE',
    law:'THE_BRIDGE_COMPILES_WHAT_REALITY_MUST_DO_AND_PROVE__A_SEPARATE_AUTHORIZED_EXECUTOR_PERFORMS_THE_REAL_WORLD_ACTION',
    truthBoundary:'READY_FOR_EXTERNAL_EXECUTOR_IS_NOT_EXECUTED_AND_NOT_EVIDENCE'
  });
}

export function ingestRealityProbeResult({
  contract,
  observationRef,
  verifierRef,
  observedAt,
  measurements={},
  resultSummary,
  syntheticAncestors=[]
}={}){
  if(!contract?.stableId||!text(observationRef,1000)||!text(verifierRef,1000)||!text(observedAt,100)||!text(resultSummary,4000)){
    return fail('REALITY_PROBE_RESULT_INVALID',['contract-observation-verifier-time-and-summary-required']);
  }
  const proofRows=(Array.isArray(syntheticAncestors)?syntheticAncestors:[]).map((ref,index)=>({
    id:`synthetic-${index+1}`,kind:'simulation',evidenceRef:String(ref),parents:[],
    synthetic:true,sourceClass:'SYNTHETIC',observed:false,verifierRef:'simulation'
  }));
  proofRows.push({
    id:'external-observation',kind:'real-world-observation',
    evidenceRef:String(observationRef),
    parents:proofRows.map(r=>r.id),
    synthetic:false,sourceClass:'OBSERVED',observed:true,verifierRef:String(verifierRef)
  });
  const dag=compileProofDag({proofs:proofRows});
  if(!dag.ok) return fail('REALITY_PROBE_RESULT_INVALID',dag.reasonCodes||['proof-dag-refused']);
  const observed=assertObservedProof({dag,proofId:'external-observation'});
  if(!observed.ok){
    return envelope({
      ok:false,status:'REALITY_PROBE_RESULT_CONTAMINATED',
      reasonCodes:observed.reasonCodes||[],
      proofDag:dag,
      promotionAuthority:'NONE',
      truthBoundary:'SYNTHETIC_ANCESTRY_CANNOT_BE_LAUNDERED_INTO_OBSERVED_REALITY'
    });
  }
  return envelope({
    ok:true,status:'REALITY_PROBE_OBSERVATION_INGESTED',
    stableId:contract.stableId,
    observationRef:String(observationRef),
    verifierRef:String(verifierRef),
    observedAt:String(observedAt),
    measurements:structuredClone(measurements||{}),
    resultSummary:String(resultSummary),
    proofDagDigest:dag.dagDigest,
    observedProofAddress:observed.proofAddress,
    promotionAuthority:'NONE',
    nextAction:'ADVERSARIAL_REVIEW_REPLICATION_AND_PARENT_SCOPED_EVIDENCE_UPDATE',
    truthBoundary:'ONE_CLEAN_OBSERVATION_IS_EVIDENCE_FOR_THE_SCOPED_CONTRACT__NOT_AUTOMATIC_PARENT_REALIZATION'
  });
}
