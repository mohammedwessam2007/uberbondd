import test from 'node:test';
import assert from 'node:assert/strict';
import { atomizeMoonshotLiteralSource, compileInternalMoonshotAtomizationLayer, admitDerivedClaim } from '../src/moonshot-source-atomization.mjs';

test('literal atomization preserves source text and creates no hypothesis',()=>{
  const r=atomizeMoonshotLiteralSource({
    stableId:'founder-moonshot-0880',ordinal:880,literalTitle:'THE RECURSION GENOME',
    literalBodyMarkdown:'Extract reusable recursion motifs.',realizationSurface:'SOFTWARE',ideaKind:'CAPABILITY_SYSTEM'
  });
  assert.equal(r.ok,true);
  assert.equal(r.sourceAtoms[0].literal,'Extract reusable recursion motifs.');
  assert.equal(r.derivedHypothesis,null);
  assert.equal(r.derivedClaimState,'NOT_YET_DERIVED');
});

test('derived claim admission requires source binding and a real falsification contract',()=>{
  const a=atomizeMoonshotLiteralSource({
    stableId:'x',ordinal:1,literalTitle:'X',literalBodyMarkdown:'Build a deterministic compiler.',
    realizationSurface:'SOFTWARE',ideaKind:'CAPABILITY_SYSTEM'
  });
  const bad=admitDerivedClaim({atomization:a,claimId:'c',statement:'works'});
  assert.equal(bad.ok,false);
  const good=admitDerivedClaim({
    atomization:a,claimId:'c',statement:'The compiler preserves output semantics.',
    sourceAtomIds:['source-atom-001'],assumptions:['finite fixture domain'],
    rivalHypothesis:'The compiler changes output semantics.',
    falsifier:'Any held-out fixture changes output.',
    baseline:'uncompiled implementation',measurement:'exact output equality',
    heldOutOrCounterexample:'unseen fixture set'
  });
  assert.equal(good.ok,true);
  assert.equal(good.evidenceState,'HYPOTHESIS');
  assert.equal(good.promotionAuthority,'NONE');
});

test('all internal programs can be source-atomized without automatic derived claims',()=>{
  const literals=Array.from({length:890},(_,i)=>({
    ordinal:i+1,literalTitle:'IDEA '+(i+1),literalBodyMarkdown:'Build mechanism '+(i+1)+'.'
  }));
  const programs=Array.from({length:890},(_,i)=>({
    stableId:'founder-moonshot-'+String(i+1).padStart(4,'0'),ordinal:i+1,
    frontierClass:i<193?'INTERNAL_EXECUTION':'EXTERNAL_REALITY',
    realizationSurface:i<193?'SOFTWARE':'PHYSICAL',ideaKind:'CAPABILITY_SYSTEM'
  }));
  const r=compileInternalMoonshotAtomizationLayer({literalEntries:literals,executionPrograms:programs});
  assert.equal(r.ok,true);
  assert.equal(r.atomizedCount,193);
  assert.equal(r.derivedClaimCount,0);
  assert.ok(r.packets.every(p=>p.derivedHypothesis===null));
});
