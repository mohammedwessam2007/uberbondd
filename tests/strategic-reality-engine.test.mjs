import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileStrategicReality,
  assessStrategicPlan,
  strategicBlindspotProbes
} from '../src/strategic-reality-engine.mjs';

const actor = (overrides = {}) => ({
  actorId: 'counterparty-1',
  role: 'counterparty',
  sovereign: true,
  canExit: true,
  responses: [
    {
      id: 'decline',
      class: 'DECLINE',
      description: 'Declines the proposal',
      probability: 0.2,
      evidenceRef: 'evidence:decline-base-rate'
    },
    {
      id: 'adapt',
      class: 'ADAPT',
      description: 'Changes behaviour after learning the plan',
      probability: 0.3,
      evidenceRef: 'evidence:adapt-base-rate'
    }
  ],
  ...overrides
});

test('other actors must remain sovereign rather than becoming controllable terrain', () => {
  const result = compileStrategicReality({
    subject: 'partner distribution plan',
    actors: [actor({ sovereign: false })]
  });
  assert.equal(result.ok, false);
  assert.ok(result.reasonCodes.includes('other-actor-must-be-treated-as-sovereign:counterparty-1'));
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('probabilities require evidence and may not exceed one per actor', () => {
  const missingEvidence = compileStrategicReality({
    subject: 'x',
    actors: [actor({ responses: [{ id: 'r1', class: 'DECLINE', description: 'no', probability: 0.4 }] })]
  });
  assert.equal(missingEvidence.ok, false);
  assert.ok(missingEvidence.reasonCodes.includes('probability-evidence-required:counterparty-1:r1'));

  const overfull = compileStrategicReality({
    subject: 'x',
    actors: [actor({ responses: [
      { id: 'r1', class: 'DECLINE', description: 'no', probability: 0.7, evidenceRef: 'e:1' },
      { id: 'r2', class: 'ADAPT', description: 'adapt', probability: 0.6, evidenceRef: 'e:2' }
    ] })]
  });
  assert.equal(overfull.ok, false);
  assert.ok(overfull.reasonCodes.includes('actor-probability-total-exceeds-one:counterparty-1'));
});

test('missing probability mass remains unknown instead of being normalized into certainty', () => {
  const result = compileStrategicReality({ subject: 'x', actors: [actor()] });
  assert.equal(result.ok, true);
  assert.equal(result.actors[0].unassignedProbabilityMass, 0.5);
  assert.match(result.truthBoundary, /SOVEREIGN_AND_ADAPTIVE/);
});

test('consent rights and legitimate exit are hard boundaries, not low-scoring scenarios', () => {
  const reality = compileStrategicReality({ subject: 'x', actors: [actor()] });
  const result = assessStrategicPlan({
    planRef: 'plan:1',
    strategicReality: reality,
    scenarios: [
      {
        id: 's1',
        actorId: 'counterparty-1',
        responseId: 'decline',
        planStillWorks: true,
        adaptationAvailable: true,
        requiresConsentWithoutConsent: true,
        evidenceRef: 'scenario:evidence'
      }
    ]
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'STRATEGIC_PLAN_BLOCKED_BY_INTER_SOVEREIGN_BOUNDARY');
  assert.equal(result.recommendationMayProceed, false);
  assert.deepEqual(result.hardBoundaryScenarioIds, ['s1']);
  assert.equal(result.highestRung, 'RECOMMENDATION');
  assert.equal(result.businessEffectAuthority, 'NONE');
});

test('fragility and adaptation stay distinguishable', () => {
  const reality = compileStrategicReality({ subject: 'x', actors: [actor()] });
  const fragile = assessStrategicPlan({
    planRef: 'plan:fragile', strategicReality: reality,
    scenarios: [{ id: 'f1', actorId: 'counterparty-1', responseId: 'decline', planStillWorks: false, adaptationAvailable: false, evidenceRef: 'e:f1' }]
  });
  assert.equal(fragile.status, 'STRATEGIC_PLAN_FRAGILE_TO_DECLARED_RESPONSES');

  const adaptable = assessStrategicPlan({
    planRef: 'plan:adapt', strategicReality: reality,
    scenarios: [{ id: 'a1', actorId: 'counterparty-1', responseId: 'adapt', planStillWorks: false, adaptationAvailable: true, evidenceRef: 'e:a1' }]
  });
  assert.equal(adaptable.status, 'STRATEGIC_PLAN_REQUIRES_ADAPTATION');
  assert.equal(adaptable.recommendationMayProceed, true);
  assert.equal(adaptable.robustnessClaimScope, 'SUPPLIED_SCENARIOS_ONLY');
});

test('strategic blindspot probes are questions, never fabricated probabilities', () => {
  const probes = strategicBlindspotProbes({
    planRef: 'plan:2',
    actors: [{ actorId: 'counterparty-1' }, { actorId: 'regulator-1' }]
  });
  assert.equal(probes.ok, true);
  assert.equal(probes.probes.length, 8);
  assert.equal(probes.probabilityClaimed, false);
  assert.ok(probes.probes.some(row => row.class === 'EXIT'));
  assert.ok(probes.probes.some(row => row.class === 'COUNTER'));
  assert.equal(probes.businessEffectAuthority, 'NONE');
});
