import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMoonshotRealizationLedger,
  buildSharedAncestorDemand,
  selectInternalRealizationFrontier,
  triageFounderMoonshot
} from '../src/moonshot-realization-factory.mjs';

const entry=(ordinal,title,body)=>({
  ordinal,
  literalTitle:title,
  hypotheticalIq:'fictional',
  literalBodyMarkdown:body,
  sourceLineStart:ordinal*4,
  sourceLineEnd:ordinal*4+3
});

test('triage routes software ideas internally without claiming feasibility',()=>{
  const r=triageFounderMoonshot(entry(1,'THE CAUSAL COMPILER','Compile desired computational outcomes into causal intervention programs and test them in simulation.'));
  assert.equal(r.ok,true);
  assert.equal(r.moonshot.realityState,'IMAGINED');
  assert.equal(r.moonshot.executionAuthority,'NONE');
  assert.match(r.moonshot.truthBoundary,/NOT_FEASIBILITY_EVIDENCE/);
  assert.ok(r.moonshot.ancestorIds.includes('experiment-compiler'));
});

test('physical and biological ideas keep external authority gates',()=>{
  const p=triageFounderMoonshot(entry(2,'PROGRAMMABLE MATTER','Create physical materials that reconfigure molecular structure.'));
  assert.equal(p.ok,true);
  assert.equal(p.moonshot.requiresExternalAuthority,true);
  assert.match(p.moonshot.nextAction,/SIMULATE/);
});

test('doctrine becomes a machine-checkable invariant route',()=>{
  const d=triageFounderMoonshot(entry(3,'THE CIVILIZATIONAL INVARIANT','No amount of capability growth is progress if it destroys valuable future choice.'));
  assert.equal(d.moonshot.ideaKind,'DOCTRINE_OR_INVARIANT');
  assert.equal(d.moonshot.implementationMode,'POLICY_OR_INVARIANT_TEST');
});

test('ledger refuses partial corpora instead of pretending all ideas are routed',()=>{
  const r=buildMoonshotRealizationLedger({entries:[entry(1,'x','software compiler')]});
  assert.equal(r.ok,false);
  assert.ok(r.reasonCodes.includes('exact-890-entry-corpus-required'));
});

test('ledger gives every one of 890 source entries a unique route',()=>{
  const entries=Array.from({length:890},(_,i)=>entry(i+1,`IDEA ${i+1}`,i%2===0?'software algorithm compiler':'physical biological experiment'));
  const r=buildMoonshotRealizationLedger({entries});
  assert.equal(r.ok,true);
  assert.equal(r.triagedCount,890);
  assert.equal(new Set(r.rows.map(x=>x.stableId)).size,890);
  assert.equal(r.counts.internalFirst+r.counts.externalAuthorityRequired,890);
});

test('shared ancestor demand counts routed moonshots without calling the relationship causal proof',()=>{
  const rows=[
    triageFounderMoonshot(entry(1,'A','software compiler')).moonshot,
    triageFounderMoonshot(entry(2,'B','software algorithm')).moonshot
  ];
  const r=buildSharedAncestorDemand({rows,ancestorSpine:[
    {id:'experiment-compiler',name:'Experiment Compiler',status:'SOURCE_PARTIAL'}
  ]});
  assert.equal(r.ok,true);
  assert.ok(r.ancestors.some(x=>x.ancestorId==='experiment-compiler'&&x.moonshotCount===2));
  assert.match(r.law,/NOT_CAUSAL_NECESSITY/);
});

test('frontier admits only reversible internal-first ideas',()=>{
  const rows=[
    triageFounderMoonshot(entry(1,'SOFTWARE','software algorithm compiler')).moonshot,
    triageFounderMoonshot(entry(2,'MATTER','physical matter actuator')).moonshot
  ];
  const r=selectInternalRealizationFrontier({rows,limit:10});
  assert.equal(r.ok,true);
  assert.equal(r.candidates.length,1);
  assert.equal(r.candidates[0].stableId,'founder-moonshot-0001');
  assert.equal(r.executionAuthority,'NONE');
});
