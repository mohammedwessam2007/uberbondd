import {
  analyzeTimelineTopology,
  buildTimelineCannibalismPacket,
  evaluateWormholeCandidate,
  WORMHOLE_MECHANISM_CLASSES
} from './timeline-topology-engine.mjs';

export const TIMELINE_TOPOLOGY_CHALLENGE_VERSION = 'uberbond.timeline-topology-challenge.v1';
const ZERO = Object.freeze({customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});
const text=(value,max=2000)=>{const out=String(value??'').trim();return out&&out.length<=max?out:null;};
const uniq=value=>[...new Set((Array.isArray(value)?value:[]).map(v=>String(v).trim()).filter(Boolean))];
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:{...ZERO},...extra});
const fail=(reasonCodes,extra={})=>envelope({ok:false,status:'TIMELINE_TOPOLOGY_CHALLENGE_REFUSED',version:TIMELINE_TOPOLOGY_CHALLENGE_VERSION,reasonCodes:uniq(reasonCodes),...extra});

export function compileTimelineTopologyChallenge(input={}){
  const baseline=analyzeTimelineTopology(input?.baselineGraph||{});
  if(!baseline.ok)return fail(['valid-baseline-timeline-graph-required',...(baseline.reasonCodes||[])]);
  const packet=buildTimelineCannibalismPacket({analysis:baseline,maxTargets:Math.min(12,Math.max(1,baseline.attackTargets.length||1))});
  if(!packet.ok)return fail(['timeline-cannibalism-packet-required']);
  const decision=text(input?.decision,40)?.toUpperCase();
  if(decision==='WORMHOLE'){
    const candidate=evaluateWormholeCandidate({baseline,candidate:{
      name:input?.name,
      mechanismClass:input?.mechanismClass,
      evidenceClass:'HYPOTHESIS',
      evidenceRefs:uniq(input?.evidenceRefs),
      independentlyVerified:false,
      baseGraphDigest:baseline.graphDigest,
      baselineGraph:input.baselineGraph,
      projectedGraph:input?.projectedGraph,
      transformations:input?.transformations
    }});
    if(!candidate.ok)return fail(['wormhole-candidate-invalid',...(candidate.reasonCodes||[])]);
    return envelope({
      ok:true,status:'WORMHOLE_TOPOLOGY_CHANGE_VALIDATED_AS_HYPOTHESIS',version:TIMELINE_TOPOLOGY_CHALLENGE_VERSION,
      trustedEvidence:{
        decision:'WORMHOLE',graphDigest:baseline.graphDigest,criticalPathBeforeMs:baseline.criticalPathDurationMs,
        projectedCriticalPathAfterMs:candidate.criticalPathAfterMs,criticalPathSavingsMs:candidate.criticalPathSavingsMs,
        compressionRatio:candidate.compressionRatio,mechanismClass:candidate.mechanismClass,
        changedNodeIds:candidate.changedNodeIds,declaredEvidenceBoundFloorMs:baseline.declaredEvidenceBoundFloorMs,
        evidenceClass:'HYPOTHESIS',terminalContractPreserved:true
      },
      searchOrders:packet.searchOrders
    });
  }
  if(decision==='NO_VALID_SHORTCUT'){
    const attempted=uniq(input?.attemptedMechanismClasses).filter(v=>WORMHOLE_MECHANISM_CLASSES.includes(v));
    const reason=text(input?.reason,1200);
    if(attempted.length<4||!reason)return fail(['at-least-four-distinct-wormhole-mechanisms-and-reason-required']);
    return envelope({
      ok:true,status:'TIMELINE_TOPOLOGY_CHALLENGED_NO_VALID_SHORTCUT',version:TIMELINE_TOPOLOGY_CHALLENGE_VERSION,
      trustedEvidence:{
        decision:'NO_VALID_SHORTCUT',graphDigest:baseline.graphDigest,criticalPathBeforeMs:baseline.criticalPathDurationMs,
        projectedCriticalPathAfterMs:null,criticalPathSavingsMs:0,compressionRatio:1,mechanismClass:null,
        attemptedMechanismClasses:attempted.slice(0,12),declaredEvidenceBoundFloorMs:baseline.declaredEvidenceBoundFloorMs,
        evidenceClass:'HYPOTHESIS',terminalContractPreserved:true,reason
      },
      searchOrders:packet.searchOrders
    });
  }
  return fail(['recognized-wormhole-or-no-valid-shortcut-decision-required']);
}
