import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const HEALTH_RECOMMENDATION_BOUNDARY_VERSION='uberbond.health-recommendation-boundary.v1';
const CLASSES=new Set(['GENERAL_INFORMATION','WELLNESS_PLANNING','PERSONAL_MEDICAL_DECISION','DIAGNOSIS_OR_TREATMENT']);
const text=(v,max=1200)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const refs=v=>Array.isArray(v)&&v.length<=64?v.map(x=>text(x,1600)).filter(Boolean):null;
const envelope=extra=>({businessEffectAuthority:'NONE',medicalActionAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra});

export function compileHealthRecommendationBoundary(input={}){
  const recommendationClass=text(input.recommendationClass,100)?.toUpperCase();
  const evidenceRefs=refs(input.evidenceRefs||[]);
  const reasonCodes=[];
  if(!CLASSES.has(recommendationClass))reasonCodes.push('recognized-health-recommendation-class-required');
  if(!evidenceRefs||evidenceRefs.length===0)reasonCodes.push('health-evidence-required');
  if(input.uncertaintyStated!==true)reasonCodes.push('health-uncertainty-must-be-stated');
  if(input.cautionStated!==true)reasonCodes.push('health-caution-must-be-stated');
  if(reasonCodes.length)return envelope({ok:false,status:'HEALTH_RECOMMENDATION_BLOCKED',reasonCodes,evidenceRefs:evidenceRefs||[]});
  const highStakes=['PERSONAL_MEDICAL_DECISION','DIAGNOSIS_OR_TREATMENT'].includes(recommendationClass);
  if(highStakes)return envelope({ok:true,status:'PROFESSIONAL_REVIEW_REQUIRED',recommendationClass,evidenceRefs,professionalReviewRequired:true,truthBoundary:'UBERBOND MAY ORGANIZE EVIDENCE QUESTIONS OPTIONS AND UNCERTAINTY; THIS SOURCE CONTRACT DOES NOT DIAGNOSE PRESCRIBE OR AUTHORIZE A PERSONAL MEDICAL ACTION'});
  return envelope({ok:true,status:'HEALTH_INFORMATION_BOUNDARY_READY',recommendationClass,evidenceRefs,professionalReviewRequired:false,truthBoundary:'GENERAL INFORMATION OR WELLNESS PLANNING REMAINS EVIDENCE-BOUND AND UNCERTAINTY-AWARE; IT DOES NOT CREATE PERSONAL MEDICAL AUTHORITY'});
}
