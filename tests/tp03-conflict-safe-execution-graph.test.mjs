import test from 'node:test';
import assert from 'node:assert/strict';
import { compileExecutionLeafGraph } from '../src/execution-leaf-graph.mjs';
import { deriveConservativeParallelConflicts } from '../src/canonical-execution-leaf-materializer.mjs';
import { recomputeExecutionLeafGraphDigest } from '../src/execution-leaf-graph-receipt-digest.mjs';

const HEAD='a'.repeat(40);
const baseLeaf=(leafId,kind='VERIFICATION',scope=[`src/${leafId}.mjs`],over={})=>({
  leafId,kind,requirementIds:[leafId],exactScope:scope,predecessors:[],verifierLeafIds:[],parallelConflictSet:[],inputEvidence:['coverage://exact-head'],implementationAcceptance:`Acceptance for ${leafId}`,hostileFalsifiers:['counterexample-required'],mutationRequirement:'Mutate critical guards when applicable.',persistenceRequirement:'NONE when stateless.',restartRecoveryRequirement:'NONE when stateless.',runtimeRequirement:'Exact source execution required before runtime credit.',externalEvidenceRequirement:'External proof stays external.',authorityRequired:[],authorityExplicitlyNotGranted:['BUSINESS_EFFECT_AUTHORITY'],verifierIndependence:'Independent verifier required.',rollback:'Restore exact prior source revision.',claimExpiry:'ON_SOURCE_OR_EVIDENCE_CHANGE',alternateRoutes:['verified-reuse'],blockerFingerprint:`blocker:${leafId}`,terminalEvidenceClass:'SOURCE_AND_TEST_RECEIPT',executorClass:'AUTHORIZED_WORKER',...over
});
const requirement=id=>({id,canonicalSource:`canon://${id}`,disposition:'OWNED_INTERNAL',executionLeafIds:[id],terminalEvidenceClass:'VERIFIED_SOURCE'});

function graph(leaves){return compileExecutionLeafGraph({sourceCommit:HEAD,requirements:leaves.map(row=>requirement(row.leafId)),leaves});}

test('conflictless width is proven exactly with a concrete witness',()=>{
  const out=graph([baseLeaf('A'),baseLeaf('B'),baseLeaf('C')]);
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(out.maxSafeParallelWidth,3);
  assert.equal(out.safeParallelWidthLowerBound,3);
  assert.equal(out.safeParallelWidthUpperBound,3);
  assert.equal(out.safeParallelWidthProvenExact,true);
  assert.deepEqual(out.parallelismProof.conflictFreeWitness,['A','B','C']);
});

test('greedy independent set is never mislabeled maximum when bounds do not meet',()=>{
  const leaves=['A','B','C','D'].map(id=>baseLeaf(id));
  const edges={A:['B','C','D'],B:['A'],C:['A'],D:['A']};
  for(const leaf of leaves)leaf.parallelConflictSet=edges[leaf.leafId];
  const out=graph(leaves);
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(out.safeParallelWidthLowerBound,1);
  assert.equal(out.safeParallelWidthUpperBound,3);
  assert.equal(out.safeParallelWidthProvenExact,false);
  assert.equal(out.maxSafeParallelWidth,null);
  assert.match(out.parallelismProof.truthBoundary,/NOT_ESTABLISHED/);
});

test('derived shared-scope conflicts are symmetric when either leaf may mutate',()=>{
  const leaves=[baseLeaf('I','IMPLEMENTATION',['src/shared.mjs']),baseLeaf('V','VERIFICATION',['src/shared.mjs']),baseLeaf('R','VERIFICATION',['src/shared.mjs'])];
  deriveConservativeParallelConflicts(leaves);
  assert.deepEqual(leaves[0].parallelConflictSet,['R','V']);
  assert.deepEqual(leaves[1].parallelConflictSet,['I']);
  assert.deepEqual(leaves[2].parallelConflictSet,['I']);
  assert.ok(!leaves[1].parallelConflictSet.includes('R'));
});

test('scope derivation does not truncate the evidence surface before conflict analysis',()=>{
  const scopes=Array.from({length:15},(_,index)=>`src/s${index}.mjs`);
  const leaves=[baseLeaf('I','IMPLEMENTATION',scopes),baseLeaf('V','VERIFICATION',['src/s14.mjs'])];
  deriveConservativeParallelConflicts(leaves);
  assert.equal(leaves[0].exactScope.length,15);
  assert.deepEqual(leaves[0].parallelConflictSet,['V']);
  assert.deepEqual(leaves[1].parallelConflictSet,['I']);
});

test('parallelism proof is load-bearing in new graph digest',()=>{
  const out=graph([baseLeaf('A'),baseLeaf('B')]);
  assert.equal(out.graphDigest,recomputeExecutionLeafGraphDigest(out));
  const forged=structuredClone(out);
  forged.parallelismProof.upperBound=999;
  assert.notEqual(forged.graphDigest,recomputeExecutionLeafGraphDigest(forged));
});

test('all concurrency accounting remains zero-effect and non-authorizing',()=>{
  const out=graph([baseLeaf('A'),baseLeaf('B')]);
  assert.equal(out.businessEffectAuthority,'NONE');
  assert.deepEqual(out.externalEffectLedger,{customerMessages:0,providerCalls:0,spendCents:0,deployments:0,dnsChanges:0,credentialChanges:0,paymentMutations:0,productionMutations:0});
});
