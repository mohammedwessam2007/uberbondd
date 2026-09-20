import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const MOONSHOT_REALIZATION_CLOSURE_VERSION='uberbond.moonshot-realization-closure.v1';

const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:structuredClone(ZERO_EXTERNAL_EFFECTS),
  ...extra
});
const fail=(reasons,extra={})=>envelope({
  ok:false,status:'MOONSHOT_REALIZATION_CLOSURE_REFUSED',
  reasonCodes:[...new Set(reasons.filter(Boolean))],...extra
});

export function compileMoonshotRealityPackets({
  literalEntries=[],
  ledgerRows=[],
  technologyTree,
  overlayEntries={}
}={}){
  const reasons=[];
  if(!Array.isArray(literalEntries)||literalEntries.length!==890) reasons.push('exact-890-literal-entries-required');
  if(!Array.isArray(ledgerRows)||ledgerRows.length!==890) reasons.push('exact-890-ledger-rows-required');
  if(!technologyTree?.ok||technologyTree.status!=='MOONSHOT_TECHNOLOGY_TREE_READY') reasons.push('valid-technology-tree-required');
  if((technologyTree?.nodes||[]).length!==890) reasons.push('technology-tree-must-cover-890');
  if(reasons.length) return fail(reasons);

  const literalByOrdinal=new Map(literalEntries.map(e=>[e.ordinal,e]));
  const ledgerById=new Map(ledgerRows.map(e=>[e.stableId,e]));
  const packets=[];
  for(const node of technologyTree.nodes){
    const literal=literalByOrdinal.get(node.ordinal);
    const ledger=ledgerById.get(node.stableId);
    if(!literal||!ledger) return fail([`source-ledger-binding-missing:${node.stableId}`]);
    const overlay=overlayEntries?.[node.stableId]||{};
    const external=node.treeState==='INTERNAL_PRECURSORS_READY__EXTERNAL_REALITY_GATE_REMAINS';
    const internal=node.treeState==='INTERNAL_REALIZATION_FRONTIER_READY';
    if(!external&&!internal) return fail([`unclosed-internal-route:${node.stableId}:${node.treeState}`]);
    packets.push({
      stableId:node.stableId,
      ordinal:node.ordinal,
      literalTitle:literal.literalTitle,
      hypotheticalIq:literal.hypotheticalIq,
      sourceLines:[literal.sourceLineStart,literal.sourceLineEnd],
      immutableSourceBody:literal.literalBodyMarkdown,
      parentRealityState:overlay.parentRealityState||node.parentRealityState||'IMAGINED',
      verifiedDescendants:Array.isArray(overlay.verifiedDescendants)?overlay.verifiedDescendants:[],
      realizationSurface:node.realizationSurface,
      ideaKind:node.ideaKind,
      requiredAncestorIds:node.requiredAncestorIds,
      readyAncestorIds:node.readyAncestorIds,
      internalBlockers:node.internalBlockers,
      externalGates:node.externalGates,
      requiresExternalAuthority:node.requiresExternalAuthority,
      frontierClass:internal?'INTERNAL_EXECUTION':'EXTERNAL_REALITY',
      nextAction:node.nextAction,
      claimAtomizationState:ledger.claimAtomizationState,
      implementationMode:ledger.implementationMode,
      truthBoundary:internal
        ?'INTERNAL_FRONTIER_READY_MEANS_UBERBOND_HAS_THE_SHARED_SOFTWARE_ANCESTORS__THE_PARENT_IDEA_STILL_NEEDS_SCOPED_EVIDENCE'
        :'EXTERNAL_FRONTIER_READY_MEANS_INTERNAL_PRECURSORS_ARE_CLEAR__REAL_WORLD_AUTHORITY_MEASUREMENT_OR_PHYSICAL_EVIDENCE_REMAINS_REQUIRED'
    });
  }
  packets.sort((a,b)=>a.ordinal-b.ordinal);
  return envelope({
    ok:true,status:'MOONSHOT_890_REALITY_PACKETS_COMPILED',
    packetCount:packets.length,
    internalExecutionCount:packets.filter(p=>p.frontierClass==='INTERNAL_EXECUTION').length,
    externalRealityCount:packets.filter(p=>p.frontierClass==='EXTERNAL_REALITY').length,
    packets,
    noDropLaw:'EVERY_LITERAL_SOURCE_ENTRY_REMAINS_EMBEDDED_AND_ADDRESSABLE_IN_ITS_REALITY_PACKET'
  });
}

export function verifyMoonshotRealizationClosure({
  literalEntries=[],
  ledgerRows=[],
  technologyTree,
  ancestorSpine=[],
  overlayEntries={}
}={}){
  const packets=compileMoonshotRealityPackets({
    literalEntries,ledgerRows,technologyTree,overlayEntries
  });
  if(!packets.ok) return packets;

  const reasons=[];
  const ids=packets.packets.map(p=>p.stableId);
  const ordinals=packets.packets.map(p=>p.ordinal);
  if(new Set(ids).size!==890) reasons.push('stable-id-count-not-890');
  if(!ordinals.every((v,i)=>v===i+1)) reasons.push('ordinals-not-contiguous-1-through-890');
  if((technologyTree.ancestorFrontier||[]).length!==0) reasons.push('internal-shared-ancestor-frontier-remains');
  const internalBlockers=packets.packets.filter(p=>p.internalBlockers?.length);
  if(internalBlockers.length) reasons.push(`internal-blockers-remain:${internalBlockers.length}`);
  if(packets.internalExecutionCount+packets.externalRealityCount!==890) reasons.push('frontier-partition-not-890');

  const unreadyInternalAncestors=(technologyTree.ancestorDemand||[])
    .filter(a=>!['READY_INTERNAL','EXTERNAL_GATE'].includes(a.readiness));
  if(unreadyInternalAncestors.length) reasons.push(`unready-internal-ancestors:${unreadyInternalAncestors.length}`);

  if(reasons.length) return fail(reasons,{
    packetCount:packets.packetCount,
    remainingAncestorFrontier:technologyTree.ancestorFrontier||[],
    unreadyInternalAncestors
  });

  return envelope({
    ok:true,
    status:'MOONSHOT_890_INTERNAL_REALIZATION_ARCHITECTURE_CLOSED__EXTERNAL_REALITY_REMAINS',
    packetCount:890,
    internalExecutionCount:packets.internalExecutionCount,
    externalRealityCount:packets.externalRealityCount,
    internalSharedBlockerCount:0,
    unresolvedExternalRealityCount:packets.externalRealityCount,
    realityPackets:packets.packets,
    law:'ALL_890_HAVE_A_LIVE_REALIZATION_ROUTE__ZERO_INTERNAL_SHARED_ARCHITECTURE_BLOCKERS__EXTERNAL_REALITY_CANNOT_BE_DECLARED_COMPLETE_FROM_SOFTWARE',
    claimsNotMade:[
      'NO_890_OF_890_PHYSICAL_REALIZATION',
      'NO_890_OF_890_SCIENTIFIC_VALIDATION',
      'NO_EXTERNAL_AUTHORITY_INFERRED',
      'NO_CIVILIZATION_SCALE_PARENT_PROMOTED_FROM_A_SOFTWARE_DESCENDANT'
    ]
  });
}
