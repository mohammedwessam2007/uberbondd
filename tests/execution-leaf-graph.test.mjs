import test from 'node:test';
import assert from 'node:assert/strict';
import { compileExecutionLeafGraph, requirementsFromCoverageRows } from '../src/execution-leaf-graph.mjs';

const HEAD='a'.repeat(40);
const baseLeaf=(leafId,kind,requirementIds,over={})=>({
  leafId,kind,requirementIds,
  exactScope:[`src/${leafId}.mjs`],
  predecessors:[],
  verifierLeafIds:[],
  parallelConflictSet:[],
  inputEvidence:['coverage://exact-head'],
  implementationAcceptance:`Acceptance for ${leafId}`,
  hostileFalsifiers:['counterexample-required'],
  mutationRequirement:'Mutate one critical guard when applicable.',
  persistenceRequirement:'Persist identity when stateful; NONE with evidence when stateless.',
  restartRecoveryRequirement:'Exercise restart when stateful; NONE with evidence when stateless.',
  runtimeRequirement:'Exact source execution required before runtime credit.',
  externalEvidenceRequirement:'External proof stays external.',
  authorityRequired:[],
  authorityExplicitlyNotGranted:['BUSINESS_EFFECT_AUTHORITY'],
  verifierIndependence:'Verifier must be independent from the implementation producer and evidence writer.',
  rollback:'Restore prior exact source revision.',
  alternateRoutes:['verified-reuse-or-independent-implementation'],
  blockerFingerprint:`blocker:${leafId}`,
  terminalEvidenceClass:'SOURCE_AND_TEST_RECEIPT',
  executorClass:'CHEAPEST_CAPABLE_AUTHORIZED_WORKER',
  ...over
});

function valid(){
  const requirements=[
    {id:'REQ-1',canonicalSource:'canon://REQ-1',disposition:'OWNED_INTERNAL',executionLeafIds:['I1','V1'],terminalEvidenceClass:'VERIFIED_SOURCE'},
    {id:'REQ-2',canonicalSource:'canon://REQ-2',disposition:'OWNED_EXTERNAL',executionLeafIds:['B1'],terminalEvidenceClass:'EXTERNAL_PROVIDER_EVIDENCE'},
    {id:'REQ-3',canonicalSource:'canon://REQ-3',disposition:'OPEN_ENDED_FRONTIER',executionLeafIds:['B2'],terminalEvidenceClass:'ONGOING_RESEARCH_EVIDENCE'}
  ];
  const leaves=[
    baseLeaf('I1','IMPLEMENTATION',['REQ-1'],{verifierLeafIds:['V1']}),
    baseLeaf('V1','VERIFICATION',['REQ-1'],{predecessors:['I1'],terminalEvidenceClass:'INDEPENDENT_VERIFICATION_RECEIPT',executorClass:'INDEPENDENT_VERIFIER'}),
    baseLeaf('B1','BOUNDARY',['REQ-2'],{terminalEvidenceClass:'EXTERNAL_PROVIDER_EVIDENCE',implementationAcceptance:'Record the exact external provider evidence gate without fabricating it.'}),
    baseLeaf('B2','BOUNDARY',['REQ-3'],{terminalEvidenceClass:'ONGOING_RESEARCH_EVIDENCE',implementationAcceptance:'Keep the frontier explicit and nonterminal.'})
  ];
  return {sourceCommit:HEAD,requirements,leaves};
}

test('valid graph proves zero orphan and zero floating work without claiming execution',()=>{
  const out=compileExecutionLeafGraph(valid());
  assert.equal(out.ok,true);
  assert.equal(out.status,'ZERO_ORPHAN_EXECUTION_LEAF_GRAPH_COMPILED');
  assert.deepEqual(out.counts,{requirements:3,leaves:4,dependencyEdges:1,orphanRequirements:0,floatingLeaves:0,dependencyCycles:0});
  assert.deepEqual(out.criticalPath,['I1','V1']);
  assert.equal(out.maxSafeParallelWidth,3);
  assert.equal(out.businessEffectAuthority,'NONE');
  assert.match(out.truthBoundary,/DOES_NOT MEAN THE LEAVES ARE IMPLEMENTED/);
});

test('orphan requirement is explicit instead of silently dropped',()=>{
  const x=valid();x.requirements[1].executionLeafIds=[];
  const out=compileExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('orphan-requirement:REQ-2'));assert.deepEqual(out.orphanRequirements,['REQ-2']);
});

test('floating execution leaf is rejected',()=>{
  const x=valid();x.leaves[2].requirementIds=[];
  const out=compileExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('floating-execution-leaf:B1'));assert.deepEqual(out.floatingLeaves,['B1']);
});

test('requirement and leaf bindings must be reciprocal',()=>{
  const x=valid();x.requirements[0].executionLeafIds=['I1'];
  const out=compileExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('requirement-leaf-binding-not-reciprocal:REQ-1<->V1'));
});

test('missing dependency fails closed',()=>{
  const x=valid();x.leaves[0].predecessors=['NOPE'];
  const out=compileExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('missing-predecessor:I1->NOPE'));
});

test('dependency cycles are surfaced with exact leaf ids',()=>{
  const x=valid();x.leaves[0].predecessors=['V1'];
  const out=compileExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('execution-leaf-dependency-cycle'));assert.deepEqual(out.cycleLeafIds.sort(),['I1','V1']);
});

test('implementation requires an explicit independent verifier leaf',()=>{
  const x=valid();x.leaves[0].verifierLeafIds=[];
  const out=compileExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('independent-verifier-leaf-required:I1'));
});

test('a named verifier must actually be a verification leaf',()=>{
  const x=valid();x.leaves[1].kind='BOUNDARY';
  const out=compileExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('verifier-leaf-must-have-verification-kind:I1->V1'));
});

test('verifier must be causally downstream of the subject leaf',()=>{
  const x=valid();x.leaves[1].predecessors=[];
  const out=compileExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('verifier-must-depend-on-subject-leaf:V1->I1'));
});

test('parallel conflicts must be symmetric',()=>{
  const x=valid();x.leaves[2].parallelConflictSet=['B2'];
  const out=compileExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('parallel-conflict-must-be-symmetric:B1<->B2'));
});

test('symmetric conflicts reduce safe parallel width without inventing elapsed duration',()=>{
  const x=valid();x.leaves[2].parallelConflictSet=['B2'];x.leaves[3].parallelConflictSet=['B1'];
  const out=compileExecutionLeafGraph(x);
  assert.equal(out.ok,true);assert.equal(out.maxSafeParallelWidth,2);assert.equal(out.dependencyDepth,2);
});

test('superseded requirement requires proof rather than a label',()=>{
  const x=valid();x.requirements[2].disposition='SUPERSEDED_WITH_PROOF';
  const out=compileExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('supersession-proof-required:REQ-3'));
  x.requirements[2].statusEvidenceRef='merge://replacement';
  assert.equal(compileExecutionLeafGraph(x).ok,true);
});

test('unknown disposition cannot hide an unfinished requirement',()=>{
  const x=valid();x.requirements[1].disposition='MISC';
  const out=compileExecutionLeafGraph(x);
  assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('recognized-requirement-disposition-required:REQ-2'));
});

test('invalid source commit refuses the graph',()=>{
  const out=compileExecutionLeafGraph({...valid(),sourceCommit:'main'});
  assert.equal(out.ok,false);assert.deepEqual(out.reasonCodes,['valid-source-commit-required']);
});

test('coverage-row adapter never auto-invents ownership',()=>{
  const requirements=requirementsFromCoverageRows([{canonicalId:'TOTAL-1',sourceRef:'canon://TOTAL-1'}],{});
  assert.equal(requirements[0].id,'TOTAL-1');
  assert.equal(requirements[0].disposition,null);
  assert.deepEqual(requirements[0].executionLeafIds,[]);
  const out=compileExecutionLeafGraph({sourceCommit:HEAD,requirements,leaves:[baseLeaf('B','BOUNDARY',['TOTAL-1'])]});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('recognized-requirement-disposition-required:TOTAL-1'));
  assert.ok(out.reasonCodes.includes('orphan-requirement:TOTAL-1'));
});
