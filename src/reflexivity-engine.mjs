// Reflexivity Engine.
//
// A forecast about weather can be observed without changing the weather. A
// forecast about a bank run, a product launch, a negotiation, a market or a
// public reputation can change the system merely by being believed. This organ
// makes that feedback edge explicit before a prediction is treated as if the
// observer were outside the system.
export const REFLEXIVITY_ENGINE_VERSION = 'uberbond.reflexivity-engine.v1';

export const REFLEXIVITY_CLASSES = Object.freeze([
  'INERT_OR_NO_DECLARED_FEEDBACK',
  'OBSERVER_EFFECT',
  'SELF_FULFILLING',
  'SELF_DEFEATING',
  'STRATEGIC_ADAPTATION',
  'MIXED_OR_UNKNOWN_REFLEXIVITY'
]);

const text = (value, max = 600) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const uniq = values => [...new Set((values || []).filter(Boolean))];
const fail = (reasonCodes, extra = {}) => ({
  ok: false,
  status: 'REFLEXIVITY_REFUSED',
  reasonCodes: uniq(reasonCodes),
  businessEffectAuthority: 'NONE',
  ...extra
});

function normalizeEdge(edge, index) {
  const direction = text(edge?.direction, 40)?.toUpperCase();
  return {
    id: text(edge?.id, 120) || `feedback-${index + 1}`,
    source: text(edge?.source, 200),
    target: text(edge?.target, 200),
    mechanism: text(edge?.mechanism, 600),
    direction,
    evidenceRef: text(edge?.evidenceRef, 300),
    actorCanAdapt: edge?.actorCanAdapt === true,
    requiresAwareness: edge?.requiresAwareness !== false
  };
}

/**
 * Classify declared feedback between a prediction/observation/action and the
 * system being predicted. It does not infer an effect from domain stereotypes.
 */
export function assessReflexivity({
  subject,
  forecastRef = null,
  observationPublic = false,
  forecastPublished = false,
  plannedActionDisclosed = false,
  feedbackEdges = []
} = {}) {
  const named = text(subject, 800);
  if (!named) return fail(['subject-required']);
  const raw = Array.isArray(feedbackEdges) ? feedbackEdges : [];
  const edges = raw.map(normalizeEdge);
  const reasons = [];
  for (const edge of edges) {
    if (!edge.source || !edge.target || !edge.mechanism || !edge.evidenceRef) reasons.push(`incomplete-feedback-edge:${edge.id}`);
    if (edge.direction && !['AMPLIFIES', 'DAMPENS', 'CHANGES_UNKNOWN_DIRECTION'].includes(edge.direction)) reasons.push(`invalid-feedback-direction:${edge.id}`);
  }
  if (reasons.length) return fail(reasons);

  const informationExposed = observationPublic || forecastPublished || plannedActionDisclosed;
  const active = edges.filter(edge => informationExposed || edge.requiresAwareness === false);
  const amplifies = active.filter(edge => edge.direction === 'AMPLIFIES');
  const dampens = active.filter(edge => edge.direction === 'DAMPENS');
  const unknown = active.filter(edge => !edge.direction || edge.direction === 'CHANGES_UNKNOWN_DIRECTION');
  const adaptive = active.filter(edge => edge.actorCanAdapt);

  let reflexivityClass = 'INERT_OR_NO_DECLARED_FEEDBACK';
  if (active.length) {
    if (adaptive.length) reflexivityClass = 'STRATEGIC_ADAPTATION';
    else if (amplifies.length && !dampens.length && !unknown.length) reflexivityClass = 'SELF_FULFILLING';
    else if (dampens.length && !amplifies.length && !unknown.length) reflexivityClass = 'SELF_DEFEATING';
    else if (unknown.length || (amplifies.length && dampens.length)) reflexivityClass = 'MIXED_OR_UNKNOWN_REFLEXIVITY';
    else reflexivityClass = 'OBSERVER_EFFECT';
  }

  return {
    ok: true,
    status: 'REFLEXIVITY_ASSESSED',
    subject: named,
    forecastRef: text(forecastRef, 300),
    reflexivityClass,
    informationExposed,
    activeFeedbackEdges: active,
    inactiveAwarenessDependentEdges: edges.filter(edge => !active.includes(edge)),
    recomputationRequired: active.length > 0,
    businessEffectAuthority: 'NONE',
    truthBoundary: 'A_DECLARED_FEEDBACK_EDGE_REQUIRES_RECOMPUTATION__IT_DOES_NOT_QUANTIFY_THE_EFFECT_OR_REWRITE_THE_FORECAST_BY_ITSELF'
  };
}

/**
 * Build a scenario set that separates the world where the forecast stays
 * private from worlds where feedback is activated. No probability is attached
 * unless a separate validated model supplies one later.
 */
export function compileReflexiveScenarios({ assessment, includePrivateBaseline = true } = {}) {
  if (!assessment?.ok || assessment.status !== 'REFLEXIVITY_ASSESSED') return fail(['valid-reflexivity-assessment-required']);
  const scenarios = [];
  if (includePrivateBaseline) scenarios.push({
    id: 'private-baseline',
    class: 'COUNTERFACTUAL_PRIVATE_BASELINE',
    activatedFeedbackEdgeIds: [],
    probability: null
  });
  if (assessment.activeFeedbackEdges.length) {
    for (const edge of assessment.activeFeedbackEdges) scenarios.push({
      id: `feedback:${edge.id}`,
      class: edge.actorCanAdapt ? 'STRATEGIC_RESPONSE_SCENARIO' : 'FEEDBACK_SCENARIO',
      activatedFeedbackEdgeIds: [edge.id],
      direction: edge.direction || 'CHANGES_UNKNOWN_DIRECTION',
      mechanism: edge.mechanism,
      probability: null
    });
  } else {
    scenarios.push({
      id: 'declared-no-feedback',
      class: 'NO_DECLARED_ACTIVE_FEEDBACK',
      activatedFeedbackEdgeIds: [],
      probability: null
    });
  }
  return {
    ok: true,
    status: 'REFLEXIVE_SCENARIOS_COMPILED',
    scenarios,
    probabilityClaimed: false,
    businessEffectAuthority: 'NONE',
    truthBoundary: 'SCENARIO_GENERATION_EXPOSES_FEEDBACK_PATHS__IT_DOES_NOT_ASSIGN_PROBABILITY_WITHOUT_VALIDATED_QUANTITATIVE_EVIDENCE'
  };
}

/**
 * Decide whether a previously sealed forecast remains usable after disclosure
 * or action changed its information environment.
 */
export function forecastReflexivityGate({ assessment, forecastInformationState = 'PRIVATE', currentInformationState = null } = {}) {
  if (!assessment?.ok) return fail(['valid-reflexivity-assessment-required']);
  const before = text(forecastInformationState, 80)?.toUpperCase();
  const after = text(currentInformationState, 80)?.toUpperCase();
  if (!before || !after) return fail(['forecast-and-current-information-state-required']);
  const changed = before !== after;
  if (changed && assessment.activeFeedbackEdges.length) {
    return {
      ok: true,
      status: 'FORECAST_REQUIRES_REFLEXIVE_RECOMPUTATION',
      previousInformationState: before,
      currentInformationState: after,
      reasonCodes: ['information-environment-changed-with-active-feedback'],
      highestRung: 'RECOMMENDATION',
      businessEffectAuthority: 'NONE'
    };
  }
  return {
    ok: true,
    status: 'FORECAST_INFORMATION_ENVIRONMENT_UNCHANGED_OR_NO_ACTIVE_FEEDBACK',
    previousInformationState: before,
    currentInformationState: after,
    highestRung: 'RECOMMENDATION',
    businessEffectAuthority: 'NONE'
  };
}
