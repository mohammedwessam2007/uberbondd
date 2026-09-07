#!/usr/bin/env node

// Zero-effect operator proof for the first Personal Civilization life organs.
// Synthetic fixture only. No founder-private state, provider calls or external actions.

import { compileLifeKnowledgeSnapshot } from '../src/personal-civilization-kernel.mjs';
import {
  PERSONAL_CIVILIZATION_ORGANS_VERSION,
  compilePersonalCounterfactualUniverse,
  compileOsteogenesisPlan,
  compilePersonalTimeTelescope,
  compileIdentityEvolutionHypothesis,
  compileSerendipityPortfolio,
  compileLifeGamechangerSignal,
  compileLifeGenesisPopulation,
  compileLifeCompressionModel
} from '../src/personal-civilization-organs.mjs';
import { ZERO_EXTERNAL_EFFECTS } from '../src/effect-ledgers.mjs';

export function compilePersonalCivilizationOrgansDoctor() {
  const snapshot = compileLifeKnowledgeSnapshot({
    snapshotId: 'synthetic-organs-doctor',
    goals: ['expand valuable reachable futures'],
    constraints: ['founder sovereignty'],
    values: ['truth', 'agency'],
    capabilityInventory: [
      { id: 'learning', currentLevel: 0.8, prerequisites: [], evidenceRefs: ['fixture:synthetic'] },
      { id: 'communication', currentLevel: 0.4, prerequisites: ['learning'], evidenceRefs: ['fixture:synthetic'] }
    ],
    futurePaths: [
      { id: 'future-a', requiredCapabilities: ['communication'], evidenceRefs: ['fixture:hypothesis'] },
      { id: 'future-b', requiredCapabilities: ['learning'], evidenceRefs: ['fixture:hypothesis'] }
    ],
    evidenceRefs: ['fixture:synthetic-owner-goal']
  });
  if (!snapshot.ok) return snapshot;

  const counterfactual = compilePersonalCounterfactualUniverse({
    snapshot: snapshot.snapshot,
    variants: [
      { id: 'a', capabilityIds: ['learning', 'communication'], commitments: [], failureModes: ['lock-in'], evidenceRefs: [] },
      { id: 'b', capabilityIds: ['learning'], commitments: [], failureModes: ['drift'], evidenceRefs: [] }
    ]
  });
  const osteogenesis = compileOsteogenesisPlan({ snapshot: snapshot.snapshot, targetFutureIds: ['future-a'] });
  const telescope = compilePersonalTimeTelescope({ behavior: 'synthetic repeated learning', occurrencesPerWeek: 5, effectPerOccurrence: 1 });
  const identity = compileIdentityEvolutionHypothesis({
    statement: 'synthetic self-story',
    evidenceRefs: ['fixture:synthetic'],
    candidateExplanations: [
      { id: 'skill', kind: 'SKILL', explanation: 'practice may be limited', evidenceRefs: [], confidence: 0.5 },
      { id: 'environment', kind: 'ENVIRONMENT', explanation: 'context may matter', evidenceRefs: [], confidence: 0.5 }
    ],
    lowCostTests: [{ id: 'test', description: 'bounded reversible practice', reversible: true, founderMinutes: 10, evidenceRefs: [] }]
  });
  const serendipity = compileSerendipityPortfolio({ collisions: [{ id: 'collision', domains: ['learning', 'creation'], exposure: 'synthetic cross-domain exposure', evidenceRefs: [], founderMinutes: 10, risk: 0, reversible: true }] });
  const signal = compileLifeGamechangerSignal({ id: 'signal', observation: 'synthetic primitive changed', changedPrimitives: ['synthetic-primitive'], affectedFutureIds: ['future-a'], evidenceRefs: ['fixture:synthetic'], observedAt: '2026-09-07T00:00:00Z' });
  const genesis = signal.ok ? compileLifeGenesisPopulation({ snapshot: snapshot.snapshot, signals: [signal.signal], mutations: [{ id: 'mutation', premise: 'synthetic reversible possibility', capabilityIds: ['communication'], preservesFutureIds: ['future-a'], evidenceRefs: [] }] }) : signal;
  const compression = compileLifeCompressionModel({ observations: [{ id: 'o1' }, { id: 'o2' }], principles: [{ id: 'p1', statement: 'synthetic principle', explainsObservationIds: ['o1'], exceptionObservationIds: [], evidenceRefs: [] }] });

  const organs = { counterfactual, osteogenesis, telescope, identity, serendipity, signal, genesis, compression };
  const checks = Object.fromEntries(Object.entries(organs).map(([name, result]) => [name, result.ok === true]));
  const allGreen = Object.values(checks).every(Boolean);
  const allZeroEffect = Object.values(organs).every((result) => result.externalEffectAuthority === 'NONE' && JSON.stringify(result.externalEffectLedger) === JSON.stringify(ZERO_EXTERNAL_EFFECTS));
  return {
    ok: allGreen && allZeroEffect,
    status: allGreen && allZeroEffect ? 'PERSONAL_CIVILIZATION_ORGANS_READY' : 'PERSONAL_CIVILIZATION_ORGANS_NOT_READY',
    organsVersion: PERSONAL_CIVILIZATION_ORGANS_VERSION,
    checks,
    allZeroEffect,
    founderPrivateStateLoaded: false,
    decisionAuthority: 'FOUNDER_ONLY',
    externalEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = compilePersonalCivilizationOrgansDoctor();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}
