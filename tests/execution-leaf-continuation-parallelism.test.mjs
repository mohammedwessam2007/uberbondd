import test from 'node:test';
import assert from 'node:assert/strict';
import { compileExecutionLeafGraph } from '../src/execution-leaf-graph.mjs';
import { compileExecutionLeafContinuation } from '../src/execution-leaf-continuation.mjs';

const HEAD='a'.repeat(40);
const leaf=id=>({leafId:id,kind:'VERIFICATION',requirementIds:[id],exactScope:[`src/${id}.mjs`],predecessors:[],verifierLeafIds:[],parallelConflictSet:[],inputEvidence:['coverage://exact-head'],implementationAcceptance:'Verify.',hostileFalsifiers:['tamper'],mutationRequirement:'NONE',persistenceRequirement:'NONE',restartRecoveryRequirement:'NONE',runtimeRequirement:'NONE',externalEvidenceRequirement:'NONE',authorityRequired:[],authorityExplicitlyNotGranted:['BUSINESS_EFFECT_AUTHORITY'],verifierIndependence:'Independent.',rollback:'Restore exact source.',claimExpiry:'ON_SOURCE_CHANGE',alternateRoutes:['reuse'],blockerFingerprint:id,terminalEvidenceClass:'SOURCE_AND_TEST_RECEIPT',executorClass:'INDEPENDENT_VERIFIER'});
const requirement=id=>({id,canonicalSource:`canon://${id}`,disposition:'OWNED_INTERNAL',executionLeafIds:[id],terminalEvidenceClass:'SOURCE_AND_TEST_RECEIPT'});
function graph(){const leaves=[leaf('A'),leaf('B')];return compileExecutionLeafGraph({sourceCommit:HEAD,requirements:leaves.map(row=>requirement(row.leafId)),leaves});}

test('continuation accepts the current canonical graph digest including parallelism proof',()=>{
 const g=graph();assert.equal(g.ok,true,JSON.stringify(g));assert.equal(g.parallelismProof.provenExact,true);
 const out=compileExecutionLeafContinuation({graph:g});assert.equal(out.ok,true,JSON.stringify(out));assert.deepEqual(out.state.runnableLeafIds,['A','B']);
});

test('parallelism-proof mutation invalidates continuation graph identity',()=>{
 const g=graph();const forged=structuredClone(g);forged.parallelismProof.upperBound=999;
 const out=compileExecutionLeafContinuation({graph:forged});assert.equal(out.ok,false);assert.ok(out.reasonCodes.includes('valid-untampered-canonical-execution-leaf-graph-required'));
});

test('continuation still grants no business or external-effect authority',()=>{
 const out=compileExecutionLeafContinuation({graph:graph()});assert.equal(out.businessEffectAuthority,'NONE');assert.equal(out.externalEffectLedger.providerCalls,0);assert.equal(out.resourceLaw.quotaEvasionAllowed,false);
});
