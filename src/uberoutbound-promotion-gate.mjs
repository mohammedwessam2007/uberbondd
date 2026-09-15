import { UBEROUTBOUND_EVIDENCE_STATES } from './uberoutbound-genome.mjs';

export const UBEROUTBOUND_PROMOTION_GATE_VERSION = 'uberbond.uberoutbound-promotion-gate.v1';

export const UBEROUTBOUND_PROMOTION_STATES = Object.freeze({
  RESEARCH_PRIOR: 'RESEARCH_PRIOR',
  RANDOMIZED_TRIAL: 'RANDOMIZED_TRIAL',
  VALIDATION_PENDING: 'VALIDATION_PENDING',
  APPROVED_POLICY_CANDIDATE: 'APPROVED_POLICY_CANDIDATE',
  DEGRADED: 'DEGRADED',
  REVOKED: 'REVOKED'
});

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const finite = value => value === null || value === undefined || value === ''
  ? null
  : (Number.isFinite(Number(value)) ? Number(value) : null);

const TERMINAL_ECONOMIC_METRICS = new Set([
  'CLEARED_CONTRIBUTION_PROFIT',
  'INCREMENTAL_CLEARED_CONTRIBUTION_PROFIT',
  'RETENTION',
  'EXPANSION'
]);

const ACCEPTABLE_INTERMEDIATE_METRICS = new Set([
  'QUALIFIED_POSITIVE_REPLY',
  'QUALIFIED_MEETING',
  'SHOW',
  'QUALIFIED_OPPORTUNITY',
  'PROPOSAL'
]);

export function compileUberOutboundPromotionDecision({
  candidate = {},
  experimentEvidence = {},
  validationEvidence = {},
  reputationEvidence = {},
  economicEvidence = {},
  policy = {}
} = {}) {
  const candidateId = clean(candidate.candidateId || candidate.genotypeId || candidate.claimId, 240) || null;
  const causalState = clean(experimentEvidence.causalState, 80).toUpperCase();
  const primaryMetric = clean(experimentEvidence.primaryMetric, 120).toUpperCase();
  const samplePerArm = finite(experimentEvidence.samplePerArm);
  const minimumSamplePerArm = finite(experimentEvidence.minimumSamplePerArm ?? policy.minimumSamplePerArm);
  const effectDirection = clean(experimentEvidence.effectDirection, 80).toUpperCase();
  const uncertaintyState = clean(experimentEvidence.uncertaintyState, 80).toUpperCase();
  const independentAnalysis = experimentEvidence.independentAnalysis === true;
  const randomized = experimentEvidence.randomized === true;
  const holdoutProtected = experimentEvidence.holdoutProtected === true;
  const validationPassed = validationEvidence.untouchedValidationPassed === true;
  const validationSample = finite(validationEvidence.sampleSize);
  const minimumValidationSample = finite(validationEvidence.minimumSampleSize ?? policy.minimumValidationSample);
  const complaintRate = finite(reputationEvidence.complaintRate);
  const complaintCeiling = finite(reputationEvidence.complaintCeiling ?? policy.complaintCeiling);
  const hardBounceRate = finite(reputationEvidence.hardBounceRate);
  const hardBounceCeiling = finite(reputationEvidence.hardBounceCeiling ?? policy.hardBounceCeiling);
  const legalIncidents = Math.max(0, Math.floor(finite(reputationEvidence.legalIncidentCount) || 0));
  const providerPolicyIncidents = Math.max(0, Math.floor(finite(reputationEvidence.providerPolicyIncidentCount) || 0));
  const incrementalContribution = finite(economicEvidence.incrementalClearedContributionCents);
  const downFunnelObserved = economicEvidence.downFunnelObserved === true;

  const fatal = [];
  const pending = [];
  const warnings = [];

  if (!candidateId) fatal.push('candidate-id-required');
  if (legalIncidents > 0) fatal.push('legal-incident-observed');
  if (providerPolicyIncidents > 0) fatal.push('provider-policy-incident-observed');
  if (complaintRate != null && complaintCeiling != null && complaintRate >= complaintCeiling) fatal.push('complaint-ceiling-reached');
  if (hardBounceRate != null && hardBounceCeiling != null && hardBounceRate >= hardBounceCeiling) fatal.push('hard-bounce-ceiling-reached');
  if (effectDirection === 'NEGATIVE' || causalState === 'HARM') fatal.push('negative-causal-or-harm-signal');

  if (!randomized) pending.push('randomized-trial-required');
  if (!independentAnalysis) pending.push('independent-analysis-required');
  if (!holdoutProtected) pending.push('persistent-or-untouched-holdout-required');
  if (!primaryMetric) pending.push('predeclared-primary-metric-required');
  if (['OPEN', 'OPEN_RATE', 'RAW_REPLY', 'RAW_REPLY_RATE'].includes(primaryMetric)) fatal.push('vanity-metric-cannot-promote-policy');
  if (samplePerArm == null || minimumSamplePerArm == null || samplePerArm < minimumSamplePerArm) pending.push('minimum-randomized-sample-not-met');
  if (!['SUPPORTED', 'CAUSAL_SUPPORTED'].includes(causalState)) pending.push('causal-support-not-established');
  if (!['ACCEPTABLE', 'NARROW', 'STABLE'].includes(uncertaintyState)) pending.push('uncertainty-too-wide-or-unknown');
  if (!validationPassed) pending.push('untouched-validation-required');
  if (minimumValidationSample != null && (validationSample == null || validationSample < minimumValidationSample)) pending.push('minimum-validation-sample-not-met');
  if (!downFunnelObserved) warnings.push('down-funnel-evidence-not-yet-observed');
  if (!TERMINAL_ECONOMIC_METRICS.has(primaryMetric) && !ACCEPTABLE_INTERMEDIATE_METRICS.has(primaryMetric)) warnings.push('primary-metric-not-in-standard-hierarchy');
  if (incrementalContribution == null) warnings.push('incremental-cleared-contribution-unknown');
  if (incrementalContribution != null && incrementalContribution < 0) fatal.push('negative-incremental-cleared-contribution');

  let state;
  if (fatal.length) state = UBEROUTBOUND_PROMOTION_STATES.REVOKED;
  else if (pending.includes('randomized-trial-required') || pending.includes('minimum-randomized-sample-not-met') || pending.includes('causal-support-not-established')) state = UBEROUTBOUND_PROMOTION_STATES.RANDOMIZED_TRIAL;
  else if (pending.length) state = UBEROUTBOUND_PROMOTION_STATES.VALIDATION_PENDING;
  else state = UBEROUTBOUND_PROMOTION_STATES.APPROVED_POLICY_CANDIDATE;

  const eligibleForPolicyReview = state === UBEROUTBOUND_PROMOTION_STATES.APPROVED_POLICY_CANDIDATE;
  return {
    version: UBEROUTBOUND_PROMOTION_GATE_VERSION,
    candidateId,
    state,
    eligibleForPolicyReview,
    evidenceState: eligibleForPolicyReview ? UBEROUTBOUND_EVIDENCE_STATES.STRONG_INFERENCE : UBEROUTBOUND_EVIDENCE_STATES.UNKNOWN,
    fatalReasonCodes: [...new Set(fatal)],
    pendingReasonCodes: [...new Set(pending)],
    warningCodes: [...new Set(warnings)],
    evidenceSummary: {
      causalState: causalState || 'UNKNOWN',
      primaryMetric: primaryMetric || null,
      samplePerArm,
      minimumSamplePerArm,
      randomized,
      independentAnalysis,
      holdoutProtected,
      validationPassed,
      validationSample,
      minimumValidationSample,
      complaintRate,
      complaintCeiling,
      hardBounceRate,
      hardBounceCeiling,
      incrementalClearedContributionCents: incrementalContribution,
      downFunnelObserved
    },
    automaticRuntimePromotionAuthorized: false,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'Promotion eligibility means only that the candidate has enough declared causal, validation and guardrail evidence to enter separate policy review. It never auto-promotes a treatment, widens contact authority, overrides suppression/legal/provider gates, or converts an observational prior into causal truth.'
  };
}

export function compileUberOutboundDegradationDecision({
  currentState = 'APPROVED_POLICY_CANDIDATE',
  complaintRate = null,
  complaintCeiling = null,
  hardBounceRate = null,
  hardBounceCeiling = null,
  recentEffectDirection = 'UNKNOWN',
  legalIncidentCount = 0,
  providerPolicyIncidentCount = 0
} = {}) {
  const reasons = [];
  const c = finite(complaintRate);
  const cc = finite(complaintCeiling);
  const b = finite(hardBounceRate);
  const bc = finite(hardBounceCeiling);
  if (Math.max(0, Math.floor(finite(legalIncidentCount) || 0)) > 0) reasons.push('legal-incident-observed');
  if (Math.max(0, Math.floor(finite(providerPolicyIncidentCount) || 0)) > 0) reasons.push('provider-policy-incident-observed');
  if (c != null && cc != null && c >= cc) reasons.push('complaint-ceiling-reached');
  if (b != null && bc != null && b >= bc) reasons.push('hard-bounce-ceiling-reached');
  if (clean(recentEffectDirection, 80).toUpperCase() === 'NEGATIVE') reasons.push('recent-effect-negative');
  const severe = reasons.some(reason => ['legal-incident-observed', 'provider-policy-incident-observed', 'complaint-ceiling-reached'].includes(reason));
  return {
    version: UBEROUTBOUND_PROMOTION_GATE_VERSION,
    previousState: clean(currentState, 80).toUpperCase() || 'UNKNOWN',
    nextState: reasons.length ? (severe ? UBEROUTBOUND_PROMOTION_STATES.REVOKED : UBEROUTBOUND_PROMOTION_STATES.DEGRADED) : clean(currentState, 80).toUpperCase() || 'UNKNOWN',
    reasonCodes: [...new Set(reasons)],
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'Degradation output is a policy-state recommendation. Consequence actions remain under the existing authority and suppression/provider control planes.'
  };
}
