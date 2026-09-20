import test from 'node:test';
import assert from 'node:assert/strict';
import { foldMoonshotEvidence, summarizeMoonshotEvidence } from '../src/moonshot-evidence-propagation.mjs';

const ledger=[{stableId:'founder-moonshot-0001',ordinal:1,literalTitle:'THE CAUSAL COMPILER',realityState:'IMAGINED'}];

test('parent state advances only contiguously',()=>{
  const r=foldMoonshotEvidence({ledgerRows:ledger,events:[
    {eventId:'a',targetType:'MOONSHOT',targetId:'founder-moonshot-0001',eventType:'PARENT_STATE_EVIDENCE',state:'FORMALIZED',evidenceRefs:['doc:a']},
    {eventId:'b',targetType:'MOONSHOT',targetId:'founder-moonshot-0001',eventType:'PARENT_STATE_EVIDENCE',state:'CONSTRAINT_MAPPED',evidenceRefs:['doc:b']}
  ]});
  assert.equal(r.ok,true);
  assert.equal(r.states[0].parentRealityState,'CONSTRAINT_MAPPED');
});

test('child software evidence does not promote the parent',()=>{
  const r=foldMoonshotEvidence({ledgerRows:ledger,events:[
    {eventId:'child',targetType:'MOONSHOT',targetId:'founder-moonshot-0001',eventType:'CHILD_MECHANISM_EVIDENCE',childMechanismId:'x',childState:'SOFTWARE_DEMONSTRATED',evidenceRefs:['experiment:x']}
  ]});
  assert.equal(r.states[0].parentRealityState,'IMAGINED');
  assert.equal(r.states[0].childMechanisms.length,1);
  assert.match(r.law,/NEVER_AUTO_PROMOTE/);
});

test('falsified children remain preserved',()=>{
  const r=foldMoonshotEvidence({ledgerRows:ledger,events:[
    {eventId:'f',targetType:'MOONSHOT',targetId:'founder-moonshot-0001',eventType:'CHILD_MECHANISM_FALSIFIED',childMechanismId:'v1',evidenceRefs:['experiment:v1']}
  ]});
  assert.equal(r.states[0].falsifiedChildren.length,1);
});

test('summary distinguishes parent state from demonstrated descendants',()=>{
  const r=foldMoonshotEvidence({ledgerRows:ledger,events:[
    {eventId:'child',targetType:'MOONSHOT',targetId:'founder-moonshot-0001',eventType:'CHILD_MECHANISM_EVIDENCE',childMechanismId:'x',childState:'SOFTWARE_DEMONSTRATED',evidenceRefs:['experiment:x']}
  ]});
  const s=summarizeMoonshotEvidence({states:r.states});
  assert.equal(s.summary.parentByState.IMAGINED,1);
  assert.equal(s.summary.parentsWithDemonstratedChildren,1);
});
