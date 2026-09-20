import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileGenesisMechanisms } from './genesis-mechanism-compiler.mjs';

export const MOONSHOT_MECHANISM_MARKET_VERSION='uberbond.moonshot-mechanism-market.v1';

const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

export function compileMoonshotMechanismMarket({donors=[],maxCandidates=100}={}){
  if(!Array.isArray(donors)||donors.length<2||donors.length>128){
    return envelope({ok:false,status:'MOONSHOT_MECHANISM_MARKET_INVALID',reasonCodes:['two-to-128-evidence-bound-donors-required']});
  }
  const compiled=compileGenesisMechanisms({donors,maxCandidates});
  if(!compiled.ok){
    return envelope({ok:false,status:'MOONSHOT_MECHANISM_MARKET_REFUSED',reasonCodes:compiled.reasonCodes||['genesis-mechanism-compiler-refused'],compiler:compiled});
  }
  const candidates=(compiled.candidates||[]).map(candidate=>({
    ...candidate,
    targetStatus:'RESEARCH_HYPOTHESIS_ONLY',
    experimentRequired:true,
    promotionAuthority:'NONE'
  }));
  const primitiveEvidenceCounts={};
  for(const primitive of compiled.primitives||[]){
    primitiveEvidenceCounts[primitive.evidenceClass]=(primitiveEvidenceCounts[primitive.evidenceClass]||0)+1;
  }
  return envelope({
    ok:true,
    status:'MOONSHOT_MECHANISM_MARKET_READY',
    donorCount:compiled.donorCount,
    primitiveCount:compiled.primitiveCount,
    variantCount:compiled.variantCount,
    candidateCount:candidates.length,
    primitiveEvidenceCounts,
    primitives:compiled.primitives,
    variants:compiled.variants,
    candidates,
    law:'VERIFIED_DONORS_MAY_SPAWN_HYPOTHESES__DESCENDANTS_NEVER_INHERIT_VALIDATION_AUTOMATICALLY'
  });
}

export function selectMechanismHypothesisFrontier({candidates=[],limit=20}={}){
  const n=Number(limit);
  if(!Array.isArray(candidates)||!Number.isSafeInteger(n)||n<1||n>100){
    return envelope({ok:false,status:'MECHANISM_HYPOTHESIS_FRONTIER_INVALID',reasonCodes:['candidates-and-bounded-limit-required']});
  }
  const rows=[...candidates]
    .filter(row=>row?.status==='HYPOTHESIS')
    .sort((a,b)=>{
      const ad=(a.donorIds||[]).length;
      const bd=(b.donorIds||[]).length;
      return bd-ad
        || String(a.evidenceClass).localeCompare(String(b.evidenceClass))
        || String(a.candidateId).localeCompare(String(b.candidateId));
    })
    .slice(0,n)
    .map(row=>({
      candidateId:row.candidateId,
      donorIds:row.donorIds,
      donorDomains:row.donorDomains,
      primitiveIds:row.primitiveIds,
      exploits:row.exploits,
      evidenceClass:row.evidenceClass,
      truthBoundary:row.truthBoundary,
      nextAction:'ATOMIZE_HYPOTHESIS_AND_COMPILE_MINIMUM_REALITY_PROBE'
    }));
  return envelope({
    ok:true,
    status:'MECHANISM_HYPOTHESIS_FRONTIER_READY',
    candidates:rows,
    executionAuthority:'NONE',
    law:'FRONTIER_SELECTION_IS_NOT_VALIDATION'
  });
}
