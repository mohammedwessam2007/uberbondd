import test from 'node:test';
import assert from 'node:assert/strict';
import { synthesizeUberBondMetacognition } from '../src/uberbond-metacognitive-synthesis.mjs';

const FEATURE = {
  ok: true,
  genomeDigest: 'a'.repeat(64),
  fallbackArtifacts: ['src/mysterious-feature.mjs'],
  reachabilityModuleCount: 4,
  reachabilityModules: [
    { path: 'src/a.mjs', category: 'AWAITING_ACTIVATION', gate: 'NO_PROVIDER', reason: 'fixture' },
    { path: 'src/b.mjs', category: 'AWAITING_ACTIVATION', gate: 'NO_PROVIDER', reason: 'fixture' },
    { path: 'src/c.mjs', category: 'AWAITING_ACTIVATION', gate: 'NO_PROVIDER', reason: 'fixture' },
    { path: 'src/d.mjs', category: 'NEEDS_TRIAGE', gate: null, reason: 'unknown role' }
  ],
  readinessCapabilities: [{ id: 'provider-integration', status: 'PARTIAL', externalBlocker: 'No provider configured' }],
  familyCounts: { 'frontier-intelligence': 5, 'truth-evidence': 1 },
  featureFamilies: [
    { id: 'frontier-intelligence' },
    { id: 'truth-evidence' },
    { id: 'general-runtime' }
  ]
};

const EVENT_HORIZON = {
  schemaVersion: 'uberbond-event-horizon-1.0.0',
  economicGenes: [
    { id: 'evidence-precondition', description: 'Payment or acceptance depends on reconstructable evidence.' },
    { id: 'portfolio-channel-owner', description: 'One intermediary controls trusted access to many accounts.' },
    { id: 'service-to-rail', description: 'A bounded sprint can become a repeatable monitor after accepted use.' }
  ],
  tournament: [
    { id: 'champion', status: 'CURRENT_CHAMPION' },
    { id: 'challenger', status: 'GATED_CHALLENGER' }
  ]
};

test('metacognitive synthesis turns repository blind spots and repeated gates into bounded research, not authority', () => {
  const result = synthesizeUberBondMetacognition({
    featureGenome: FEATURE,
    eventHorizon: EVENT_HORIZON,
    capabilityGenome: { status: 'CAPABILITY_GENOME_FOUNDATION_HEALTHY', state: { approvedCapabilityCount: 0 } },
    frontierModelTeam: { status: 'FRONTIER_MODEL_TEAM_DOCTOR_READY', roleCoverage: { gaps: ['verifier'] } },
    date: new Date('2026-09-05T20:00:00Z')
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.hypotheses.unknownUnknownCount > 0);
  assert.ok(result.hypotheses.ideaCandidateCount > 0);
  assert.ok(result.repeatedGateQuestions.some(item => item.gate === 'NO_PROVIDER' && item.recurrence === 3));
  assert.equal(result.executionAuthority, 'NONE');
  assert.equal(result.promotionAuthority, 'NONE');
  assert.match(result.truthBoundary, /HYPOTHESES/);
});

test('Mechanism Lab recombinations remain unproven and retain kill conditions', () => {
  const result = synthesizeUberBondMetacognition({ featureGenome: FEATURE, eventHorizon: EVENT_HORIZON, date: new Date('2026-09-05T20:00:00Z') });
  assert.equal(result.ok, true);
  assert.ok(result.mechanismLab.recombinations.candidates.length >= 1);
  for (const candidate of result.mechanismLab.recombinations.candidates) {
    assert.equal(candidate.evidenceStatus, 'UNPROVEN_COMBINATION');
    assert.ok(candidate.killConditions.includes('no cleared payment after bounded experiment'));
  }
  assert.ok(result.mechanismLab.redTeamedRecombinations.every(review => review.promotion === 'DISABLED_UNTIL_PAYMENT_AND_ACCEPTED_DELIVERY_PROOF'));
});

test('unknown-unknown work happens before cognitive idea promotion and repeated gates become capability-gap attention only', () => {
  const result = synthesizeUberBondMetacognition({ featureGenome: FEATURE, eventHorizon: EVENT_HORIZON, date: new Date('2026-09-05T20:00:00Z') });
  assert.equal(result.ok, true);
  assert.ok(result.events.some(event => event.event.kind === 'ONTOLOGY_CANDIDATE'));
  assert.ok(result.events.some(event => event.event.kind === 'IDEA_CANDIDATE'));
  const gateEvent = result.events.find(event => event.event.kind === 'CAPABILITY_GAP');
  assert.ok(gateEvent);
  assert.match(gateEvent.event.summary, /never bypass the gate/i);
  assert.equal(gateEvent.event.businessEffectAuthority, 'NONE');
});

test('metacognitive synthesis fails closed without Feature Genome or Event Horizon genes', () => {
  const noGenome = synthesizeUberBondMetacognition({ eventHorizon: EVENT_HORIZON });
  assert.equal(noGenome.ok, false);
  assert.ok(noGenome.reasonCodes.includes('valid-feature-genome-required'));
  const noEconomics = synthesizeUberBondMetacognition({ featureGenome: FEATURE, eventHorizon: {} });
  assert.equal(noEconomics.ok, false);
  assert.ok(noEconomics.reasonCodes.includes('event-horizon-economic-genes-required'));
});
