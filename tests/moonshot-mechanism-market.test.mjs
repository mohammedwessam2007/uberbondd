import test from 'node:test';
import assert from 'node:assert/strict';
import { compileMoonshotMechanismMarket, selectMechanismHypothesisFrontier } from '../src/moonshot-mechanism-market.mjs';

const donor=(id,domain,does,exploits)=>({
  mechanismId:id,domain,does,exploits,
  assumptions:['the declared mechanism applies'],
  evidenceClass:'STRONG_EVIDENCE',
  source:{kind:'MEASURED_RECORD',ref:`experiment:${id}`,observedAt:'2026-09-20T00:00:00.000Z'}
});

test('verified donors compile to primitives but recombinations remain hypotheses',()=>{
  const r=compileMoonshotMechanismMarket({donors:[
    donor('a','causal','compile goals backward','known causal structure prunes search'),
    donor('b','ontology','screen semantic novelty','equivalent behavior can hide behind different names')
  ]});
  assert.equal(r.ok,true);
  assert.ok(r.primitiveCount>=4);
  assert.ok(r.candidateCount>0);
  assert.ok(r.candidates.every(c=>c.status==='HYPOTHESIS'));
  assert.ok(r.candidates.every(c=>c.promotionAuthority==='NONE'));
  assert.match(r.law,/NEVER_INHERIT_VALIDATION/);
});

test('frontier never upgrades hypothesis evidence into proof',()=>{
  const market=compileMoonshotMechanismMarket({donors:[
    donor('a','x','do a','constraint a'),
    donor('b','y','do b','constraint b')
  ]});
  const f=selectMechanismHypothesisFrontier({candidates:market.candidates,limit:5});
  assert.equal(f.ok,true);
  assert.ok(f.candidates.length>0);
  assert.ok(f.candidates.every(c=>c.nextAction==='ATOMIZE_HYPOTHESIS_AND_COMPILE_MINIMUM_REALITY_PROBE'));
  assert.equal(f.executionAuthority,'NONE');
});
