import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSandwichDescendantAdmission } from '../src/sandwich-descendant-admission.mjs';

const HEAD='a'.repeat(40);
const before={
  schemaVersion:'test',
  canonicalDefinition:'existing goal universe',
  terminalTriad:['Mohamed provides will','UberBond provides intelligence','Reality provides feedback'],
  canonicalHierarchy:['SOVEREIGN_COGNITIVE_CONTINUUM'],
  terminalConcepts:['Living Mohamed Model','GENESIS','Wallbreaker'],
  containedPersonalCivilizationSystems:['Life Knowledge Graph'],
  supportingEconomicAndTechnicalDonors:['Capability Genome'],
  hardBoundaries:['Capability never creates authority']
};
const candidate={
  name:'Representation Escape Compiler',
  foldClass:'INTERNAL_SOURCE',
  canonicalGoalRefs:['GENESIS','Wallbreaker'],
  dependencies:[],
  acceptanceEvidence:['SOURCE: a bounded compiler emits alternate problem representations','TEST: hostile test proves duplicate or authority-widening representations are refused'],
  rationale:'A reusable representation-search primitive expands problem-solving leverage across already-canonical GENESIS and Wallbreaker.'
};

test('trusted admission appends exactly one structured missing requirement',()=>{
  const out=compileSandwichDescendantAdmission({beforeDocument:before,candidate,baseRevision:HEAD});
  assert.equal(out.ok,true);
  assert.equal(out.appendedCount,1);
  assert.equal(out.afterDocument.terminalConcepts.length,before.terminalConcepts.length+1);
  assert.deepEqual(out.afterDocument.terminalConcepts.slice(0,-1),before.terminalConcepts);
  assert.deepEqual({...out.afterDocument,terminalConcepts:before.terminalConcepts},before);
  assert.equal(out.entry.admittedFromBaseRevision,HEAD);
  assert.equal(out.entry.implementationStatus,'MISSING');
  assert.equal(out.entry.implementationForbiddenInAdmission,true);
  assert.equal(out.entry.businessEffectAuthority,'NONE');
  assert.equal(out.entry.externalEffectAuthority,'NONE');
  assert.match(out.canonicalId,/^total-north-star:/);
});

test('new descendant must cite existing canonical goals rather than inventing founder preferences',()=>{
  const out=compileSandwichDescendantAdmission({beforeDocument:before,candidate:{...candidate,canonicalGoalRefs:['Win arbitrary prize']},baseRevision:HEAD});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.some(code=>code.startsWith('noncanonical-goal-ref:')));
});

test('dependency-bearing and duplicate gaps are refused at genesis',()=>{
  assert.equal(compileSandwichDescendantAdmission({beforeDocument:before,candidate:{...candidate,dependencies:['missing-x']},baseRevision:HEAD}).ok,false);
  assert.equal(compileSandwichDescendantAdmission({beforeDocument:before,candidate:{...candidate,name:'GENESIS'},baseRevision:HEAD}).ok,false);
});

test('admission requires both source and hostile-test evidence contracts',()=>{
  const onlySource=compileSandwichDescendantAdmission({beforeDocument:before,candidate:{...candidate,acceptanceEvidence:['SOURCE: exists','SOURCE: also exists']},baseRevision:HEAD});
  assert.equal(onlySource.ok,false);
  assert.ok(onlySource.reasonCodes.includes('test-acceptance-clause-required'));
});

test('only internal source or research folds may become autonomous descendant requirements',()=>{
  const out=compileSandwichDescendantAdmission({beforeDocument:before,candidate:{...candidate,foldClass:'EXTERNAL_PROVIDER'},baseRevision:HEAD});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('internal-fold-class-required'));
});
