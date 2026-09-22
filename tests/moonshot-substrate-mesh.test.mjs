import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileMoonshotSubstrateMesh,
  compileMoonshotExecutionWave
} from '../src/moonshot-substrate-mesh.mjs';

const moonshots=Array.from({length:890},(_,i)=>({
  stableId:`founder-moonshot-${String(i+1).padStart(4,'0')}`,
  ordinal:i+1,
  literalTitle:`IDEA ${i+1}`,
  realizationSurface:i%8===0?'FORMAL':i%8===1?'SOFTWARE':i%8===2?'PHYSICAL':i%8===3?'BIOLOGICAL':i%8===4?'HUMAN':i%8===5?'INSTITUTIONAL':i%8===6?'CIVILIZATION':'MIXED',
  ideaKind:'CAPABILITY_SYSTEM',
  domains:['COMPUTATION'],
  requiresExternalAuthority:i>=400
}));
const tree={
  ok:true,
  status:'MOONSHOT_TECHNOLOGY_TREE_READY',
  nodes:moonshots.map(m=>({
    stableId:m.stableId,
    requiresExternalAuthority:m.requiresExternalAuthority,
    treeState:m.requiresExternalAuthority?'INTERNAL_PRECURSORS_READY__EXTERNAL_REALITY_GATE_REMAINS':'INTERNAL_REALIZATION_FRONTIER_READY'
  }))
};

test('all 890 moonshots receive one energy-compute-model-reality route',()=>{
  const mesh=compileMoonshotSubstrateMesh({moonshots,technologyTree:tree});
  assert.equal(mesh.ok,true);
  assert.equal(mesh.routeCount,890);
  assert.equal(mesh.firstStableId,'founder-moonshot-0001');
  assert.equal(mesh.lastStableId,'founder-moonshot-0890');
  assert.equal(new Set(mesh.routes.map(r=>r.stableId)).size,890);
  assert.equal(mesh.houseEnergy.ready,false);
  assert.ok(mesh.routes.every(r=>r.houseEnergy.state==='HOUSE_ENERGY_BLOCKED_PENDING_VERIFIED_SAVED_KWH'));
  assert.ok(mesh.routes.every(r=>r.reality.authority==='NONE'));
});

test('verified UberWatt energy makes internal compute eligible without granting external authority',()=>{
  const energyEquivalent={
    ok:true,
    status:'UBERWATT_ENERGY_EQUIVALENCE_COMPILED',
    savedKwh:12.5,
    evidenceRef:'uberwatt:verified-period-ledger'
  };
  const mesh=compileMoonshotSubstrateMesh({
    moonshots,
    technologyTree:tree,
    energyEquivalent,
    localCells:[{cellId:'hp-local',admitted:true,measured:true,taskClasses:['code','test'],sourceRef:'receipt:hp'}],
    modelSuppliers:[{supplierId:'frontier-council',available:true,tier:'FRONTIER',taskClasses:['review'],evidenceRef:'catalog'}]
  });
  assert.equal(mesh.ok,true);
  assert.equal(mesh.houseEnergy.ready,true);
  assert.equal(mesh.routeCount,890);
  assert.ok(mesh.routes.every(r=>r.houseEnergy.eligibleForInternalCompute===true));
  assert.ok(mesh.routes.every(r=>r.reality.authority==='NONE'));
  assert.equal(mesh.admittedLocalCellCount,1);
  assert.equal(mesh.availableModelSupplierCount,1);
});

test('external moonshots stay simulation-only and a house-energy wave fails closed when energy is unverified',()=>{
  const mesh=compileMoonshotSubstrateMesh({moonshots,technologyTree:tree});
  const blocked=compileMoonshotExecutionWave({mesh,maxIdeas:16,requireVerifiedHouseEnergy:true});
  assert.equal(blocked.ok,false);
  assert.ok(blocked.reasonCodes.includes('verified-house-energy-required'));

  const wave=compileMoonshotExecutionWave({mesh,maxIdeas:64,includeExternalSimulation:true});
  assert.equal(wave.ok,true);
  assert.equal(wave.candidateCount,64);
  assert.ok(wave.candidates.every(x=>x.authority==='NONE'));
});

test('coverage fails if even one of the 890 stable identities is missing or shifted',()=>{
  const broken=structuredClone(moonshots);
  broken[889].stableId='founder-moonshot-9999';
  const mesh=compileMoonshotSubstrateMesh({moonshots:broken,technologyTree:tree});
  assert.equal(mesh.ok,false);
  assert.ok(mesh.reasonCodes.includes('all-890-unique-contiguous-stable-ids-required'));
});
