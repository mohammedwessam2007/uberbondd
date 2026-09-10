import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTerminalSemanticRefusalHandoff } from '../src/terminal-semantic-refusal-handoff.mjs';
import { compileFiniteCompletionDirective } from '../scripts/uberbond-finite-completion-seed.mjs';

const HEAD='a'.repeat(40);
const truth={ok:true,status:'CURRENT_TRUTH_AND_ZERO_ORPHAN_GRAPH_REGENERATED_FOR_EXACT_SOURCE_HEAD',headSha:HEAD};
const semantic={
  ok:false,status:'SEMANTIC_REQUIREMENT_TRIBUNAL_REFUSED',sourceCommit:HEAD,
  invalidContracts:[
    {requirementId:'finite:alpha',reasonCodes:['behavior-test-required:finite:alpha','caller-required:finite:alpha']},
    {requirementId:'structural:constitution',reasonCodes:['structural-rationale-required:structural:constitution']},
    {requirementId:'finite:beta',reasonCodes:['behavior-test-required:finite:beta']},
    {requirementId:'external:customer',reasonCodes:['external-evidence-requirement-required:external:customer']}
  ],
  contracts:[
    {requirementId:'finite:alpha',requirementClass:'FINITE_BEHAVIOR'},
    {requirementId:'structural:constitution',requirementClass:'STRUCTURAL_CONSTITUTION'},
    {requirementId:'finite:beta',requirementClass:'FINITE_BEHAVIOR'},
    {requirementId:'external:customer',requirementClass:'EXTERNAL'}
  ],
  diagnostics:{reasonFamilyHistogram:{'behavior-test-required':2,'caller-required':1,'structural-rationale-required':1,'external-evidence-requirement-required':1}}
};
const graph={ok:true,status:'ZERO_ORPHAN_CANONICAL_EXECUTION_LEAF_GRAPH_COMPILED',sourceCommit:HEAD,counts:{orphanRequirements:0,floatingLeaves:0,dependencyCycles:0,leaves:5}};

test('semantic refusal becomes an exact-head finite repair queue without promoting the tribunal',()=>{
  const out=compileTerminalSemanticRefusalHandoff({truthReceipt:truth,semanticTribunal:semantic,runs:[{script:'scripts/semantic-requirement-tribunal.mjs',exitCode:2}]});
  assert.equal(out.ok,false);
  assert.equal(out.status,'TERMINAL_REALIZATION_REFUSED');
  assert.equal(out.sourceCommit,HEAD);
  assert.deepEqual(out.finiteOpenRequirements,['finite:alpha','finite:beta']);
  assert.equal(out.semanticDiagnostics.invalidContractCount,4);
  assert.equal(out.semanticDiagnostics.finiteInvalidContractCount,2);
  assert.deepEqual(out.semanticDiagnostics.samplesByReasonFamily['behavior-test-required'],['finite:alpha','finite:beta']);
  assert.equal(out.businessEffectAuthority,'NONE');
});

test('structural and external invalid contracts never enter finite repair queue',()=>{
  const out=compileTerminalSemanticRefusalHandoff({truthReceipt:truth,semanticTribunal:semantic});
  assert.equal(out.finiteOpenRequirements.includes('structural:constitution'),false);
  assert.equal(out.finiteOpenRequirements.includes('external:customer'),false);
});

test('stale semantic artifact cannot steer current self-completion',()=>{
  const out=compileTerminalSemanticRefusalHandoff({truthReceipt:truth,semanticTribunal:{...semantic,sourceCommit:'b'.repeat(40)}});
  assert.equal(out.ok,false);
  assert.equal(out.status,'TERMINAL_SEMANTIC_REFUSAL_HANDOFF_REFUSED');
  assert.ok(out.reasonCodes.includes('semantic-refusal-must-bind-exact-current-head'));
});

test('finite completion controller consumes the refusal queue as bounded requirement work',()=>{
  const terminal=compileTerminalSemanticRefusalHandoff({truthReceipt:truth,semanticTribunal:semantic});
  const directive=compileFiniteCompletionDirective({baseRevision:HEAD,terminalRealization:terminal,executionGraph:graph});
  assert.equal(directive.ok,true);
  assert.equal(directive.status,'FINITE_REQUIREMENT_TARGET_READY');
  assert.equal(directive.repairMode,'FINITE_REQUIREMENT');
  assert.equal(directive.targetRequirementId,'finite:alpha');
  assert.equal(directive.finiteOpenRequirementCount,2);
});
