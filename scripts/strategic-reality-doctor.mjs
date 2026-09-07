import {
  compileStrategicReality,
  assessStrategicPlan,
  strategicBlindspotProbes
} from '../src/strategic-reality-engine.mjs';

const reality = compileStrategicReality({
  subject: 'bounded partner-distribution scenario',
  actors: [{
    actorId: 'partner-1',
    role: 'independent partner',
    sovereign: true,
    canExit: true,
    consentRequired: true,
    responses: [
      { id: 'decline', class: 'DECLINE', description: 'declines', probability: 0.2, evidenceRef: 'doctor:synthetic-base-rate' },
      { id: 'adapt', class: 'ADAPT', description: 'adapts after learning the plan', probability: 0.3, evidenceRef: 'doctor:synthetic-base-rate' }
    ]
  }]
});

if (!reality.ok || reality.businessEffectAuthority !== 'NONE') {
  throw new Error(`strategic-reality-compile-failed:${JSON.stringify(reality)}`);
}
if (reality.actors[0].unassignedProbabilityMass !== 0.5) {
  throw new Error('strategic-reality-unknown-mass-was-not-preserved');
}

const boundary = assessStrategicPlan({
  planRef: 'doctor:plan',
  strategicReality: reality,
  scenarios: [{
    id: 'doctor:boundary',
    actorId: 'partner-1',
    responseId: 'decline',
    planStillWorks: true,
    adaptationAvailable: true,
    constrainsOtherActorExit: true,
    evidenceRef: 'doctor:synthetic-scenario'
  }]
});

if (boundary.status !== 'STRATEGIC_PLAN_BLOCKED_BY_INTER_SOVEREIGN_BOUNDARY') {
  throw new Error(`strategic-boundary-not-enforced:${JSON.stringify(boundary)}`);
}
if (boundary.recommendationMayProceed !== false || boundary.highestRung !== 'RECOMMENDATION') {
  throw new Error('strategic-boundary-authority-inflation');
}

const probes = strategicBlindspotProbes({ planRef: 'doctor:plan', actors: reality.actors });
if (!probes.ok || probes.probabilityClaimed !== false || probes.probes.length !== 4) {
  throw new Error(`strategic-probes-invalid:${JSON.stringify(probes)}`);
}

console.log(JSON.stringify({
  ok: true,
  status: 'STRATEGIC_REALITY_DOCTOR_HEALTHY',
  actorCount: reality.actors.length,
  preservedUnknownProbabilityMass: reality.actors[0].unassignedProbabilityMass,
  interSovereignBoundaryEnforced: true,
  probes: probes.probes.length,
  highestRung: boundary.highestRung,
  businessEffectAuthority: 'NONE',
  truthBoundary: 'SYNTHETIC_OPERATOR_DOCTOR_PROVES_INTERNAL_CONTRACTS_ONLY__IT_DOES_NOT_PREDICT_OR_CONTROL_REAL_COUNTERPARTIES'
}, null, 2));
