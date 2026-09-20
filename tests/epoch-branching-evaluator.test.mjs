import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateEpochBranchingCandidate,
  compareEpochBranchingCandidates,
  evaluateAncestorAblation
} from '../src/epoch-branching-evaluator.mjs';

const moonshots=Array.from({length:890},(_,i)=>({
  stableId:`founder-moonshot-${String(i+1).padStart(4,'0')}`,
  ordinal:i+1,literalTitle:`IDEA ${i+1}`,
  realizationSurface:i<500?'SOFTWARE':'PHYSICAL',
  ideaKind:i<400?'CAPABILITY_SYSTEM':'RESEARCH_PROGRAM',
  ancestorIds:i<600?['common']:['common','narrow'],
  requiresExternalAuthority:i>=500,
  realityState:'IMAGINED'
}));
const spine=[
  {id:'common',status:'RESEARCH_PROGRAM'},
  {id:'narrow',status:'RESEARCH_PROGRAM'}
];

test('shared ancestor produces larger reachability delta than narrower ancestor',()=>{
  const common=evaluateEpochBranchingCandidate({
    candidateId:'common',moonshots,ancestorSpine:spine,
    ancestorStatusChanges:{common:'SOURCE_IMPLEMENTED_AND_EXECUTED'},evidenceClass:'SIMULATED'
  });
  const narrow=evaluateEpochBranchingCandidate({
    candidateId:'narrow',moonshots,ancestorSpine:spine,
    ancestorStatusChanges:{narrow:'SOURCE_IMPLEMENTED_AND_EXECUTED'},evidenceClass:'SIMULATED'
  });
  assert.equal(common.ok,true);
  assert.equal(narrow.ok,true);
  assert.ok(common.epochBranchingScore>narrow.epochBranchingScore);
});

test('counterfactual evaluation never promotes its candidate',()=>{
  const r=evaluateEpochBranchingCandidate({
    candidateId:'c',moonshots,ancestorSpine:spine,
    ancestorStatusChanges:{common:'SOURCE_IMPLEMENTED_AND_EXECUTED'},evidenceClass:'HYPOTHESIS'
  });
  assert.equal(r.promotionAuthority,'NONE');
  assert.match(r.law,/DOES_NOT_CREATE_EVIDENCE/);
});

test('candidate comparison exposes a pareto set without granting selection authority',()=>{
  const a=evaluateEpochBranchingCandidate({
    candidateId:'a',moonshots,ancestorSpine:spine,
    ancestorStatusChanges:{common:'SOURCE_IMPLEMENTED_AND_EXECUTED'},evidenceClass:'SIMULATED'
  });
  const b=evaluateEpochBranchingCandidate({
    candidateId:'b',moonshots,ancestorSpine:spine,
    ancestorStatusChanges:{narrow:'SOURCE_IMPLEMENTED_AND_EXECUTED'},evidenceClass:'SIMULATED'
  });
  const r=compareEpochBranchingCandidates({candidates:[a,b]});
  assert.equal(r.ok,true);
  assert.equal(r.ranked[0].candidateId,'a');
  assert.equal(r.selectionAuthority,'NONE');
});

test('ablation reports dependency sensitivity rather than causal proof',()=>{
  const ready=spine.map(x=>({...x,status:'SOURCE_IMPLEMENTED_AND_EXECUTED'}));
  const r=evaluateAncestorAblation({ancestorId:'common',moonshots,ancestorSpine:ready});
  assert.equal(r.ok,true);
  assert.ok(r.deltaWhenPresent.internalReady>=0);
  assert.match(r.truthBoundary,/NOT_HISTORICAL_CAUSAL_PROOF/);
});
