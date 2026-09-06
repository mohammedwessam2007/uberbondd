import test from 'node:test';
import assert from 'node:assert/strict';

import {
  eventFromGamechangerArtifact,
  eventFromGenesisArtifact,
  eventFromCapabilityGenomeResult,
  eventFromSelfMaintenanceResult,
  compileCognitiveEventsFromArtifacts
} from '../src/uberbond-cognitive-adapters.mjs';

test('Gamechanger batch becomes a routed cognitive event', () => {
  const event = eventFromGamechangerArtifact({
    generatedAt: '2026-09-05T18:00:00.000Z',
    frontierSignals: [{ id: 's1' }, { id: 's2' }],
    intelligencePackets: [{ signalId: 's1' }]
  });
  assert.equal(event.ok, true);
  assert.equal(event.event.kind, 'GAMECHANGER_CANDIDATE');
  assert.equal(event.event.sourceNodeId, 'gamechanger');
  assert.match(event.event.summary, /2 signals/);
});

test('GENESIS batch preserves resurrection pressure as research, not proof', () => {
  const event = eventFromGenesisArtifact({
    generatedAt: '2026-09-05T18:01:00.000Z',
    cycles: [{ ok: true }, { ok: false }],
    summary: { successful: 1, resurrectionReviewCandidates: 3 }
  });
  assert.equal(event.ok, true);
  assert.equal(event.event.kind, 'GENESIS_HYPOTHESIS');
  assert.equal(event.event.truthClass, 'RESEARCH_ASSET');
  assert.match(event.event.summary, /3 resurrection-review candidates/);
});

test('healthy Capability Genome uses canonical doctor state rather than fake top-level counts', () => {
  const event = eventFromCapabilityGenomeResult({
    ok: true,
    status: 'CAPABILITY_GENOME_FOUNDATION_HEALTHY',
    evaluatedAt: '2026-09-05T18:02:00.000Z',
    state: {
      worldRepositoryCandidateCount: 123,
      worldSkillBodyCount: 20,
      worldCapabilityRecordsNormalized: 7,
      capabilityRecordCount: 7,
      approvedCapabilityCount: 2,
      activeCapabilityCount: 1,
      revokedCapabilityCount: 3
    }
  });
  assert.equal(event.ok, true);
  assert.equal(event.event.kind, 'CAPABILITY_CANDIDATE');
  assert.equal(event.event.sourceNodeId, 'capability-genome');
  assert.equal(event.event.truthClass, 'VERIFIED_CURRENT');
  assert.match(event.event.summary, /123 measured repository candidates/);
  assert.match(event.event.summary, /20 imported skill bodies/);
  assert.match(event.event.summary, /7 normalized capability records/);
  assert.match(event.event.summary, /2 approved/);
  assert.match(event.event.summary, /1 active/);
  assert.match(event.event.summary, /3 revoked/);
});

test('unhealthy Capability Genome becomes an evidenced capability gap', () => {
  const event = eventFromCapabilityGenomeResult({
    ok: false,
    status: 'CAPABILITY_GENOME_UNHEALTHY',
    state: { worldRepositoryCandidateCount: 10, worldSkillBodyCount: 2, worldCapabilityRecordsNormalized: 1 }
  });
  assert.equal(event.ok, true);
  assert.equal(event.event.kind, 'CAPABILITY_GAP');
  assert.equal(event.event.truthClass, 'RESEARCH_ASSET');
  assert.match(event.event.summary, /Route the evidenced gap/);
});

test('verified self-maintenance becomes verification evidence while failure becomes blocker evidence', () => {
  const verified = eventFromSelfMaintenanceResult({ ok: true, status: 'VERIFIED_CHANGESET_PROMOTED_TO_REVIEW', changeSetId: 'changes-1' });
  const blocked = eventFromSelfMaintenanceResult({ ok: false, status: 'VERIFICATION_FAILED' });
  assert.equal(verified.event.kind, 'VERIFICATION_RESULT');
  assert.equal(blocked.event.kind, 'BLOCKER');
  assert.equal(verified.event.businessEffectAuthority, 'NONE');
});

test('multi-organ artifact ingestion never invents missing source evidence', () => {
  const compiled = compileCognitiveEventsFromArtifacts({
    gamechanger: { generatedAt: '2026-09-05T18:00:00.000Z', frontierSignals: [], intelligencePackets: [] },
    genesis: { generatedAt: '2026-09-05T18:01:00.000Z', cycles: [], summary: {} },
    capabilityGenome: null,
    selfMaintenance: null,
    commercialOutcome: null
  });
  assert.equal(compiled.ok, true);
  assert.equal(compiled.eventCount, 2);
  assert.equal(compiled.events.some(event => event.event.sourceNodeId === 'capability-genome'), false);
});
