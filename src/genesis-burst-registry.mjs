import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileGenesisIdeaBurst } from './genesis-idea-burst.mjs';

export const GENESIS_BURST_REGISTRY_VERSION='uberbond.genesis-burst-registry.v1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});
const text=(v,m=1000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};

export function compileGenesisBurstRegistry({bursts=[]}={}){
  if(!Array.isArray(bursts)||bursts.length<1||bursts.length>256){
    return envelope({ok:false,status:'GENESIS_BURST_REGISTRY_BLOCKED',reasonCodes:['bounded-burst-registry-required']});
  }
  const burstIds=new Set(),artifactRefs=new Set(),candidateIds=new Set();
  const compiled=[];
  for(const row of bursts){
    const burstId=text(row?.burstId,240),artifactRef=text(row?.artifactRef,1000),payload=row?.payload;
    const reasons=[];
    if(!burstId||!/^genesis-burst-[a-z0-9-]+$/.test(burstId)||burstIds.has(burstId)) reasons.push('unique-stable-burst-id-required');
    if(!artifactRef||artifactRefs.has(artifactRef)) reasons.push('unique-artifact-ref-required');
    if(!payload||!Array.isArray(payload.candidates)) reasons.push('burst-payload-required');
    if(reasons.length) return envelope({ok:false,status:'GENESIS_BURST_REGISTRY_BLOCKED',reasonCodes:reasons,burstId:burstId||null});
    const result=compileGenesisIdeaBurst({
      signal:payload.signal,
      affectedDomains:payload.affectedDomains,
      candidates:payload.candidates,
      maxGenerators:payload.activationPolicy?.maxGenerators||12,
      candidateBudgetPerGenerator:payload.activationPolicy?.candidateBudgetPerGenerator||50
    });
    if(!result.ok) return envelope({ok:false,status:'GENESIS_BURST_REGISTRY_BLOCKED',reasonCodes:['burst-failed-compiler-validation'],burstId,compilerResult:result});
    const declaredKeys=Array.isArray(payload.activatedGeneratorKeys)?payload.activatedGeneratorKeys:[];
    if(JSON.stringify(declaredKeys)!==JSON.stringify(result.activation.selectedGeneratorKeys)){
      return envelope({ok:false,status:'GENESIS_BURST_REGISTRY_BLOCKED',reasonCodes:['declared-generator-lineage-mismatch'],burstId});
    }
    if(Number(payload.materializedCandidateCount)!==result.materializedCandidateCount){
      return envelope({ok:false,status:'GENESIS_BURST_REGISTRY_BLOCKED',reasonCodes:['declared-candidate-count-mismatch'],burstId});
    }
    for(const candidate of result.candidates){
      if(candidateIds.has(candidate.id)) return envelope({ok:false,status:'GENESIS_BURST_REGISTRY_BLOCKED',reasonCodes:['candidate-id-collision-across-bursts'],burstId,candidateId:candidate.id});
      candidateIds.add(candidate.id);
    }
    burstIds.add(burstId);artifactRefs.add(artifactRef);
    compiled.push({
      burstId,artifactRef,
      signalId:result.signal.id,
      selectedGeneratorCount:result.activation.selectedGeneratorCount,
      selectedFirstGenerationCapacity:result.activation.selectedFirstGenerationCapacity,
      materializedCandidateCount:result.materializedCandidateCount,
      burstDigest:result.burstDigest,
      topCandidates:result.candidates.slice(0,5).map(c=>({id:c.id,title:c.title,utility:c.utility}))
    });
  }
  return envelope({
    ok:true,status:'GENESIS_BURST_REGISTRY_READY',version:GENESIS_BURST_REGISTRY_VERSION,
    burstCount:compiled.length,
    totalMaterializedCandidates:candidateIds.size,
    totalSelectedFirstGenerationCapacity:compiled.reduce((s,b)=>s+b.selectedFirstGenerationCapacity,0),
    bursts:compiled,
    law:'BURSTS_ARE_APPEND_ONLY_EVIDENCE_BOUND_GENERATION_RECEIPTS__CANDIDATE_IDENTITIES_MUST_REMAIN_GLOBALLY_UNIQUE.',
    truthBoundary:'A_GROWING_BURST_REGISTRY_PROVES_GENERATION_LINEAGE_AND_ACCUMULATION__NOT_DISCOVERY_FEASIBILITY_IMPLEMENTATION_OR_CONTINUOUS_BACKGROUND_RUNTIME.'
  });
}
