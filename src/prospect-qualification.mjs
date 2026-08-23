// The decision layer of the prospect pipeline: evidence in, disposition out.
//
// The rule this module exists to enforce is that a model's opinion is evidence
// of the weakest class and never an authority. An SDR agent that answers
// "IDEAL" is not allowed to move a prospect into an outreach experiment, and no
// amount of model confidence substitutes for a verified contact route or a
// source-backed fact. So the model's assessment enters as one scored dimension
// carrying MODEL_INFERENCE provenance, and a deterministic policy -- which
// cannot be argued with, because it does not read prose -- decides what happens.
//
// Nothing here contacts anybody. The strongest disposition this module can
// return is "eligible to be considered by the governed send path", which that
// path then gates again on its own terms.

import crypto from 'node:crypto';

export const PROSPECT_QUALIFICATION_POLICY_VERSION = 'prospect-qualification-1.0.0';

export const PROSPECT_DISPOSITIONS = Object.freeze([
  'ELIGIBLE_FOR_EXPERIMENT',
  'NEEDS_RESEARCH',
  'REJECT',
  'QUARANTINE'
]);

/**
 * Dimensions of fit, each scored 0..1 and each carrying its own provenance.
 * Splitting them matters: "IDEAL" collapses a dozen judgements into one word
 * and hides which of them was actually evidenced.
 */
export const PROSPECT_SCORE_DIMENSIONS = Object.freeze([
  'icpFit',
  'buyerRoleFit',
  'painEvidence',
  'signalStrength',
  'reachability',
  'offerFit',
  'timing',
  'buyerAuthority',
  'companyEconomics'
]);

const DIMENSION_WEIGHTS = Object.freeze({
  icpFit: 0.18,
  buyerRoleFit: 0.14,
  painEvidence: 0.14,
  signalStrength: 0.10,
  reachability: 0.16,
  offerFit: 0.12,
  timing: 0.06,
  buyerAuthority: 0.06,
  companyEconomics: 0.04
});

// Evidence strong enough for a dimension to count towards eligibility on its
// own. MODEL_INFERENCE is deliberately absent.
const SOURCE_BACKED_CLASSES = new Set(['DIRECT_FIRST_PARTY', 'DIRECT_PUBLIC', 'LICENSED_PROVIDER']);

// Dimensions that must be source-backed before a prospect can enter an
// experiment. A model may have an opinion about timing; it may not be the only
// reason we believe somebody is in our ICP.
const MUST_BE_SOURCE_BACKED = Object.freeze(['icpFit', 'buyerRoleFit', 'reachability']);

const ZERO_EFFECTS = Object.freeze({
  providerCalls: 0,
  messages: 0,
  purchases: 0,
  deployments: 0,
  credentialChanges: 0,
  dnsChanges: 0,
  productionMutations: 0,
  spendCents: 0
});

// Fields a model result is never allowed to contribute. If one appears the
// assessment is not merely ignored -- it is reported, because a model asking
// for authority is a signal in itself.
const FORBIDDEN_ASSESSMENT_FIELDS = Object.freeze([
  'disposition', 'eligible', 'authority', 'outboundAuthority', 'businessEffectAuthority',
  'approved', 'send', 'sendNow', 'override', 'suppressionOverride', 'budgetCents'
]);

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function unit(value, fallback = null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

/**
 * Take a model's prospect assessment and strip it of anything that looks like a
 * decision. What survives is a set of 0..1 opinions with MODEL_INFERENCE
 * provenance and a note.
 */
export function normalizeModelProspectAssessment(input = {}) {
  const requestedAuthority = FORBIDDEN_ASSESSMENT_FIELDS.filter(field => input && Object.hasOwn(input, field));
  const dimensions = {};
  for (const dimension of PROSPECT_SCORE_DIMENSIONS) {
    const value = unit(input?.dimensions?.[dimension]);
    if (value !== null) dimensions[dimension] = value;
  }
  return {
    policyVersion: PROSPECT_QUALIFICATION_POLICY_VERSION,
    model: text(input?.model, 160) || null,
    dimensions,
    confidence: unit(input?.confidence, 0),
    rationale: text(input?.rationale, 1000),
    evidenceClass: 'MODEL_INFERENCE',
    advisory: true,
    grantsAuthority: false,
    requestedAuthorityFields: requestedAuthority,
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

function routeSummary(bundle = {}) {
  const routes = Array.isArray(bundle.routes) ? bundle.routes : [];
  return {
    total: routes.length,
    verified: routes.filter(route => route.status === 'VERIFIED_ROUTE' && route.usableForHandoff === true).length,
    blocked: routes.filter(route => String(route.status || '').startsWith('BLOCKED_')).length,
    needsWork: routes.filter(route => ['NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'REVERIFY_REQUIRED', 'DEFER_TEMPORARY_FAILURE'].includes(route.status)).length
  };
}

function observedDimensions(observations = {}) {
  const scored = {};
  for (const dimension of PROSPECT_SCORE_DIMENSIONS) {
    const observation = observations?.[dimension];
    const value = unit(observation?.value ?? observation);
    if (value === null) continue;
    const evidenceClass = text(observation?.evidenceClass, 60).toUpperCase() || 'MODEL_INFERENCE';
    scored[dimension] = { value, evidenceClass, sourceBacked: SOURCE_BACKED_CLASSES.has(evidenceClass) };
  }
  return scored;
}

/**
 * Deterministic fit score.
 *
 * A model dimension is used only where no observation exists, and it is capped:
 * an unevidenced opinion cannot carry a dimension past the point where it would
 * decide anything on its own.
 */
export function scoreProspectFit({ bundle = {}, observations = {}, assessment = null } = {}) {
  const advisory = assessment ? normalizeModelProspectAssessment(assessment) : null;
  const observed = observedDimensions(observations);
  const routes = routeSummary(bundle);

  const dimensions = {};
  for (const dimension of PROSPECT_SCORE_DIMENSIONS) {
    if (observed[dimension]) {
      dimensions[dimension] = { ...observed[dimension], from: 'OBSERVED' };
      continue;
    }
    const modelValue = advisory?.dimensions?.[dimension];
    if (modelValue === undefined) {
      dimensions[dimension] = { value: 0, evidenceClass: 'ABSENT', sourceBacked: false, from: 'ABSENT' };
      continue;
    }
    dimensions[dimension] = {
      // Halved on purpose: an unevidenced opinion contributes, but it cannot
      // reach the weight a source-backed observation would.
      value: Math.min(0.5, modelValue),
      evidenceClass: 'MODEL_INFERENCE',
      sourceBacked: false,
      from: 'MODEL_ADVISORY'
    };
  }

  // Reachability is not a matter of opinion: it is whether a verified route
  // exists. Whatever anyone scored it, the routes decide.
  dimensions.reachability = {
    value: routes.verified > 0 ? 1 : 0,
    evidenceClass: routes.verified > 0 ? 'DIRECT_PUBLIC' : 'ABSENT',
    sourceBacked: routes.verified > 0,
    from: 'ROUTE_STATE'
  };

  const total = PROSPECT_SCORE_DIMENSIONS.reduce(
    (sum, dimension) => sum + dimensions[dimension].value * DIMENSION_WEIGHTS[dimension], 0);
  const sourceBackedShare = PROSPECT_SCORE_DIMENSIONS.reduce(
    (sum, dimension) => sum + (dimensions[dimension].sourceBacked ? DIMENSION_WEIGHTS[dimension] : 0), 0);

  return {
    policyVersion: PROSPECT_QUALIFICATION_POLICY_VERSION,
    score: Number(total.toFixed(4)),
    evidenceQuality: Number(sourceBackedShare.toFixed(4)),
    dimensions,
    routes,
    advisory,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS }
  };
}

/**
 * The policy. Reads numbers and states, never prose -- which is what makes it
 * immune to anything written in a prospect's own web copy.
 */
export function decideProspectDisposition({
  bundle = {},
  observations = {},
  assessment = null,
  minimumScore = 0.55,
  minimumEvidenceQuality = 0.45,
  date = new Date()
} = {}) {
  const fit = scoreProspectFit({ bundle, observations, assessment });
  const reasonCodes = [];
  let disposition = 'ELIGIBLE_FOR_EXPERIMENT';

  const conflicts = Array.isArray(bundle?.summary?.conflicts) ? bundle.summary.conflicts : [];

  // Quarantine first. These are states where acting would be wrong even if
  // every other number were perfect.
  if (fit.routes.blocked > 0) {
    disposition = 'QUARANTINE';
    reasonCodes.push('suppressed-or-blocked-contact-route');
  } else if (fit.advisory?.requestedAuthorityFields?.length) {
    disposition = 'QUARANTINE';
    reasonCodes.push('model-assessment-requested-authority');
  } else if (conflicts.length) {
    disposition = 'NEEDS_RESEARCH';
    reasonCodes.push('unresolved-evidence-conflict');
  } else if (fit.routes.verified === 0) {
    disposition = 'NEEDS_RESEARCH';
    reasonCodes.push('no-verified-contact-route');
  } else {
    const unevidenced = MUST_BE_SOURCE_BACKED.filter(dimension => !fit.dimensions[dimension].sourceBacked);
    if (unevidenced.length) {
      disposition = 'NEEDS_RESEARCH';
      for (const dimension of unevidenced) reasonCodes.push(`unevidenced-dimension:${dimension}`);
    } else if (fit.evidenceQuality < minimumEvidenceQuality) {
      disposition = 'NEEDS_RESEARCH';
      reasonCodes.push('insufficient-evidence-quality');
    } else if (fit.score < minimumScore) {
      disposition = 'REJECT';
      reasonCodes.push('fit-score-below-threshold');
    }
  }

  const identity = {
    prospectId: text(bundle?.prospectId, 160),
    score: fit.score,
    evidenceQuality: fit.evidenceQuality,
    disposition,
    reasonCodes: [...reasonCodes].sort()
  };

  return {
    ok: true,
    policyVersion: PROSPECT_QUALIFICATION_POLICY_VERSION,
    decisionId: `prospectdec_${digest(identity).slice(0, 24)}`,
    prospectId: identity.prospectId,
    disposition,
    reasonCodes: [...new Set(reasonCodes)],
    score: fit.score,
    evidenceQuality: fit.evidenceQuality,
    dimensions: fit.dimensions,
    routes: fit.routes,
    advisory: fit.advisory,
    decidedAt: iso(date),
    // Eligible means "the governed send path may now consider this", not
    // "send". Authority is granted somewhere else, on other evidence.
    outboundAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EFFECTS },
    note: 'A disposition is an eligibility recommendation. It confers no authority to contact anybody.'
  };
}
