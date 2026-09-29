import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compileCognitiveIR,
  authoritySatisfies,
  planQualityTypedExecution,
  findCommonSemanticSubexpressions,
  enforceQualityEscrow,
  compileFrontierResidual,
  createProofCarryingCognitionPacket
} from '../src/frontier-intelligence-vm.mjs';

const sha = char => char.repeat(64);

function program() {
  return compileCognitiveIR({
    programId: 'demo-program',
    taskClass: 'research',
    nodes: [
      {
        nodeId: 'n1',
        semanticIdentity: 'exact arithmetic',
        operation: 'EXACT',
        requiredQualityType: 'Q_EXACT',
        sourceStateDigest: sha('a')
      },
      {
        nodeId: 'n2',
        semanticIdentity: 'bounded evidence relevance',
        operation: 'NOUL',
        requiredQualityType: 'Q_CERTIFIED_BOUNDED',
        sourceStateDigest: sha('b'),
        dependencies: ['n1']
      },
      {
        nodeId: 'n3',
        semanticIdentity: 'novel synthesis',
        operation: 'CROWN',
        requiredQualityType: 'Q_FRONTIER',
        sourceStateDigest: sha('c'),
        dependencies: ['n2'],
        evidenceRefs: ['evidence://1']
      },
      {
        nodeId: 'n4',
        semanticIdentity: 'unknown novel dispute',
        operation: 'CROWN',
        requiredQualityType: 'Q_UNKNOWN',
        sourceStateDigest: sha('d'),
        dependencies: ['n3']
      }
    ]
  });
}

test('CIR compiler rejects cycles and missing dependencies', () => {
  const missing = compileCognitiveIR({
    programId: 'bad',
    taskClass: 'research',
    nodes: [{
      nodeId: 'a',
      semanticIdentity: 'x',
      operation: 'CROWN',
      requiredQualityType: 'Q_FRONTIER',
      sourceStateDigest: sha('a'),
      dependencies: ['missing']
    }]
  });
  assert.equal(missing.ok, false);
  assert.ok(missing.reasonCodes.some(x => x.includes('dependency-not-found')));

  const cyclic = compileCognitiveIR({
    programId: 'cycle',
    taskClass: 'research',
    nodes: [
      { nodeId: 'a', semanticIdentity: 'a', operation: 'CROWN', requiredQualityType: 'Q_FRONTIER', sourceStateDigest: sha('a'), dependencies: ['b'] },
      { nodeId: 'b', semanticIdentity: 'b', operation: 'CROWN', requiredQualityType: 'Q_FRONTIER', sourceStateDigest: sha('b'), dependencies: ['a'] }
    ]
  });
  assert.equal(cyclic.ok, false);
  assert.ok(cyclic.reasonCodes.includes('dependency-cycle-forbidden'));
});

test('quality type checker prevents cheap backends from satisfying frontier nodes', () => {
  assert.equal(authoritySatisfies('Q_EXACT', 'CODE'), true);
  assert.equal(authoritySatisfies('Q_CERTIFIED_BOUNDED', 'JEV_CERTIFIED'), true);
  assert.equal(authoritySatisfies('Q_FRONTIER', 'JEV_CERTIFIED'), false);
  assert.equal(authoritySatisfies('Q_FRONTIER', 'CHEAP_SWARM'), false);
  assert.equal(authoritySatisfies('Q_MULTI_FRONTIER', 'FRONTIER_CROWN'), false);
  assert.equal(authoritySatisfies('Q_UNKNOWN', 'MULTI_FRONTIER'), false);
});

test('execution planner pages unknown upward and only uses Jev for certified bounded nodes', () => {
  const compiled = program();
  assert.equal(compiled.ok, true, JSON.stringify(compiled));
  const plan = planQualityTypedExecution({
    program: compiled.program,
    certifiedNodeIds: ['n2']
  });
  assert.equal(plan.ok, true, JSON.stringify(plan));
  const byId = Object.fromEntries(plan.plan.map(row => [row.nodeId, row]));
  assert.equal(byId.n1.backend, 'CODE');
  assert.equal(byId.n2.backend, 'JEV_CERTIFIED');
  assert.equal(byId.n3.backend, 'FRONTIER_CROWN');
  assert.equal(byId.n4.backend, 'MULTI_FRONTIER');
  assert.deepEqual(plan.frontierResidualNodeIds, ['n3', 'n4']);
});

test('uncertified bounded semantics fail upward to the Crown rather than down to cheap inference', () => {
  const compiled = program();
  const plan = planQualityTypedExecution({ program: compiled.program });
  const n2 = plan.plan.find(row => row.nodeId === 'n2');
  assert.equal(n2.backend, 'FRONTIER_CROWN');
  assert.equal(n2.reason, 'bounded-node-not-yet-certified');
});

test('CSE only deduplicates exact same semantic identity, source state, quality, and domain', () => {
  const compiled = compileCognitiveIR({
    programId: 'cse',
    taskClass: 'research',
    nodes: [
      { nodeId: 'a', semanticIdentity: 'P17', operation: 'CROWN', requiredQualityType: 'Q_FRONTIER', sourceStateDigest: sha('a'), applicabilityDomain: 'same-domain' },
      { nodeId: 'b', semanticIdentity: 'P17', operation: 'CROWN', requiredQualityType: 'Q_FRONTIER', sourceStateDigest: sha('a'), applicabilityDomain: 'same-domain' },
      { nodeId: 'c', semanticIdentity: 'P17', operation: 'CROWN', requiredQualityType: 'Q_FRONTIER', sourceStateDigest: sha('b'), applicabilityDomain: 'same-domain' }
    ]
  });
  const cse = findCommonSemanticSubexpressions({ program: compiled.program });
  assert.equal(cse.ok, true);
  assert.equal(cse.eliminatedCandidateCount, 1);
  assert.deepEqual(cse.aliases[0].duplicateNodeIds, ['b']);
});

test('quality escrow blocks cheap speculation that would consume required Crown rescue money', () => {
  const safe = enforceQualityEscrow({ availableCents: 100, requiredFallbackCents: 60, speculativeSpendCents: 30 });
  assert.equal(safe.permitted, true);

  const unsafe = enforceQualityEscrow({ availableCents: 100, requiredFallbackCents: 60, speculativeSpendCents: 50 });
  assert.equal(unsafe.permitted, false);
  assert.equal(unsafe.status, 'SPECULATION_BLOCKED_PROTECT_CROWN_ESCROW');
});

test('frontier residual contains only unresolved frontier-typed nodes', () => {
  const compiled = program();
  const plan = planQualityTypedExecution({
    program: compiled.program,
    certifiedNodeIds: ['n2']
  });
  const residual = compileFrontierResidual({
    executionPlan: plan,
    resolvedNodeIds: ['n1', 'n2']
  });
  assert.equal(residual.ok, true);
  assert.equal(residual.frontierNodeCount, 2);
  assert.deepEqual(residual.packet.frontierNodes.map(x => x.nodeId), ['n3', 'n4']);
});

test('proof-carrying packet preserves provenance but never self-proves correctness', () => {
  const out = createProofCarryingCognitionPacket({
    resultDigest: sha('a'),
    programDigest: sha('b'),
    qualityType: 'Q_FRONTIER',
    backendIdentities: ['openrouter:model@revision'],
    evidenceRefs: ['evidence://1'],
    tests: ['test://1'],
    counterexamples: ['counterexample://1'],
    applicabilityDomain: 'research tasks matching archetype X',
    invalidators: ['source-state-changed'],
    costReceiptRef: 'receipt://1',
    crownRevision: 'model@revision'
  });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.match(out.packetDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(out.claimBoundary, /DOES_NOT_BY_ITSELF_PROVE/);
});
