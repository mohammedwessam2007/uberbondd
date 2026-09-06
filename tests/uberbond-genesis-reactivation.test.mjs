import test from 'node:test';
import assert from 'node:assert/strict';
import { rankGenesisIdeasForCurrentGaps, compileGenesisReactivationEvents } from '../src/uberbond-genesis-reactivation.mjs';

const ATLAS = {
  ok: true,
  classes: {
    genesisIdeas: [
      { id: 'genesis-idea:1', ordinal: 1, name: 'Unknown-Unknown Engine', maturity: 'PARTIAL_PRIMITIVE', implementationStatus: 'OBSERVED_INTERNAL_RUNTIME_RECEIPT', implementationSources: ['src/perpetual-frontier-genesis.mjs'], implementationTests: [], runtimeReceipts: ['artifacts/x.json'], missingPaths: [], implementationNote: 'Compiles blind spots and contradictions into research questions.' },
      { id: 'genesis-idea:2', ordinal: 2, name: 'Provider Extinction Drill', maturity: 'IMPLEMENTED_PRIMITIVE', implementationStatus: 'SOURCE_AND_TEST_PRESENT', implementationSources: ['src/genesis-world-resilience.mjs'], implementationTests: [], runtimeReceipts: [], missingPaths: [], implementationNote: 'Models provider failure and capability gaps.' },
      { id: 'genesis-idea:3', ordinal: 3, name: 'Artistic Freedom Simulator', maturity: 'PARTIAL_PRIMITIVE', implementationStatus: 'SOURCE_AND_TEST_PRESENT', implementationSources: ['src/other.mjs'], implementationTests: [], runtimeReceipts: [], missingPaths: [], implementationNote: 'Unrelated fixture.' }
    ]
  }
};

const GENOME = {
  fallbackArtifacts: ['src/provider-failover-unknown.mjs'],
  reachabilityModules: [
    { path: 'src/provider-adapter.mjs', category: 'AWAITING_ACTIVATION', gate: 'NO_PROVIDER_ADAPTER_CONFIGURED', reason: 'provider unavailable' }
  ]
};

const META = {
  unknownAgenda: { agenda: [{ observation: 'What provider capability substitute survives provider failure?' }] },
  repeatedGateQuestions: [{ gate: 'NO_PROVIDER_ADAPTER_CONFIGURED', question: 'What lawful substitute removes provider dependency?' }],
  blindnessLedger: { blindSpots: [] }
};

test('reactivation ranks relevant GENESIS ideas from current pressure rather than all ideas', () => {
  const result = rankGenesisIdeasForCurrentGaps({ featureAtlas: ATLAS, featureGenome: GENOME, metacognitiveSynthesis: META, limit: 10 });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.candidateCount >= 1);
  assert.equal(result.candidates[0].ordinal, 2);
  assert.ok(result.candidates.every(item => item.score > 0));
  assert.equal(result.candidates.some(item => item.ordinal === 3), false);
  assert.equal(result.businessEffectAuthority, 'NONE');
  assert.match(result.truthBoundary, /search heuristic/i);
});

test('partial and not-yet-runtime-observed ideas get bounded priors but token overlap still drives selection', () => {
  const result = rankGenesisIdeasForCurrentGaps({ featureAtlas: ATLAS, featureGenome: { fallbackArtifacts: ['src/blind-spot.mjs'], reachabilityModules: [] }, metacognitiveSynthesis: { unknownAgenda: { agenda: [{ observation: 'blind spots contradictions' }] } } });
  assert.equal(result.ok, true);
  const unknown = result.candidates.find(item => item.ordinal === 1);
  assert.ok(unknown);
  assert.ok(unknown.score >= 7);
});

test('reactivated ideas become research events with no authority', () => {
  const ranking = rankGenesisIdeasForCurrentGaps({ featureAtlas: ATLAS, featureGenome: GENOME, metacognitiveSynthesis: META });
  const events = compileGenesisReactivationEvents(ranking, { date: new Date('2026-09-05T20:00:00Z') });
  assert.equal(events.ok, true);
  assert.ok(events.events.length > 0);
  assert.equal(events.events[0].event.kind, 'GENESIS_HYPOTHESIS');
  assert.equal(events.events[0].event.sourceNodeId, 'genesis-evolution');
  assert.equal(events.events[0].event.businessEffectAuthority, 'NONE');
  assert.match(events.events[0].event.summary, /token association is not proof/i);
});

test('reactivation refuses a missing feature atlas', () => {
  const result = rankGenesisIdeasForCurrentGaps({ featureAtlas: null });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('valid-feature-atlas-required'));
});
