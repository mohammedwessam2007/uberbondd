import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORCHESTRATION_REFERENCE_PACK,
  validateOrchestrationGraph,
  readyOrchestrationNodes,
  scoreOrchestrationCandidate,
  buildOrchestrationFrontierTournament,
  buildOrchestratorDiscoveryPlan
} from '../src/orchestration-frontier.mjs';

function node(overrides = {}) {
  return {
    id: 'implement',
    purpose: 'Implement one bounded change.',
    dependencies: [],
    workerRequirement: 'verified-coding-worker',
    ownedFilesOrResponsibility: ['src/example.mjs'],
    inputs: ['current-main'],
    expectedOutput: 'A minimal implementation patch.',
    verification: ['node --test tests/example.test.mjs'],
    stopCondition: 'Focused behavioral gate is green or a causal blocker is recorded.',
    authorityCeiling: 'NONE',
    implementation: true,
    callableWorkerVerified: true,
    ...overrides
  };
}

function candidate(overrides = {}) {
  return {
    id: 'fable-orchestrator',
    name: 'Fable Orchestrator',
    upstream: 'codejunkie99/fable-orchestrator',
    sourceRef: '3b653701d48095a488c350f7a9d5b1fca4d37183',
    license: 'MIT',
    plannerWorkerSeparation: 95,
    boundedDag: 88,
    callableWorkerValidation: 90,
    ownershipDiscipline: 86,
    safeParallelism: 82,
    independentVerification: 82,
    adversarialReview: 62,
    durableState: 45,
    contextRecovery: 45,
    providerNeutrality: 72,
    authorityPreservation: 92,
    secretBoundary: 94,
    replaceability: 95,
    founderMinuteLeverage: 80,
    runtimeRequired: false,
    unboundedRecursion: false,
    silentCredentialAccess: false,
    authorityExpansion: false,
    notes: [],
    ...overrides
  };
}

test('reference pack pins Fable, Metaswarm and Superpowers to exact MIT revisions', () => {
  assert.deepEqual(ORCHESTRATION_REFERENCE_PACK.map(item => item.id), [
    'fable-orchestrator',
    'metaswarm',
    'superpowers'
  ]);
  assert.ok(ORCHESTRATION_REFERENCE_PACK.every(item => item.license === 'MIT'));
  assert.ok(ORCHESTRATION_REFERENCE_PACK.every(item => /^[a-f0-9]{40}$/.test(item.sourceRef)));
});

test('valid bounded graph exposes dependency-ready work and later unlocks integration', () => {
  const graph = {
    mode: 'FABLE_GRAPH',
    parentAuthority: 'LOCAL_PREPARATION',
    dataClass: 'SOURCE_CODE',
    maxDepth: 1,
    maxIterations: 3,
    nodes: [
      node({ id: 'implement', authorityCeiling: 'NONE' }),
      node({
        id: 'verify',
        purpose: 'Independently verify the implementation.',
        dependencies: ['implement'],
        workerRequirement: 'verified-independent-reviewer',
        ownedFilesOrResponsibility: ['verification responsibility'],
        expectedOutput: 'Independent behavioral verification receipt.',
        verification: ['re-run focused behavior'],
        authorityCeiling: 'NONE'
      })
    ]
  };
  const validated = validateOrchestrationGraph(graph);
  assert.equal(validated.ok, true);
  assert.match(validated.graphDigest, /^[a-f0-9]{64}$/);
  assert.equal(validated.businessEffectAuthority, 'NONE');

  const first = readyOrchestrationNodes(graph, []);
  assert.deepEqual(first.readyNodes.map(item => item.id), ['implement']);
  assert.equal(first.parallelDispatchAllowed, false);

  const second = readyOrchestrationNodes(graph, ['implement']);
  assert.deepEqual(second.readyNodes.map(item => item.id), ['verify']);
});

test('independent ready nodes may run in parallel but dependencies still gate integration', () => {
  const graph = {
    mode: 'SWARM',
    parentAuthority: 'NONE',
    dataClass: 'SOURCE_CODE',
    nodes: [
      node({ id: 'lane-a', ownedFilesOrResponsibility: ['src/a.mjs'] }),
      node({ id: 'lane-b', ownedFilesOrResponsibility: ['src/b.mjs'] }),
      node({
        id: 'integrate',
        dependencies: ['lane-a', 'lane-b'],
        ownedFilesOrResponsibility: ['integration responsibility']
      })
    ]
  };
  const start = readyOrchestrationNodes(graph, []);
  assert.deepEqual(new Set(start.readyNodes.map(item => item.id)), new Set(['lane-a', 'lane-b']));
  assert.equal(start.parallelDispatchAllowed, true);
  const waiting = readyOrchestrationNodes(graph, ['lane-a']);
  assert.deepEqual(waiting.readyNodes.map(item => item.id), ['lane-b']);
  const integrate = readyOrchestrationNodes(graph, ['lane-a', 'lane-b']);
  assert.deepEqual(integrate.readyNodes.map(item => item.id), ['integrate']);
});

test('implementation node cannot claim a model or worker is callable without runtime proof', () => {
  const result = validateOrchestrationGraph({
    mode: 'DIRECT',
    parentAuthority: 'NONE',
    nodes: [node({ callableWorkerVerified: false })]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('callable-worker-must-be-verified:implement'));
});

test('secret-bearing orchestration packets fail closed before dispatch', () => {
  const result = validateOrchestrationGraph({
    mode: 'DIRECT',
    parentAuthority: 'NONE',
    dataClass: 'CREDENTIAL',
    nodes: [node()]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('sensitive-data-not-approved-for-orchestration-packet'));
});

test('child graph nodes cannot widen parent authority', () => {
  const result = validateOrchestrationGraph({
    mode: 'DIRECT',
    parentAuthority: 'NONE',
    nodes: [node({ authorityCeiling: 'LOCAL_PREPARATION' })]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('child-authority-widens-parent:implement'));
});

test('dependency cycles and unknown dependencies fail closed', () => {
  const cyclic = validateOrchestrationGraph({
    mode: 'FABLE_GRAPH',
    parentAuthority: 'NONE',
    nodes: [
      node({ id: 'a', dependencies: ['b'], ownedFilesOrResponsibility: ['a'] }),
      node({ id: 'b', dependencies: ['a'], ownedFilesOrResponsibility: ['b'] })
    ]
  });
  assert.equal(cyclic.ok, false);
  assert.ok(cyclic.reasonCodes.some(code => code.startsWith('dependency-cycle:')));

  const unknown = validateOrchestrationGraph({
    mode: 'FABLE_GRAPH',
    parentAuthority: 'NONE',
    nodes: [node({ dependencies: ['ghost'] })]
  });
  assert.equal(unknown.ok, false);
  assert.ok(unknown.reasonCodes.includes('unknown-dependency:implement:ghost'));
});

test('recursive orchestration is bounded and unavailable in non-recursive modes', () => {
  const oversized = validateOrchestrationGraph({
    mode: 'RECURSIVE_SWARM',
    parentAuthority: 'NONE',
    maxDepth: 5,
    nodes: [node()]
  });
  assert.equal(oversized.ok, false);
  assert.ok(oversized.reasonCodes.includes('bounded-max-depth-required'));

  const wrongMode = validateOrchestrationGraph({
    mode: 'SWARM',
    parentAuthority: 'NONE',
    maxDepth: 2,
    nodes: [node()]
  });
  assert.equal(wrongMode.ok, false);
  assert.ok(wrongMode.reasonCodes.includes('recursive-depth-requires-recursive-swarm'));
});

test('orchestration candidate scoring rejects unsafe orchestration despite high claimed quality', () => {
  const result = scoreOrchestrationCandidate(candidate({
    id: 'dangerous-orchestrator',
    name: 'Dangerous Orchestrator',
    upstream: 'example/dangerous',
    sourceRef: '1111111111111111111111111111111111111111',
    plannerWorkerSeparation: 100,
    boundedDag: 100,
    independentVerification: 100,
    silentCredentialAccess: true,
    authorityExpansion: true
  }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('silent-credential-access-prohibited'));
  assert.ok(result.reasonCodes.includes('orchestrator-authority-expansion-prohibited'));
});

test('unapproved license blocks automatic orchestration composition', () => {
  const result = scoreOrchestrationCandidate(candidate({ license: 'UNKNOWN' }));
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('license-not-preapproved-for-automatic-composition'));
});

test('N+1 tournament proposes composition or promotion only when challenger beats the measured baseline', () => {
  const baseline = candidate();
  const challenger = candidate({
    id: 'future-challenger',
    name: 'Future Challenger',
    upstream: 'example/future-challenger',
    sourceRef: '2222222222222222222222222222222222222222',
    durableState: 100,
    contextRecovery: 100,
    adversarialReview: 100,
    independentVerification: 100,
    safeParallelism: 100,
    providerNeutrality: 100,
    founderMinuteLeverage: 100
  });
  const result = buildOrchestrationFrontierTournament({ candidates: [baseline, challenger] });
  assert.equal(result.ok, true);
  assert.equal(result.champion.id, 'future-challenger');
  assert.ok(['COMPOSE_CHALLENGER_MECHANISMS', 'PROMOTION_CANDIDATE'].includes(result.decision));
  assert.equal(result.promotionAuthority, 'RESEARCH_AND_PROPOSAL_ONLY');
});

test('discovery plan continuously looks beyond Fable without installation or promotion authority', () => {
  const plan = buildOrchestratorDiscoveryPlan();
  assert.equal(plan.ok, true);
  assert.equal(plan.cadenceMinutes, 120);
  assert.ok(plan.sources.includes('GAMECHANGER_MESH'));
  assert.ok(plan.sources.includes('FIND_SKILLS'));
  assert.ok(plan.searchThemes.some(item => item.includes('Claude Code')));
  assert.equal(plan.installationAuthority, 'NONE');
  assert.equal(plan.promotionAuthority, 'NONE');
  assert.equal(plan.externalEffectLedger.spendCents, 0);
});
