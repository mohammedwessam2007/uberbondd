import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const GENESIS_CANDIDATE_SUBSTRATE_BRIDGE_VERSION='uberbond.genesis-candidate-substrate-bridge.v1';
const zero=()=>structuredClone(ZERO_EXTERNAL_EFFECTS);
const envelope=extra=>({businessEffectAuthority:'NONE',externalEffectAuthority:'NONE',externalEffectLedger:zero(),...extra});
const text=(v,m=1000)=>{const s=String(v??'').trim();return s&&s.length<=m?s:null;};
const finite=(v,a=0,b=1)=>{const n=Number(v);return Number.isFinite(n)&&n>=a&&n<=b?n:null;};
const uniq=v=>[...new Set(v)];

export function compileGenesisCandidateSubstrateBridge({nursery,moonshotMesh}={}){
  const reasons=[];
  if(!nursery||!Array.isArray(nursery.candidates)||nursery.candidates.length<1||nursery.candidates.length>500) reasons.push('bounded-live-nursery-required');
  if(!moonshotMesh?.ok||moonshotMesh?.status!=='MOONSHOT_890_SUBSTRATE_MESH_READY'||!Array.isArray(moonshotMesh.routes)||moonshotMesh.routes.length!==890) reasons.push('valid-890-substrate-mesh-required');
  if(reasons.length) return envelope({ok:false,status:'GENESIS_CANDIDATE_SUBSTRATE_BRIDGE_BLOCKED',reasonCodes:reasons});

  const routeById=new Map(moonshotMesh.routes.map(route=>[route.stableId,route]));
  const seen=new Set();
  const routes=[];

  for(const raw of nursery.candidates){
    const candidateId=text(raw?.id,240);
    const title=text(raw?.title,300);
    const generatorKey=text(raw?.generatorKey,300);
    const utility=finite(raw?.utility);
    const testability=finite(raw?.testability);
    const affinities=Array.isArray(raw?.moonshotAffinity)?uniq(raw.moonshotAffinity.map(v=>text(v,120)).filter(Boolean)):[];
    const substrateNeeds=Array.isArray(raw?.substrateNeeds)?uniq(raw.substrateNeeds.map(v=>text(v,120)).filter(Boolean)):[];
    const local=[];
    if(!candidateId||seen.has(candidateId)||!/^genesis-candidate-[a-z0-9-]+$/.test(candidateId)) local.push('unique-genesis-candidate-id-required');
    if(!title||!generatorKey||utility===null||testability===null) local.push('candidate-title-lineage-utility-testability-required');
    if(!affinities.length||affinities.some(id=>!/^founder-moonshot-\d{4}$/.test(id))) local.push('valid-moonshot-affinity-required');
    if(!substrateNeeds.length) local.push('substrate-needs-required');
    const ancestors=affinities.map(id=>routeById.get(id));
    const missing=affinities.filter((id,index)=>!ancestors[index]);
    if(missing.length) local.push('all-moonshot-affinities-must-resolve');
    if(local.length) return envelope({ok:false,status:'GENESIS_CANDIDATE_SUBSTRATE_BRIDGE_BLOCKED',reasonCodes:uniq(local),candidateId:candidateId||null,missingAncestorIds:missing});
    seen.add(candidateId);

    const cognitiveLadder=uniq(ancestors.flatMap(a=>a?.execution?.cognitiveLadder||[]));
    const inheritedWorkClasses=uniq(ancestors.flatMap(a=>a?.execution?.workClasses||[]));
    const localCellIds=uniq(ancestors.flatMap(a=>a?.execution?.localCellIds||[]));
    const modelSupplierIds=uniq(ancestors.flatMap(a=>a?.execution?.modelSupplierIds||[]));
    const ancestorExternalGateIds=ancestors.filter(a=>a?.reality?.requiresExternalAuthority).map(a=>a.stableId);
    const energyReady=moonshotMesh?.houseEnergy?.ready===true;

    routes.push({
      candidateId,
      title,
      generatorKey,
      utility,
      testability,
      moonshotAncestorIds:affinities,
      substrateNeeds,
      inherited:{
        workClasses:inheritedWorkClasses,
        cognitiveLadder,
        localCellIds,
        modelSupplierIds,
        houseEnergyState:moonshotMesh?.houseEnergy?.state||'UNKNOWN',
        houseEnergyEligible:energyReady,
        ancestorExternalGateIds
      },
      execution:{
        authority:'NONE',
        allowedMode:'INTERNAL_HYPOTHESIS_FALSIFICATION_AND_PROBE',
        nextAction:testability>=0.8?'RUN_INTERNAL_FALSIFICATION_PROBE':'REFINE_FALSIFIER_AND_MEASUREMENT',
        objective:'MAXIMIZE_VERIFIED_LEARNING_PER_KWH_PER_DOLLAR_PER_FOUNDER_MINUTE'
      },
      proofState:'ROUTED_GENERATED_HYPOTHESIS_NOT_REALIZED',
      truthBoundary:'INHERITING_A_SUBSTRATE_ROUTE_DOES_NOT_INHERIT_REALITY_AUTHORITY_OR_PROVE_THE_CANDIDATE.'
    });
  }

  routes.sort((a,b)=>b.utility-a.utility||b.testability-a.testability||a.candidateId.localeCompare(b.candidateId));
  return envelope({
    ok:true,
    status:'GENESIS_CANDIDATE_SUBSTRATE_BRIDGE_READY',
    version:GENESIS_CANDIDATE_SUBSTRATE_BRIDGE_VERSION,
    candidateRouteCount:routes.length,
    moonshotSourceCount:moonshotMesh.routeCount,
    houseEnergy:moonshotMesh.houseEnergy,
    routes,
    law:'GENESIS_CHILDREN_MAY_INHERIT_SUBSTRATE_ROUTES_AND_BLOCKERS_FROM_890_ANCESTORS__THEY_NEVER_INHERIT_EXTERNAL_AUTHORITY.',
    truthBoundary:'THIS_BRIDGE_CONNECTS_GENERATED_IDEAS_TO_THE_890_ENERGY_COMPUTE_MODEL_FABRIC__IT_IS_NOT_IMPLEMENTATION_FEASIBILITY_OR_DISCOVERY_PROOF.'
  });
}

export function compileGenesisCandidateProbeWave({bridge,maxCandidates=8,minimumUtility=0.8,requireVerifiedHouseEnergy=false}={}){
  const limit=Number(maxCandidates),floor=finite(minimumUtility);
  const reasons=[];
  if(!bridge?.ok||bridge.status!=='GENESIS_CANDIDATE_SUBSTRATE_BRIDGE_READY') reasons.push('valid-candidate-substrate-bridge-required');
  if(!Number.isSafeInteger(limit)||limit<1||limit>64) reasons.push('max-candidates-must-be-integer-1-to-64');
  if(floor===null) reasons.push('minimum-utility-must-be-zero-to-one');
  if(requireVerifiedHouseEnergy&&bridge?.houseEnergy?.ready!==true) reasons.push('verified-house-energy-required');
  if(reasons.length) return envelope({ok:false,status:'GENESIS_CANDIDATE_PROBE_WAVE_BLOCKED',reasonCodes:reasons});

  const candidates=bridge.routes
    .filter(route=>route.utility>=floor)
    .slice(0,limit)
    .map(route=>({
      candidateId:route.candidateId,
      title:route.title,
      utility:route.utility,
      testability:route.testability,
      moonshotAncestorIds:route.moonshotAncestorIds,
      workClasses:route.inherited.workClasses,
      cognitiveLadder:route.inherited.cognitiveLadder,
      localCellIds:route.inherited.localCellIds,
      modelSupplierIds:route.inherited.modelSupplierIds,
      houseEnergyEligible:route.inherited.houseEnergyEligible,
      mode:'INTERNAL_HYPOTHESIS_FALSIFICATION_AND_PROBE',
      authority:'NONE'
    }));

  return envelope({
    ok:true,
    status:'GENESIS_CANDIDATE_PROBE_WAVE_READY',
    candidateCount:candidates.length,
    candidates,
    executionAuthority:'NONE',
    law:'PROBE_WAVE_SELECTION_IS_AN_INTERNAL_RESEARCH_PRIORITY_QUEUE__NOT_AUTO_PROMOTION_OR_EXTERNAL_ACTION.'
  });
}
