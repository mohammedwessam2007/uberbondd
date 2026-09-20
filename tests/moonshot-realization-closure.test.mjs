import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileMoonshotRealityPackets,
  verifyMoonshotRealizationClosure
} from '../src/moonshot-realization-closure.mjs';

const literals=Array.from({length:890},(_,i)=>({
  ordinal:i+1,literalTitle:`IDEA ${i+1}`,hypotheticalIq:'fictional',
  literalBodyMarkdown:`Body ${i+1}`,sourceLineStart:i*4+1,sourceLineEnd:i*4+4
}));
const ledger=literals.map(e=>({
  stableId:`founder-moonshot-${String(e.ordinal).padStart(4,'0')}`,
  ordinal:e.ordinal,claimAtomizationState:'PENDING_EVIDENCE_GRADE_ATOMIZATION',
  implementationMode:'PURE_SOFTWARE_PROTOTYPE'
}));
const nodes=ledger.map((e,i)=>({
  stableId:e.stableId,ordinal:e.ordinal,literalTitle:literals[i].literalTitle,
  realizationSurface:i<200?'SOFTWARE':'PHYSICAL',ideaKind:'CAPABILITY_SYSTEM',
  parentRealityState:'IMAGINED',
  requiredAncestorIds:['common'],readyAncestorIds:['common'],internalBlockers:[],
  externalGates:i<200?[]:['physical-reality-bridge'],
  requiresExternalAuthority:i>=200,
  treeState:i<200?'INTERNAL_REALIZATION_FRONTIER_READY':'INTERNAL_PRECURSORS_READY__EXTERNAL_REALITY_GATE_REMAINS',
  nextAction:i<200?'EVIDENCE_GRADE_ATOMIZATION_AND_EXPERIMENT_COMPILATION':'ADVANCE_SIMULATION_FORMALIZATION_AND_MEASUREMENT_UNTIL_EXTERNAL_GATE_IS_JUSTIFIED'
}));
const tree={
  ok:true,status:'MOONSHOT_TECHNOLOGY_TREE_READY',nodes,
  ancestorFrontier:[],
  ancestorDemand:[
    {ancestorId:'common',readiness:'READY_INTERNAL'},
    {ancestorId:'physical-reality-bridge',readiness:'EXTERNAL_GATE'}
  ]
};

test('closure requires every literal idea to remain bound to one reality packet',()=>{
  const r=compileMoonshotRealityPackets({literalEntries:literals,ledgerRows:ledger,technologyTree:tree});
  assert.equal(r.ok,true);
  assert.equal(r.packetCount,890);
  assert.equal(r.packets[0].immutableSourceBody,'Body 1');
  assert.equal(r.packets.at(-1).ordinal,890);
});

test('closure partitions all 890 between internal execution and external reality',()=>{
  const r=verifyMoonshotRealizationClosure({literalEntries:literals,ledgerRows:ledger,technologyTree:tree});
  assert.equal(r.ok,true);
  assert.equal(r.internalExecutionCount,200);
  assert.equal(r.externalRealityCount,690);
  assert.equal(r.internalSharedBlockerCount,0);
  assert.match(r.status,/EXTERNAL_REALITY_REMAINS/);
});

test('closure refuses even one unresolved internal shared blocker',()=>{
  const broken=structuredClone(tree);
  broken.nodes[0].treeState='BLOCKED_BY_MISSING_SHARED_ANCESTOR';
  broken.nodes[0].internalBlockers=[{ancestorId:'missing'}];
  broken.ancestorFrontier=[{ancestorId:'missing'}];
  const r=verifyMoonshotRealizationClosure({literalEntries:literals,ledgerRows:ledger,technologyTree:broken});
  assert.equal(r.ok,false);
});
