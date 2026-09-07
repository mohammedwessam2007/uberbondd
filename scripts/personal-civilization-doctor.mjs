#!/usr/bin/env node

// Zero-effect operator surface for the Personal Civilization Engine foundation.
// This doctor uses only synthetic, public-safe fixture data. It proves that the
// North Star has an executable kernel without persisting private life state or
// granting any authority over the founder or the external world.

import {
  PERSONAL_CIVILIZATION_KERNEL_VERSION,
  PERSONAL_CIVILIZATION_DECISION_AUTHORITY,
  PERSONAL_CIVILIZATION_EFFECT_AUTHORITY,
  compileLifeKnowledgeSnapshot,
  deriveAncestralCapabilities,
  compileLifePossibilityPortfolio,
  compileAutopoiesisMap
} from '../src/personal-civilization-kernel.mjs';

const effects = (overrides = {}) => ({
  agency: 0,
  capability: 0,
  understanding: 0,
  meaningfulExperience: 0,
  relationships: 0,
  freedom: 0,
  healthSupport: 0,
  creativity: 0,
  economicResilience: 0,
  timeSovereignty: 0,
  meaning: 0,
  ...overrides
});

export function compilePersonalCivilizationDoctor() {
  const snapshot = compileLifeKnowledgeSnapshot({
    snapshotId: 'doctor-synthetic-life-state',
    goals: ['expand valuable reachable futures'],
    constraints: ['founder sovereignty', 'zero external effects'],
    values: ['truth', 'agency', 'optionality'],
    capabilityInventory: [
      { id: 'learning', prerequisites: [], evidenceRefs: ['fixture:synthetic'] },
      { id: 'communication', prerequisites: ['learning'], evidenceRefs: ['fixture:synthetic'] }
    ],
    futurePaths: [
      { id: 'future-a', requiredCapabilities: ['learning', 'communication'], evidenceRefs: ['fixture:hypothesis'] },
      { id: 'future-b', requiredCapabilities: ['learning'], evidenceRefs: ['fixture:hypothesis'] }
    ],
    evidenceRefs: ['fixture:synthetic-only']
  });
  if (!snapshot.ok) return snapshot;

  const ancestral = deriveAncestralCapabilities({ snapshot: snapshot.snapshot });
  const possibilities = compileLifePossibilityPortfolio({
    snapshot: snapshot.snapshot,
    interventions: [
      {
        id: 'reversible-learning-experiment',
        effects: effects({ agency: 1, capability: 2, understanding: 2, freedom: 1 }),
        evidenceRefs: ['fixture:hypothesis'],
        opensFutureIds: [],
        preservesFutureIds: ['future-a', 'future-b'],
        closesFutureIds: [],
        capabilityIds: ['learning'],
        founderMinutes: 30,
        costCents: 0,
        risk: 1,
        uncertainty: 0.5,
        reversible: true
      }
    ]
  });
  const autopoiesis = compileAutopoiesisMap({
    edges: [
      { from: 'learning', to: 'capability', mechanism: 'practice can improve capability', evidenceRefs: ['fixture:hypothesis'] },
      { from: 'capability', to: 'learning', mechanism: 'greater capability can unlock richer learning', evidenceRefs: ['fixture:hypothesis'] }
    ]
  });

  const ok = snapshot.ok && ancestral.ok && possibilities.ok && autopoiesis.ok;
  return {
    ok,
    status: ok ? 'PERSONAL_CIVILIZATION_FOUNDATION_READY' : 'PERSONAL_CIVILIZATION_FOUNDATION_NOT_READY',
    kernelVersion: PERSONAL_CIVILIZATION_KERNEL_VERSION,
    decisionAuthority: PERSONAL_CIVILIZATION_DECISION_AUTHORITY,
    externalEffectAuthority: PERSONAL_CIVILIZATION_EFFECT_AUTHORITY,
    publicFixtureOnly: true,
    privateLifeStatePersisted: false,
    checks: {
      lifeKnowledgeSnapshot: snapshot.ok,
      ancestralCapabilities: ancestral.ok,
      possibilityPortfolio: possibilities.ok,
      lifeAutopoiesis: autopoiesis.ok,
      noAutomaticLifeWinner: possibilities.portfolio?.noAutomaticWinner === true,
      founderDecisionRequired: possibilities.portfolio?.founderMustChoose === true
    },
    externalEffectLedger: snapshot.externalEffectLedger
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = compilePersonalCivilizationDoctor();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}
