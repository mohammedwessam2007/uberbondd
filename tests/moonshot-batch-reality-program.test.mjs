import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileAllMoonshotExecutionPrograms,
  selectNextExecutableProgram
} from '../src/moonshot-batch-reality-program.mjs';

const packets=Array.from({length:890},(_,i)=>({
  stableId:`founder-moonshot-${String(i+1).padStart(4,'0')}`,
  ordinal:i+1,literalTitle:`IDEA ${i+1}`,
  parentRealityState:i===0?'CONSTRAINT_MAPPED':'IMAGINED',
  frontierClass:i<193?'INTERNAL_EXECUTION':'EXTERNAL_REALITY',
  realizationSurface:i<193?'SOFTWARE':i<500?'PHYSICAL':'HUMAN',
  ideaKind:'CAPABILITY_SYSTEM',
  verifiedDescendants:[],
  requiredAncestorIds:['a'],readyAncestorIds:['a'],
  internalBlockers:[],externalGates:i<193?[]:['physical-reality-bridge'],
  requiresExternalAuthority:i>=193
}));
const closureState={
  closure:{internalSharedBlockerCount:0,ancestorFrontierCount:0},
  packets
};

test('all 890 compile into exactly one execution program without invented claims',()=>{
  const r=compileAllMoonshotExecutionPrograms({closureState});
  assert.equal(r.ok,true);
  assert.equal(r.programCount,890);
  assert.equal(r.internalProgramCount,193);
  assert.equal(r.externalProgramCount,697);
  assert.equal(r.programs[0].hypothesis,null);
  assert.equal(r.programs[0].claimState,'EVIDENCE_GRADE_ATOMIZATION_REQUIRED');
});

test('external programs compile provider-neutral bridge shells with no authority',()=>{
  const r=compileAllMoonshotExecutionPrograms({closureState});
  const physical=r.programs[193];
  assert.equal(physical.frontierClass,'EXTERNAL_REALITY');
  assert.equal(physical.adapterClass,'PHYSICAL_LAB');
  assert.equal(physical.executionAuthority,'NONE');
});

test('batch compiler refuses a closure that still has internal blockers',()=>{
  const broken=structuredClone(closureState);
  broken.closure.internalSharedBlockerCount=1;
  const r=compileAllMoonshotExecutionPrograms({closureState:broken});
  assert.equal(r.ok,false);
});

test('selector prioritizes a non-imagined internal parent without treating selection as evidence',()=>{
  const r=compileAllMoonshotExecutionPrograms({closureState});
  const s=selectNextExecutableProgram({programs:r.programs});
  assert.equal(s.ok,true);
  assert.equal(s.selected.stableId,'founder-moonshot-0001');
  assert.equal(s.executionAuthority,'NONE');
});
