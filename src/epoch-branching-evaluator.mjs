import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { compileMoonshotTechnologyTree } from './moonshot-technology-tree-compiler.mjs';

export const EPOCH_BRANCHING_EVALUATOR_VERSION='uberbond.epoch-branching-evaluator.v1';

const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});
const fail=(status,reasons,extra={})=>envelope({
  ok:false,status,reasonCodes:[...new Set(reasons.filter(Boolean))],...extra
});
const text=(v,max=300)=>{
  const s=String(v??'').trim();
  return s&&s.length<=max?s:null;
};
const uniq=a=>[...new Set((Array.isArray(a)?a:[]).map(String).filter(Boolean))];

function countStates(tree){
  return {
    internalReady:tree.internalFrontier?.length||0,
    externalPrecursorsReady:tree.externalFrontier?.length||0,
    blockedMissing:tree.stateCounts?.BLOCKED_BY_MISSING_SHARED_ANCESTOR||0,
    blockedUnverified:tree.stateCounts?.BLOCKED_BY_UNVERIFIED_EXISTING_ANCESTOR||0
  };
}

function readyStatus(status){
  return /EXECUTED|REPRODUCIBLE|EVIDENCE_PRESENT|VERIFIED|READY_INTERNAL/.test(String(status||'').toUpperCase());
}

function cloneSpine(spine){
  return (Array.isArray(spine)?spine:[]).map(row=>({
    ...row,
    evidenceRefs:Array.isArray(row.evidenceRefs)?[...row.evidenceRefs]:[]
  }));
}

function changedRows(before,after){
  const beforeMap=new Map((before.nodes||[]).map(n=>[n.stableId,n]));
  const rows=[];
  for(const node of after.nodes||[]){
    const old=beforeMap.get(node.stableId);
    if(!old) continue;
    if(old.treeState!==node.treeState){
      rows.push({
        stableId:node.stableId,
        ordinal:node.ordinal,
        literalTitle:node.literalTitle,
        from:old.treeState,
        to:node.treeState,
        realizationSurface:node.realizationSurface,
        ideaKind:node.ideaKind,
        removedInternalBlockers:(old.internalBlockers||[])
          .filter(x=>!(node.internalBlockers||[]).some(y=>y.ancestorId===x.ancestorId))
          .map(x=>x.ancestorId)
      });
    }
  }
  return rows;
}

export function evaluateEpochBranchingCandidate({
  candidateId,
  moonshots=[],
  ancestorSpine=[],
  overlayEntries={},
  ancestorStatusChanges={},
  descendantEvidenceChanges={},
  evidenceClass='HYPOTHESIS'
}={}){
  const id=text(candidateId,200);
  if(!id||!Array.isArray(moonshots)||moonshots.length!==890||!Array.isArray(ancestorSpine)){
    return fail('EPOCH_BRANCHING_CANDIDATE_INVALID',['candidate-id-exact-890-moonshots-and-ancestor-spine-required']);
  }
  const validEvidence=['HYPOTHESIS','SIMULATED','SOFTWARE_DEMONSTRATED','REPRODUCED','EXPERIMENTALLY_SUPPORTED'];
  const evidence=String(evidenceClass||'').toUpperCase();
  if(!validEvidence.includes(evidence)){
    return fail('EPOCH_BRANCHING_CANDIDATE_INVALID',['known-evidence-class-required']);
  }

  const before=compileMoonshotTechnologyTree({moonshots,ancestorSpine,overlayEntries});
  if(!before.ok) return before;

  const hypotheticalSpine=cloneSpine(ancestorSpine);
  const known=new Set(hypotheticalSpine.map(x=>x.id));
  const changedAncestors=[];
  for(const [ancestorId,newStatusRaw] of Object.entries(ancestorStatusChanges||{})){
    const newStatus=text(newStatusRaw,240);
    if(!known.has(ancestorId)||!newStatus){
      return fail('EPOCH_BRANCHING_CANDIDATE_INVALID',[`unknown-or-invalid-ancestor-change:${ancestorId}`]);
    }
    const row=hypotheticalSpine.find(x=>x.id===ancestorId);
    const beforeStatus=row.status;
    row.status=newStatus;
    changedAncestors.push({ancestorId,beforeStatus,afterStatus:newStatus,afterLooksReady:readyStatus(newStatus)});
  }

  const hypotheticalOverlay=structuredClone(overlayEntries||{});
  for(const [stableId,descendants] of Object.entries(descendantEvidenceChanges||{})){
    if(!Array.isArray(descendants)) return fail('EPOCH_BRANCHING_CANDIDATE_INVALID',[`descendant-change-array-required:${stableId}`]);
    const existing=hypotheticalOverlay[stableId]||{};
    existing.verifiedDescendants=[
      ...(Array.isArray(existing.verifiedDescendants)?existing.verifiedDescendants:[]),
      ...descendants.map(d=>structuredClone(d))
    ];
    hypotheticalOverlay[stableId]=existing;
  }

  const after=compileMoonshotTechnologyTree({
    moonshots,ancestorSpine:hypotheticalSpine,overlayEntries:hypotheticalOverlay
  });
  if(!after.ok) return after;

  const b=countStates(before),a=countStates(after);
  const changed=changedRows(before,after);
  const openedSurfaces=uniq(changed.map(row=>row.realizationSurface)).sort();
  const openedKinds=uniq(changed.map(row=>row.ideaKind)).sort();

  const delta={
    internalReady:a.internalReady-b.internalReady,
    externalPrecursorsReady:a.externalPrecursorsReady-b.externalPrecursorsReady,
    blockedMissing:b.blockedMissing-a.blockedMissing,
    blockedUnverified:b.blockedUnverified-a.blockedUnverified,
    changedMoonshots:changed.length,
    openedSurfaceCount:openedSurfaces.length,
    openedIdeaKindCount:openedKinds.length
  };

  const epochBranchingScore=Number((
    delta.internalReady*8 +
    delta.externalPrecursorsReady*4 +
    delta.blockedMissing*2 +
    delta.blockedUnverified +
    delta.openedSurfaceCount*25 +
    delta.openedIdeaKindCount*10
  ).toFixed(3));

  return envelope({
    ok:true,status:'EPOCH_BRANCHING_COUNTERFACTUAL_EVALUATED',
    candidateId:id,evidenceClass:evidence,
    before:b,after:a,delta,
    openedSurfaces,openedIdeaKinds:openedKinds,
    changedAncestors,
    changedMoonshots:changed,
    epochBranchingScore,
    promotionAuthority:'NONE',
    executionAuthority:'NONE',
    law:'BRANCHING_SCORE_MEASURES_COUNTERFACTUAL_REACHABILITY_CHANGE__IT_DOES_NOT_CREATE_EVIDENCE_OR_PROMOTE_THE_CANDIDATE',
    truthBoundary:'COUNTERFACTUAL_REACHABILITY_DEPENDS_ON_THE_DECLARED_890_DEPENDENCY_MODEL_AND_MUST_BE_RECOMPUTED_WHEN_THE_MODEL_CHANGES'
  });
}

export function compareEpochBranchingCandidates({candidates=[]}={}){
  if(!Array.isArray(candidates)||candidates.length===0||candidates.length>256){
    return fail('EPOCH_BRANCHING_COMPARISON_INVALID',['one-to-256-evaluated-candidates-required']);
  }
  const accepted=candidates.filter(c=>c?.ok===true&&c.status==='EPOCH_BRANCHING_COUNTERFACTUAL_EVALUATED');
  if(!accepted.length) return fail('EPOCH_BRANCHING_COMPARISON_INVALID',['at-least-one-valid-evaluation-required']);
  const ranked=[...accepted].sort((a,b)=>
    b.epochBranchingScore-a.epochBranchingScore||
    b.delta.internalReady-a.delta.internalReady||
    b.delta.externalPrecursorsReady-a.delta.externalPrecursorsReady||
    a.candidateId.localeCompare(b.candidateId)
  );
  const pareto=ranked.filter(candidate=>!ranked.some(other=>
    other.candidateId!==candidate.candidateId &&
    other.delta.internalReady>=candidate.delta.internalReady &&
    other.delta.externalPrecursorsReady>=candidate.delta.externalPrecursorsReady &&
    other.delta.openedSurfaceCount>=candidate.delta.openedSurfaceCount &&
    (
      other.delta.internalReady>candidate.delta.internalReady ||
      other.delta.externalPrecursorsReady>candidate.delta.externalPrecursorsReady ||
      other.delta.openedSurfaceCount>candidate.delta.openedSurfaceCount
    )
  ));
  return envelope({
    ok:true,status:'EPOCH_BRANCHING_CANDIDATES_COMPARED',
    ranked:ranked.map((c,index)=>({
      rank:index+1,candidateId:c.candidateId,evidenceClass:c.evidenceClass,
      epochBranchingScore:c.epochBranchingScore,delta:c.delta
    })),
    paretoCandidateIds:pareto.map(c=>c.candidateId),
    selectionAuthority:'NONE',
    law:'RANKING_IS_A_RESEARCH_RESOURCE_ALLOCATION_SIGNAL__NOT_PROOF_OF_IMPORTANCE_OR_PERMISSION_TO_ACT'
  });
}

export function evaluateAncestorAblation({
  ancestorId,
  moonshots=[],
  ancestorSpine=[],
  overlayEntries={}
}={}){
  const id=text(ancestorId,200);
  const row=(ancestorSpine||[]).find(x=>x.id===id);
  if(!id||!row) return fail('EPOCH_ABLATION_INVALID',['known-ancestor-required']);
  const baseline=compileMoonshotTechnologyTree({moonshots,ancestorSpine,overlayEntries});
  if(!baseline.ok) return baseline;
  const demoted=cloneSpine(ancestorSpine);
  demoted.find(x=>x.id===id).status='RESEARCH_PROGRAM';
  const without=compileMoonshotTechnologyTree({moonshots,ancestorSpine:demoted,overlayEntries});
  if(!without.ok) return without;
  const b=countStates(without),a=countStates(baseline);
  return envelope({
    ok:true,status:'ANCESTOR_BRANCHING_ABLATION_EVALUATED',
    ancestorId:id,
    observedCurrentStatus:row.status,
    currentLooksReady:readyStatus(row.status),
    deltaWhenPresent:{
      internalReady:a.internalReady-b.internalReady,
      externalPrecursorsReady:a.externalPrecursorsReady-b.externalPrecursorsReady,
      blockedMissing:b.blockedMissing-a.blockedMissing,
      blockedUnverified:b.blockedUnverified-a.blockedUnverified
    },
    promotionAuthority:'NONE',
    truthBoundary:'ABLATION_MEASURES_DEPENDENCY_GRAPH_SENSITIVITY__NOT_HISTORICAL_CAUSAL_PROOF'
  });
}
