import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBEROUTBOUND_GENOME_VERSION = 'uberbond.uberoutbound-genome.v2';

export const UBEROUTBOUND_EVIDENCE_STATES = Object.freeze({
  PROVEN_NORMATIVE: 'PROVEN_NORMATIVE',
  STRONG_INFERENCE: 'STRONG_INFERENCE',
  PROBABLE: 'PROBABLE',
  SPECULATIVE: 'SPECULATIVE',
  UNKNOWN: 'UNKNOWN'
});

export const UBEROUTBOUND_ACTIONS = Object.freeze({
  SEND_CANDIDATE: 'SEND_CANDIDATE',
  WAIT: 'WAIT',
  ABSTAIN: 'ABSTAIN',
  ROUTE_ELSEWHERE: 'ROUTE_ELSEWHERE'
});

export const UBEROUTBOUND_PROBLEM_ALTITUDES = Object.freeze({
  C_SUITE: 'STRATEGIC',
  VP_HEAD: 'FUNCTION',
  DIRECTOR: 'FUNCTION_OPERATIONAL',
  MANAGER: 'WORKFLOW',
  IC_OR_OTHER: 'TASK',
  UNKNOWN: 'UNKNOWN'
});

export const UBEROUTBOUND_V1_PRIORS = Object.freeze({
  firstTouchMaxWords: Object.freeze({ value: 100, evidenceState: 'PROBABLE', sourceClass: 'GONG_LARGE_OBSERVATIONAL' }),
  firstTouchSentenceRange: Object.freeze({ min: 3, max: 4, evidenceState: 'PROBABLE', sourceClass: 'GONG_LARGE_OBSERVATIONAL' }),
  preferredColdCtas: Object.freeze({ value: ['OFFER', 'INTEREST', 'SEND_ASSET', 'BENCHMARK'], evidenceState: 'PROBABLE' }),
  directMeetingAskFirstTouch: Object.freeze({ value: 'CHALLENGER_ONLY', evidenceState: 'PROBABLE' }),
  problemBeforeProduct: Object.freeze({ value: true, evidenceState: 'PROBABLE' }),
  personalizationBySeniority: Object.freeze({ value: true, evidenceState: 'PROBABLE' }),
  relevantProofOverPrestigeProof: Object.freeze({ value: true, evidenceState: 'PROBABLE' }),
  multiTouchNeeded: Object.freeze({ value: true, evidenceState: 'PROBABLE' }),
  followupSweetSpot: Object.freeze({ value: [6, 7], evidenceState: 'PROBABLE', note: 'Not a universal cadence; adaptive stop rules dominate.' }),
  exactTriggerHierarchy: Object.freeze({ value: null, evidenceState: 'SPECULATIVE' }),
  exactIndustryWinner: Object.freeze({ value: null, evidenceState: 'SPECULATIVE' }),
  exactToneWinner: Object.freeze({ value: null, evidenceState: 'SPECULATIVE' }),
  universalOptimalDailyVolume: Object.freeze({ value: null, evidenceState: 'UNKNOWN' }),
  terminalObjective: Object.freeze({ value: 'INCREMENTAL_CLEARED_CONTRIBUTION_PROFIT_SUBJECT_TO_QUALITY_REPUTATION_COMPLIANCE', evidenceState: 'STRONG_INFERENCE' })
});

export const UBEROUTBOUND_SAMPLE_SIZE_PRIORS = Object.freeze([
  Object.freeze({ outcome: 'REPLY', baselineRate: 0.02, variantRate: 0.024, relativeLift: 0.20, approxRecipientsPerArm: 21067 }),
  Object.freeze({ outcome: 'REPLY', baselineRate: 0.02, variantRate: 0.026, relativeLift: 0.30, approxRecipientsPerArm: 9758 }),
  Object.freeze({ outcome: 'QUALIFIED_POSITIVE_REPLY', baselineRate: 0.01, variantRate: 0.012, relativeLift: 0.20, approxRecipientsPerArm: 42607 }),
  Object.freeze({ outcome: 'QUALIFIED_POSITIVE_REPLY', baselineRate: 0.01, variantRate: 0.015, relativeLift: 0.50, approxRecipientsPerArm: 7674 }),
  Object.freeze({ outcome: 'MEETING', baselineRate: 0.003, variantRate: 0.0036, relativeLift: 0.20, approxRecipientsPerArm: 143125 }),
  Object.freeze({ outcome: 'MEETING', baselineRate: 0.003, variantRate: 0.0045, relativeLift: 0.50, approxRecipientsPerArm: 25803 }),
  Object.freeze({ outcome: 'HIGHER_RATE_OUTCOME', baselineRate: 0.05, variantRate: 0.06, relativeLift: 0.20, approxRecipientsPerArm: 8143 })
]);

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp01 = value => Math.max(0, Math.min(1, finite(value) ?? 0));
const bool01 = value => value === true ? 1 : 0;

function noEffects(extra = {}) {
  return {
    version: UBEROUTBOUND_GENOME_VERSION,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: structuredClone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

function hashUnit(value) {
  const digest = crypto.createHash('sha256').update(String(value ?? '')).digest();
  return digest.readUInt32BE(0) / 0xffffffff;
}

export function normalizedOutboundSeniority(value) {
  const raw = clean(value, 80).toUpperCase();
  if (['CEO', 'CFO', 'COO', 'CMO', 'CRO', 'CTO', 'CIO', 'CHRO', 'C_SUITE', 'EXECUTIVE'].includes(raw)) return 'C_SUITE';
  if (raw.includes('VP') || raw.includes('VICE PRESIDENT') || raw === 'HEAD') return 'VP_HEAD';
  if (raw.includes('DIRECTOR')) return 'DIRECTOR';
  if (raw.includes('MANAGER')) return 'MANAGER';
  return raw ? 'IC_OR_OTHER' : 'UNKNOWN';
}

export function outboundProblemAltitude(seniority) {
  return UBEROUTBOUND_PROBLEM_ALTITUDES[normalizedOutboundSeniority(seniority)] || 'UNKNOWN';
}

export function outboundPersonalizationPrior(seniority) {
  switch (normalizedOutboundSeniority(seniority)) {
    case 'C_SUITE': return ['COMPANY', 'ACTIVITY', 'EXECUTIVE_PRIORITY'];
    case 'VP_HEAD': return ['COMPANY', 'ROLE', 'ACTIVITY'];
    case 'DIRECTOR': return ['COMPANY', 'ROLE', 'WORKFLOW'];
    case 'MANAGER': return ['WORKFLOW', 'ROLE', 'COMPANY'];
    case 'IC_OR_OTHER': return ['WORKFLOW', 'INDIVIDUAL', 'ROLE'];
    default: return ['COMPANY', 'ROLE'];
  }
}

export function compileOutboundLegalEvidence(legalDecision = {}) {
  const status = clean(legalDecision.status, 80).toUpperCase();
  const jurisdiction = clean(legalDecision.jurisdiction, 80).toUpperCase();
  const basis = clean(legalDecision.basis, 160);
  const policyVersion = clean(legalDecision.policyVersion, 160);
  const evidenceId = clean(legalDecision.evidenceId, 240);
  const recipientType = clean(legalDecision.recipientType, 120);
  const reasons = [];

  if (status !== 'PASSED') reasons.push('jurisdiction-legal-eligibility-not-passed');
  if (!jurisdiction) reasons.push('jurisdiction-required');
  if (!basis) reasons.push('legal-basis-required');
  if (!policyVersion) reasons.push('legal-policy-version-required');
  if (!evidenceId) reasons.push('legal-evidence-id-required');

  return {
    passed: reasons.length === 0,
    status: status || 'UNKNOWN',
    jurisdiction: jurisdiction || null,
    basis: basis || null,
    recipientType: recipientType || null,
    policyVersion: policyVersion || null,
    evidenceId: evidenceId || null,
    reasonCodes: reasons,
    truthBoundary: 'This object records a prior legal-eligibility decision. It does not independently interpret every jurisdiction or manufacture consent.'
  };
}

export function compileOutboundTriggerPrior(trigger = {}) {
  const type = clean(trigger.type, 120).toUpperCase();
  const confidence = clamp01(trigger.confidence);
  const freshness = clamp01(trigger.freshness ?? 1);
  const problemLinked = trigger.problemLinked === true;
  const direct = ['DIRECT_ENGAGEMENT', 'INTENT', 'OBSERVED_PROBLEM', 'EXPLICIT_PRIORITY'].includes(type);
  const medium = ['HIRING', 'JOB_POST', 'EXPANSION', 'TECH_CHANGE', 'REGULATION', 'LEADERSHIP_CHANGE'].includes(type);
  const weak = ['FUNDING', 'SOCIAL_POST', 'AWARD', 'PODCAST_APPEARANCE', 'TRIVIA'].includes(type);

  let tier = 'UNKNOWN';
  let prior = 0.25;
  let evidenceState = UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE;
  if (direct) { tier = 'A'; prior = 0.85; evidenceState = UBEROUTBOUND_EVIDENCE_STATES.PROBABLE; }
  else if (medium) { tier = 'B'; prior = 0.65; evidenceState = UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE; }
  else if (weak) { tier = 'C'; prior = 0.40; evidenceState = UBEROUTBOUND_EVIDENCE_STATES.SPECULATIVE; }
  if (['SOCIAL_POST', 'AWARD', 'TRIVIA'].includes(type)) { tier = 'D'; prior = 0.20; }
  if (problemLinked) prior = Math.min(1, prior + 0.10);

  const score = prior * (0.5 + (confidence * 0.5)) * (0.5 + (freshness * 0.5));
  return {
    type: type || null,
    tier,
    score: Number(score.toFixed(4)),
    confidence,
    freshness,
    problemLinked,
    evidenceState,
    truthBoundary: 'Trigger tiers are research priors, not universal causal truth. Selection effect and mention effect must be experimentally separated.'
  };
}

export function compileOutboundOpportunityScore({ prospect = {}, sender = {}, legalEvidence = {} } = {}) {
  const trigger = compileOutboundTriggerPrior(prospect.trigger || {});
  const components = {
    problemExistsGivenEvidence: clamp01(prospect.problemEvidenceScore),
    roleOwnsProblem: clamp01(prospect.roleOwnershipScore),
    accountValue: clamp01(prospect.accountValueScore),
    triggerFreshnessAndStrength: trigger.score,
    contactability: clamp01(prospect.contactabilityScore),
    legalEligibility: legalEvidence.passed ? 1 : 0,
    senderHealth: ['GREEN', 'READY'].includes(clean(sender.status, 80).toUpperCase()) ? 1 : 0
  };
  const score = Object.values(components).reduce((acc, value) => acc * value, 1);
  return {
    score: Number(score.toFixed(6)),
    components,
    trigger,
    formula: 'P(problem|evidence) * P(role owns it) * accountValue * triggerFreshnessAndStrength * contactability * legalEligibility * senderHealth',
    truthBoundary: 'This score is a transparent prioritization heuristic. Its calibration must be learned from observed outcomes.'
  };
}

function hardGateReasons({ prospect = {}, sender = {}, authorization = {}, legalEvidence = {}, experimentReady = false, policy = {} } = {}) {
  const reasons = [];
  if (!legalEvidence.passed) reasons.push(...legalEvidence.reasonCodes);
  if (prospect.suppressed === true || prospect.unsubscribed === true) reasons.push('suppression-dominates');
  if (prospect.safeForOutreach !== true) reasons.push('safe-for-outreach-required');
  if (!['VERIFIED', 'SAFE', 'OWNER_CONFIRMED'].includes(clean(prospect.verificationStatus, 80).toUpperCase())) reasons.push('verified-contact-route-required');
  if (!['GREEN', 'READY'].includes(clean(sender.status, 80).toUpperCase())) reasons.push('healthy-sender-required');
  if (sender.authenticationReady !== true) reasons.push('sender-authentication-required');
  if (sender.providerBudgetAvailable !== true) reasons.push('recipient-provider-budget-required');
  if (authorization.outreachAuthorized !== true) reasons.push('separate-outreach-authorization-required');
  if ((policy.requireExperimentAssignment ?? true) && !experimentReady) reasons.push('experiment-assignment-required');
  return [...new Set(reasons)];
}

function strategyPrior(message = {}, prospect = {}) {
  const reasons = [];
  let score = 0.5;
  const wordCount = Math.max(0, Math.floor(finite(message.wordCount) || 0));
  const sentenceCount = Math.max(0, Math.floor(finite(message.sentenceCount) || 0));
  const subjectWordCount = Math.max(0, Math.floor(finite(message.subjectWordCount) || 0));
  const cta = clean(message.ctaType, 80).toUpperCase();
  const firstTouch = Math.max(1, Math.floor(finite(message.sequencePosition) || 1)) === 1;

  if (firstTouch && wordCount > 0 && wordCount <= 100) { score += 0.08; reasons.push('probable-short-first-touch-prior'); }
  if (firstTouch && sentenceCount >= 3 && sentenceCount <= 4) { score += 0.06; reasons.push('probable-3-to-4-sentence-prior'); }
  if (firstTouch && subjectWordCount > 0 && subjectWordCount <= 4) { score += 0.03; reasons.push('probable-short-subject-prior'); }
  if (message.problemBeforeProduct === true) { score += 0.08; reasons.push('probable-problem-before-product-prior'); }
  if (message.productHeavy === true && firstTouch) { score -= 0.08; reasons.push('product-heavy-first-touch-challenged-by-observational-evidence'); }
  if (message.relevantProof === true) { score += 0.06; reasons.push('probable-relevant-proof-prior'); }
  if (firstTouch && ['OFFER', 'INTEREST', 'SEND_ASSET', 'BENCHMARK'].includes(cta)) { score += 0.08; reasons.push('probable-low-friction-cta-prior'); }
  if (firstTouch && cta === 'MEETING') { score -= 0.08; reasons.push('direct-meeting-ask-is-challenger-on-cold-first-touch'); }
  if (Math.max(1, Math.floor(finite(message.sequencePosition) || 1)) > 1 && message.newInformation === true) {
    score += 0.04;
    reasons.push('new-information-followup-prior');
  }

  const preferredPersonalization = new Set(outboundPersonalizationPrior(prospect.seniority));
  if (preferredPersonalization.has(clean(message.personalizationClass, 80).toUpperCase())) {
    score += 0.05;
    reasons.push('seniority-conditioned-personalization-prior');
  }

  const expectedAltitude = outboundProblemAltitude(prospect.seniority);
  if (clean(message.problemAltitude, 80).toUpperCase() === expectedAltitude) {
    score += 0.05;
    reasons.push('problem-altitude-match-prior');
  }

  score = Math.max(0, Math.min(1, score));
  return { score: Number(score.toFixed(4)), reasonCodes: reasons };
}

export function assignUberOutboundExperiment({ prospect = {}, experiment = null } = {}) {
  if (!experiment || !Array.isArray(experiment.arms) || experiment.arms.length < 2) return null;
  const accountKey = clean(prospect.accountId || prospect.companyDomain || prospect.contactId || prospect.email, 320);
  const experimentId = clean(experiment.experimentId, 160);
  const primaryMetric = clean(experiment.primaryMetric, 120).toUpperCase();
  const arms = experiment.arms.map(arm => clean(arm, 160)).filter(Boolean);
  if (!accountKey || !experimentId || !primaryMetric || arms.length < 2) return null;

  const holdoutRate = Math.max(0, Math.min(0.5, finite(experiment.holdoutRate) ?? 0));
  const u = hashUnit(`${experimentId}:${accountKey}`);
  if (holdoutRate > 0 && u < holdoutRate) {
    return {
      experimentId,
      primaryMetric,
      unit: 'ACCOUNT_OR_RECIPIENT_KEY',
      accountKey,
      arm: 'PERSISTENT_HOLDOUT',
      holdout: true,
      deterministic: true,
      treatmentAuthorityCreated: false
    };
  }

  const treatmentU = holdoutRate > 0 ? (u - holdoutRate) / (1 - holdoutRate) : u;
  const selectedIndex = Math.min(arms.length - 1, Math.floor(treatmentU * arms.length));
  return {
    experimentId,
    primaryMetric,
    unit: 'ACCOUNT_OR_RECIPIENT_KEY',
    accountKey,
    arm: arms[selectedIndex],
    holdout: false,
    deterministic: true,
    treatmentAuthorityCreated: false
  };
}

function chooseNonSendAction(blockers = []) {
  if (blockers.includes('suppression-dominates')) return UBEROUTBOUND_ACTIONS.ABSTAIN;
  if (blockers.some(reason => reason.startsWith('jurisdiction-') || reason.startsWith('legal-'))) return UBEROUTBOUND_ACTIONS.ROUTE_ELSEWHERE;
  if (blockers.includes('safe-for-outreach-required') || blockers.includes('verified-contact-route-required')) return UBEROUTBOUND_ACTIONS.ABSTAIN;
  return UBEROUTBOUND_ACTIONS.WAIT;
}

export function compileUberOutboundGenomeDecision({
  prospect = {},
  sender = {},
  authorization = {},
  legalDecision = {},
  messageCandidates = [],
  experiment = null,
  policy = {},
  now = new Date()
} = {}) {
  const legalEvidence = compileOutboundLegalEvidence(legalDecision);
  const experimentAssignment = assignUberOutboundExperiment({ prospect, experiment });
  const blockers = hardGateReasons({
    prospect,
    sender,
    authorization,
    legalEvidence,
    experimentReady: Boolean(experimentAssignment),
    policy
  });
  const opportunity = compileOutboundOpportunityScore({ prospect, sender, legalEvidence });
  const preferredPersonalization = outboundPersonalizationPrior(prospect.seniority);
  const problemAltitude = outboundProblemAltitude(prospect.seniority);
  const minOpportunityScore = finite(policy.minOpportunityScore);

  if (minOpportunityScore != null && opportunity.score < minOpportunityScore) blockers.push('opportunity-score-below-policy-floor');

  const candidates = (Array.isArray(messageCandidates) ? messageCandidates : []).map((message, index) => {
    const prior = strategyPrior(message, prospect);
    return {
      candidateId: clean(message.candidateId || `candidate-${index + 1}`, 160),
      priorScore: prior.score,
      priorReasonCodes: prior.reasonCodes,
      wordCount: Math.max(0, Math.floor(finite(message.wordCount) || 0)),
      sentenceCount: Math.max(0, Math.floor(finite(message.sentenceCount) || 0)),
      subjectWordCount: Math.max(0, Math.floor(finite(message.subjectWordCount) || 0)),
      ctaType: clean(message.ctaType, 80).toUpperCase() || null,
      personalizationClass: clean(message.personalizationClass, 80).toUpperCase() || null,
      problemAltitude: clean(message.problemAltitude, 80).toUpperCase() || null,
      problemBeforeProduct: message.problemBeforeProduct === true,
      productHeavy: message.productHeavy === true,
      relevantProof: message.relevantProof === true,
      newInformation: message.newInformation === true,
      sequencePosition: Math.max(1, Math.floor(finite(message.sequencePosition) || 1))
    };
  }).sort((a, b) => b.priorScore - a.priorScore || a.candidateId.localeCompare(b.candidateId));

  if (!candidates.length) blockers.push('message-candidate-required');
  const uniqueBlockers = [...new Set(blockers)];
  const action = uniqueBlockers.length ? chooseNonSendAction(uniqueBlockers) : UBEROUTBOUND_ACTIONS.SEND_CANDIDATE;

  return noEffects({
    ok: true,
    generatedAt: new Date(now).toISOString(),
    state: uniqueBlockers.length ? 'OUTBOUND_GENOME_BLOCKED' : 'READY_FOR_GOVERNED_SEND_REVIEW',
    recommendedAction: action,
    blockers: uniqueBlockers,
    evidencePolicy: {
      hardGates: ['LEGAL_ELIGIBILITY', 'SUPPRESSION', 'VERIFIED_CONTACT', 'SENDER_HEALTH', 'AUTHENTICATION', 'RECIPIENT_PROVIDER_BUDGET', 'SEPARATE_AUTHORIZATION', 'EXPERIMENT_ASSIGNMENT'],
      priorsAreNotHardGates: true,
      terminalObjective: 'INCREMENTAL_CLEARED_CONTRIBUTION_PROFIT_SUBJECT_TO_REPUTATION_COMPLIANCE_AND_QUALITY',
      openRateTerminalMetric: false,
      volumeQuotaTerminalMetric: false
    },
    legalEvidence,
    opportunity,
    preferredPersonalization,
    problemAltitude,
    messageCandidates: candidates,
    recommendedCandidateId: candidates[0]?.candidateId || null,
    experimentAssignment,
    priors: UBEROUTBOUND_V1_PRIORS,
    messagesSent: 0,
    providerCalls: 0,
    truthBoundary: 'This compiler converts the 2026-09-14 research corpus into evidence-weighted priors, abstention choices and hard governance gates. It does not prove a universal best template, create legal eligibility, authorize outreach, send messages, or claim causal lift.'
  });
}

export function compileUberOutboundOutcomeReceipt({
  decisionId = null,
  experimentAssignment = null,
  outcome = {},
  economics = {},
  observedAt = new Date()
} = {}) {
  const contribution = finite(economics.clearedContributionCents);
  const reputationDamage = finite(economics.reputationDamageCents);
  const complianceRisk = finite(economics.complianceRiskCostCents);
  const opportunityCost = finite(economics.opportunityCostCents);
  const allEconomicTermsObserved = [contribution, reputationDamage, complianceRisk, opportunityCost].every(value => value != null);
  const marginalSendValueCents = allEconomicTermsObserved
    ? contribution - reputationDamage - complianceRisk - opportunityCost
    : null;

  return noEffects({
    receiptType: 'UBEROUTBOUND_OUTCOME',
    decisionId: clean(decisionId, 240) || null,
    observedAt: new Date(observedAt).toISOString(),
    experimentAssignment: experimentAssignment || null,
    delivery: {
      accepted: outcome.deliveryAccepted === true,
      hardBounce: outcome.hardBounce === true,
      softBounce: outcome.softBounce === true,
      complaint: outcome.complaint === true,
      unsubscribed: outcome.unsubscribed === true,
      blockedOrDeferred: outcome.blockedOrDeferred === true
    },
    conversation: {
      replyClass: clean(outcome.replyClass, 120).toUpperCase() || null,
      positiveReply: outcome.positiveReply === true,
      qualifiedPositiveReply: outcome.qualifiedPositiveReply === true,
      referral: outcome.referral === true
    },
    commercial: {
      meetingBooked: outcome.meetingBooked === true,
      meetingShowed: outcome.meetingShowed === true,
      qualifiedOpportunity: outcome.qualifiedOpportunity === true,
      proposal: outcome.proposal === true,
      closedWon: outcome.closedWon === true,
      retained: outcome.retained === true,
      expanded: outcome.expanded === true,
      clearedRevenueCents: finite(outcome.clearedRevenueCents),
      clearedContributionCents: contribution
    },
    economics: {
      reputationDamageCents: reputationDamage,
      complianceRiskCostCents: complianceRisk,
      opportunityCostCents: opportunityCost,
      marginalSendValueCents,
      state: allEconomicTermsObserved ? 'OBSERVED_ENOUGH_TO_COMPUTE' : 'PARTIAL_UNKNOWN'
    },
    truthBoundary: 'A reply, meeting or attributed opportunity is not cleared economic value. Marginal send value remains UNKNOWN until all required economic terms are actually observed or defensibly estimated by a separate policy.'
  });
}

export function compileUberOutboundLearningPacket({ outcomes = [], policy = {} } = {}) {
  const rows = Array.isArray(outcomes) ? outcomes.filter(Boolean) : [];
  const maxComplaintRate = finite(policy.maxComplaintRate) ?? 0.001;
  const minSamplesPerArm = Math.max(1, Math.floor(finite(policy.minSamplesPerArm) || 100));
  const byArm = new Map();

  for (const row of rows) {
    const arm = clean(row?.experimentAssignment?.arm || 'UNASSIGNED', 160);
    if (!byArm.has(arm)) byArm.set(arm, []);
    byArm.get(arm).push(row);
  }

  const arms = [...byArm.entries()].map(([arm, armRows]) => {
    const n = armRows.length;
    const count = predicate => armRows.filter(predicate).length;
    const complaints = count(row => row?.delivery?.complaint === true);
    const qualifiedReplies = count(row => row?.conversation?.qualifiedPositiveReply === true);
    const opportunities = count(row => row?.commercial?.qualifiedOpportunity === true);
    const closedWon = count(row => row?.commercial?.closedWon === true);
    const knownMarginal = armRows.map(row => finite(row?.economics?.marginalSendValueCents)).filter(value => value != null);
    const complaintRate = n ? complaints / n : 0;
    return {
      arm,
      n,
      complaintRate,
      qualifiedPositiveReplyRate: n ? qualifiedReplies / n : 0,
      opportunityRate: n ? opportunities / n : 0,
      closedWonRate: n ? closedWon / n : 0,
      knownMarginalValueCount: knownMarginal.length,
      totalKnownMarginalSendValueCents: knownMarginal.reduce((sum, value) => sum + value, 0),
      guardrailsPassed: complaintRate < maxComplaintRate,
      sampleFloorMet: n >= minSamplesPerArm
    };
  }).sort((a, b) => a.arm.localeCompare(b.arm));

  const eligibleForCausalAnalysis = arms.length >= 2 && arms.every(arm => arm.guardrailsPassed && arm.sampleFloorMet);
  return noEffects({
    packetType: 'UBEROUTBOUND_LEARNING_PACKET',
    outcomeCount: rows.length,
    arms,
    policy: { maxComplaintRate, minSamplesPerArm },
    eligibleForCausalAnalysis,
    promotionState: eligibleForCausalAnalysis ? 'READY_FOR_INDEPENDENT_CAUSAL_ANALYSIS' : 'EVIDENCE_ACCUMULATING',
    automaticWinner: null,
    truthBoundary: 'This aggregator exposes rates and guardrails but deliberately does not declare a causal winner. Promotion requires independent statistical/causal analysis, validation traffic and downstream economic evidence.'
  });
}
