import crypto from 'node:crypto';
import {
  compileUberOutboundMessageGenotype,
  UBEROUTBOUND_EVIDENCE_STATES
} from './uberoutbound-genome.mjs';
import {
  compileUberOutboundPromotionDecision,
  compileUberOutboundDegradationDecision
} from './uberoutbound-promotion-gate.mjs';

export const UBERREPLY_FOUR_OFFER_GENOME_VERSION = 'uberbond.uberreply-four-offer-genome.v1';
export const UBERREPLY_DAILY_PORTFOLIO_TARGET = 100_000;
export const UBERREPLY_DAILY_LANE_TARGET = 25_000;

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const upper = value => clean(value, 240).toUpperCase();
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp01 = value => Math.max(0, Math.min(1, finite(value) ?? 0));
const integer = value => Math.max(0, Math.floor(finite(value) ?? 0));
const uniq = values => [...new Set((values || []).filter(Boolean))];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function digest(prefix, value) {
  const hash = crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
  return `${prefix}_${hash}`;
}

export const UBERREPLY_OFFER_PORTFOLIO = Object.freeze([
  Object.freeze({
    offerId: 'LEAD_TO_BOOKING_LEAK_AUDIT',
    lane: 'A',
    dailyTarget: UBERREPLY_DAILY_LANE_TARGET,
    publicName: 'White-Label Lead-to-Booking Leak Audit',
    canonicalAncestor: 'White-label Lead-Path Revenue Leak Evidence Sprint',
    buyerClass: 'HOME_SERVICES_AGENCY',
    buyerDescription: 'Agencies serving HVAC, plumbing, electrical, or adjacent local-service clients',
    painClass: 'LEADS_NOT_BECOMING_BOOKED_JOBS_OR_NOT_PROVABLY_ATTRIBUTED',
    promise: 'Show where one client lead path breaks, stalls, disappears, or becomes impossible to attribute, with partner-brandable evidence and a prioritized repair backlog.',
    firstPaidCanaryUsd: 450,
    freeArtifactFamilies: Object.freeze(['ONE_PAGE_LEAD_PATH_MAP', 'PUBLIC_PATH_OBSERVATION', 'BOOKING_HANDOFF_SCREENSHOT']),
    expansionPath: Object.freeze(['PORTFOLIO_AUDITS', 'MONTHLY_LEAD_PATH_ASSURANCE', 'AGENCY_WHITE_LABEL_RETAINER']),
    sourceEvidenceState: UBEROUTBOUND_EVIDENCE_STATES.STRONG_INFERENCE,
    externalDemandProofState: 'NOT_YET_PROVEN'
  }),
  Object.freeze({
    offerId: 'AI_AGENT_RELEASE_GATE',
    lane: 'B',
    dailyTarget: UBERREPLY_DAILY_LANE_TARGET,
    publicName: 'AI Agent Release Gate',
    canonicalAncestor: 'AI Agent Acceptance Evidence Sprint',
    buyerClass: 'AI_AGENCY_OR_AGENT_BUILDER',
    buyerDescription: 'AI implementation agencies, SaaS teams, and agent builders preparing customer-facing releases',
    painClass: 'AGENT_FAILURE_OR_UNAUTHORIZED_ACTION_DISCOVERED_AFTER_RELEASE',
    promise: 'Independently test the versioned agent against buyer-approved failure and final-state scenarios before users discover the defects.',
    firstPaidCanaryUsd: 900,
    freeArtifactFamilies: Object.freeze(['THREE_FAILURE_SCENARIOS', 'PUBLIC_WORKFLOW_RISK_MAP', 'RELEASE_GATE_CHECKLIST']),
    expansionPath: Object.freeze(['RELEASE_ACCEPTANCE_SPRINT', 'REGRESSION_GATE', 'PORTFOLIO_AGENT_ASSURANCE']),
    sourceEvidenceState: UBEROUTBOUND_EVIDENCE_STATES.STRONG_INFERENCE,
    externalDemandProofState: 'NOT_YET_PROVEN'
  }),
  Object.freeze({
    offerId: 'CLIENT_ROI_PROOF_SPRINT',
    lane: 'C',
    dailyTarget: UBERREPLY_DAILY_LANE_TARGET,
    publicName: 'Client ROI Proof Sprint',
    canonicalAncestor: null,
    buyerClass: 'PERFORMANCE_MARKETING_AGENCY',
    buyerDescription: 'PPC, SEO, performance, growth, and lead-generation agencies that must defend client ROI',
    painClass: 'MARKETING_ACTIVITY_CANNOT_BE_RECONCILED_TO_DOWNSTREAM_REVENUE',
    promise: 'Reconcile platform activity to calls, forms, CRM outcomes, and buyer-origin revenue evidence, then produce client-ready proof plus the unresolved evidence gaps.',
    firstPaidCanaryUsd: 950,
    freeArtifactFamilies: Object.freeze(['ATTRIBUTION_GAP_MAP', 'THREE_EVIDENCE_BREAKS', 'CLIENT_REPORT_PROOF_CHECKLIST']),
    expansionPath: Object.freeze(['MONTHLY_REVENUE_PROOF', 'CLIENT_RETENTION_ASSURANCE', 'PORTFOLIO_RECONCILIATION']),
    sourceEvidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE,
    externalDemandProofState: 'NOT_YET_PROVEN'
  }),
  Object.freeze({
    offerId: 'BILINGUAL_BOOKING_LEAK_AUDIT',
    lane: 'D',
    dailyTarget: UBERREPLY_DAILY_LANE_TARGET,
    publicName: 'Arabic + English Booking Leak Audit',
    canonicalAncestor: null,
    buyerClass: 'GCC_HIGH_LTV_APPOINTMENT_BUSINESS',
    buyerDescription: 'UAE/KSA clinics, medspas, dental groups, and other high-LTV appointment businesses with Arabic/English journeys',
    painClass: 'BILINGUAL_ENQUIRIES_DIE_BETWEEN_AD_MESSAGING_PHONE_AND_BOOKING',
    promise: 'Trace the Arabic and English booking journey and show where enquiries disappear, stall, or lose continuity before an appointment is booked.',
    firstPaidCanaryUsd: 750,
    freeArtifactFamilies: Object.freeze(['BILINGUAL_BOOKING_MAP', 'ONE_HANDOFF_SCREENSHOT', 'CHANNEL_LANGUAGE_GAP_NOTE']),
    expansionPath: Object.freeze(['MULTI_LOCATION_AUDIT', 'BOOKING_ASSURANCE_MONITOR', 'CHANNEL_LANGUAGE_PORTFOLIO_ASSURANCE']),
    sourceEvidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE,
    externalDemandProofState: 'NOT_YET_PROVEN'
  })
]);

export const UBERREPLY_HYBRID = Object.freeze({
  name: 'UBERREPLY',
  structure: Object.freeze(['SIGNAL', 'TENSION', 'INSIGHT', 'GIFT', 'TINY_ASK']),
  donorPrinciples: Object.freeze([
    'SMYKM_CONTEXTUAL_RELEVANCE',
    'JOSH_BRAUN_ILLUMINATE_DONT_PITCH',
    'GONG_PROBLEM_BEFORE_PRODUCT_SHORT_FIRST_TOUCH',
    'JASON_BAY_OFFER_BASED_CTA',
    'NEW_INFORMATION_FOLLOWUPS',
    'ECONOMICALLY_CAUSAL_PERSONALIZATION_NOT_DECORATIVE_PERSONALIZATION'
  ]),
  firstTouch: Object.freeze({
    subjectWordRange: Object.freeze({ min: 1, max: 4 }),
    bodyWordTargetByResearchDepth: Object.freeze({ S: Object.freeze({ min: 65, max: 120 }), A: Object.freeze({ min: 50, max: 95 }), B: Object.freeze({ min: 35, max: 75 }) }),
    directMeetingAsk: 'DISALLOWED_BY_DEFAULT',
    preferredCta: 'SEND_ASSET',
    onePrimaryAsk: true,
    problemBeforeProduct: true,
    productHeavy: false
  }),
  followups: Object.freeze({
    defaultTouches: 3,
    evidenceConditionedMaximumTouches: 6,
    eachTouchMustAddNewInformation: true,
    stopOnNegativeReply: true,
    stopOnSuppressionOrUnsubscribe: true,
    stopOnReputationDeterioration: true
  }),
  evidenceState: UBEROUTBOUND_EVIDENCE_STATES.STRONG_INFERENCE,
  truthBoundary: 'UBERREPLY is a synthesized strategy prior. No donor principle or structure is treated as a universal causal winner until UberBond experiments establish segment-specific outcome evidence.'
});

export function getUberReplyOffer(offerId) {
  return UBERREPLY_OFFER_PORTFOLIO.find(row => row.offerId === upper(offerId)) || null;
}

function tagSet(prospect = {}) {
  const raw = [
    prospect.industry,
    prospect.buyerClass,
    prospect.companyType,
    prospect.department,
    prospect.region,
    prospect.country,
    prospect.vertical,
    prospect.serviceModel,
    ...(Array.isArray(prospect.tags) ? prospect.tags : []),
    ...(Array.isArray(prospect.services) ? prospect.services : [])
  ];
  return new Set(raw.map(value => upper(value)).filter(Boolean));
}

function hasAny(tags, needles) {
  for (const tag of tags) for (const needle of needles) if (tag.includes(needle)) return true;
  return false;
}

export function scoreUberReplyOfferFit(offer, prospect = {}) {
  const tags = tagSet(prospect);
  const evidence = clamp01(prospect.fitEvidenceConfidence ?? prospect.problemEvidenceScore ?? 0);
  let semantic = 0;
  if (offer.offerId === 'LEAD_TO_BOOKING_LEAK_AUDIT') {
    semantic += hasAny(tags, ['AGENCY', 'MARKETING', 'PPC', 'LEAD GEN']) ? 0.35 : 0;
    semantic += hasAny(tags, ['HVAC', 'PLUMB', 'ELECTR', 'HOME SERVICE', 'ROOF', 'PEST', 'LOCAL SERVICE']) ? 0.35 : 0;
    semantic += hasAny(tags, ['SERVICETITAN', 'JOBBER', 'BOOKING', 'CALL', 'CRM']) ? 0.15 : 0;
  } else if (offer.offerId === 'AI_AGENT_RELEASE_GATE') {
    semantic += hasAny(tags, ['AI', 'AGENT', 'LLM', 'SAAS', 'SOFTWARE']) ? 0.45 : 0;
    semantic += hasAny(tags, ['IMPLEMENTATION', 'AGENCY', 'PRODUCT', 'ENGINEERING', 'PLATFORM']) ? 0.25 : 0;
    semantic += hasAny(tags, ['RELEASE', 'EVAL', 'QA', 'ACCEPTANCE', 'WORKFLOW']) ? 0.15 : 0;
  } else if (offer.offerId === 'CLIENT_ROI_PROOF_SPRINT') {
    semantic += hasAny(tags, ['AGENCY', 'MARKETING', 'PPC', 'SEO', 'PERFORMANCE', 'GROWTH']) ? 0.45 : 0;
    semantic += hasAny(tags, ['ATTRIBUTION', 'ROI', 'ANALYTICS', 'CRM', 'REVENUE', 'REPORTING']) ? 0.30 : 0;
  } else if (offer.offerId === 'BILINGUAL_BOOKING_LEAK_AUDIT') {
    semantic += hasAny(tags, ['UAE', 'SAUDI', 'KSA', 'GCC', 'DUBAI', 'RIYADH', 'ABU DHABI', 'JEDDAH']) ? 0.30 : 0;
    semantic += hasAny(tags, ['CLINIC', 'MEDSPA', 'DENTAL', 'HEALTH', 'AESTHETIC', 'APPOINTMENT']) ? 0.35 : 0;
    semantic += hasAny(tags, ['ARABIC', 'WHATSAPP', 'BOOKING', 'CALL', 'BILINGUAL']) ? 0.20 : 0;
  }
  const score = Math.min(1, semantic + (0.15 * evidence));
  return {
    offerId: offer.offerId,
    score: Number(score.toFixed(4)),
    evidenceConfidence: evidence,
    semanticFit: Number(semantic.toFixed(4)),
    truthBoundary: 'Fit is an explicit heuristic over supplied evidence and tags. It is not buyer intent, consent, willingness to pay, or permission to contact.'
  };
}

export function selectUberReplyOffer(prospect = {}, { minimumFit = 0.55 } = {}) {
  const ranked = UBERREPLY_OFFER_PORTFOLIO
    .map(offer => ({ offer, fit: scoreUberReplyOfferFit(offer, prospect) }))
    .sort((a, b) => b.fit.score - a.fit.score || a.offer.offerId.localeCompare(b.offer.offerId));
  const winner = ranked[0];
  if (!winner || winner.fit.score < minimumFit) {
    return {
      selected: false,
      state: 'ABSTAIN_NO_STRONG_OFFER_FIT',
      offer: null,
      ranked: ranked.map(row => row.fit),
      externalEffectAuthority: 'NONE',
      businessEffectAuthority: 'NONE'
    };
  }
  return {
    selected: true,
    state: 'OFFER_FIT_SELECTED',
    offer: winner.offer,
    fit: winner.fit,
    ranked: ranked.map(row => row.fit),
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE'
  };
}

export function compileUberReplyResearchDepth({
  accountValueScore = 0,
  signalStrength = 0,
  artifactFeasibility = 0,
  evidenceDensity = 0,
  estimatedResearchMinutes = 0
} = {}) {
  const value = clamp01(accountValueScore);
  const signal = clamp01(signalStrength);
  const artifact = clamp01(artifactFeasibility);
  const density = clamp01(evidenceDensity);
  const minutes = Math.max(0, finite(estimatedResearchMinutes) ?? 0);
  const gross = (0.35 * value) + (0.30 * signal) + (0.20 * artifact) + (0.15 * density);
  const costPenalty = Math.min(0.25, minutes / 240);
  const net = Math.max(0, gross - costPenalty);
  const depth = net >= 0.76 ? 'S' : net >= 0.48 ? 'A' : 'B';
  return {
    depth,
    score: Number(net.toFixed(4)),
    bodyWordTarget: UBERREPLY_HYBRID.firstTouch.bodyWordTargetByResearchDepth[depth],
    personalizationClass: depth === 'S' ? 'DEEP_ECONOMIC_CAUSAL' : depth === 'A' ? 'ECONOMIC_CAUSAL' : 'SEGMENT_TRIGGER_CAUSAL',
    truthBoundary: 'Research depth allocates effort by expected evidence value and cost. It is not a promise that deeper research causes a higher reply or purchase rate.'
  };
}

export function compileUberReplyMessagePolicy({ offerId, prospect = {}, sequencePosition = 1, research = {} } = {}) {
  const offer = getUberReplyOffer(offerId);
  if (!offer) return { ok: false, state: 'UNKNOWN_OFFER', reasonCodes: ['known-offer-required'] };
  const depth = compileUberReplyResearchDepth(research);
  const firstTouch = integer(sequencePosition || 1) <= 1;
  const position = Math.max(1, integer(sequencePosition || 1));
  const artifact = offer.freeArtifactFamilies[0];
  const messageCandidate = {
    problemAltitude: upper(prospect.problemAltitude || 'FUNCTION_OPERATIONAL'),
    personalizationClass: depth.personalizationClass,
    researchDepth: depth.depth,
    sourceCountBucket: integer(prospect.sourceCount || 0),
    sourceFreshnessBucket: clamp01(prospect.sourceFreshness ?? 1),
    subjectArchitecture: 'SHORT_PLAIN_RELEVANT',
    subjectWordCount: Math.min(4, Math.max(1, integer(prospect.proposedSubjectWordCount || 3))),
    openingArchitecture: 'SIGNAL',
    problemArchitecture: 'TENSION_QUESTION',
    problemBeforeProduct: true,
    mechanismClass: 'EVIDENCE_FIRST_MICRO_ARTIFACT',
    productHeavy: false,
    proofType: 'PROSPECT_SPECIFIC_OBSERVATION',
    relevantProof: true,
    proofSimilarityDimension: 'SAME_PROBLEM_OR_WORKFLOW',
    offerType: artifact,
    ctaType: firstTouch ? 'SEND_ASSET' : 'LOW_FRICTION_REPLY',
    tone: 'PLAIN_SPECIFIC_LOW_PRESSURE',
    sequencePosition: position,
    newInformation: position > 1,
    threadMode: position > 1 ? 'SAME_THREAD' : 'NEW_THREAD',
    promptOrPolicyVersion: UBERREPLY_FOUR_OFFER_GENOME_VERSION,
    generationCostBand: depth.depth === 'S' ? 'HIGH' : depth.depth === 'A' ? 'MEDIUM' : 'LOW',
    researchEffortBand: depth.depth
  };
  const genotype = compileUberOutboundMessageGenotype(messageCandidate, prospect);
  const experimentIdentity = {
    offerId: offer.offerId,
    lane: offer.lane,
    industry: upper(prospect.industry),
    buyerClass: offer.buyerClass,
    seniority: upper(prospect.seniority),
    triggerType: upper(prospect?.trigger?.type),
    painClass: offer.painClass,
    researchDepth: depth.depth,
    genotypeId: genotype.genotypeId,
    cta: messageCandidate.ctaType,
    sequencePosition: position
  };
  return {
    ok: true,
    state: 'UBERREPLY_POLICY_COMPILED',
    offer,
    researchDepth: depth,
    messageCandidate,
    genotype,
    experimentCellId: digest('ubrx', experimentIdentity),
    experimentIdentity,
    constraints: {
      subjectWordMin: 1,
      subjectWordMax: 4,
      bodyWordTarget: depth.bodyWordTarget,
      onePrimaryAsk: true,
      directMeetingAskFirstTouchAllowed: false,
      problemBeforeProduct: true,
      evidenceBackedSignalRequired: true,
      freeArtifactMustExistBeforeClaimingItExists: true,
      everyFollowupMustAddNewInformation: position > 1
    },
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'This compiles a strategy genotype and experiment cell only. It creates no contact authority and does not prove the strategy will outperform another strategy.'
  };
}

function wordCount(value) {
  const text = clean(value, 20000);
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

export function validateUberReplyRenderedMessage({ policy = {}, subject = '', body = '', evidenceRefs = [], primaryAskCount = 1, artifactPrepared = false } = {}) {
  const reasons = [];
  const subjectWords = wordCount(subject);
  const bodyWords = wordCount(body);
  const position = integer(policy?.messageCandidate?.sequencePosition || 1) || 1;
  const target = policy?.constraints?.bodyWordTarget || { min: 35, max: 100 };
  const lower = String(body || '').toLowerCase();
  if (subjectWords < 1 || subjectWords > 4) reasons.push('subject-must-be-1-to-4-words');
  if (bodyWords < Number(target.min || 0) || bodyWords > Number(target.max || 999)) reasons.push('body-outside-research-depth-word-target');
  if (!Array.isArray(evidenceRefs) || evidenceRefs.filter(Boolean).length < 1) reasons.push('at-least-one-evidence-reference-required');
  if (integer(primaryAskCount) !== 1) reasons.push('exactly-one-primary-ask-required');
  if (position === 1 && /(book|schedule|calendar|15\s*min|30\s*min|meeting)/i.test(body)) reasons.push('first-touch-direct-meeting-ask-disallowed');
  if (/hope (you('| a)re|you are) well|just bumping|circling back|touching base/i.test(body)) reasons.push('generic-or-empty-followup-language-disallowed');
  if (policy?.constraints?.freeArtifactMustExistBeforeClaimingItExists === true && /i (made|mapped|found|drafted|prepared|pulled together)/i.test(body) && artifactPrepared !== true) {
    reasons.push('claimed-artifact-must-exist-before-send');
  }
  if (position > 1 && policy?.constraints?.everyFollowupMustAddNewInformation === true && !/new|another|also|one more|benchmark|found|noticed|evidence|example/i.test(lower)) {
    reasons.push('followup-new-information-signal-required');
  }
  return {
    ok: reasons.length === 0,
    state: reasons.length ? 'UBERREPLY_RENDER_REFUSED' : 'UBERREPLY_RENDER_ACCEPTED',
    reasonCodes: uniq(reasons),
    subjectWords,
    bodyWords,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE'
  };
}

export function compileUberReplyPortfolioAllocation({ eligibleByOffer = {}, targetPerLane = UBERREPLY_DAILY_LANE_TARGET } = {}) {
  const target = integer(targetPerLane);
  const lanes = UBERREPLY_OFFER_PORTFOLIO.map(offer => {
    const eligible = integer(eligibleByOffer?.[offer.offerId]);
    const allocated = Math.min(target, eligible);
    return {
      lane: offer.lane,
      offerId: offer.offerId,
      target,
      eligible,
      allocated,
      shortfall: Math.max(0, target - allocated),
      spilloverToOtherLaneAuthorized: false
    };
  });
  const allocatedTotal = lanes.reduce((sum, row) => sum + row.allocated, 0);
  const targetTotal = lanes.reduce((sum, row) => sum + row.target, 0);
  return {
    version: UBERREPLY_FOUR_OFFER_GENOME_VERSION,
    targetTotal,
    allocatedTotal,
    shortfall: Math.max(0, targetTotal - allocatedTotal),
    lanes,
    exactFourLaneTarget: targetTotal === UBERREPLY_DAILY_PORTFOLIO_TARGET,
    automaticCrossLaneReallocationAuthorized: false,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'The 25k-per-lane split is a diversification target, not a quota that permits lower-quality recipients. Missing eligible inventory remains unfilled unless a separately governed policy authorizes reallocation.'
  };
}

export function compileUberReplyOutcomeFitness(outcome = {}) {
  const sends = integer(outcome.providerConfirmedSends ?? outcome.sends);
  const qualifiedPositiveReplies = integer(outcome.qualifiedPositiveReplies);
  const qualifiedConversations = integer(outcome.qualifiedConversations);
  const paidSprints = integer(outcome.paidSprints ?? outcome.clearedPayments);
  const acceptedDeliveries = integer(outcome.acceptedDeliveries);
  const expansions = integer(outcome.expansions);
  const clearedContributionCents = finite(outcome.clearedContributionCents) ?? 0;
  const expansionContributionCents = finite(outcome.expansionContributionCents) ?? 0;
  const complaints = integer(outcome.complaints);
  const hardBounces = integer(outcome.hardBounces);
  const denominator = Math.max(1, sends);
  const per1000 = value => Number(((value / denominator) * 1000).toFixed(6));
  const contributionPer1000Cents = Number((((clearedContributionCents + expansionContributionCents) / denominator) * 1000).toFixed(2));
  const guardrailState = complaints > 0 || hardBounces > Math.max(2, Math.ceil(sends * 0.02)) ? 'REVIEW_REQUIRED' : 'CLEAR';
  const maturity = acceptedDeliveries > 0 || paidSprints > 0 ? 'DOWN_FUNNEL' : qualifiedConversations > 0 ? 'CONVERSATION' : qualifiedPositiveReplies > 0 ? 'REPLY' : 'NO_RESPONSE';
  return {
    sends,
    qualifiedPositiveRepliesPer1000: per1000(qualifiedPositiveReplies),
    qualifiedConversationsPer1000: per1000(qualifiedConversations),
    paidSprintsPer1000: per1000(paidSprints),
    acceptedDeliveriesPer1000: per1000(acceptedDeliveries),
    expansionsPer1000: per1000(expansions),
    contributionPer1000Cents,
    complaintRate: Number((complaints / denominator).toFixed(8)),
    hardBounceRate: Number((hardBounces / denominator).toFixed(8)),
    guardrailState,
    maturity,
    rankingVector: Object.freeze([
      guardrailState === 'CLEAR' ? 1 : 0,
      contributionPer1000Cents,
      per1000(paidSprints),
      per1000(acceptedDeliveries),
      per1000(qualifiedConversations),
      per1000(qualifiedPositiveReplies)
    ]),
    truthBoundary: 'Fitness prioritizes cleared contribution and paid/down-funnel outcomes over raw reply rate. It is descriptive of supplied receipts and does not infer unobserved revenue or causal lift.'
  };
}

export function compareUberReplyFitness(aOutcome = {}, bOutcome = {}) {
  const a = compileUberReplyOutcomeFitness(aOutcome);
  const b = compileUberReplyOutcomeFitness(bOutcome);
  for (let i = 0; i < a.rankingVector.length; i += 1) {
    if (a.rankingVector[i] > b.rankingVector[i]) return { winner: 'A', a, b, comparedAtIndex: i };
    if (a.rankingVector[i] < b.rankingVector[i]) return { winner: 'B', a, b, comparedAtIndex: i };
  }
  return { winner: 'TIE', a, b, comparedAtIndex: null };
}

export function compileUberReplyOfferLifecycle({ offerId, outcome = {}, minimumPaidForScaleReview = 3 } = {}) {
  const offer = getUberReplyOffer(offerId);
  if (!offer) return { state: 'UNKNOWN_OFFER', reasonCodes: ['known-offer-required'] };
  const fitness = compileUberReplyOutcomeFitness(outcome);
  const conversations = integer(outcome.qualifiedConversations);
  const paid = integer(outcome.paidSprints ?? outcome.clearedPayments);
  const contribution = finite(outcome.clearedContributionCents) ?? 0;
  const accepted = integer(outcome.acceptedDeliveries);
  const reasons = [];
  let state = 'CONTINUE_BOUNDED_EXPERIMENT';
  if (fitness.guardrailState !== 'CLEAR') {
    state = 'DEGRADE_OR_PAUSE_FOR_GUARDRAIL_REVIEW';
    reasons.push('sender-or-recipient-harm-review-required');
  } else if (conversations >= 5 && paid === 0) {
    state = 'RETHINK_OFFER';
    reasons.push('five-qualified-conversations-with-zero-paid-pilots');
  } else if (paid > 0 && contribution < 0) {
    state = 'RETHINK_ECONOMICS';
    reasons.push('negative-cleared-contribution');
  } else if (paid >= minimumPaidForScaleReview && accepted >= minimumPaidForScaleReview && contribution > 0) {
    state = 'SCALE_REVIEW_CANDIDATE';
    reasons.push('repeat-paid-accepted-positive-contribution-evidence');
  }
  return {
    version: UBERREPLY_FOUR_OFFER_GENOME_VERSION,
    offerId: offer.offerId,
    state,
    reasonCodes: reasons,
    fitness,
    automaticOfferReplacementAuthorized: false,
    automaticSpendIncreaseAuthorized: false,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'Offer lifecycle is a commercial-learning recommendation. Scale, replacement, price changes, or consequential distribution remain separately governed.'
  };
}

export function compileUberReplyStrategyLifecycle({
  genotype = {},
  experimentEvidence = {},
  validationEvidence = {},
  reputationEvidence = {},
  economicEvidence = {},
  policy = {}
} = {}) {
  const primaryMetric = upper(experimentEvidence.primaryMetric || 'INCREMENTAL_CLEARED_CONTRIBUTION_PROFIT');
  const promotion = compileUberOutboundPromotionDecision({
    candidate: { ...genotype, candidateId: genotype.candidateId || genotype.genotypeId },
    experimentEvidence: { ...experimentEvidence, primaryMetric },
    validationEvidence,
    reputationEvidence,
    economicEvidence,
    policy
  });
  const degradation = compileUberOutboundDegradationDecision({
    currentState: promotion.state,
    complaintRate: reputationEvidence.complaintRate,
    complaintCeiling: reputationEvidence.complaintCeiling ?? policy.complaintCeiling,
    hardBounceRate: reputationEvidence.hardBounceRate,
    hardBounceCeiling: reputationEvidence.hardBounceCeiling ?? policy.hardBounceCeiling,
    recentEffectDirection: experimentEvidence.effectDirection,
    legalIncidentCount: reputationEvidence.legalIncidentCount,
    providerPolicyIncidentCount: reputationEvidence.providerPolicyIncidentCount
  });
  return {
    version: UBERREPLY_FOUR_OFFER_GENOME_VERSION,
    primaryMetric,
    promotion,
    degradation,
    rawReplyRateCanPromotePolicy: false,
    automaticRuntimePromotionAuthorized: false,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'UBERREPLY inherits the canonical promotion gate. A strategy cannot win on opens or raw replies alone and cannot auto-promote into consequential runtime authority.'
  };
}

export function compileUberReplyPortfolioDecision({ prospect = {}, research = {}, sequencePosition = 1, minimumFit = 0.55 } = {}) {
  const selection = selectUberReplyOffer(prospect, { minimumFit });
  if (!selection.selected) return { ...selection, version: UBERREPLY_FOUR_OFFER_GENOME_VERSION };
  const policy = compileUberReplyMessagePolicy({ offerId: selection.offer.offerId, prospect, research, sequencePosition });
  return {
    version: UBERREPLY_FOUR_OFFER_GENOME_VERSION,
    state: policy.ok ? 'UBERREPLY_PORTFOLIO_DECISION_READY' : 'UBERREPLY_PORTFOLIO_DECISION_REFUSED',
    selection,
    policy,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'Portfolio selection and message strategy compilation are decision support only. Recipient eligibility, legal/suppression state, sender health, and dispatch authority remain binding downstream.'
  };
}
