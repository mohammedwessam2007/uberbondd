// Prospect qualification: scoring, and the boundary the score may not cross.
//
// The workflow this generalises ends with a model emitting IDEAL or
// NOT_IDEAL and a spreadsheet row being marked ready to send. Two things are
// wrong with that. A single label throws away why -- so nothing can ever be
// measured or improved. And the label itself becomes the authority: the model
// decides who gets contacted.
//
// Here the model is a witness, never a judge. It contributes a bounded,
// component-wise opinion; deterministic policy reads that opinion alongside
// evidence quality and verification state and decides. A model may lower an
// outcome. It may never, on its own, raise one to eligible.

import {
  evidenceStrength,
  isSendableEvidenceClass,
  cappedConfidence
} from './prospect-evidence.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledger.mjs';

export const PROSPECT_QUALIFICATION_POLICY_VERSION = 'prospect-qualification-1.0.0';

export const QUALIFICATION_OUTCOMES = Object.freeze([
  'ELIGIBLE_FOR_EXPERIMENT',
  'NEEDS_RESEARCH',
  'REJECT',
  'QUARANTINE'
]);

// The components a score is made of. Each one is separately reported, so a
// weak prospect can be told apart from an unresearched one -- they score
// similarly and mean opposite things.
export const SCORE_COMPONENTS = Object.freeze([
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

const WEIGHTS = Object.freeze({
  icpFit: 0.18,
  buyerRoleFit: 0.14,
  painEvidence: 0.16,
  signalStrength: 0.12,
  reachability: 0.12,
  offerFit: 0.12,
  timing: 0.06,
  buyerAuthority: 0.06,
  companyEconomics: 0.04
});

// A model opinion is capped here regardless of what it claims. An LLM reading
// a public bio is, at best, a third-party unverified source about intent.
const MODEL_OPINION_EVIDENCE_CLASS = 'THIRD_PARTY_UNVERIFIED';
const MODEL_MAX_COMPONENT_WEIGHT = 0.35;

function unitScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(1, number));
}

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}

function fail(reasonCodes) {
  return {
    ok: false,
    policyVersion: PROSPECT_QUALIFICATION_POLICY_VERSION,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

/**
 * Normalize a model's advisory opinion into something bounded and labelled.
 *
 * Any decision-shaped field the model tries to return is dropped here, at the
 * boundary, rather than being carried inward and trusted somewhere deeper.
 */
export function normalizeModelAdvisory({
  provider = '', model = '', components = {}, rationale = '', confidence = null
} = {}) {
  if (!text(provider, 120) || !text(model, 120)) return fail(['advisory-provider-and-model-required']);
  const normalized = {};
  const rejectedKeys = [];
  for (const [key, value] of Object.entries(components || {})) {
    if (!SCORE_COMPONENTS.includes(key)) { rejectedKeys.push(key); continue; }
    const score = unitScore(value);
    if (score !== null) normalized[key] = score;
  }
  return {
    ok: true,
    policyVersion: PROSPECT_QUALIFICATION_POLICY_VERSION,
    provider: text(provider, 120),
    model: text(model, 120),
    components: normalized,
    // Recorded, not obeyed. A model asking for an outcome is a fact about the
    // model, which is worth keeping and worth never acting on.
    rejectedKeys,
    rationale: text(rationale, 2000),
    evidenceClass: MODEL_OPINION_EVIDENCE_CLASS,
    confidence: cappedConfidence(MODEL_OPINION_EVIDENCE_CLASS, confidence ?? 0),
    authority: 'ADVISORY_ONLY',
    grantsOutboundAuthority: false,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

/**
 * Score a prospect from its evidence bundle, optionally tempered by a model.
 *
 * Deterministic components come from evidence. The model may move a component
 * by at most MODEL_MAX_COMPONENT_WEIGHT, and only downward past the
 * deterministic value when the deterministic value is itself unmeasured --
 * so an enthusiastic model cannot manufacture fit that no evidence supports.
 */
export function scoreProspect({
  bundle = null,
  deterministicComponents = {},
  advisory = null
} = {}) {
  if (!bundle?.ok) return fail(['valid-prospect-evidence-bundle-required']);

  const components = {};
  const provenance = {};
  for (const name of SCORE_COMPONENTS) {
    const deterministic = unitScore(deterministicComponents[name]);
    const modelValue = advisory?.ok ? unitScore(advisory.components?.[name]) : null;
    if (deterministic === null && modelValue === null) {
      components[name] = 0;
      provenance[name] = 'UNMEASURED';
      continue;
    }
    if (deterministic === null) {
      // Nothing deterministic to anchor to, so the model's view is admitted at
      // its capped weight only -- never at face value.
      components[name] = Number((modelValue * MODEL_MAX_COMPONENT_WEIGHT).toFixed(4));
      provenance[name] = 'MODEL_ADVISORY_ONLY';
      continue;
    }
    if (modelValue === null) {
      components[name] = deterministic;
      provenance[name] = 'DETERMINISTIC';
      continue;
    }
    const blended = deterministic * (1 - MODEL_MAX_COMPONENT_WEIGHT) + modelValue * MODEL_MAX_COMPONENT_WEIGHT;
    // The model may temper a deterministic score in either direction within
    // its weight, but the result can never exceed the deterministic value by
    // more than that weight allows.
    components[name] = Number(Math.min(blended, deterministic + MODEL_MAX_COMPONENT_WEIGHT).toFixed(4));
    provenance[name] = 'BLENDED';
  }

  const total = Number(SCORE_COMPONENTS.reduce((sum, name) => sum + components[name] * WEIGHTS[name], 0).toFixed(4));
  const unmeasured = SCORE_COMPONENTS.filter(name => provenance[name] === 'UNMEASURED');

  return {
    ok: true,
    policyVersion: PROSPECT_QUALIFICATION_POLICY_VERSION,
    personId: bundle.personId,
    components,
    provenance,
    score: total,
    // Confidence is bounded by what is actually known about the prospect, so a
    // high score built on unknown fields cannot present as a certain one.
    evidenceConfidence: Number(Math.min(bundle.weakestConfidence, 1 - unmeasured.length / SCORE_COMPONENTS.length).toFixed(4)),
    unmeasuredComponents: unmeasured,
    conflicts: bundle.conflicts || [],
    advisoryUsed: advisory?.ok ? { provider: advisory.provider, model: advisory.model, authority: 'ADVISORY_ONLY' } : null,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

/**
 * The decision. Deterministic, and the only thing allowed to make it.
 *
 * QUARANTINE outranks everything: a suppressed or conflicting prospect is not
 * a low-scoring prospect, it is one we must stop touching until a human or a
 * stronger source resolves it.
 */
export function decideProspectQualification({
  scored = null,
  bundle = null,
  routeEligibility = null,
  minimumScore = 0.6,
  minimumEvidenceConfidence = 0.5,
  requiredComponents = ['icpFit', 'buyerRoleFit', 'offerFit']
} = {}) {
  if (!scored?.ok || !bundle?.ok) return fail(['valid-score-and-bundle-required']);
  const reasonCodes = [];

  if (routeEligibility?.state === 'SUPPRESSED') {
    return {
      ok: true,
      policyVersion: PROSPECT_QUALIFICATION_POLICY_VERSION,
      personId: bundle.personId,
      outcome: 'QUARANTINE',
      score: scored.score,
      reasonCodes: ['suppression-dominates-all-other-evidence'],
      distributionEligible: false,
      grantedBy: 'DETERMINISTIC_POLICY',
      externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
    };
  }
  if ((bundle.conflicts || []).length) reasonCodes.push('unresolved-evidence-conflict');

  const missingRequired = (Array.isArray(requiredComponents) ? requiredComponents : [])
    .filter(name => scored.provenance?.[name] !== 'DETERMINISTIC' && scored.provenance?.[name] !== 'BLENDED');
  if (missingRequired.length) reasonCodes.push('required-component-not-deterministically-measured');
  if (scored.evidenceConfidence < minimumEvidenceConfidence) reasonCodes.push('evidence-confidence-below-threshold');
  if (scored.score < minimumScore) reasonCodes.push('score-below-threshold');

  const sendableRoute = (bundle.contactRoutes || []).some(route => route.sendableEvidenceClass);
  if (!sendableRoute) reasonCodes.push('no-route-with-sendable-provenance');
  if (routeEligibility && routeEligibility.eligible !== true) reasonCodes.push('contact-route-not-send-eligible');

  let outcome;
  if ((bundle.conflicts || []).length) outcome = 'QUARANTINE';
  else if (!reasonCodes.length) outcome = 'ELIGIBLE_FOR_EXPERIMENT';
  else if (reasonCodes.includes('score-below-threshold') && !missingRequired.length) outcome = 'REJECT';
  else outcome = 'NEEDS_RESEARCH';

  return {
    ok: true,
    policyVersion: PROSPECT_QUALIFICATION_POLICY_VERSION,
    personId: bundle.personId,
    outcome,
    score: scored.score,
    evidenceConfidence: scored.evidenceConfidence,
    reasonCodes: [...new Set(reasonCodes)],
    // Eligibility for an experiment is not permission to send. The send path
    // still runs its own suppression, deliverability, and quota checks.
    distributionEligible: outcome === 'ELIGIBLE_FOR_EXPERIMENT',
    grantedBy: 'DETERMINISTIC_POLICY',
    advisoryAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}
