import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileBrainstateCapsule,
  compileCognitiveEvent,
  compileContextIdentity,
  compileMissionContext,
  verifyBrainstateFreshness,
  verifyBrainstateIntegrity
} from '../src/sovereign-context-fabric.mjs';

const sha40 = 'a'.repeat(40);
const sha64 = char => char.repeat(64);

function packet(overrides = {}) {
  return {
    project: 'UberBond',
    sourceCommit: sha40,
    contextDigest: sha64('b'),
    memoryDigest: sha64('c'),
    memoryReconciliationDigest: sha64('d'),
    externalCapabilityDigest: sha64('e'),
    capabilityGenome: { capabilityGraphDigest: sha64('f') },
    objective: 'Preserve the Sovereign Cognitive Continuum and expand founder agency.',
    economicNorthStar: 'risk-adjusted cleared contribution profit / founder minute',
    endState: 'A founder-light, evidence-first, sovereign cognitive and economic organism.',
    namedInitiatives: [
      { id: 'context-spine', name: 'Context Spine', status: 'CURRENT_PROGRAM' },
      { id: 'capability-genome', name: 'Capability Genome', status: 'CURRENT_PROGRAM' },
      { id: 'wallbreaker', name: 'Wallbreaker', status: 'CURRENT_PROGRAM' }
    ],
    unresolvedNames: [
      { name: 'Unknown Memory Primitive', status: 'OWNER_RECALLED_UNRESOLVED', next: 'Recover provenance.' }
    ],
    externalProofGates: ['real runtime observation required', 'real provider state required'],
    startupProtocol: ['refresh main', 'load canon', 'dedupe active work'],
    truthLaw: 'Internal prose cannot manufacture external truth.',
    memoryLaw: 'Supersession does not erase donated goals or mechanisms.',
    currentHandoff: {
      handoffBasisSha: sha40,
      activeBranch: null,
      activePullRequest: null,
      activeMission: 'Make cross-chat context sovereign and zero-retelling.',
      completed: ['repository-native brain exists'],
      blockers: ['fresh sessions can still mount stale context'],
      nextActions: ['compile exact-current brainstate before execution'],
      freshAgainstSourceCommit: true
    },
    ...overrides
  };
}

test('context identity is content-addressed across exact source, memory, capability, and reconciliation truth', () => {
  const result = compileContextIdentity(packet());
  assert.equal(result.ok, true);
  assert.match(result.identityDigest, /^[a-f0-9]{64}$/);
  assert.equal(result.identity.sourceCommit, sha40);
  assert.equal(result.externalEffectLedger.providerCalls, 0);
});

test('brainstate capsule is deterministic across wall clock and preserves zero-retelling and no-authority laws', () => {
  const first = compileBrainstateCapsule({ packet: packet(), generatedAt: '2026-09-11T18:00:00Z' });
  const second = compileBrainstateCapsule({ packet: packet(), generatedAt: '2026-09-11T19:00:00Z' });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.capsule.brainstateId, second.capsule.brainstateId);
  assert.equal(first.capsule.laws.capabilityNeverCreatesAuthority, true);
  assert.match(first.capsule.laws.zeroRetellingLaw, /MUST_NOT_RECONSTRUCT/);
  assert.equal(first.capsule.externalEffectAuthority, 'NONE');
});

test('tampering with a capsule is detected before it can be used as session truth', () => {
  const compiled = compileBrainstateCapsule({ packet: packet() });
  compiled.capsule.frontier.nextActions.push('silently invented action');
  const integrity = verifyBrainstateIntegrity(compiled.capsule);
  assert.equal(integrity.ok, false);
  assert.ok(integrity.reasonCodes.includes('brainstate-integrity-mismatch'));
});

test('source drift refuses stale-session continuity', () => {
  const compiled = compileBrainstateCapsule({ packet: packet() });
  const current = packet({ sourceCommit: '1'.repeat(40) });
  const freshness = verifyBrainstateFreshness({ capsule: compiled.capsule, currentPacket: current });
  assert.equal(freshness.ok, false);
  assert.equal(freshness.status, 'CONTEXT_DRIFT__RECOMPILE_REQUIRED');
  assert.ok(freshness.reasonCodes.includes('source-commit-drift'));
  assert.equal(freshness.requiresRecompile, true);
});

test('memory drift refuses stale-session continuity even when source SHA is unchanged', () => {
  const compiled = compileBrainstateCapsule({ packet: packet() });
  const current = packet({ memoryDigest: '2'.repeat(64) });
  const freshness = verifyBrainstateFreshness({ capsule: compiled.capsule, currentPacket: current });
  assert.equal(freshness.ok, false);
  assert.ok(freshness.reasonCodes.includes('memory-digest-drift'));
});

test('frontier drift refuses a capsule even when all content digests remain unchanged', () => {
  const compiled = compileBrainstateCapsule({ packet: packet() });
  const current = packet();
  current.currentHandoff = {
    ...current.currentHandoff,
    activeMission: 'A newer mission superseded the old frontier.'
  };
  const freshness = verifyBrainstateFreshness({ capsule: compiled.capsule, currentPacket: current });
  assert.equal(freshness.ok, false);
  assert.ok(freshness.reasonCodes.includes('frontier-drift'));
});

test('exact-current capsule verifies as current', () => {
  const current = packet();
  const compiled = compileBrainstateCapsule({ packet: current, generatedAt: '2026-09-11T18:00:00Z' });
  const freshness = verifyBrainstateFreshness({ capsule: compiled.capsule, currentPacket: current });
  assert.equal(freshness.ok, true);
  assert.equal(freshness.status, 'CONTEXT_CURRENT');
  assert.equal(freshness.requiresRecompile, false);
});

test('mission compiler retrieves relevant initiatives without dumping the entire memory index', () => {
  const compiled = compileBrainstateCapsule({ packet: packet() });
  const mission = compileMissionContext({
    capsule: compiled.capsule,
    mission: 'Upgrade the Context Spine and cross-chat context continuity.'
  });
  assert.equal(mission.ok, true);
  assert.match(mission.context.missionContextId, /^[a-f0-9]{64}$/);
  assert.ok(mission.context.relevantInitiatives.some(item => item.id === 'context-spine'));
  assert.equal(mission.context.brainstateId, compiled.capsule.brainstateId);
  assert.equal(mission.context.businessEffectAuthority, 'NONE');
});

test('cognitive events are immutable content-addressed provenance units', () => {
  const event = compileCognitiveEvent({
    kind: 'decision.changed',
    occurredAt: '2026-09-11T18:00:00Z',
    source: 'founder-chat',
    evidenceClass: 'CHAT_SPEC_GOAL',
    claimsAdded: ['New sessions must mount the same UberBond brainstate.'],
    claimsSuperseded: ['Hourly chat loops are an acceptable continuity mechanism.'],
    affectedNodes: ['context-spine', 'persistent-brain']
  });
  assert.equal(event.ok, true);
  assert.match(event.event.eventId, /^[a-f0-9]{64}$/);
  assert.equal(event.event.externalEffectAuthority, 'NONE');
});

test('invalid parent event ids fail closed instead of entering cognitive history', () => {
  const event = compileCognitiveEvent({
    kind: 'evidence.observed',
    occurredAt: '2026-09-11T18:00:00Z',
    source: 'runtime',
    evidenceClass: 'OBSERVED_RUNTIME',
    parentEventIds: ['not-a-digest']
  });
  assert.equal(event.ok, false);
  assert.ok(event.reasonCodes.includes('parent-event-id-invalid'));
});
