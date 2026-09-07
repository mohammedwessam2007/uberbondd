import test from 'node:test';
import assert from 'node:assert/strict';
import { compileLifeKnowledgeSnapshot } from '../src/personal-civilization-kernel.mjs';
import {
  compilePersonalCounterfactualUniverse,
  compileOsteogenesisPlan,
  compilePersonalTimeTelescope,
  compileIdentityEvolutionHypothesis,
  compileSerendipityPortfolio,
  compileLifeGamechangerSignal,
  compileLifeGenesisPopulation,
  compileLifeCompressionModel
} from '../src/personal-civilization-organs.mjs';

function snapshot() {
  const result = compileLifeKnowledgeSnapshot({
    snapshotId: 'life-organs-fixture',
    goals: ['expand valuable reachable futures'],
    constraints: ['founder sovereignty'],
    values: ['truth', 'freedom'],
    capabilityInventory: [
      { id: 'learning', currentLevel: 0.8, prerequisites: [], evidenceRefs: ['fixture:learning'] },
      { id: 'communication', currentLevel: 0.4, prerequisites: ['learning'], evidenceRefs: ['fixture:communication'] },
      { id: 'language', currentLevel: 0.2, prerequisites: ['communication'], evidenceRefs: ['fixture:language'] }
    ],
    futurePaths: [
      { id: 'future-a', requiredCapabilities: ['communication', 'language'], evidenceRefs: ['fixture:a'] },
      { id: 'future-b', requiredCapabilities: ['communication'], evidenceRefs: ['fixture:b'] }
    ],
    evidenceRefs: ['fixture:owner-goal']
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.snapshot;
}

test('counterfactual universe extracts invariants instead of ranking fantasy lives', () => {
  const result = compilePersonalCounterfactualUniverse({
    snapshot: snapshot(),
    variants: [
      { id: 'a', capabilityIds: ['communication', 'language'], commitments: ['path-a'], failureModes: ['lock-in'], evidenceRefs: [] },
      { id: 'b', capabilityIds: ['communication'], commitments: ['path-b'], failureModes: ['lock-in'], evidenceRefs: [] },
      { id: 'c', capabilityIds: ['communication', 'new-capability'], commitments: [], failureModes: ['drift'], evidenceRefs: [] }
    ]
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.universe.ancestralCapabilities[0].capabilityId, 'communication');
  assert.equal(result.universe.ancestralCapabilities[0].coverage, 1);
  assert.deepEqual(result.universe.inventedCapabilities, ['new-capability']);
  assert.equal(result.universe.automaticPathSelection, false);
});

test('Osteogenesis grows prerequisite skeleton and never gains human-change authority', () => {
  const result = compileOsteogenesisPlan({ snapshot: snapshot(), targetFutureIds: ['future-a'], masteryThreshold: 0.7 });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.plan.atoms.some((atom) => atom.capabilityId === 'language' && atom.status === 'GROWTH_REQUIRED'));
  assert.ok(result.plan.atoms.some((atom) => atom.capabilityId === 'learning' && atom.status === 'SUFFICIENT_FOR_THRESHOLD'));
  assert.equal(result.plan.humanChangeAuthority, 'NONE');
  assert.equal(result.plan.trainingAuthority, 'PROPOSE_ONLY');
});

test('Osteogenesis refuses a future that does not exist', () => {
  const result = compileOsteogenesisPlan({ snapshot: snapshot(), targetFutureIds: ['invented'] });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('unknown-target-future'));
});

test('Time Telescope exposes compounding as uncertain scenarios, never exact prophecy', () => {
  const result = compilePersonalTimeTelescope({ behavior: 'practice a skill', occurrencesPerWeek: 7, effectPerOccurrence: 1, confidence: 0.6 });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.telescope.exactPredictionClaimed, false);
  assert.ok(result.telescope.horizons.length >= 4);
  assert.ok(result.telescope.horizons.every((horizon) => horizon.interpretation === 'SCENARIO_NOT_FORECAST'));
});

test('Identity Evolution refuses to compress a self-story into one explanation', () => {
  const result = compileIdentityEvolutionHypothesis({
    statement: 'I am bad at this',
    evidenceRefs: ['fixture:observation'],
    candidateExplanations: [
      { id: 'skill', kind: 'SKILL', explanation: 'limited practice', evidenceRefs: [], confidence: 0.6 },
      { id: 'environment', kind: 'ENVIRONMENT', explanation: 'context makes practice difficult', evidenceRefs: [], confidence: 0.4 }
    ],
    lowCostTests: [{ id: 'practice', description: 'try a bounded practice block', reversible: true, founderMinutes: 20, evidenceRefs: [] }]
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.hypothesis.identityVerdict, 'UNRESOLVED');
  assert.equal(result.hypothesis.antiCompressionLaw, 'DO_NOT_TURN_LIMITED_EVIDENCE_INTO_IDENTITY');
});

test('Serendipity portfolio rewards heterogeneous exposure but cannot contact anyone', () => {
  const result = compileSerendipityPortfolio({
    collisions: [
      { id: 'wide', domains: ['medicine', 'art', 'technology'], exposure: 'attend a mixed-domain public event', evidenceRefs: [], founderMinutes: 90, risk: 1, reversible: true },
      { id: 'effect', domains: ['medicine', 'technology'], exposure: 'message someone automatically', evidenceRefs: [], founderMinutes: 5, risk: 1, requestedExternalEffect: true }
    ]
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.portfolio.candidates[0].id, 'wide');
  assert.equal(result.portfolio.refused[0].id, 'effect');
  assert.equal(result.portfolio.automaticContactAuthority, 'NONE');
});

test('Life Gamechanger is evidence-bound signal with zero promotion authority', () => {
  const result = compileLifeGamechangerSignal({
    id: 'signal-1',
    observation: 'a relevant external primitive changed',
    changedPrimitives: ['access-cost'],
    affectedFutureIds: ['future-a'],
    evidenceRefs: ['official:source'],
    observedAt: '2026-09-07T00:00:00Z',
    confidence: 0.8
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.signal.promotionAuthority, 'NONE');
  assert.equal(result.signal.actionAuthority, 'NONE');
});

test('Life GENESIS generates hypotheses from admitted signals, not commitments', () => {
  const signal = compileLifeGamechangerSignal({ id: 's', observation: 'primitive changed', changedPrimitives: ['x'], affectedFutureIds: ['future-a'], evidenceRefs: ['source:x'], observedAt: '2026-09-07T00:00:00Z' });
  const result = compileLifeGenesisPopulation({
    snapshot: snapshot(),
    signals: [signal.signal],
    mutations: [{ id: 'm1', premise: 'combine two paths in a reversible experiment', capabilityIds: ['communication'], preservesFutureIds: ['future-a'], evidenceRefs: [] }]
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.population.candidates[0].truthClass, 'HYPOTHESIS');
  assert.equal(result.population.automaticCommitmentAuthority, 'NONE');
  assert.equal(result.population.imaginationIsNotEvidence, true);
});

test('Life Compression preserves unexplained observations and exceptions', () => {
  const result = compileLifeCompressionModel({
    observations: [{ id: 'o1' }, { id: 'o2' }, { id: 'o3' }],
    principles: [{ id: 'p1', statement: 'a candidate mechanism', explainsObservationIds: ['o1', 'o2'], exceptionObservationIds: ['o2'], evidenceRefs: [] }]
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(result.model.unexplainedObservationIds, ['o3']);
  assert.equal(result.model.exceptionObservationCount, 1);
  assert.equal(result.model.truthLaw, 'COMPRESSION_MUST_PRESERVE_EXCEPTIONS_AND_UNCERTAINTY');
});

test('all new life organs remain zero-effect and founder-sovereign', () => {
  const telescope = compilePersonalTimeTelescope({ behavior: 'read', occurrencesPerWeek: 1, effectPerOccurrence: 1 });
  assert.equal(telescope.decisionAuthority, 'FOUNDER_ONLY');
  assert.equal(telescope.externalEffectAuthority, 'NONE');
  assert.deepEqual(telescope.externalEffectLedger, {
    providerCalls: 0,
    messages: 0,
    purchases: 0,
    deployments: 0,
    credentialChanges: 0,
    dnsChanges: 0,
    productionMutations: 0,
    spendCents: 0
  });
});
