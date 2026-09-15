import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOmegaPrivateEvidence } from '../src/omega-private-evidence-gate.mjs';

const pass=(opts={})=>({passed:true,evidenceRefs:['private:receipt'],independent:opts.independent===true,replicated:opts.replicated===true});
function fullSet(){return{semanticCompilation:pass(),sealedHiddenHoldouts:pass({independent:true}),crossFamilyTransfer:pass(),crossDomainTransfer:pass({independent:true}),verifierIndependence:pass({independent:true}),leakageResistance:pass({independent:true}),fullCostAccounting:pass(),robustness:pass(),replication:pass({independent:true,replicated:true}),realitySettlement:pass({independent:true}),compoundingReduction:pass(),metaGeneralization:pass()};}
function e10Set(){return{frontierBreadth:pass({independent:true}),calibratedFailure:pass({independent:true}),evaluatorGapClosed:pass({independent:true})};}

test('all bounded dimensions green cannot reach E10 without frontier-only evidence',()=>{
  const out=evaluateOmegaPrivateEvidence({dimensions:fullSet()});
  assert.equal(out.e10,false);
  assert.equal(out.grade,'E9');
  assert.ok(out.reasonCodes.includes('e10:frontierBreadth:not-passed'));
});

test('E10 requires all twelve dimensions plus independent frontier breadth calibration and evaluator closure',()=>{
  const out=evaluateOmegaPrivateEvidence({dimensions:fullSet(),e10Requirements:e10Set()});
  assert.equal(out.e10,true);
  assert.equal(out.grade,'E10');
  assert.equal(out.score,12);
  assert.equal(out.e10OnlyGreen,true);
});

test('missing an earlier ladder rung prevents later-grade jumping',()=>{
  const dimensions=fullSet();dimensions.semanticCompilation={passed:false,evidenceRefs:[]};
  const out=evaluateOmegaPrivateEvidence({dimensions,e10Requirements:e10Set()});
  assert.equal(out.e10,false);
  assert.equal(out.grade,'E4');
});

test('critical dimensions require independent checking',()=>{
  const dimensions=fullSet();dimensions.leakageResistance.independent=false;
  const out=evaluateOmegaPrivateEvidence({dimensions,e10Requirements:e10Set()});
  assert.equal(out.e10,false);
  assert.ok(out.reasonCodes.includes('leakageResistance:independence-required'));
});

test('replication must be reproduced',()=>{
  const dimensions=fullSet();dimensions.replication.replicated=false;
  const out=evaluateOmegaPrivateEvidence({dimensions,e10Requirements:e10Set()});
  assert.equal(out.e10,false);
  assert.ok(out.reasonCodes.includes('replication:replicated-run-required'));
});
