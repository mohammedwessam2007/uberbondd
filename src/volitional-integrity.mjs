// Volitional-integrity consequence gate for Personal Civilization.
//
// This module deliberately does not model a second self. It consumes the
// current living-self-model preference provenance shape and answers one narrow
// question: may a consequential recommendation proceed to choice presentation
// without silently treating inferred/system/social influence as present will?
//
// Recommendation is never choice. Choice is never effect authority.

export const VOLITIONAL_INTEGRITY_VERSION = 'uberbond.volitional-integrity.v1';

const MAX_ENDORSEMENT_AGE_MS = 24 * 60 * 60 * 1000;
const PRESSURE_ORIGINS = new Set(['SOCIAL_PRESSURE', 'ADVERTISING', 'UNKNOWN']);
const DECLARED_INFLUENCES = new Set([
  'AI_SUGGESTION', 'EXTERNAL_SUGGESTION', 'ENVIRONMENTAL_PRESSURE',
  'BEHAVIORAL_INFERENCE', 'SOCIAL_PRESSURE'
]);

const text = (value, max = 1000) => {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
};
const unique = values => [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
const fail = (reasonCodes, extra = {}) => ({
  ok: false,
  status: 'VOLITIONAL_INTEGRITY_REFUSED',
  reasonCodes: unique(reasonCodes),
  recommendationAuthority: 'NONE',
  choiceAuthority: 'NONE',
  businessEffectAuthority: 'NONE',
  ...extra
});

function validIso(value) {
  const raw = text(value, 80);
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? { iso: new Date(ms).toISOString(), ms } : null;
}

function parseInfluences(values) {
  const normalized = unique((Array.isArray(values) ? values : [])
    .map(value => text(value, 80)?.toUpperCase()).filter(Boolean));
  return {
    recognized: normalized.filter(value => DECLARED_INFLUENCES.has(value)),
    unknown: normalized.filter(value => !DECLARED_INFLUENCES.has(value))
  };
}

function validateFreshSelfReport({ report, evaluatedAt, maxAgeMs, requiredBooleanField = null } = {}) {
  const now = validIso(evaluatedAt);
  if (!now) return { ok: false, reasons: ['explicit-valid-evaluated-at-required'] };
  if (!Number.isFinite(Number(maxAgeMs)) || Number(maxAgeMs) <= 0) {
    return { ok: false, reasons: ['positive-present-report-max-age-required'], now };
  }
  const stated = validIso(report?.statedAt);
  const reasons = [];
  if (report?.source !== 'PRESENT_SELF_REPORT') reasons.push('present-self-report-required');
  if (requiredBooleanField && report?.[requiredBooleanField] !== true) reasons.push('explicit-present-endorsement-required');
  if (!stated) reasons.push('valid-present-report-time-required');
  if (stated && stated.ms > now.ms) reasons.push('future-dated-present-report-refused');
  if (stated && now.ms - stated.ms > Number(maxAgeMs)) reasons.push('stale-present-report-refused');
  return { ok: reasons.length === 0, reasons, now, stated };
}

/**
 * A present endorsement is accepted only as an explicit, fresh founder report.
 * It is not inferred from preferenceProvenance.currentlyEndorsed because that
 * field intentionally carries no freshness or observation identity.
 */
export function verifyPresentEndorsement({ provenance, endorsement, evaluatedAt, maxAgeMs = MAX_ENDORSEMENT_AGE_MS } = {}) {
  if (!provenance?.ok || provenance?.status !== 'PROVENANCE_TRACED') {
    return fail(['canonical-preference-provenance-required']);
  }
  const preference = text(provenance.preference, 500);
  if (!preference) return fail(['canonical-preference-required']);

  const fresh = validateFreshSelfReport({ report: endorsement, evaluatedAt, maxAgeMs, requiredBooleanField: 'explicitlyEndorsed' });
  const reasons = [...fresh.reasons];
  if (text(endorsement?.preference, 500) !== preference) reasons.push('endorsement-preference-mismatch');
  if (reasons.length) return fail(reasons, { preference, evaluatedAt: fresh.now?.iso || null });

  return {
    ok: true,
    status: 'FRESH_PRESENT_ENDORSEMENT_VERIFIED',
    preference,
    statedAt: fresh.stated.iso,
    evaluatedAt: fresh.now.iso,
    ageMs: fresh.now.ms - fresh.stated.ms,
    authenticityClaim: 'NONE',
    recommendationAuthority: 'NONE',
    choiceAuthority: 'NONE',
    businessEffectAuthority: 'NONE'
  };
}

/**
 * Decide whether a recommendation may be shown as a consequential option.
 * Influences trigger reflection, never a ruling that a preference is fake.
 */
export function assessVolitionalIntegrity({
  provenance,
  recommendationRef,
  highStakes = false,
  practicallyIrreversible = false,
  declaredInfluences = [],
  endorsement = null,
  evaluatedAt,
  maxEndorsementAgeMs = MAX_ENDORSEMENT_AGE_MS
} = {}) {
  if (!provenance?.ok || provenance?.status !== 'PROVENANCE_TRACED') {
    return fail(['canonical-preference-provenance-required']);
  }
  const recommendation = text(recommendationRef, 500);
  if (!recommendation) return fail(['recommendation-ref-required']);
  const preference = text(provenance.preference, 500);
  if (!preference) return fail(['canonical-preference-required']);

  const parsedInfluences = parseInfluences(declaredInfluences);
  if (parsedInfluences.unknown.length) {
    return fail(['unknown-declared-influence-refused'], { unknownInfluences: parsedInfluences.unknown.sort() });
  }

  const origins = unique(provenance.origins).sort();
  const influences = parsedInfluences.recognized.sort();
  const consequential = highStakes === true || practicallyIrreversible === true;
  const pressureOrigin = origins.some(origin => PRESSURE_ORIGINS.has(origin));
  const declaredPressure = influences.length > 0;
  const aiInfluence = influences.includes('AI_SUGGESTION');
  const reflectionRequired = consequential && (pressureOrigin || declaredPressure);

  let endorsementReceipt = null;
  if (reflectionRequired) {
    endorsementReceipt = verifyPresentEndorsement({
      provenance, endorsement, evaluatedAt, maxAgeMs: maxEndorsementAgeMs
    });
  }

  const reasonCodes = [];
  if (reflectionRequired && !endorsementReceipt?.ok) reasonCodes.push('fresh-present-explicit-endorsement-required');
  if (consequential && aiInfluence && !endorsementReceipt?.ok) {
    reasonCodes.push('ai-influenced-preference-cannot-self-authorize-consequential-recommendation');
  }

  return {
    ok: true,
    status: reasonCodes.length ? 'VOLITIONAL_REVIEW_REQUIRED' : 'VOLITIONAL_BOUNDARY_CLEAR_ON_DECLARED_EVIDENCE',
    recommendationRef: recommendation,
    preference,
    preferenceOrigins: origins,
    declaredInfluences: influences,
    consequential,
    reflectionRequired,
    freshPresentEndorsement: endorsementReceipt?.ok === true,
    reasonCodes,
    recommendationMayProceedToChoicePresentation: reasonCodes.length === 0,
    authenticityClaim: 'NONE',
    modelMayChooseForFounder: false,
    recommendationAuthority: 'NONE',
    choiceAuthority: 'FOUNDER_ONLY',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'INFLUENCE_IS_SHOWN_NOT_JUDGED__PRESENT_EXPLICIT_WILL_OUTRANKS_MODEL_INFERENCE__RECOMMENDATION_NEVER_CREATES_CHOICE_OR_EFFECT_AUTHORITY'
  };
}

/** Detect a possible personalization loop without claiming manipulation. */
export function detectPreferenceFeedbackLoop({ provenance, recommendationRefs = [], behaviorEvidenceRefs = [], declaredInfluences = [] } = {}) {
  if (!provenance?.ok || provenance?.status !== 'PROVENANCE_TRACED') {
    return fail(['canonical-preference-provenance-required']);
  }
  const parsedInfluences = parseInfluences(declaredInfluences);
  if (parsedInfluences.unknown.length) {
    return fail(['unknown-declared-influence-refused'], { unknownInfluences: parsedInfluences.unknown.sort() });
  }
  const recommendations = unique(recommendationRefs.map(value => text(value, 300))).sort();
  const behavior = unique(behaviorEvidenceRefs.map(value => text(value, 300))).sort();
  const influences = parsedInfluences.recognized;
  const systemInfluenced = influences.includes('AI_SUGGESTION') || influences.includes('BEHAVIORAL_INFERENCE');
  const feedbackPossible = systemInfluenced && recommendations.length > 0 && behavior.length > 0;
  return {
    ok: true,
    status: feedbackPossible ? 'PREFERENCE_FEEDBACK_LOOP_POSSIBLE' : 'NO_DECLARED_PREFERENCE_FEEDBACK_LOOP',
    preference: provenance.preference,
    recommendationRefs: recommendations,
    behaviorEvidenceRefs: behavior,
    requiresFounderInterpretation: feedbackPossible,
    authenticityClaim: 'NONE',
    businessEffectAuthority: 'NONE'
  };
}

/** Explicit present choice terminates model override. It grants no external effect. */
export function presentWillBoundary({ presentChoice, modelRecommendation = null, evaluatedAt, maxAgeMs = MAX_ENDORSEMENT_AGE_MS } = {}) {
  const fresh = validateFreshSelfReport({ report: presentChoice, evaluatedAt, maxAgeMs });
  const choice = text(presentChoice?.stance, 80)?.toUpperCase();
  const reasons = [...fresh.reasons];
  if (!['CHOOSE', 'DO_NOT_CHOOSE', 'DEFER'].includes(choice)) reasons.push('explicit-present-choice-required');
  if (reasons.length) return fail(reasons);

  return {
    ok: true,
    status: choice === 'DO_NOT_CHOOSE' ? 'PRESENT_WILL_VETO' : choice === 'DEFER' ? 'PRESENT_WILL_DEFERS' : 'PRESENT_WILL_CHOOSES',
    presentChoice: choice,
    statedAt: fresh.stated.iso,
    evaluatedAt: fresh.now.iso,
    modelRecommendation: text(modelRecommendation, 500),
    modelMayOverride: false,
    effectMayExecuteFromThisReceipt: false,
    recommendationAuthority: 'NONE',
    choiceAuthority: 'FOUNDER_ONLY',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'PRESENT_EXPLICIT_CHOICE_OUTRANKS_THE_MODEL__CHOICE_STILL_REQUIRES_SEPARATE_EFFECT_AUTHORITY_FOR_EXTERNAL_CONSEQUENCES'
  };
}
