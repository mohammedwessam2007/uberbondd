import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAncestorReadiness,
  compileMoonshotTechnologyTree,
  diffTechnologyTree
} from '../src/moonshot-technology-tree-compiler.mjs';

const entries=Array.from({length:890},(_,i)=>({
  stableId:`founder-moonshot-${String(i+1).padStart(4,'0')}`,
  ordinal:i+1,literalTitle:`IDEA ${i+1}`,
  realizationSurface:'SOFTWARE',ideaKind:'CAPABILITY_SYSTEM',
  ancestorIds:['a','b'],requiresExternalAuthority:false,realityState:'IMAGINED'
}));

test('ancestor readiness distinguishes executed source from a name in canon',()=>{
  assert.equal(classifyAncestorReadiness({id:'a',status:'SOURCE_AND_CONNECTOR_EXECUTION_EVIDENCE_PRESENT'}).readiness,'READY_INTERNAL');
  assert.equal(classifyAncestorReadiness({id:'a',status:'EXISTING_DONORS_PRESENT'}).readiness,'VERIFY_EXISTING');
  assert.equal(classifyAncestorReadiness({id:'a',status:'RESEARCH_PROGRAM'}).readiness,'BUILD_REQUIRED');
  assert.equal(classifyAncestorReadiness({id:'a',status:'EXTERNAL_CAPABILITY_AND_AUTHORITY_DEPENDENT'}).readiness,'EXTERNAL_GATE');
});

test('tree exposes shared missing ancestor instead of pretending moonshots are executable',()=>{
  const tree=compileMoonshotTechnologyTree({
    moonshots:entries,
    ancestorSpine:[
      {id:'a',name:'A',status:'SOURCE_AND_CONNECTOR_EXECUTION_EVIDENCE_PRESENT'},
      {id:'b',name:'B',status:'RESEARCH_PROGRAM'}
    ]
  });
  assert.equal(tree.ok,true);
  assert.equal(tree.stateCounts.BLOCKED_BY_MISSING_SHARED_ANCESTOR,890);
  assert.equal(tree.ancestorFrontier[0].ancestorId,'b');
  assert.equal(tree.ancestorFrontier[0].affectedMoonshotCount,890);
});

test('promoting a shared ancestor changes reachability for every dependent moonshot',()=>{
  const before=compileMoonshotTechnologyTree({
    moonshots:entries,
    ancestorSpine:[
      {id:'a',status:'SOURCE_AND_CONNECTOR_EXECUTION_EVIDENCE_PRESENT'},
      {id:'b',status:'RESEARCH_PROGRAM'}
    ]
  });
  const after=compileMoonshotTechnologyTree({
    moonshots:entries,
    ancestorSpine:[
      {id:'a',status:'SOURCE_AND_CONNECTOR_EXECUTION_EVIDENCE_PRESENT'},
      {id:'b',status:'EVIDENCE_BOUND_DONOR_COMPILER_EXECUTED'}
    ]
  });
  const diff=diffTechnologyTree({before,after});
  assert.equal(diff.ok,true);
  assert.equal(diff.changedMoonshotCount,890);
  assert.equal(after.internalFrontier.length,890);
});

test('verified child evidence does not alter parent truth state',()=>{
  const tree=compileMoonshotTechnologyTree({
    moonshots:entries,
    ancestorSpine:[
      {id:'a',status:'EXECUTED'},{id:'b',status:'EXECUTED'}
    ],
    overlayEntries:{
      'founder-moonshot-0001':{
        parentRealityState:'CONSTRAINT_MAPPED',
        verifiedDescendants:[{id:'child',state:'REPRODUCED'}]
      }
    }
  });
  const one=tree.nodes[0];
  assert.equal(one.parentRealityState,'CONSTRAINT_MAPPED');
  assert.equal(one.verifiedDescendants.length,1);
  assert.equal(one.treeState,'INTERNAL_REALIZATION_FRONTIER_READY');
});

test('external gates remain visible after internal ancestors are ready',()=>{
  const ext=[...entries];
  ext[0]={...ext[0],requiresExternalAuthority:true};
  const tree=compileMoonshotTechnologyTree({
    moonshots:ext,
    ancestorSpine:[{id:'a',status:'EXECUTED'},{id:'b',status:'EXECUTED'}]
  });
  assert.equal(tree.nodes[0].treeState,'INTERNAL_PRECURSORS_READY__EXTERNAL_REALITY_GATE_REMAINS');
  assert.equal(tree.nodes[0].nextAction,'ADVANCE_SIMULATION_FORMALIZATION_AND_MEASUREMENT_UNTIL_EXTERNAL_GATE_IS_JUSTIFIED');
});
