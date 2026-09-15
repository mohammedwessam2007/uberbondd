import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OMEGA_PRIVATE_EVIDENCE_GATE_VERSION = 'uberbond.omega-private-evidence-gate.v2';

const REQUIRED = Object.freeze([
  'semanticCompilation','sealedHiddenHoldouts','crossFamilyTransfer','crossDomainTransfer','verifierIndependence','leakageResistance','fullCostAccounting','robustness','replication','realitySettlement','compoundingReduction','metaGeneralization'
]);
const E10_ONLY = Object.freeze(['frontierBreadth','calibratedFailure','evaluatorGapClosed']);
const CRITICAL = new Set(['sealedHiddenHoldouts','crossDomainTransfer','verifierIndependence','leakageResistance','replication','realitySettlement']);
const envelope = extra => ({ businessEffectAuthority:'NONE', externalEffectAuthority:'NONE', externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS), ...extra });
function normalizedDimension(raw={}){ return {passed:raw.passed===true,evidenceRefs:Array.isArray(raw.evidenceRefs)?[...new Set(raw.evidenceRefs.map(String).map(v=>v.trim()).filter(Boolean))]:[],independent:raw.independent===true,replicated:raw.replicated===true}; }
const green=d=>d?.passed===true&&d.evidenceRefs.length>0;

export function evaluateOmegaPrivateEvidence(input={}){
  const dimensions={},e10Requirements={},reasons=[];
  for(const name of REQUIRED){const d=normalizedDimension(input?.dimensions?.[name]);dimensions[name]=d;if(!d.passed)reasons.push(`${name}:not-passed`);if(!d.evidenceRefs.length)reasons.push(`${name}:missing-evidence`);}
  for(const name of E10_ONLY){const d=normalizedDimension(input?.e10Requirements?.[name]);e10Requirements[name]=d;if(!d.passed)reasons.push(`e10:${name}:not-passed`);if(!d.evidenceRefs.length)reasons.push(`e10:${name}:missing-evidence`);if(!d.independent)reasons.push(`e10:${name}:independence-required`);}
  for(const name of CRITICAL){if(!dimensions[name].independent)reasons.push(`${name}:independence-required`);}
  if(!dimensions.replication.replicated)reasons.push('replication:replicated-run-required');

  const score=REQUIRED.filter(name=>green(dimensions[name])).length;
  const criticalGreen=[...CRITICAL].every(name=>green(dimensions[name])&&dimensions[name].independent);
  const e10OnlyGreen=E10_ONLY.every(name=>green(e10Requirements[name])&&e10Requirements[name].independent);

  const e3=green(dimensions.sealedHiddenHoldouts)&&green(dimensions.crossFamilyTransfer);
  const e4=e3&&green(dimensions.robustness);
  const e5=e4&&green(dimensions.semanticCompilation);
  const e6=e5&&green(dimensions.crossDomainTransfer)&&green(dimensions.verifierIndependence)&&dimensions.crossDomainTransfer.independent&&dimensions.verifierIndependence.independent;
  const e7=e6&&green(dimensions.leakageResistance)&&dimensions.leakageResistance.independent&&green(dimensions.fullCostAccounting);
  const e8=e7&&green(dimensions.compoundingReduction);
  const e9=e8&&green(dimensions.replication)&&dimensions.replication.independent&&dimensions.replication.replicated&&green(dimensions.realitySettlement)&&dimensions.realitySettlement.independent;
  const allTwelve=REQUIRED.every(name=>green(dimensions[name]));
  const e10=e9&&allTwelve&&criticalGreen&&green(dimensions.metaGeneralization)&&e10OnlyGreen;

  let grade='E0';
  if(score>=1)grade='E1'; if(score>=3)grade='E2'; if(e3)grade='E3'; if(e4)grade='E4'; if(e5)grade='E5'; if(e6)grade='E6'; if(e7)grade='E7'; if(e8)grade='E8'; if(e9)grade='E9'; if(e10)grade='E10';

  return envelope({ok:true,status:e10?'OMEGA_PRIVATE_EVIDENCE_E10':'OMEGA_PRIVATE_EVIDENCE_NOT_E10',version:OMEGA_PRIVATE_EVIDENCE_GATE_VERSION,grade,score,totalDimensions:REQUIRED.length,criticalGreen,e10OnlyGreen,e10,dimensions,e10Requirements,reasonCodes:[...new Set(reasons)],truthBoundary:'E10 requires all twelve program dimensions plus independently evidenced frontier breadth, calibrated failure, and evaluator-gap closure. A bounded CSP program cannot earn E10 merely by marking internal dimensions green. E10 remains a private evidence grade, not proof of ASI, unlimited compute, or a singularity.'});
}
