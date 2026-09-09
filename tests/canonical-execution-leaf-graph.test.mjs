import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCoverageBoundExecutionLeafGraph } from '../src/canonical-execution-leaf-graph.mjs';

const HEAD='a'.repeat(40);
const leaf=(leafId,kind,requirementIds,over={})=>({
  leafId,kind,requirementIds,exactScope:[`src/${leafId}.mjs`],predecessors:[],verifierLeafIds:[],parallelConflictSet:[],
  implementationAcceptance:`accept ${leafId}`,verifierIndependence:'independent verifier/evidence writer',rollback:'restore prior source',
  alternateRoutes:['verified reuse'],terminalEvidenceClass:'SOURCE_RECEIPT',executorClass:'worker',...over
});
function valid(){
  const coverage={ok:true,status:'COVERAGE_MATRIX_COMPILED',sourceCommit:HEAD,counts:{rows:2,extractedConcepts:2,byState:{VERIFIED_CURRENT:1,SPEC_ONLY:1}},rows:[{canonicalId:'TOTAL-1',currentState:'VERIFIED_CURRENT'},{canonicalId:'TOTAL-2',currentState:'SPEC_ONLY'}]};
  const requirements=[
    {id:'TOTAL-1',canonicalSource:'canon://TOTAL-1',disposition:'OWNED_INTERNAL',executionLeafIds:['I','V'],terminalEvidenceClass:'VERIFIED_SOURCE'},
    {id:'TOTAL-2',canonicalSource:'canon://TOTAL-2',disposition:'OWNED_EXTERNAL',executionLeafIds:['B'],terminalEvidenceClass:'EXTERNAL_EVIDENCE'}
  ];
  const leaves=[leaf('I','IMPLEMENTATION',['TOTAL-1'],{verifierLeafIds:['V']}),leaf('V','VERIFICATION',['TOTAL-1'],{predecessors:['I']}),leaf('B','BOUNDARY',['TOTAL-2'])];
  return {coverage,requirements,leaves};
}

test('canonical wrapper proves exact denominator binding plus zero orphan graph',()=>{
  const out=compileCoverageBoundExecutionLeafGraph(valid());
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(out.status,'ZERO_ORPHAN_CANONICAL_EXECUTION_LEAF_GRAPH_COMPILED');
  assert.equal(out.canonicalBinding.coverageRows,2);
  assert.equal(out.canonicalBinding.extractedConcepts,2);
  assert.deepEqual(out.canonicalBinding.coverageStates,{SPEC_ONLY:1,VERIFIED_CURRENT:1});
  assert.deepEqual(out.canonicalBinding.canonicalRequirementIds,['TOTAL-1','TOTAL-2']);
  assert.equal(out.denominatorConservation.exact,true);
  assert.equal(out.counts.orphanRequirements,0);
  assert.equal(out.businessEffectAuthority,'NONE');
});

test('omitting a canonical requirement is impossible to call zero orphan',()=>{
  const x=valid();x.requirements=x.requirements.filter(row=>row.id!=='TOTAL-2');x.leaves=x.leaves.filter(row=>!row.requirementIds.includes('TOTAL-2'));
  const out=compileCoverageBoundExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('canonical-requirements-missing-from-execution-graph'));assert.deepEqual(out.missingRequirements,['TOTAL-2']);
});

test('inventing a noncanonical requirement also fails',()=>{
  const x=valid();x.requirements.push({id:'COOL-NEW-THING',canonicalSource:'nowhere',disposition:'OWNED_INTERNAL',executionLeafIds:[],terminalEvidenceClass:'NONE'});
  const out=compileCoverageBoundExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('execution-graph-contains-noncanonical-requirements'));assert.deepEqual(out.extraRequirements,['COOL-NEW-THING']);
});

test('coverage row count must equal actual materialized rows',()=>{
  const x=valid();x.coverage.counts.rows=999;
  const out=compileCoverageBoundExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('coverage-materialized-rows-must-match-denominator'));
});

test('extracted concept count cannot exceed or shrink below materialized rows',()=>{
  const x=valid();x.coverage.counts.extractedConcepts=3;
  const out=compileCoverageBoundExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('coverage-extracted-concepts-must-match-materialized-rows'));
});

test('declared state histogram must equal row-derived histogram exactly',()=>{
  const x=valid();x.coverage.counts.byState={VERIFIED_CURRENT:2};
  const out=compileCoverageBoundExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('coverage-state-counts-must-exactly-match-materialized-rows'));
});

test('unknown row state cannot enter the finite canonical denominator',()=>{
  const x=valid();x.coverage.rows[0].currentState='TOTALLY_DONE_TRUST_ME';x.coverage.counts.byState={TOTALLY_DONE_TRUST_ME:1,SPEC_ONLY:1};
  const out=compileCoverageBoundExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('coverage-row-state-must-be-canonical'));
});

test('duplicate canonical ids fail instead of shrinking the denominator through Set dedupe',()=>{
  const x=valid();x.coverage.rows[1].canonicalId='TOTAL-1';
  const out=compileCoverageBoundExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('coverage-canonical-ids-must-be-unique'));
});

test('coverage without exact source commit cannot own an execution graph',()=>{
  const x=valid();x.coverage.sourceCommit='main';
  const out=compileCoverageBoundExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('coverage-exact-source-commit-required'));
});

test('a caller cannot pass an arbitrary object that merely contains rows',()=>{
  const x=valid();x.coverage.ok=false;x.coverage.status='HAND_WRITTEN';
  const out=compileCoverageBoundExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('canonical-compiled-sovereign-coverage-required'));
});

test('exact denominator does not rescue an invalid leaf graph',()=>{
  const x=valid();x.leaves[0].verifierLeafIds=[];
  const out=compileCoverageBoundExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('execution-leaf-graph-invalid'));assert.ok(out.graphFailure.reasonCodes.includes('independent-verifier-leaf-required:I'));
});
