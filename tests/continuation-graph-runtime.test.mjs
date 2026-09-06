import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileContinuationGraph,
  recordContinuationResult,
  buildContinuationCheckpoint,
  resumeContinuationGraph,
  continuationCapabilityAtom
} from '../src/continuation-graph-runtime.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

const sha = char => char.repeat(64);

function graphFixture() {
  return compileContinuationGraph({
    objective: 'Close a software mission without depending on one model session.',
    maxParallel: 2,
    nodes: [
      { id: 'sense', objective: 'Inspect current truth', maxAttempts: 2 },
      { id: 'research', objective: 'Research candidate mechanisms', maxAttempts: 2 },
      { id: 'synthesize', objective: 'Synthesize evidence', dependsOn: ['sense', 'research'], proofRequirements: ['evidence digest'] },
      { id: 'verify', objective: 'Adversarially verify synthesis', dependsOn: ['synthesize'], maxAttempts: 2 },
      { id: 'integrate', objective: 'Prepare bounded integration', dependsOn: ['verify'] }
    ]
  });
}

test('compiles a dependency DAG into a parallel runnable frontier with zero authority', () => {
  const graph = graphFixture();
  assert.equal(graph.ok, true, JSON.stringify(graph));
  assert.deepEqual(graph.state.runnableNodeIds, ['research', 'sense']);
  assert.equal(graph.resourceLaw.providerLimitsAreHardConstraints, true);
  assert.equal(graph.resourceLaw.quotaEvasionAllowed, false);
  assert.equal(graph.resourceLaw.identityCyclingAllowed, false);
  assert.equal(graph.externalEffectAuthority, 'NONE');
  assert.equal(graph.businessEffectAuthority, 'NONE');
  assert.deepEqual(graph.externalEffectLedger, ZERO_EXTERNAL_EFFECTS);
});

test('completion advances the graph instead of rerunning already-completed independent work', () => {
  let graph = graphFixture();
  graph = recordContinuationResult({ graph, nodeId: 'sense', result: { status: 'COMPLETED', receiptDigest: sha('a') } });
  assert.equal(graph.ok, true);
  assert.deepEqual(graph.state.runnableNodeIds, ['research']);
  graph = recordContinuationResult({ graph, nodeId: 'research', result: { status: 'COMPLETED', receiptDigest: sha('b') } });
  assert.equal(graph.ok, true);
  assert.deepEqual(graph.state.runnableNodeIds, ['synthesize']);
  assert.deepEqual(graph.state.completedNodeIds, ['research', 'sense']);
});

test('a failed node retries locally and does not erase completed siblings', () => {
  let graph = graphFixture();
  graph = recordContinuationResult({ graph, nodeId: 'sense', result: { status: 'COMPLETED', receiptDigest: sha('a') } });
  graph = recordContinuationResult({ graph, nodeId: 'research', result: { status: 'FAILED', receiptDigest: sha('b'), summary: 'temporary source failure' } });
  assert.equal(graph.ok, true);
  assert.equal(graph.state.nodes.sense.status, 'COMPLETED');
  assert.equal(graph.state.nodes.research.status, 'PENDING_RETRY');
  assert.deepEqual(graph.state.runnableNodeIds, ['research']);
});

test('exhausted local retry becomes terminal and blocks dependent advancement', () => {
  let graph = compileContinuationGraph({
    objective: 'bounded retry',
    nodes: [
      { id: 'a', objective: 'A', maxAttempts: 1 },
      { id: 'b', objective: 'B', dependsOn: ['a'] }
    ]
  });
  graph = recordContinuationResult({ graph, nodeId: 'a', result: { status: 'FAILED', receiptDigest: sha('c') } });
  assert.equal(graph.ok, true);
  assert.equal(graph.state.nodes.a.status, 'FAILED_TERMINAL');
  assert.equal(graph.state.status, 'DEGRADED');
  assert.deepEqual(graph.state.runnableNodeIds, []);
});

test('duplicate terminal receipt is idempotent while a conflicting replay fails closed', () => {
  let graph = graphFixture();
  graph = recordContinuationResult({ graph, nodeId: 'sense', result: { status: 'COMPLETED', receiptDigest: sha('d') } });
  const replay = recordContinuationResult({ graph, nodeId: 'sense', result: { status: 'COMPLETED', receiptDigest: sha('d') } });
  assert.equal(replay.ok, true);
  assert.equal(replay.status, 'CONTINUATION_RESULT_IDEMPOTENT');
  assert.equal(replay.idempotent, true);
  const conflict = recordContinuationResult({ graph, nodeId: 'sense', result: { status: 'COMPLETED', receiptDigest: sha('e') } });
  assert.equal(conflict.ok, false);
  assert.ok(conflict.reasonCodes.includes('conflicting-terminal-replay'));
});

test('cycle, missing dependency and self-dependency are all refused at compile time', () => {
  const cycle = compileContinuationGraph({ objective: 'cycle', nodes: [
    { id: 'a', objective: 'A', dependsOn: ['b'] },
    { id: 'b', objective: 'B', dependsOn: ['a'] }
  ] });
  assert.equal(cycle.ok, false);
  assert.ok(cycle.reasonCodes.includes('acyclic-existing-dependencies-required'));
  const missing = compileContinuationGraph({ objective: 'missing', nodes: [{ id: 'a', objective: 'A', dependsOn: ['ghost'] }] });
  assert.equal(missing.ok, false);
  const self = compileContinuationGraph({ objective: 'self', nodes: [{ id: 'a', objective: 'A', dependsOn: ['a'] }] });
  assert.equal(self.ok, false);
});

test('checkpoint resumes only the exact graph state on the exact source revision', () => {
  let graph = graphFixture();
  graph = recordContinuationResult({ graph, nodeId: 'sense', result: { status: 'COMPLETED', receiptDigest: sha('f') } });
  const checkpoint = buildContinuationCheckpoint({ graph, sourceRevision: 'commit-abc123', memoryPointers: ['memory:goal', 'receipt:sense'] });
  assert.equal(checkpoint.ok, true, JSON.stringify(checkpoint));
  const resumed = resumeContinuationGraph({ graph, checkpoint: checkpoint.checkpoint, currentSourceRevision: 'commit-abc123' });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.status, 'CONTINUATION_RESUME_READY');
  const stale = resumeContinuationGraph({ graph, checkpoint: checkpoint.checkpoint, currentSourceRevision: 'commit-def456' });
  assert.equal(stale.ok, false);
  assert.equal(stale.status, 'CONTINUATION_RESUME_RECONCILIATION_REQUIRED');
  assert.ok(stale.reasonCodes.includes('source-revision-changed'));
});

test('checkpoint and result surfaces refuse credential material', () => {
  const graph = graphFixture();
  const result = recordContinuationResult({
    graph,
    nodeId: 'sense',
    result: { status: 'COMPLETED', receiptDigest: sha('1'), summary: `Bearer ${'x'.repeat(32)}` }
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('secret-material-prohibited'));
  const checkpoint = buildContinuationCheckpoint({ graph, sourceRevision: 'abc', memoryPointers: [`sk-${'x'.repeat(24)}`] });
  assert.equal(checkpoint.ok, false);
  assert.ok(checkpoint.reasonCodes.includes('secret-material-prohibited'));
});

test('continuation runtime exports a normalized Capability Genome atom', () => {
  const atom = continuationCapabilityAtom();
  assert.equal(atom.ok, true, JSON.stringify(atom));
  assert.equal(atom.atom.id, 'uberbond.continuation.compile-resumable-work-graph');
  assert.equal(atom.atom.sideEffectClass, 'NONE');
  assert.ok(atom.atom.inputs.includes('dependency-edges'));
  assert.ok(atom.atom.outputs.includes('checkpoint'));
});
