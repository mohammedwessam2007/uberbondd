import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFiniteClosureTribunal } from '../src/finite-closure-tribunal.mjs';
import { recomputeExecutionLeafGraphDigest } from '../src/execution-leaf-graph-receipt-digest.mjs';

const HEAD='a'.repeat(40);const D='sha256:'+'b'.repeat(64);
function graph(ids=['finite:a','frontier:b']){
  const g={ok:true,status:'ZERO_ORPHAN_CANONICAL_EXECUTION_LEAF_GRAPH_COMPILED',sourceCommit:HEAD,requirements:ids.map(id=>({id})),leaves:[],topologicalWaves:[],criticalPath:[],counts:{requirements:ids.length,orphanRequirements:0,floatingLeaves:0,dependencyCycles:0}};
  g.graphDigest=recomputeExecutionLeafGraphDigest(g);return g;
}
function fixture(){
  return{
    truthReceipt:{ok:true,status:'CURRENT_TRUTH_AND_ZERO_ORPHAN_GRAPH_REGENERATED_FOR_EXACT_SOURCE_HEAD',headSha:HEAD},
    semanticTribunal:{ok:true,status:'SEMANTIC_ZERO_ORPHAN_REQUIREMENTS_VERIFIED',sourceCommit:HEAD,receiptDigest:D,requirements:[
      {requirementId:'finite:a',requirementClass:'FINITE_BEHAVIOR',currentState:'VERIFIED_CURRENT',sourceRefs:['src/a.mjs'],testRefs:['tests/a.test.mjs']},
      {requirementId:'frontier:b',requirementClass:'OPEN_ENDED_FRONTIER',currentState:'SPEC_ONLY',sourceRefs:[],testRefs:[]}
    ]},
    executionGraph:graph(),
    continuationProof:{ok:true,status:'EXECUTION_LEAF_CONTINUATION_RESUME_READY'},
    sinkAuthorityReport:{ok:true,status:'ALL_DECLARED_EFFECT_SINKS_AUTHORITY_BOUND',receiptDigest:D},
    recursiveGovernanceReport:{ok:true,status:'RECURSIVE_GOVERNANCE_PRINCIPAL_CONTROL_VERIFIED',receiptDigest:D},
    cutSetReport:{ok:true,status:'SOVEREIGN_CUT_SET_AUDIT_CURRENT',receiptDigest:D,unresolvedInternalCuts:[]},
    namedRuntimeStatus:'NOT_MEASURED',observedAutonomyStatus:'ELAPSED_EVIDENCE_PENDING',externalCommercialStatus:'NO_REAL_CUSTOMERS_OR_CLEARED_REVENUE',personalRealityStatus:'LONGITUDINAL_EVIDENCE_PENDING',asiEvidenceStatus:'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED',openEndedFrontierStatus:'OPEN'
  };
}

test('finite engineering may reach 100 while runtime commercial life ASI and frontier remain separate',()=>{const out=compileFiniteClosureTribunal(fixture());assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.status,'FINITE_REALIZATION_TRIBUNAL_PASSED_WITH_SEPARATE_REALITY_BOUNDARIES');assert.equal(out.separatedStatus.FINITE_ENGINEERING_CLOSURE,'100_PERCENT_OF_DECLARED_FINITE_ENGINEERING_SCOPE');assert.equal(out.separatedStatus.NAMED_RUNTIME_STATUS,'NOT_MEASURED');assert.equal(out.separatedStatus.EXTERNAL_COMMERCIAL_STATUS,'NO_REAL_CUSTOMERS_OR_CLEARED_REVENUE');assert.equal(out.separatedStatus.ASI_EVIDENCE_STATUS,'SYSTEM_LEVEL_ASI_NOT_ESTABLISHED');assert.equal(out.separatedStatus.OPEN_ENDED_FRONTIER_STATUS,'OPEN');assert.equal(Object.hasOwn(out,'overallPercent'),false);assert.equal(Object.hasOwn(out,'globalCompletion'),false);});
test('one finite semantic requirement below verified/enforced reopens closure',()=>{const x=fixture();x.semanticTribunal.requirements[0].currentState='PARTIAL_CURRENT';const out=compileFiniteClosureTribunal(x);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('finite-behavior-requirements-not-source-closed'));assert.equal(out.separatedStatus.FINITE_ENGINEERING_CLOSURE,'INCOMPLETE');});
test('open-ended frontier SPEC_ONLY never enters finite denominator',()=>{const out=compileFiniteClosureTribunal(fixture());assert.equal(out.finiteRequirements,1);assert.equal(out.semanticRequirements,2);assert.deepEqual(out.finiteOpenRequirements,[]);});
test('semantic and execution graph must cover exactly the same canonical identities',()=>{const x=fixture();x.executionGraph=graph(['finite:a']);const out=compileFiniteClosureTribunal(x);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('semantic-and-execution-denominators-must-be-reciprocal'));assert.deepEqual(out.semanticMissingFromGraph,['frontier:b']);});
test('tampered graph digest blocks terminal closure',()=>{const x=fixture();x.executionGraph.graphDigest='0'.repeat(64);const out=compileFiniteClosureTribunal(x);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('execution-graph-integrity-required'));});
test('missing sink authority proof blocks closure even when every requirement is green',()=>{const x=fixture();x.sinkAuthorityReport={ok:false,status:'NOPE'};const out=compileFiniteClosureTribunal(x);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('all-effect-sinks-must-enforce-exact-composed-authority'));});
test('principal-level recursive governance is load-bearing at terminal join',()=>{const x=fixture();x.recursiveGovernanceReport={ok:false};const out=compileFiniteClosureTribunal(x);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('principal-level-recursive-governance-proof-required'));});
test('an unresolved internally solvable cut forbids 100 but external/runtime cuts do not masquerade as internal',()=>{const x=fixture();x.cutSetReport={...x.cutSetReport,unresolvedInternalCuts:['WORKER_SCHEDULER_PROCESS'],runtimeProofRequiredCuts:['WEB_RUNTIME_HOST'],externalProviderCuts:['PAYMENT_PROVIDER']};let out=compileFiniteClosureTribunal(x);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('unresolved-internal-single-point-failures-remain'));x.cutSetReport={...x.cutSetReport,unresolvedInternalCuts:[],runtimeProofRequiredCuts:['WEB_RUNTIME_HOST'],externalProviderCuts:['PAYMENT_PROVIDER']};out=compileFiniteClosureTribunal(x);assert.equal(out.ok,true,JSON.stringify(out));});
test('continuation composition proof is required so a graph nobody can resume cannot close',()=>{const x=fixture();x.continuationProof={ok:false,status:'BLOCKED'};const out=compileFiniteClosureTribunal(x);assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('canonical-graph-continuation-composition-proof-required'));});
