import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const MOONSHOT_TECHNOLOGY_TREE_COMPILER_VERSION='uberbond.moonshot-technology-tree-compiler.v1';

export const ANCESTOR_READINESS_CLASSES=Object.freeze([
  'READY_INTERNAL',
  'VERIFY_EXISTING',
  'BUILD_REQUIRED',
  'EXTERNAL_GATE',
  'UNKNOWN'
]);

const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});

function uniq(values){return [...new Set(values)];}

export function classifyAncestorReadiness(ancestor={}){
  const status=String(ancestor?.status||'').toUpperCase();
  let readiness='UNKNOWN';
  if(/EXTERNAL_CAPABILITY|EXTERNAL_GATE|OWNER_ONLY|AUTHORITY_DEPENDENT/.test(status)){
    readiness='EXTERNAL_GATE';
  }else if(/EXECUTED|REPRODUCIBLE|EVIDENCE_PRESENT/.test(status)){
    readiness='READY_INTERNAL';
  }else if(/RESEARCH_PROGRAM|UNREGISTERED|MISSING/.test(status)){
    readiness='BUILD_REQUIRED';
  }else if(/EXISTING_DONOR|DONORS_PRESENT|EXISTING_CANON|SOURCE_IMPLEMENTED|SOURCE_PARTIAL/.test(status)){
    readiness='VERIFY_EXISTING';
  }
  return {
    ancestorId:ancestor?.id||null,
    name:ancestor?.name||ancestor?.id||null,
    status:ancestor?.status||null,
    evidenceRefs:Array.isArray(ancestor?.evidenceRefs)?ancestor.evidenceRefs:[],
    readiness,
    nextAction:
      readiness==='READY_INTERNAL'?'NONE':
      readiness==='VERIFY_EXISTING'?'VERIFY_CALLABILITY_AND_EVIDENCE':
      readiness==='BUILD_REQUIRED'?'IMPLEMENT_AND_TEST_SHARED_ANCESTOR':
      readiness==='EXTERNAL_GATE'?'PRESERVE_EXTERNAL_GATE_AND_BUILD_INTERNAL_PRECURSORS':
      'RECONCILE_UNKNOWN_ANCESTOR_STATUS'
  };
}

function parentOverlayFor(overlayEntries,stableId){
  const row=overlayEntries?.[stableId];
  if(!row) return {
    parentRealityState:null,
    verifiedDescendants:[],
    nextFrontier:[]
  };
  return {
    parentRealityState:row.parentRealityState||null,
    verifiedDescendants:Array.isArray(row.verifiedDescendants)?row.verifiedDescendants:[],
    nextFrontier:Array.isArray(row.nextFrontier)?row.nextFrontier:[]
  };
}

export function compileMoonshotTechnologyTree({
  moonshots=[],
  ancestorSpine=[],
  overlayEntries={}
}={}){
  if(!Array.isArray(moonshots)||moonshots.length!==890||!Array.isArray(ancestorSpine)){
    return envelope({
      ok:false,status:'MOONSHOT_TECHNOLOGY_TREE_INVALID',
      reasonCodes:['exact-890-moonshots-and-ancestor-spine-required']
    });
  }
  const ancestorMap=new Map(ancestorSpine.map(a=>[a.id,classifyAncestorReadiness(a)]));
  const demand=new Map();
  const nodes=[];

  for(const moonshot of moonshots){
    const required=uniq(Array.isArray(moonshot.ancestorIds)?moonshot.ancestorIds:[]);
    const ancestorStates=required.map(id=>ancestorMap.get(id)||{
      ancestorId:id,name:id,status:'UNREGISTERED_ANCESTOR',evidenceRefs:[],
      readiness:'BUILD_REQUIRED',nextAction:'IMPLEMENT_AND_TEST_SHARED_ANCESTOR'
    });
    const internalBlockers=ancestorStates.filter(a=>['VERIFY_EXISTING','BUILD_REQUIRED','UNKNOWN'].includes(a.readiness));
    const externalGates=ancestorStates.filter(a=>a.readiness==='EXTERNAL_GATE');
    const ready=ancestorStates.filter(a=>a.readiness==='READY_INTERNAL');
    const overlay=parentOverlayFor(overlayEntries,moonshot.stableId);

    let treeState;
    if(internalBlockers.some(a=>a.readiness==='BUILD_REQUIRED'||a.readiness==='UNKNOWN')){
      treeState='BLOCKED_BY_MISSING_SHARED_ANCESTOR';
    }else if(internalBlockers.length){
      treeState='BLOCKED_BY_UNVERIFIED_EXISTING_ANCESTOR';
    }else if(moonshot.requiresExternalAuthority||externalGates.length){
      treeState='INTERNAL_PRECURSORS_READY__EXTERNAL_REALITY_GATE_REMAINS';
    }else{
      treeState='INTERNAL_REALIZATION_FRONTIER_READY';
    }

    const node={
      stableId:moonshot.stableId,
      ordinal:moonshot.ordinal,
      literalTitle:moonshot.literalTitle,
      realizationSurface:moonshot.realizationSurface,
      ideaKind:moonshot.ideaKind,
      parentRealityState:overlay.parentRealityState||moonshot.realityState||'IMAGINED',
      verifiedDescendants:overlay.verifiedDescendants,
      requiredAncestorIds:required,
      readyAncestorIds:ready.map(a=>a.ancestorId),
      internalBlockers:internalBlockers.map(a=>({
        ancestorId:a.ancestorId,readiness:a.readiness,nextAction:a.nextAction
      })),
      externalGates:externalGates.map(a=>a.ancestorId),
      requiresExternalAuthority:Boolean(moonshot.requiresExternalAuthority),
      treeState,
      nextAction:
        internalBlockers.length?internalBlockers[0].nextAction:
        (moonshot.requiresExternalAuthority||externalGates.length)
          ?'ADVANCE_SIMULATION_FORMALIZATION_AND_MEASUREMENT_UNTIL_EXTERNAL_GATE_IS_JUSTIFIED'
          :'EVIDENCE_GRADE_ATOMIZATION_AND_EXPERIMENT_COMPILATION'
    };
    nodes.push(node);

    for(const state of ancestorStates){
      if(!demand.has(state.ancestorId)){
        demand.set(state.ancestorId,{
          ...state,
          affectedMoonshotIds:[],
          internalFirstMoonshotIds:[],
          externalEventuallyMoonshotIds:[],
          surfaces:new Set()
        });
      }
      const d=demand.get(state.ancestorId);
      d.affectedMoonshotIds.push(moonshot.stableId);
      if(moonshot.requiresExternalAuthority) d.externalEventuallyMoonshotIds.push(moonshot.stableId);
      else d.internalFirstMoonshotIds.push(moonshot.stableId);
      d.surfaces.add(moonshot.realizationSurface);
    }
  }

  const ancestorDemand=[...demand.values()].map(row=>({
    ancestorId:row.ancestorId,
    name:row.name,
    status:row.status,
    evidenceRefs:row.evidenceRefs,
    readiness:row.readiness,
    nextAction:row.nextAction,
    affectedMoonshotCount:row.affectedMoonshotIds.length,
    internalFirstAffectedCount:row.internalFirstMoonshotIds.length,
    externalEventuallyAffectedCount:row.externalEventuallyMoonshotIds.length,
    surfaceCount:row.surfaces.size,
    leverageScore:
      row.internalFirstMoonshotIds.length*5+
      row.affectedMoonshotIds.length+
      row.surfaces.size*10
  })).sort((a,b)=>b.leverageScore-a.leverageScore||a.ancestorId.localeCompare(b.ancestorId));

  const ancestorFrontier=ancestorDemand
    .filter(row=>!['READY_INTERNAL','EXTERNAL_GATE'].includes(row.readiness))
    .sort((a,b)=>b.leverageScore-a.leverageScore||a.ancestorId.localeCompare(b.ancestorId));

  const internalFrontier=nodes
    .filter(row=>row.treeState==='INTERNAL_REALIZATION_FRONTIER_READY')
    .sort((a,b)=>a.ordinal-b.ordinal);
  const externalFrontier=nodes
    .filter(row=>row.treeState==='INTERNAL_PRECURSORS_READY__EXTERNAL_REALITY_GATE_REMAINS')
    .sort((a,b)=>a.ordinal-b.ordinal);

  const stateCounts={};
  for(const node of nodes) stateCounts[node.treeState]=(stateCounts[node.treeState]||0)+1;

  return envelope({
    ok:true,
    status:'MOONSHOT_TECHNOLOGY_TREE_READY',
    sourceMoonshotCount:nodes.length,
    nodes,
    ancestorDemand,
    ancestorFrontier,
    internalFrontier,
    externalFrontier,
    stateCounts,
    recompileTrigger:'ANY_ANCESTOR_STATUS_OR_VERIFIED_DESCENDANT_CHANGE',
    law:'VERIFIED_PRIMITIVES_CHANGE_REACHABILITY__THEY_DO_NOT_CHANGE_PARENT_TRUTH_WITHOUT_PARENT_SCOPED_EVIDENCE',
    truthBoundary:'DEPENDENCY_ROUTING_IS_AN_EXECUTION_MODEL__NOT_PROOF_THAT_A_LISTED_ANCESTOR_IS_CAUSALLY_NECESSARY'
  });
}

export function diffTechnologyTree({before,after}={}){
  if(!before?.nodes||!after?.nodes){
    return envelope({ok:false,status:'TECHNOLOGY_TREE_DIFF_INVALID',reasonCodes:['before-and-after-tree-required']});
  }
  const oldMap=new Map(before.nodes.map(n=>[n.stableId,n]));
  const changed=[];
  for(const node of after.nodes){
    const old=oldMap.get(node.stableId);
    if(!old) continue;
    if(old.treeState!==node.treeState||
       JSON.stringify(old.internalBlockers)!==JSON.stringify(node.internalBlockers)||
       JSON.stringify(old.verifiedDescendants)!==JSON.stringify(node.verifiedDescendants)){
      changed.push({
        stableId:node.stableId,
        ordinal:node.ordinal,
        literalTitle:node.literalTitle,
        from:old.treeState,
        to:node.treeState,
        removedBlockers:(old.internalBlockers||[]).filter(x=>!(node.internalBlockers||[]).some(y=>y.ancestorId===x.ancestorId)).map(x=>x.ancestorId),
        addedBlockers:(node.internalBlockers||[]).filter(x=>!(old.internalBlockers||[]).some(y=>y.ancestorId===x.ancestorId)).map(x=>x.ancestorId),
        verifiedDescendantCountBefore:(old.verifiedDescendants||[]).length,
        verifiedDescendantCountAfter:(node.verifiedDescendants||[]).length
      });
    }
  }
  return envelope({
    ok:true,status:'TECHNOLOGY_TREE_DIFF_READY',
    changedMoonshotCount:changed.length,
    changed,
    law:'TREE_DIFF_REPORTS_REACHABILITY_CHANGES__NOT_DISCOVERY_OR_IMPLEMENTATION_BY_ITSELF'
  });
}
