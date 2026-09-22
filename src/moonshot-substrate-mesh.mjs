import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const MOONSHOT_SUBSTRATE_MESH_VERSION='uberbond.moonshot-substrate-mesh.v1';

const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const envelope=extra=>({
  businessEffectAuthority:'NONE',
  externalEffectAuthority:'NONE',
  externalEffectLedger:zero(),
  ...extra
});
const uniq=v=>[...new Set(v)];
const HOUSE_READY=new Set(['UBERWATT_ENERGY_EQUIVALENCE_COMPILED']);

const WORK_BY_SURFACE=Object.freeze({
  SOFTWARE:['code','test','repo-search','evaluation','simulation'],
  FORMAL:['proof-search','counterexample-search','formalization','evaluation'],
  PHYSICAL:['literature-search','simulation','experiment-design','measurement-design'],
  BIOLOGICAL:['literature-search','simulation','experiment-design','safety-review'],
  HUMAN:['simulation','study-design','measurement-design','evidence-review'],
  INSTITUTIONAL:['simulation','mechanism-design','policy-analysis','evidence-review'],
  CIVILIZATION:['scenario-search','simulation','counterfactual-analysis','evidence-review'],
  MIXED:['decomposition','simulation','evidence-review','frontier-escalation']
});

function validMoonshotId(row,index){
  return row?.stableId===`founder-moonshot-${String(index+1).padStart(4,'0')}`
    && Number(row?.ordinal)===index+1;
}
function houseEnergyState(energyEquivalent){
  const ready=energyEquivalent?.ok===true
    && HOUSE_READY.has(energyEquivalent?.status)
    && Number(energyEquivalent?.savedKwh)>0;
  return ready
    ? {
        ready:true,
        state:'VERIFIED_HOUSE_ENERGY_AVAILABLE_FOR_INTERNAL_COMPUTE',
        savedKwh:Number(energyEquivalent.savedKwh),
        evidenceRef:energyEquivalent.evidenceRef||null
      }
    : {
        ready:false,
        state:'HOUSE_ENERGY_BLOCKED_PENDING_VERIFIED_SAVED_KWH',
        savedKwh:null,
        evidenceRef:null
      };
}
function laneSet(row,node){
  const work=WORK_BY_SURFACE[row.realizationSurface]||WORK_BY_SURFACE.MIXED;
  const external=Boolean(row.requiresExternalAuthority||node?.requiresExternalAuthority);
  return {
    workClasses:uniq(work),
    cognitiveLadder:[
      'DETERMINISTIC_FIRST',
      'JEV_SYSTEM_ONE_IF_TYPED_AND_CALIBRATED',
      'LOCAL_MODEL_IF_ADMITTED_AND_EFFICIENT',
      'REPLACEABLE_CLOUD_MODEL_IF_BETTER',
      'FRONTIER_MODEL_FOR_NOVELTY_AMBIGUITY_OR_REVIEW'
    ],
    realityLane:external
      ? 'SIMULATION_AND_INTERNAL_PRECURSORS_ONLY_UNTIL_EXPLICIT_REALITY_AUTHORITY'
      : 'INTERNAL_REALIZATION_AND_EVIDENCE_LOOP',
    localComputeEligible:true
  };
}

export function compileMoonshotSubstrateMesh({
  moonshots=[],
  technologyTree=null,
  energyEquivalent=null,
  localCells=[],
  modelSuppliers=[]
}={}){
  const reasons=[];
  if(!Array.isArray(moonshots)||moonshots.length!==890) reasons.push('exact-890-moonshots-required');
  if(!technologyTree?.ok||technologyTree?.status!=='MOONSHOT_TECHNOLOGY_TREE_READY'||!Array.isArray(technologyTree?.nodes)||technologyTree.nodes.length!==890){
    reasons.push('exact-890-technology-tree-required');
  }
  if(!Array.isArray(localCells)||localCells.length>128) reasons.push('bounded-local-cell-list-required');
  if(!Array.isArray(modelSuppliers)||modelSuppliers.length>256) reasons.push('bounded-model-supplier-list-required');
  if(reasons.length) return envelope({ok:false,status:'MOONSHOT_SUBSTRATE_MESH_BLOCKED',reasonCodes:uniq(reasons)});

  if(!moonshots.every(validMoonshotId)||new Set(moonshots.map(x=>x.stableId)).size!==890){
    return envelope({ok:false,status:'MOONSHOT_SUBSTRATE_MESH_BLOCKED',reasonCodes:['all-890-unique-contiguous-stable-ids-required']});
  }

  const treeById=new Map(technologyTree.nodes.map(n=>[n.stableId,n]));
  const energy=houseEnergyState(energyEquivalent);
  const admittedLocalCells=localCells
    .filter(c=>c?.admitted===true&&typeof c?.cellId==='string'&&c.cellId.trim())
    .map(c=>({
      cellId:c.cellId,
      taskClasses:Array.isArray(c.taskClasses)?uniq(c.taskClasses.map(String)):[],
      measured:Boolean(c.measured),
      sourceRef:c.sourceRef||null
    }));
  const suppliers=modelSuppliers
    .filter(s=>s?.available===true&&typeof s?.supplierId==='string'&&s.supplierId.trim())
    .map(s=>({
      supplierId:s.supplierId,
      tier:s.tier||'REPLACEABLE',
      taskClasses:Array.isArray(s.taskClasses)?uniq(s.taskClasses.map(String)):[],
      evidenceRef:s.evidenceRef||null
    }));

  const routes=[];
  for(const row of moonshots){
    const node=treeById.get(row.stableId);
    if(!node){
      return envelope({ok:false,status:'MOONSHOT_SUBSTRATE_MESH_BLOCKED',reasonCodes:[`technology-tree-binding-missing:${row.stableId}`]});
    }
    const lanes=laneSet(row,node);
    routes.push({
      stableId:row.stableId,
      ordinal:row.ordinal,
      literalTitle:row.literalTitle,
      realizationSurface:row.realizationSurface,
      ideaKind:row.ideaKind,
      domains:Array.isArray(row.domains)?row.domains:[],
      treeState:node.treeState,
      houseEnergy:{
        state:energy.state,
        eligibleForInternalCompute:energy.ready,
        verifiedSavedKwh:energy.savedKwh,
        evidenceRef:energy.evidenceRef
      },
      execution:{
        ...lanes,
        localCellIds:admittedLocalCells.map(c=>c.cellId),
        modelSupplierIds:suppliers.map(s=>s.supplierId),
        objective:'MAXIMIZE_VERIFIED_PROGRESS_PER_KWH_PER_DOLLAR_PER_FOUNDER_MINUTE',
        schedulerPolicy:'USE_CHEAPEST_SUFFICIENT_VERIFIED_LAYER_THEN_ESCALATE'
      },
      reality:{
        requiresExternalAuthority:Boolean(row.requiresExternalAuthority||node.requiresExternalAuthority),
        authority:'NONE',
        gate:lanes.realityLane
      },
      proofState:'ROUTED_NOT_REALIZED',
      truthBoundary:'A SUBSTRATE ROUTE CONNECTS THE IDEA TO ENERGY_COMPUTE_AND_MODEL_LANES; IT DOES NOT PROVE FEASIBILITY_IMPLEMENTATION_OR_EXTERNAL_EFFECT.'
    });
  }

  const externalCount=routes.filter(r=>r.reality.requiresExternalAuthority).length;
  const internalCount=routes.length-externalCount;
  return envelope({
    ok:true,
    status:'MOONSHOT_890_SUBSTRATE_MESH_READY',
    schemaVersion:MOONSHOT_SUBSTRATE_MESH_VERSION,
    routeCount:routes.length,
    firstStableId:routes[0].stableId,
    lastStableId:routes.at(-1).stableId,
    houseEnergy:energy,
    admittedLocalCellCount:admittedLocalCells.length,
    availableModelSupplierCount:suppliers.length,
    internalRealityCount:internalCount,
    externalRealityCount:externalCount,
    routes,
    law:'ALL_890_IDEAS_REMAIN_ADDRESSABLE; ENERGY_COMPUTE_AND_MODELS_ARE_REPLACEABLE_SUBSTRATES; CAPABILITY_NEVER_CREATES_AUTHORITY.',
    truthBoundary:'890_OF_890_SUBSTRATE_INTEGRATION_IS_ROUTING_COVERAGE_NOT_890_OF_890_IMPLEMENTATION_OR_PHYSICAL_FEASIBILITY.'
  });
}

export function compileMoonshotExecutionWave({
  mesh,
  maxIdeas=32,
  requireVerifiedHouseEnergy=false,
  includeExternalSimulation=true
}={}){
  const limit=Number(maxIdeas);
  if(!mesh?.ok||mesh.status!=='MOONSHOT_890_SUBSTRATE_MESH_READY'){
    return envelope({ok:false,status:'MOONSHOT_EXECUTION_WAVE_BLOCKED',reasonCodes:['valid-890-substrate-mesh-required']});
  }
  if(!Number.isSafeInteger(limit)||limit<1||limit>64){
    return envelope({ok:false,status:'MOONSHOT_EXECUTION_WAVE_BLOCKED',reasonCodes:['max-ideas-must-be-integer-1-to-64']});
  }
  if(requireVerifiedHouseEnergy&&mesh.houseEnergy?.ready!==true){
    return envelope({ok:false,status:'MOONSHOT_EXECUTION_WAVE_BLOCKED',reasonCodes:['verified-house-energy-required']});
  }

  const candidates=mesh.routes
    .filter(r=>includeExternalSimulation||!r.reality.requiresExternalAuthority)
    .map(r=>({
      stableId:r.stableId,
      ordinal:r.ordinal,
      literalTitle:r.literalTitle,
      workClasses:r.execution.workClasses,
      treeState:r.treeState,
      houseEnergyEligible:r.houseEnergy.eligibleForInternalCompute,
      realityMode:r.reality.requiresExternalAuthority?'SIMULATION_ONLY':'INTERNAL_REALIZATION',
      authority:'NONE'
    }))
    .slice(0,limit);

  return envelope({
    ok:true,
    status:'MOONSHOT_EXECUTION_WAVE_READY',
    candidateCount:candidates.length,
    candidates,
    executionAuthority:'NONE',
    law:'A WAVE IS A BOUNDED INTERNAL WORKSET; EXTERNAL_REALITY_ACTIONS REQUIRE SEPARATE EXPLICIT AUTHORITY.'
  });
}
