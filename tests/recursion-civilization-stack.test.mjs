import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractRecursionGenome,
  evolveRecursionMechanisms,
  evaluateMetaRecursionDesign,
  governRecursionLoops,
  compileCivilizationControlPlane
} from '../src/recursion-civilization-stack.mjs';

const lineage=(id,independent=true,outcome='SUPPORTED')=>({
  id,trigger:'failure',operator:'mechanism-rewrite',evaluatorClass:'independent-benchmark',
  promotionGate:'review',rollbackClass:'revertible',outcome,independent,evidenceRefs:[`experiment:${id}`]
});

test('recursion genome requires repeated evidence and preserves falsification',()=>{
  const good=extractRecursionGenome({lineages:[lineage('a',false),lineage('b',true)]});
  assert.equal(good.motifs[0].status,'REUSABLE_CANDIDATE');
  const contested=extractRecursionGenome({lineages:[lineage('a',false),lineage('b',true),lineage('c',true,'FALSIFIED')]});
  assert.equal(contested.motifs[0].status,'CONTESTED');
});

test('recursion evolution refuses governance weakening mutations',()=>{
  const genome=extractRecursionGenome({lineages:[lineage('a',false),lineage('b',true)]});
  const r=evolveRecursionMechanisms({motif:genome.motifs[0],mutations:[
    {id:'safe',operator:'CHANGE_SEARCH_POLICY'},
    {id:'bad',operator:'WIDEN_AUTHORITY'}
  ]});
  assert.equal(r.candidates.find(x=>x.id==='safe').status,'HYPOTHESIS');
  assert.equal(r.candidates.find(x=>x.id==='bad').status,'REFUSED');
});

test('meta recursion cannot select design with authority expansion',()=>{
  const r=evaluateMetaRecursionDesign({designs:[
    {id:'powerful',verifiedImprovement:100,replicationStrength:100,searchDiversity:100,rollbackConfidence:100,evaluatorIndependence:100,authorityExpansion:10},
    {id:'bounded',verifiedImprovement:70,replicationStrength:90,searchDiversity:80,rollbackConfidence:95,evaluatorIndependence:95,authorityExpansion:0}
  ]});
  assert.equal(r.selected.id,'bounded');
});

test('recursion governor blocks self-evaluation and authority growth',()=>{
  const r=governRecursionLoops({loops:[
    {id:'loop',gain:90,uncertainty:10,coupling:10,failureRate:.01,authorityDelta:1,independentEvaluator:false,rollbackReady:true,evidenceBound:true}
  ]});
  assert.equal(r.ok,false);
  assert.ok(r.loops[0].reasonCodes.includes('authority-growth'));
  assert.ok(r.loops[0].reasonCodes.includes('independent-evaluator-required'));
});

test('civilization control plane may observe ordinary life but never command it',()=>{
  const r=compileCivilizationControlPlane({systems:[
    {id:'grid',kind:'compute-grid',scope:'CRITICAL_CAPABILITY_SYSTEM',criticality:90,health:40,capability:80},
    {id:'person',kind:'human-life',scope:'ORDINARY_HUMAN_LIFE',criticality:100,health:50,capability:100}
  ]});
  assert.equal(r.ok,true);
  assert.equal(r.systems.find(x=>x.id==='person').commandAuthority,'NONE');
  assert.equal(r.ordinaryLifeCommandAuthority,'NONE');
});
