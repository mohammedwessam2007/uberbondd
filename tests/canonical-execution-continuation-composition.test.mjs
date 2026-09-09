import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeCanonicalExecutionLeaves } from '../src/canonical-execution-leaf-materializer.mjs';
import { compileExecutionLeafContinuation, buildExecutionLeafContinuationCheckpoint, resumeExecutionLeafContinuation } from '../src/execution-leaf-continuation.mjs';

const HEAD='a'.repeat(40);
const row=(id,state='VERIFIED_CURRENT')=>({
  canonicalId:id,
  currentState:state,
  currentEvidence:{sourceModules:['src/example.mjs'],testModules:['tests/example.test.mjs']},
  sourceArtifacts:['artifacts/canon.json'],
  owningLane:'OMEGA-14'
});
function coverage(rows){
  const byState={};
  for(const item of rows)byState[item.currentState]=(byState[item.currentState]||0)+1;
  return{ok:true,status:'COVERAGE_MATRIX_COMPILED',sourceCommit:HEAD,rows,counts:{rows:rows.length,byState}};
}

test('coverage-bound canonical materializer composes unchanged into continuation',()=>{
  const graph=materializeCanonicalExecutionLeaves({coverage:coverage([row('semantic:one')])});
  assert.equal(graph.ok,true,JSON.stringify(graph));
  assert.equal(graph.status,'ZERO_ORPHAN_CANONICAL_EXECUTION_LEAF_GRAPH_COMPILED');
  const continuation=compileExecutionLeafContinuation({graph});
  assert.equal(continuation.ok,true,JSON.stringify(continuation));
  assert.equal(continuation.state.graphDigest,graph.graphDigest);
  assert.equal(continuation.state.sourceCommit,graph.sourceCommit);
});

test('canonical graph checkpoint survives interruption and exact resume without translation',()=>{
  const graph=materializeCanonicalExecutionLeaves({coverage:coverage([row('semantic:resume')])});
  const continuation=compileExecutionLeafContinuation({graph});
  const checkpoint=buildExecutionLeafContinuationCheckpoint({graph,state:continuation.state});
  assert.equal(checkpoint.ok,true,JSON.stringify(checkpoint));
  const resumed=resumeExecutionLeafContinuation({graph,state:structuredClone(continuation.state),checkpoint:structuredClone(checkpoint.checkpoint),currentSourceCommit:HEAD});
  assert.equal(resumed.ok,true,JSON.stringify(resumed));
  assert.deepEqual(resumed.state.runnableLeafIds,continuation.state.runnableLeafIds);
});

test('canonical graph source mutation is refused on resume',()=>{
  const graph=materializeCanonicalExecutionLeaves({coverage:coverage([row('semantic:source-drift')])});
  const continuation=compileExecutionLeafContinuation({graph});
  const checkpoint=buildExecutionLeafContinuationCheckpoint({graph,state:continuation.state}).checkpoint;
  const out=resumeExecutionLeafContinuation({graph,state:continuation.state,checkpoint,currentSourceCommit:'b'.repeat(40)});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('source-revision-changed-reconciliation-required'));
});

test('canonical graph proof mutation is refused rather than normalized away',()=>{
  const graph=materializeCanonicalExecutionLeaves({coverage:coverage([row('semantic:graph-drift')])});
  const mutated=structuredClone(graph);
  mutated.leaves[0].implementationAcceptance='forged weaker acceptance';
  const out=compileExecutionLeafContinuation({graph:mutated});
  assert.equal(out.ok,false);
  assert.ok(out.reasonCodes.includes('valid-untampered-canonical-execution-leaf-graph-required'));
});
