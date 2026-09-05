import test from 'node:test';
import assert from 'node:assert/strict';
import { eventFromFeatureGenome, eventFromFrontierModelTeamDoctor } from '../src/whole-brain-cognitive-adapters.mjs';

test('feature genome becomes coverage evidence without promoting filename classification into behavior proof', () => {
  const event = eventFromFeatureGenome({
    ok: true,
    genomeDigest: 'a'.repeat(64),
    repositoryArtifactCount: 100,
    sourceDependencyEdgeCount: 80,
    readinessCapabilityCount: 12,
    genesisIdeaCount: 275,
    donorLineageCount: 10,
    fallbackArtifactCount: 7
  });
  assert.equal(event.ok, true, JSON.stringify(event));
  assert.equal(event.event.kind, 'FEATURE_COVERAGE');
  assert.equal(event.event.sourceNodeId, 'context-spine');
  assert.match(event.event.summary, /7 artifacts remain/);
  assert.match(event.event.summary, /not evidence/);
});

test('frontier model roster preserves zero-callability truth until runtime proof exists', () => {
  const event = eventFromFrontierModelTeamDoctor({
    candidateRegistry: { ok: true, candidateCount: 7 },
    configuredCandidateCount: 2,
    callableCandidateCount: 0,
    roleCoverage: { gaps: [] },
    teamMission: { missionDigest: 'b'.repeat(64) }
  });
  assert.equal(event.ok, true, JSON.stringify(event));
  assert.equal(event.event.kind, 'FRONTIER_MODEL_ROSTER');
  assert.equal(event.event.sourceNodeId, 'open-model-universe');
  assert.match(event.event.summary, /0 callability-proven/);
  assert.match(event.event.summary, /never creates runtime authority/);
});

test('invalid frontier model registry routes as a blocker rather than invented provider unavailability', () => {
  const event = eventFromFrontierModelTeamDoctor({ candidateRegistry: { ok: false } });
  assert.equal(event.ok, true, JSON.stringify(event));
  assert.equal(event.event.kind, 'BLOCKER');
  assert.match(event.event.summary, /not as evidence that any provider or model is unavailable/);
});
