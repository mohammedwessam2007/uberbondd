import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileGenesisCandidateSubstrateBridge,
  compileGenesisCandidateProbeWave
} from '../src/genesis-candidate-substrate-bridge.mjs';

const routes=Array.from({length:890},(_,i)=>({
  stableId:`founder-moonshot-${String(i+1).padStart(4,'0')}`,
  execution:{
    workClasses:[i%2?'simulation':'code'],
    cognitiveLadder:['DETERMINISTIC_FIRST','JEV_SYSTEM_ONE_IF_TYPED_AND_CALIBRATED','LOCAL_MODEL_IF_ADMITTED_AND_EFFICIENT','FRONTIER_MODEL_FOR_NOVELTY_AMBIGUITY_OR_REVIEW'],
    localCellIds:['hp-local'],
    modelSupplierIds:['frontier-council']
  },
  reality:{requiresExternalAuthority:i>=600}
}));
const mesh={
  ok:true,status:'MOONSHOT_890_SUBSTRATE_MESH_READY',routeCount:890,routes,
  houseEnergy:{ready:false,state:'HOUSE_ENERGY_BLOCKED_PENDING_VERIFIED_SAVED_KWH'}
};
const nursery={
  candidates:Array.from({length:24},(_,i)=>({
    id:`genesis-candidate-20260922-${String(i+1).padStart(4,'0')}`,
    title:`Candidate ${i+1}`,
    generatorKey:'software-agents-intelligence::1000x-scaling',
    utility:.95-i*.005,
    testability:.9,
    moonshotAffinity:['founder-moonshot-0261',i%2?'founder-moonshot-0890':'founder-moonshot-0460'],
    substrateNeeds:['JEV_SYSTEM_ONE','SOVEREIGN_COMPUTE']
  }))
};

test('all live candidates inherit routes from their 890 ancestors without inheriting authority',()=>{
  const bridge=compileGenesisCandidateSubstrateBridge({nursery,moonshotMesh:mesh});
  assert.equal(bridge.ok,true);
  assert.equal(bridge.candidateRouteCount,24);
  assert.equal(bridge.moonshotSourceCount,890);
  assert.ok(bridge.routes.every(route=>route.execution.authority==='NONE'));
  assert.ok(bridge.routes.every(route=>route.proofState==='ROUTED_GENERATED_HYPOTHESIS_NOT_REALIZED'));
});

test('candidate with a nonexistent moonshot ancestor is rejected',()=>{
  const broken=structuredClone(nursery);
  broken.candidates[0].moonshotAffinity=['founder-moonshot-9999'];
  const bridge=compileGenesisCandidateSubstrateBridge({nursery:broken,moonshotMesh:mesh});
  assert.equal(bridge.ok,false);
  assert.ok(bridge.reasonCodes.includes('all-moonshot-affinities-must-resolve'));
});

test('house energy remains fail-closed for a probe wave that explicitly requires it',()=>{
  const bridge=compileGenesisCandidateSubstrateBridge({nursery,moonshotMesh:mesh});
  const wave=compileGenesisCandidateProbeWave({bridge,maxCandidates:8,minimumUtility:.8,requireVerifiedHouseEnergy:true});
  assert.equal(wave.ok,false);
  assert.ok(wave.reasonCodes.includes('verified-house-energy-required'));
});

test('internal probe wave is bounded, utility-ranked and zero-authority',()=>{
  const readyMesh=structuredClone(mesh);
  readyMesh.houseEnergy={ready:true,state:'VERIFIED_HOUSE_ENERGY_AVAILABLE_FOR_INTERNAL_COMPUTE',savedKwh:4,evidenceRef:'uberwatt:test'};
  const bridge=compileGenesisCandidateSubstrateBridge({nursery,moonshotMesh:readyMesh});
  const wave=compileGenesisCandidateProbeWave({bridge,maxCandidates:5,minimumUtility:.8,requireVerifiedHouseEnergy:true});
  assert.equal(wave.ok,true);
  assert.equal(wave.candidateCount,5);
  assert.ok(wave.candidates.every(candidate=>candidate.authority==='NONE'));
  assert.ok(wave.candidates.every(candidate=>candidate.houseEnergyEligible===true));
  assert.ok(wave.candidates[0].utility>=wave.candidates[1].utility);
});
