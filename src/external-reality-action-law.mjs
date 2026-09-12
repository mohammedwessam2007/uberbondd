import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const EXTERNAL_REALITY_ACTION_LAW_VERSION='uberbond.external-reality-action-law.v1';
const text=(v,max=1000)=>{const s=String(v??'').trim();return s&&s.length<=max?s:null;};
const list=(v,max=64)=>Array.isArray(v)&&v.length<=max?v.map(x=>text(x,1200)).filter(Boolean):null;
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),...extra});

export function evaluateExternalRealityActionBoundary(input={}){
  const actionClass=text(input.actionClass,120)?.toUpperCase();
  const evidenceRefs=list(input.evidenceRefs||[]);
  const checks={lawful:input.lawful===true,consentSatisfied:input.consentSatisfied===true,rightsRespected:input.rightsRespected===true,permissionsSatisfied:input.permissionsSatisfied===true,platformBoundariesSatisfied:input.platformBoundariesSatisfied===true,physicallyFeasible:input.physicallyFeasible===true};
  const reasonCodes=[];
  if(!actionClass)reasonCodes.push('external-action-class-required');
  if(!evidenceRefs||evidenceRefs.length===0)reasonCodes.push('external-reality-evidence-required');
  for(const [key,value] of Object.entries(checks))if(!value)reasonCodes.push(`external-reality-${key}-not-established`);
  if(reasonCodes.length)return envelope({ok:false,status:'EXTERNAL_REALITY_ACTION_BLOCKED',reasonCodes,checks,evidenceRefs:evidenceRefs||[]});
  return envelope({ok:true,status:'EXTERNAL_REALITY_BOUNDARY_SATISFIED_FOR_PLANNING_ONLY',actionClass,checks,evidenceRefs,truthBoundary:'EVIDENCE THAT REALITY CONSTRAINTS WERE CHECKED DOES NOT CREATE PERMISSION TO ACT; CONSEQUENCE AUTHORITY MUST BE ESTABLISHED SEPARATELY AT THE EFFECT BOUNDARY'});
}
