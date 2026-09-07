// Volitional Integrity Engine.
//
// The system may model influences on a desire. It may not decide which desire
// is the "real" one. The actionable safeguard is narrower: recommendations
// that rely on behavioral inference, social pressure or AI-induced preferences
// must not quietly cross into high-stakes/irreversible territory without a
// fresh explicit endorsement from the present person.
export const VOLITIONAL_INTEGRITY_ENGINE_VERSION = 'uberbond.volitional-integrity-engine.v1';

const text = (value, max = 800) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const uniq = values => [...new Set((values || []).filter(Boolean))];
const fail = (reasonCodes, extra = {}) => ({
  ok: false,
  status: 'VOLITIONAL_INTEGRITY_REFUSED',
  reasonCodes: uniq(reasonCodes),
  highestRung: 'RECOMMENDATION',
  businessEffectAuthority: 'NONE',
  ...extra
});

const NON_SOVEREIGN_ORIGINS = new Set([
  'BEHAVIORAL_INFERENCE', 'SOCIAL_INFLUENCE', 'ENVIRONMENTAL_CONSTRAINT',
  'AI_SUGGESTION', 'EXTERNAL_SUGGESTION', 'UNKNOWN'
]);

/**
 * Audit whether a proposed recommendation is relying on a preference whose
 * provenance demands a fresh present endorsement.
 */
export function assessVolitionalIntegrity({
  preference,
  lineage = null,
  recommendationRef,
  irreversible = false,
  highStakes = false,
  presentEndorsement = null,
  aiGeneratedRecommendation = false
} = {}) {
  if (!preference?.ok || !preference.preferenceId) return fail(['valid-provenance-recorded-preference-required']);
  const rec = text(recommendationRef, 300);
  if (!rec) return fail(['recommendation-ref-required']);

  const origins = new Set([
    preference.origin,
    ...((lineage?.preferences || []).find(row => row.preferenceId === preference.preferenceId)?.ancestryOrigins || [])
  ].filter(Boolean));
  const contaminatedBySystemOrPressure = [...origins].some(origin => NON_SOVEREIGN_ORIGINS.has(origin));
  const aiFeedbackLoop = aiGeneratedRecommendation && origins.has('AI_SUGGESTION');
  const consequential = irreversible === true || highStakes === true;
  const endorsement = presentEndorsement && presentEndorsement.ok
    && presentEndorsement.origin === 'PRESENT_SELF_REPORT'
    && presentEndorsement.presentExplicitEndorsement === true;

  const reasonCodes = [];
  if (consequential && contaminatedBySystemOrPressure && !endorsement) reasonCodes.push('fresh-present-explicit-endorsement-required');
  if (consequential && aiFeedbackLoop && !endorsement) reasonCodes.push('ai-induced-preference-cannot-self-authorize-consequential-recommendation');

  return {
    ok: true,
    status: reasonCodes.length ? 'VOLITIONAL_REVIEW_REQUIRED' : 'VOLITIONAL_BOUNDARY_CLEAR_ON_DECLARED_EVIDENCE',
    recommendationRef: rec,
    preferenceId: preference.preferenceId,
    preferenceOrigins: [...origins].sort(),
    consequential,
    contaminatedBySystemOrPressure,
    aiFeedbackLoop,
    freshPresentEndorsement: Boolean(endorsement),
    reasonCodes,
    authenticityClaim: 'NONE',
    recommendationMayProceedToChoicePresentation: reasonCodes.length === 0,
    highestRung: 'RECOMMENDATION',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'INFLUENCE_DOES_NOT_PROVE_INAUTHENTICITY__THE_GATE_ONLY_PREVENTS_NON_SOVEREIGN_OR_AI_INDUCED_PREFERENCES_FROM_SELF_AUTHORIZING_CONSEQUENTIAL_RECOMMENDATIONS'
  };
}

/**
 * Detect when personalization is reinforcing a preference primarily because
 * earlier recommendations increased the behavior from which the preference was
 * inferred. This is a feedback warning, not a claim of manipulation.
 */
export function detectPreferenceFeedbackLoop({
  preference,
  recommendationHistory = [],
  behaviorEvidenceRefs = []
} = {}) {
  if (!preference?.ok) return fail(['valid-provenance-recorded-preference-required']);
  const recommendations = uniq((Array.isArray(recommendationHistory) ? recommendationHistory : []).map(item => text(item, 300)));
  const behavior = uniq((Array.isArray(behaviorEvidenceRefs) ? behaviorEvidenceRefs : []).map(item => text(item, 300)));
  const aiOrigin = preference.origin === 'AI_SUGGESTION' || (preference.influencedBy || []).some(ref => /^ai:/i.test(ref));
  const inferred = preference.origin === 'BEHAVIORAL_INFERENCE';
  const feedbackPossible = recommendations.length > 0 && behavior.length > 0 && (aiOrigin || inferred);
  return {
    ok: true,
    status: feedbackPossible ? 'PREFERENCE_FEEDBACK_LOOP_POSSIBLE' : 'NO_DECLARED_PREFERENCE_FEEDBACK_LOOP',
    preferenceId: preference.preferenceId,
    recommendationRefs: recommendations,
    behaviorEvidenceRefs: behavior,
    requiresHumanInterpretation: feedbackPossible,
    authenticityClaim: 'NONE',
    businessEffectAuthority: 'NONE'
  };
}

/** Present choice always terminates the model's attempt to infer around it. */
export function presentWillVeto({ presentChoice, modelRecommendation } = {}) {
  const choice = text(presentChoice?.stance || presentChoice, 80)?.toUpperCase();
  const recommendation = text(modelRecommendation, 500);
  if (!choice || !['CHOOSE', 'DO_NOT_CHOOSE', 'DEFER'].includes(choice)) return fail(['explicit-present-choice-required']);
  return {
    ok: true,
    status: choice === 'DO_NOT_CHOOSE' ? 'PRESENT_WILL_VETO' : choice === 'DEFER' ? 'PRESENT_WILL_DEFERS' : 'PRESENT_WILL_CHOOSES',
    presentChoice: choice,
    modelRecommendation: recommendation,
    modelMayOverride: false,
    businessEffectAuthority: 'NONE',
    truthBoundary: 'PRESENT_EXPLICIT_CHOICE_OUTRANKS_THE_MODEL_EVEN_WHEN_THE_MODEL_PREDICTS_REGRET'
  };
}
