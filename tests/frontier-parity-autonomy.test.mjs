import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAbsorptionCandidate, evaluateAbsorptionParity, buildAbsorptionWorkPacket } from '../src/frontier-absorption-engine.mjs';
import { normalizeFrontierSignal, scoreFrontierSignal, buildIdeaAtomizationPacket, buildFrontierThinkerSwarm, buildCombinationSearchSpace, judgeFrontierOutcome } from '../src/autonomous-frontier-intelligence.mjs';
import { normalizeWorkerSpec, compileWorkerManifest, detectWorkerOwnershipConflicts } from '../src/frontier-worker-compiler.mjs';
import { buildContextPlan, assessContextPressure } from '../src/frontier-context-spine.mjs';
import { normalizeArtifactReceipt, verifyArtifactCompletion, buildVisualVerificationContract, verifyVisualEvidence } from '../src/frontier-artifact-verifier.mjs';

const observedAt = '2026-09-03T00:00:00Z';

function candidate() {
  return {
    id: 'feature.goal-loop',
    sourceId: 'source.frontier-operator',
    featureName: 'Goal loop',
    sourceBoundary: 'Observable behavior may be reproduced; proprietary implementation is not copied.',
    observableBehaviors: ['repeats-until-proof-or-blocker', 'independent-goal-check'],
    nonFunctionalRequirements: ['bounded-cost', 'durable-checkpoint'],
    forbiddenShortcuts: ['self-certification', 'unbounded-loop'],
    providerNeutralTarget: 'OMNIA Goal Engine'
  };
}

function evidence(behavior, qualityScore = 90, status = 'PASS') {
  return { behavior, qualityScore, status, observedAt, evidenceRef: `evidence:${behavior}:${qualityScore}` };
}

function worker(id, ownedResources = []) {
  return {
    id,
    name: id,
    role: 'WORKER',
    objective: 'Implement one bounded lane.',
    ownedResources,
    permissions: ['REPO_READ', 'BOUNDED_REPO_WRITE', 'TEST_EXECUTION'],
    forbiddenEffects: ['MESSAGE', 'DEPLOYMENT', 'MONEY_MOVEMENT'],
    acceptanceCriteria: ['Relevant checks pass with current evidence.'],
    contextTags: ['frontier'],
    maxTurns: 12,
    maxParallelChildren: 0,
    preferredModels: ['model.a'],
    fallbackModels: ['model.b']
  };
}

test('absorption candidate requires observable behavior contract', () => {
  const result = normalizeAbsorptionCandidate({ ...candidate(), observableBehaviors: [] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('observable-behavior-contract-required'));
});

test('implementation cannot claim parity without reference proof', () => {
  const result = evaluateAbsorptionParity({
    candidate: candidate(),
    implementation: { id: 'omnia.goal-engine', sourceRevision: 'abc123', state: 'ACTIVE', implementedBehaviors: candidate().observableBehaviors },
    implementationEvidence: candidate().observableBehaviors.map(item => evidence(item, 95))
  });
  assert.equal(result.status, 'PARITY_UNPROVEN');
  assert.equal(result.claimBoundary, 'NO_PARITY_OR_SUPERIORITY_CLAIM_AUTHORIZED');
  assert.equal(result.missingReferenceProof.length, 2);
});

test('parity requires every behavior to meet reference quality', () => {
  const behaviors = candidate().observableBehaviors;
  const result = evaluateAbsorptionParity({
    candidate: candidate(),
    implementation: { id: 'omnia.goal-engine', sourceRevision: 'abc123', state: 'ACTIVE', implementedBehaviors: behaviors },
    referenceEvidence: behaviors.map(item => evidence(item, 90)),
    implementationEvidence: [evidence(behaviors[0], 95), evidence(behaviors[1], 89)]
  });
  assert.equal(result.status, 'PARITY_UNPROVEN');
});

test('superiority requires all observable behaviors to exceed reference', () => {
  const behaviors = candidate().observableBehaviors;
  const result = evaluateAbsorptionParity({
    candidate: candidate(),
    implementation: { id: 'omnia.goal-engine', sourceRevision: 'abc123', state: 'ACTIVE', implementedBehaviors: behaviors },
    referenceEvidence: behaviors.map(item => evidence(item, 90)),
    implementationEvidence: behaviors.map(item => evidence(item, 95))
  });
  assert.equal(result.status, 'SUPERIORITY_PROVEN');
});

test('absorption work packet never grants authority or calls a concept cloned', () => {
  const result = buildAbsorptionWorkPacket({ candidate: candidate(), currentCapabilities: ['goal-contract'], substitutes: ['cheap-model-verifier'] });
  assert.equal(result.ok, true);
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.ok(result.packet.prohibitedClaims.includes('CLONED'));
});

test('frontier signal requires evidence and preserves zero authority', () => {
  const invalid = normalizeFrontierSignal({ id: 'signal-1', source: 'source', observedAt, summary: 'New capability', claimedChange: 'Changed', evidenceRefs: [] });
  assert.equal(invalid.ok, false);
  const valid = normalizeFrontierSignal({ id: 'signal-1', source: 'source', observedAt, summary: 'New capability', claimedChange: 'Changed', evidenceRefs: ['ref:1'], domains: ['models'], confidence: 80 });
  assert.equal(valid.ok, true);
  assert.equal(valid.businessEffectAuthority, 'NONE');
});

test('frontier scoring penalizes risk and uncertainty', () => {
  const safe = scoreFrontierSignal({ novelty: 90, enablingPower: 90, strategicAdjacency: 90, economicUpside: 90, evidenceQuality: 90, founderMinutesSaved: 90, risk: 5, uncertainty: 5 });
  const risky = scoreFrontierSignal({ novelty: 90, enablingPower: 90, strategicAdjacency: 90, economicUpside: 90, evidenceQuality: 90, founderMinutesSaved: 90, risk: 95, uncertainty: 95 });
  assert.ok(safe.score > risky.score);
});

test('idea atomization separates observed signal from hypothesis outputs', () => {
  const signal = { id: 'signal-1', source: 'source', observedAt, summary: 'New capability', claimedChange: 'Changed', evidenceRefs: ['ref:1'], domains: ['models'], confidence: 80 };
  const result = buildIdeaAtomizationPacket({ signal, knownCapabilities: ['goal-engine'], knownOpportunityMechanisms: ['service'] });
  assert.equal(result.ok, true);
  assert.ok(result.packet.requiredOutputs.includes('EVIDENCE_GAPS'));
  assert.ok(result.packet.laws.includes('UNKNOWN_REMAINS_UNKNOWN'));
});

test('thinker swarm preserves disagreement and has no execution authority', () => {
  const result = buildFrontierThinkerSwarm({ missionId: 'mission-x', objective: 'Find useful frontier capability.' });
  assert.equal(result.ok, true);
  assert.ok(result.lanes.length >= 5);
  assert.ok(result.lanes.every(lane => lane.executionAuthority === 'NONE'));
  assert.match(result.synthesisRule, /CONSENSUS_IS_NOT_PROOF/);
});

test('combination search remains a hypothesis space', () => {
  const result = buildCombinationSearchSpace({ capabilityAtoms: ['a'], markets: ['m'], channels: ['c'], technologies: ['t'], maxCandidates: 10 });
  assert.equal(result.ok, true);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.claimBoundary, 'COMBINATION_IS_HYPOTHESIS_NOT_OPPORTUNITY_PROOF');
});

test('reality judge cannot promote its own supported hypothesis', () => {
  const result = judgeFrontierOutcome({ hypothesisId: 'h1', expected: 'Improve reliability', observations: [{ metric: 'reliability', direction: 'IMPROVED', evidenceRef: 'obs:1', observedAt, confidence: 90 }] });
  assert.equal(result.verdict, 'SUPPORTED');
  assert.equal(result.promotionAuthority, 'NONE');
});

test('canonical worker compiler keeps providers interchangeable and forbids self certification', () => {
  for (const target of ['GENERIC', 'CLAUDE_CODE', 'CODEX', 'OPEN_MODEL_AGENT']) {
    const result = compileWorkerManifest({ worker: worker('worker-a', ['src/a.mjs']), target });
    assert.equal(result.ok, true);
    assert.equal(result.manifest.selfCertificationAllowed, false);
    assert.equal(result.manifest.externalEffectAuthority, 'NONE');
  }
});

test('worker permissions reject undeclared authority-like values', () => {
  const result = normalizeWorkerSpec({ ...worker('worker-a'), permissions: ['SPEND_MONEY'] });
  assert.equal(result.ok, false);
});

test('overlapping worker resources force serialization', () => {
  const result = detectWorkerOwnershipConflicts([worker('a', ['src/shared.mjs']), worker('b', ['src/shared.mjs'])]);
  assert.equal(result.status, 'SERIALIZATION_REQUIRED');
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.parallelExecutionAuthority, 'NONE');
});

test('context spine always admits constitution and refuses missing dependencies', () => {
  const artifacts = [
    { id: 'constitution', kind: 'CONSTITUTION', contentRef: 'docs/constitution', tags: ['all'], dependencies: [], estimatedTokens: 100, priority: 100, immutable: true },
    { id: 'contract', kind: 'CONTRACT', contentRef: 'docs/contract', tags: ['frontier'], dependencies: ['missing'], estimatedTokens: 100, priority: 90 }
  ];
  const result = buildContextPlan({ taskId: 'task', requiredTags: ['frontier'], artifacts, tokenBudget: 1000 });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('dependency-would-be-omitted') || result.reasonCodes.includes('task-tags-artifacts-and-budget-required'));
});

test('context pressure demands checkpoint near exhaustion', () => {
  const result = assessContextPressure({ usedTokens: 950, tokenBudget: 1000, checkpointAvailable: false });
  assert.equal(result.state, 'CRITICAL');
  assert.equal(result.action, 'CREATE_CHECKPOINT_BEFORE_CONTINUING');
});

test('artifact completion refuses missing and uncertain checks', () => {
  const receipt = {
    artifactId: 'artifact-1', artifactType: 'CODE', artifactRef: 'commit:abc', sourceRevision: 'abc', observedAt,
    checks: [{ id: 'tests', status: 'UNCERTAIN', evidenceRef: 'run:1', observedAt }], uncertainty: ['hosted-runner-startup-blocked']
  };
  const result = verifyArtifactCompletion({ receipt, requiredChecks: ['tests', 'syntax'] });
  assert.equal(result.complete, false);
  assert.deepEqual(result.missing, ['syntax']);
  assert.deepEqual(result.uncertain, ['tests']);
});

test('artifact receipt requires real checks rather than prose-only success', () => {
  const result = normalizeArtifactReceipt({ artifactId: 'a', artifactType: 'CODE', artifactRef: 'x', sourceRevision: 'r', observedAt, checks: [], uncertainty: [] });
  assert.equal(result.ok, false);
});

test('visual verification cannot pass with an uncovered dimension', () => {
  const contractResult = buildVisualVerificationContract({ id: 'ui', referenceRefs: ['ref.png'], renderRefs: ['render.png'], dimensions: ['LAYOUT', 'CONTENT'] });
  assert.equal(contractResult.ok, true);
  const result = verifyVisualEvidence({ contract: contractResult.contract, observations: [{ dimension: 'LAYOUT', status: 'PASS', evidenceRef: 'vision:1', observedAt, note: 'ok' }] });
  assert.equal(result.pass, false);
  assert.deepEqual(result.missing, ['CONTENT']);
});
