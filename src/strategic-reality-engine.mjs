// Strategic Reality Engine.
//
// Reality contains other agents, not chess pieces. A plan that works only while
// every other person, company or institution remains passive is not robust; a
// plan that "solves" adaptation by ignoring consent, rights or exit is not a
// strategic success. This organ makes adaptive responses explicit while keeping
// other actors sovereign.
export const STRATEGIC_REALITY_ENGINE_VERSION = 'uberbond.strategic-reality-engine.v1';

const text = (value, max = 800) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const uniq = values => [...new Set((values || []).filter(Boolean))];
const fail = (reasonCodes, extra = {}) => ({
  ok: false,
  status: 'STRATEGIC_REALITY_REFUSED',
  reasonCodes: uniq(reasonCodes),
  highestRung: 'RECOMMENDATION',
  businessEffectAuthority: 'NONE',
  ...extra
});

const RESPONSE_CLASSES = new Set([
  'COOPERATE', 'NEGOTIATE', 'DECLINE', 'IGNORE', 'ADAPT', 'COUNTER', 'EXIT', 'UNKNOWN'
]);

function normalizeActor(actor, index) {
  const responses = (Array.isArray(actor?.responses) ? actor.responses : []).map((row, responseIndex) => ({
    id: text(row?.id, 160) || `response-${index + 1}-${responseIndex + 1}`,
    class: text(row?.class, 80)?.toUpperCase(),
    description: text(row?.description, 600),
    evidenceRef: text(row?.evidenceRef, 300),
    probability: row?.probability === null || row?.probability === undefined ? null : Number(row.probability)
  }));
  return {
    actorId: text(actor?.actorId || actor?.id, 160),
    role: text(actor?.role, 240),
    goalsKnown: (Array.isArray(actor?.goalsKnown) ? actor.goalsKnown : []).map(item => text(item, 400)).filter(Boolean),
    constraintsKnown: (Array.isArray(actor?.constraintsKnown) ? actor.constraintsKnown : []).map(item => text(item, 400)).filter(Boolean),
    responses,
    consentRequired: actor?.consentRequired === true,
    canExit: actor?.canExit !== false,
    sovereign: actor?.sovereign !== false
  };
}

/**
 * Compile an adaptive-agent scenario set. Probabilities are accepted only when
 * every probabilistic response has an evidence reference and the probabilities
 * for one actor do not exceed one. Missing mass stays UNKNOWN rather than being
 * normalized into false certainty.
 */
export function compileStrategicReality({ subject, actors = [] } = {}) {
  const named = text(subject, 1000);
  if (!named) return fail(['strategic-subject-required']);
  const rows = (Array.isArray(actors) ? actors : []).map(normalizeActor);
  if (!rows.length) return fail(['at-least-one-strategic-actor-required']);
  const reasons = [];
  const ids = rows.map(row => row.actorId).filter(Boolean);
  if (ids.length !== rows.length) reasons.push('every-strategic-actor-needs-id');
  if (new Set(ids).size !== ids.length) reasons.push('duplicate-strategic-actor-id');

  for (const actor of rows) {
    if (actor.sovereign !== true) reasons.push(`other-actor-must-be-treated-as-sovereign:${actor.actorId}`);
    if (!actor.responses.length) reasons.push(`actor-response-set-required:${actor.actorId}`);
    let probabilityTotal = 0;
    let probabilistic = false;
    for (const response of actor.responses) {
      if (!RESPONSE_CLASSES.has(response.class) || !response.description) reasons.push(`invalid-strategic-response:${actor.actorId}:${response.id}`);
      if (response.probability !== null) {
        probabilistic = true;
        if (!Number.isFinite(response.probability) || response.probability < 0 || response.probability > 1) {
          reasons.push(`invalid-strategic-probability:${actor.actorId}:${response.id}`);
        } else probabilityTotal += response.probability;
        if (!response.evidenceRef) reasons.push(`probability-evidence-required:${actor.actorId}:${response.id}`);
      }
    }
    if (probabilistic && probabilityTotal > 1 + 1e-12) reasons.push(`actor-probability-total-exceeds-one:${actor.actorId}`);
  }
  if (reasons.length) return fail(reasons);

  return {
    ok: true,
    status: 'STRATEGIC_REALITY_COMPILED',
    subject: named,
    actors: rows.map(actor => {
      const assigned = actor.responses.reduce((sum, response) => sum + (response.probability ?? 0), 0);
      return {
        ...actor,
        unassignedProbabilityMass: actor.responses.some(response => response.probability !== null)
          ? Math.max(0, 1 - assigned)
          : null
      };
    }),
    businessEffectAuthority: 'NONE',
    truthBoundary: 'OTHER_ACTORS_ARE_SOVEREIGN_AND_ADAPTIVE__A_RESPONSE_SET_IS_NOT_A_CLAIM_THAT_UBERBOND_CONTROLS_OR_FULLY_MODELS_THEM'
  };
}

/**
 * Test one plan against supplied actor responses without averaging away a
 * rights/consent violation. A plan that requires somebody not to exit, requires
 * consent that is absent, or crosses a declared right is blocked regardless of
 * how profitable other scenarios look.
 */
export function assessStrategicPlan({
  planRef,
  strategicReality,
  scenarios = []
} = {}) {
  const plan = text(planRef, 300);
  if (!plan) return fail(['plan-ref-required']);
  if (!strategicReality?.ok) return fail(['valid-strategic-reality-required']);
  const rows = (Array.isArray(scenarios) ? scenarios : []).map((row, index) => ({
    id: text(row?.id, 160) || `scenario-${index + 1}`,
    actorId: text(row?.actorId, 160),
    responseId: text(row?.responseId, 160),
    planStillWorks: row?.planStillWorks === true,
    adaptationAvailable: row?.adaptationAvailable === true,
    requiresConsentWithoutConsent: row?.requiresConsentWithoutConsent === true,
    constrainsOtherActorExit: row?.constrainsOtherActorExit === true,
    rightsViolation: row?.rightsViolation === true,
    evidenceRef: text(row?.evidenceRef, 300)
  }));
  if (!rows.length) return fail(['strategic-plan-scenarios-required']);
  const actors = new Map(strategicReality.actors.map(actor => [actor.actorId, actor]));
  const reasons = [];
  for (const row of rows) {
    if (!actors.has(row.actorId)) reasons.push(`unknown-strategic-actor:${row.actorId}`);
    if (!row.evidenceRef) reasons.push(`strategic-scenario-evidence-required:${row.id}`);
  }
  if (reasons.length) return fail(reasons);

  const hardBoundary = rows.filter(row =>
    row.requiresConsentWithoutConsent || row.constrainsOtherActorExit || row.rightsViolation
  );
  const breaks = rows.filter(row => !row.planStillWorks && !row.adaptationAvailable);
  const adaptations = rows.filter(row => !row.planStillWorks && row.adaptationAvailable);
  const status = hardBoundary.length
    ? 'STRATEGIC_PLAN_BLOCKED_BY_INTER_SOVEREIGN_BOUNDARY'
    : breaks.length
      ? 'STRATEGIC_PLAN_FRAGILE_TO_DECLARED_RESPONSES'
      : adaptations.length
        ? 'STRATEGIC_PLAN_REQUIRES_ADAPTATION'
        : 'STRATEGIC_PLAN_ROBUST_ON_SUPPLIED_SCENARIOS';

  return {
    ok: true,
    status,
    planRef: plan,
    hardBoundaryScenarioIds: hardBoundary.map(row => row.id),
    fragileScenarioIds: breaks.map(row => row.id),
    adaptationScenarioIds: adaptations.map(row => row.id),
    robustnessClaimScope: 'SUPPLIED_SCENARIOS_ONLY',
    recommendationMayProceed: hardBoundary.length === 0,
    highestRung: 'RECOMMENDATION',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'STRATEGIC_ROBUSTNESS_NEVER_OVERRIDES_OTHER_ACTORS_CONSENT_RIGHTS_OR_EXIT'
  };
}

/**
 * Generate the minimum adversarial response checklist for a plan. These are
 * questions, not predictions about a specific person or counterparty.
 */
export function strategicBlindspotProbes({ planRef, actors = [] } = {}) {
  const plan = text(planRef, 300);
  if (!plan) return fail(['plan-ref-required']);
  const ids = uniq((Array.isArray(actors) ? actors : []).map(actor => text(actor?.actorId || actor?.id, 160)));
  const probes = ids.flatMap(actorId => [
    { actorId, class: 'DECLINE', question: `What happens to ${plan} if ${actorId} simply declines?` },
    { actorId, class: 'ADAPT', question: `How could ${actorId} adapt after learning about ${plan}?` },
    { actorId, class: 'COUNTER', question: `What lawful counter-move by ${actorId} would make ${plan} fail?` },
    { actorId, class: 'EXIT', question: `Does ${plan} still work if ${actorId} exercises a legitimate right to exit?` }
  ]);
  return {
    ok: true,
    status: 'STRATEGIC_BLINDSPOT_PROBES_READY',
    probes,
    probabilityClaimed: false,
    businessEffectAuthority: 'NONE'
  };
}
