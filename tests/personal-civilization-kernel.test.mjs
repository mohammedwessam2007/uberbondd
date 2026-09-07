import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERSONAL_CIVILIZATION_EFFECT_AUTHORITY,
  PERSONAL_CIVILIZATION_DECISION_AUTHORITY,
  compileLifeKnowledgeSnapshot,
  deriveAncestralCapabilities,
  compileLifePossibilityPortfolio,
  compileExperiencePortfolio,
  compileFutureSelfCouncil,
  compileAutopoiesisMap,
  compilePersonalCivilizationPlan
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

function snapshot() {
  return compileLifeKnowledgeSnapshot({
    snapshotId: 'life-001',
    goals: ['expand valuable reachable futures'],
    constraints: ['founder sovereignty'],
    values: ['truth', 'agency'],
    capabilityInventory: [
      { id: 'communication', currentLevel: 0.4, prerequisites: [], evidenceRefs: ['evidence:self-assessment'] },
      { id: 'language', currentLevel: 0.2, prerequisites: ['communication'], evidenceRefs: ['evidence:study-log'] },
      { id: 'research', currentLevel: 0.5, prerequisites: [], evidenceRefs: ['evidence:project-log'] }
    ],
    futurePaths: [
      { id: 'path-a', label: 'A', requiredCapabilities: ['communication', 'language'], evidenceRefs: ['hypothesis:a'] },
      { id: 'path-b', label: 'B', requiredCapabilities: ['communication', 'research'], evidenceRefs: ['hypothesis:b'] },
      { id: 'path-c', label: 'C', requiredCapabilities: ['communication'], evidenceRefs: ['hypothesis:c'] }
    ],
    evidenceRefs: ['evidence:owner-goal']
  });
}

function intervention(id, overrides = {}) {
  return {
    id,
    effects: effects({ agency: 1, capability: 1 }),
    evidenceRefs: [`hypothesis:${id}`],
    opensFutureIds: [],
    preservesFutureIds: [],
    closesFutureIds: [],
    capabilityIds: [],
    founderMinutes: 10,
    costCents: 0,
    risk: 1,
    uncertainty: 0.4,
    reversible: true,
    ...overrides
  };
}

test('life snapshot is private, zero-effect and founder-sovereign', () => {
  const result = snapshot();
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.snapshot.privacy.publicPersistenceAllowed, false);
  assert.equal(result.decisionAuthority, PERSONAL_CIVILIZATION_DECISION_AUTHORITY);
  assert.equal(result.externalEffectAuthority, PERSONAL_CIVILIZATION_EFFECT_AUTHORITY);
  assert.equal(result.snapshot.externalEffectLedger.messages, 0);
});

test('public persistence of private life state fails closed', () => {
  const result = compileLifeKnowledgeSnapshot({
    snapshotId: 'x', goals: ['x'], constraints: [], values: [], evidenceRefs: [], publicPersist: true
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('public-persistence-forbidden'));
});

test('ancestral capabilities expose cross-future leverage without choosing a life path', () => {
  const compiled = snapshot();
  const result = deriveAncestralCapabilities({ snapshot: compiled.snapshot });
  assert.equal(result.ok, true);
  assert.equal(result.ancestralCapabilities[0].capabilityId, 'communication');
  assert.equal(result.ancestralCapabilities[0].pathCount, 3);
  assert.equal(result.highestTransferCandidates[0].crossFutureCoverage, 1);
});

test('possibility portfolio preserves multi-objective Pareto frontier and refuses automatic winner', () => {
  const compiled = snapshot();
  const result = compileLifePossibilityPortfolio({
    snapshot: compiled.snapshot,
    interventions: [
      intervention('dominator', { effects: effects({ agency: 2, capability: 2 }), opensFutureIds: ['path-d'], founderMinutes: 5 }),
      intervention('dominated', { effects: effects({ agency: 1, capability: 1 }), founderMinutes: 10 }),
      intervention('tradeoff', { effects: effects({ relationships: 4, meaningfulExperience: 4 }), founderMinutes: 20 })
    ]
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.portfolio.noAutomaticWinner, true);
  assert.ok(result.portfolio.frontier.some((item) => item.id === 'dominator'));
  assert.ok(result.portfolio.frontier.some((item) => item.id === 'tradeoff'));
  assert.ok(result.portfolio.dominated.some((item) => item.id === 'dominated'));
});

test('kernel refuses interventions that request external side effects', () => {
  const compiled = snapshot();
  const result = compileLifePossibilityPortfolio({
    snapshot: compiled.snapshot,
    interventions: [intervention('send-message', { requestedExternalEffect: true })]
  });
  assert.equal(result.ok, true);
  assert.equal(result.portfolio.frontier.length, 0);
  assert.deepEqual(result.portfolio.refused[0].reasonCodes, ['external-effect-not-authorized']);
});

test('high-stakes domains are advisory and require qualified professional review', () => {
  const compiled = snapshot();
  const result = compileLifePossibilityPortfolio({
    snapshot: compiled.snapshot,
    interventions: [intervention('medical-choice', { domain: 'MEDICAL' })]
  });
  assert.equal(result.portfolio.frontier[0].reviewClass, 'FOUNDER_PLUS_QUALIFIED_PROFESSIONAL_REVIEW');
  assert.equal(result.externalEffectAuthority, 'NONE');
});

test('experience compiler values multidomain synergy without making efficiency supreme', () => {
  const result = compileExperiencePortfolio({
    experiences: [intervention('immersion', { effects: effects({ capability: 3, relationships: 3, meaningfulExperience: 4, meaning: 2 }) })]
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.experiences[0].multiDomainSynergyCount, 4);
  assert.equal(result.noJoylessEfficiencyObjective, true);
});

test('future-self council has perspective authority only and cannot vote life decisions into force', () => {
  const result = compileFutureSelfCouncil({
    decision: 'choose a long-horizon commitment',
    perspectives: [
      { id: 'near', horizon: '1 year', priorities: ['learning'], concerns: ['lock-in'], evidenceRefs: [] },
      { id: 'far', horizon: '20 years', priorities: ['freedom'], concerns: ['regret'], evidenceRefs: [] }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.council.votingAuthority, 'NONE');
  assert.equal(result.council.founderDecisionRequired, true);
});

test('autopoiesis map detects bounded reinforcing loops as hypotheses', () => {
  const result = compileAutopoiesisMap({
    edges: [
      { from: 'learning', to: 'competence', mechanism: 'practice', evidenceRefs: [] },
      { from: 'competence', to: 'opportunity', mechanism: 'better execution', evidenceRefs: [] },
      { from: 'opportunity', to: 'learning', mechanism: 'richer exposure', evidenceRefs: [] }
    ]
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.loopCount, 1);
  assert.equal(result.loopsAreHypothesesUntilObserved, true);
});

test('integrated plan compiles life possibility, osteogenesis, experience, council and autopoiesis without authority gain', () => {
  const compiled = snapshot();
  const result = compilePersonalCivilizationPlan({
    snapshot: compiled.snapshot,
    interventions: [intervention('study', { capabilityIds: ['communication'], preservesFutureIds: ['path-a', 'path-b'] })],
    experiences: [intervention('experience', { effects: effects({ meaningfulExperience: 3, relationships: 2 }) })],
    futureSelfDecision: 'commit to a path',
    futureSelfPerspectives: [
      { id: 'five-year', horizon: '5 years', priorities: ['optionality'], concerns: ['path dependence'], evidenceRefs: [] },
      { id: 'older', horizon: '30 years', priorities: ['meaning'], concerns: ['regret'], evidenceRefs: [] }
    ],
    autopoiesisEdges: [
      { from: 'learning', to: 'freedom', mechanism: 'capability creates options', evidenceRefs: [] },
      { from: 'freedom', to: 'learning', mechanism: 'time enables study', evidenceRefs: [] }
    ]
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.plan.decisionAuthority, 'FOUNDER_ONLY');
  assert.equal(result.plan.externalEffectAuthority, 'NONE');
  assert.ok(result.plan.constitutionalRules.includes('NO_SINGLE_SCALAR_LIFE_UTILITY'));
});
