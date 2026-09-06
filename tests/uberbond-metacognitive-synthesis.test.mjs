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
  familyCounts: { 'frontier-intelligence': 5, 'truth-evidence': 1, 'compute-sovereignty': 1 },
  featureFamilies: [
    { id: 'frontier-intelligence' },
    { id: 'truth-evidence' },
    { id: 'compute-sovereignty' },
    { id: 'general-runtime' }
  ]
};

const ATLAS = {
  ok: true,
  atlasDigest: 'b'.repeat(64),
  featureGenomeDigest: FEATURE.genomeDigest,
  atomCount: 10,
  classCounts: { exportedCodeFeatures: 4 },
  classes: {
    genesisIdeas: [
      {
        ordinal: 1,
        name: 'Unknown-Unknown Engine',
        maturity: 'PARTIAL_PRIMITIVE',
        implementationStatus: 'OBSERVED_INTERNAL_RUNTIME_RECEIPT',
        implementationSources: ['src/perpetual-frontier-genesis.mjs'],
        implementationTests: ['tests/perpetual-frontier-genesis.test.mjs'],
        runtimeReceipts: ['artifacts/perpetual-frontier-genesis-latest.json']
      },
      {
        ordinal: 42,
        name: 'Fixture Source-Only Idea',
        maturity: 'IMPLEMENTED_PRIMITIVE',
        implementationStatus: 'SOURCE_AND_TEST_PRESENT',
        implementationSources: ['src/fixture.mjs'],
        implementationTests: ['tests/fixture.test.mjs'],
        runtimeReceipts: []
      }
    ]
  }
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
    featureAtomAtlas: ATLAS,
    eventHorizon: EVENT_HORIZON,
    capabilityGenome: { status: 'CAPABILITY_GENOME_FOUNDATION_HEALTHY', state: { approvedCapabilityCount: 0 } },
    frontierModelTeam: { status: 'FRONTIER_MODEL_TEAM_DOCTOR_READY', roleCoverage: { gaps: ['verifier'] } },
    computeSovereignty: { status: 'COMPUTE_SOVEREIGNTY_NO_PROVEN_SUPPLY', admissibleOfferCount: 0, rejectedOfferCount: 2, zeroCostTokens: 0 },
    date: new Date('2026-09-05T20:00:00Z')
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.hypotheses.unknownUnknownCount > 0);
  assert.ok(result.hypotheses.ideaCandidateCount > 0);
  assert.ok(result.repeatedGateQuestions.some(item => item.gate === 'NO_PROVIDER' && item.recurrence === 3));
  assert.equal(result.executionAuthority, 'NONE');
  assert.equal(result.promotionAuthority, 'NONE');
  assert.match(result.truthBoundary, /HYPOTHESES/);
  assert.equal(result.inputs.featureAtomAtlasDigest, ATLAS.atlasDigest);
  assert.equal(result.inputs.partialGenesisPrimitiveCount, 1);
  assert.equal(result.inputs.sourceOnlyGenesisCandidateCount, 1);
  assert.equal(result.inputs.provenComputeOfferCount, 0);
});

test('partial and source-only GENESIS atoms create research pressure without upgrading maturity', () => {
  const result = synthesizeUberBondMetacognition({
    featureGenome: FEATURE,
    featureAtomAtlas: ATLAS,
    eventHorizon: EVENT_HORIZON,
    date: new Date('2026-09-05T20:00:00Z')
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.featureAtomPressure.partialGenesis[0].name, 'Unknown-Unknown Engine');
  assert.equal(result.featureAtomPressure.partialGenesis[0].implementationStatus, 'OBSERVED_INTERNAL_RUNTIME_RECEIPT');
  assert.equal(result.featureAtomPressure.sourceOnlyGenesis[0].name, 'Fixture Source-Only Idea');
  const agenda = JSON.stringify(result.unknownAgenda);
  assert.match(agenda, /smallest missing mechanism/i);
  assert.match(agenda, /runtime activation would add decision value/i);
});

test('zero proven compute becomes lawful scarcity research and never bypass permission', () => {
  const result = synthesizeUberBondMetacognition({
    featureGenome: FEATURE,
    featureAtomAtlas: ATLAS,
    eventHorizon: EVENT_HORIZON,
    computeSovereignty: {
      status: 'COMPUTE_SOVEREIGNTY_NO_PROVEN_SUPPLY',
      admissibleOfferCount: 0,
      rejectedOfferCount: 4,
      zeroCostTokens: 0
    },
    date: new Date('2026-09-05T20:00:00Z')
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  const agenda = JSON.stringify(result.unknownAgenda);
  assert.match(agenda, /lawful local\/open runtimes/i);
  assert.match(agenda, /Do not solve this by quota, identity, credential, billing or terms bypass/i);
  assert.equal(result.inputs.zeroCostAuthorizedTokens, 0);
  assert.equal(result.executionAuthority, 'NONE');
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

test('atlas mismatch fails closed rather than mixing feature states', () => {
  const result = synthesizeUberBondMetacognition({
    featureGenome: FEATURE,
    featureAtomAtlas: { ...ATLAS, featureGenomeDigest: 'c'.repeat(64) },
    eventHorizon: EVENT_HORIZON
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('feature-atom-atlas-must-match-feature-genome'));
});

test('metacognitive synthesis fails closed without Feature Genome or Event Horizon genes', () => {
  const noGenome = synthesizeUberBondMetacognition({ eventHorizon: EVENT_HORIZON });
  assert.equal(noGenome.ok, false);
  assert.ok(noGenome.reasonCodes.includes('valid-feature-genome-required'));
  const noEconomics = synthesizeUberBondMetacognition({ featureGenome: FEATURE, eventHorizon: {} });
  assert.equal(noEconomics.ok, false);
  assert.ok(noEconomics.reasonCodes.includes('event-horizon-economic-genes-required'));
});
