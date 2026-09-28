import crypto from 'node:crypto';
import {
  compileUberOutboundMessageGenotype,
  UBEROUTBOUND_EVIDENCE_STATES
} from './uberoutbound-genome.mjs';
import {
  compileUberOutboundPromotionDecision,
  compileUberOutboundDegradationDecision
} from './uberoutbound-promotion-gate.mjs';

export const UBERREPLY_FOUR_OFFER_GENOME_VERSION = 'uberbond.uberreply-four-offer-genome.v2';
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
    publicName: 'Agency Revenue Leak Proof Pack',
    formerPublicNames: Object.freeze(['White-Label Lead-to-Booking Leak Audit']),
    canonicalAncestor: 'White-label Lead-Path Revenue Leak Evidence Sprint',
    buyerClass: 'HOME_SERVICES_AGENCY',
    buyerDescription: 'Agency owners, Heads of Client Services, and performance leaders serving HVAC, plumbing, electrical, roofing, or adjacent home-service clients',
    painClass: 'AGENCY_CANNOT_PROVE_WHETHER_CLIENT_SIDE_LEAD_CAPTURE_BOOKING_OR_FOLLOWUP_IS_LEAKING_VALUE',
    promise: 'In 72 hours, produce a white-label evidence pack showing where three client lead paths break or become unverifiable, with screenshots, severity, and repair order.',
    standardPriceUsd: 1500,
    bundlePriceUsd: 3900,
    bundleUnitCount: 10,
    monthlyExpansionHypothesisUsd: 2500,
    firstPaidCanaryUsd: 1500,
    freeArtifactFamilies: Object.freeze(['ONE_PAGE_REVENUE_LEAK_EVIDENCE_MAP', 'ANNOTATED_LEAD_PATH_SCREENSHOT', 'REPAIR_ORDER_PREVIEW']),
    expansionPath: Object.freeze(['TEN_SITE_PROOF_PACK', 'MONTHLY_LEAD_PATH_ASSURANCE', 'AGENCY_WHITE_LABEL_RETAINER']),
    sourceEvidenceState: UBEROUTBOUND_EVIDENCE_STATES.STRONG_INFERENCE,
    externalDemandProofState: 'NOT_YET_PROVEN'
  }),
  Object.freeze({
    offerId: 'AI_AGENT_RELEASE_GATE',
    lane: 'B',
    dailyTarget: UBERREPLY_DAILY_LANE_TARGET,
    publicName: 'AI Agent Production Release Gate',
    formerPublicNames: Object.freeze(['AI Agent Release Gate', 'Production Acceptance Sprint']),
    canonicalAncestor: 'AI Agent Acceptance Evidence Sprint',
    buyerClass: 'AI_AGENCY_OR_AGENT_BUILDER',
    buyerDescription: 'AI agencies, MSPs, internal AI platform teams, SaaS teams, and agent builders preparing tool-using or customer-facing releases',
    painClass: 'TEAM_LACKS_REPRODUCIBLE_RELEASE_EVIDENCE_FOR_AGENT_TOOL_USE_EDGE_CASES_AND_REPEATABILITY',
    promise: 'Before the agent ships, produce a reproducible PASS / CONDITIONAL PASS / FAIL release packet against the real workflow.',
    standardPriceUsd: 3000,
    complexWorkflowPriceUsd: 4000,
    monthlyExpansionHypothesisUsd: 3500,
    firstPaidCanaryUsd: 3000,
    freeArtifactFamilies: Object.freeze(['SAMPLE_RELEASE_FAILURE_PACKET', 'THREE_FAILURE_SCENARIOS', 'RELEASE_GATE_CHECKLIST']),
    expansionPath: Object.freeze(['COMPLEX_WORKFLOW_RELEASE_GATE', 'CONTINUOUS_RELEASE_GATE', 'PORTFOLIO_AGENT_ASSURANCE']),
    sourceEvidenceState: UBEROUTBOUND_EVIDENCE_STATES.STRONG_INFERENCE,
    externalDemandProofState: 'NOT_YET_PROVEN'
  }),
  Object.freeze({
    offerId: 'CLIENT_ROI_PROOF_SPRINT',
    lane: 'C',
    dailyTarget: UBERREPLY_DAILY_LANE_TARGET,
    publicName: 'Revenue Proof & Renewal Pack',
    formerPublicNames: Object.freeze(['Client ROI Proof Sprint', 'Renewal-Ready ROI Evidence Pack']),
    canonicalAncestor: null,
    buyerClass: 'PERFORMANCE_MARKETING_AGENCY',
    buyerDescription: 'Performance and paid-media agencies, RevOps partners, and fractional CMOs that need defensible client renewal or budget evidence',
    painClass: 'MARKETING_CRM_AND_REVENUE_SOURCES_DISAGREE_AND_CLIENT_RENEWAL_CLAIMS_ARE_UNSAFE',
    promise: 'Turn a client\'s messy marketing-to-revenue trail into a renewal-ready evidence pack that separates what is proven, probable, and unknown.',
    standardPriceUsd: 2500,
    bundlePriceUsd: 4500,
    bundleUnitCount: 3,
    monthlyExpansionHypothesisUsd: 3000,
    firstPaidCanaryUsd: 2500,
    freeArtifactFamilies: Object.freeze(['REVENUE_RECONCILIATION_GAP_MAP', 'PROVEN_PROBABLE_UNKNOWN_PREVIEW', 'SOURCE_DEFINITION_CONFLICT_PREVIEW']),
    expansionPath: Object.freeze(['THREE_CLIENT_RENEWAL_PACK', 'MONTHLY_REVENUE_PROOF', 'PORTFOLIO_RECONCILIATION']),
    sourceEvidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE,
    externalDemandProofState: 'NOT_YET_PROVEN'
  }),
  Object.freeze({
    offerId: 'BILINGUAL_BOOKING_LEAK_AUDIT',
    lane: 'D',
    dailyTarget: UBERREPLY_DAILY_LANE_TARGET,
    publicName: 'GCC Arabic-English Booking Parity & Revenue Leak Sprint',
    formerPublicNames: Object.freeze(['Arabic + English Booking Leak Audit', 'Bilingual Appointment Recovery Sprint']),
    canonicalAncestor: null,
    buyerClass: 'GCC_HIGH_LTV_APPOINTMENT_BUSINESS',
    buyerDescription: 'Saudi/UAE clinic and medspa groups, plus agencies serving them, with Arabic and English booking journeys',
    painClass: 'ARABIC_AND_ENGLISH_BOOKING_JOURNEYS_DIVERGE_AND_CREATE_UNOBSERVED_CONVERSION_OR_EXPERIENCE_FAILURES',
    promise: 'Produce a side-by-side Arabic/English booking-journey evidence pack showing every material parity break and booking obstacle, with screenshots and repair order.',
    standardPriceUsd: 1750,
    bundlePriceUsd: 4500,
    bundleUnitCount: 3,
    monthlyExpansionHypothesisUsd: 3500,
    firstPaidCanaryUsd: 1750,
    freeArtifactFamilies: Object.freeze(['BILINGUAL_PARITY_EVIDENCE_MAP', 'PAIRED_ARABIC_ENGLISH_SCREENSHOT', 'REPAIR_ORDER_PREVIEW']),
    expansionPath: Object.freeze(['THREE_LOCATION_PARITY_PACK', 'BOOKING_PARITY_MONITOR', 'CHANNEL_LANGUAGE_PORTFOLIO_ASSURANCE']),
    sourceEvidenceState: UBEROUTBOUND_EVIDENCE_STATES.PROBABLE,
    externalDemandProofState: 'NOT_YET_PROVEN'
  })
]);

export const UBERREPLY_HYBRID = Object.freeze({
  name: 'UBERREPLY',
  structure: Object.freeze(['EVIDENCE', 'EFFECT', 'EVIDENCE_OF_WORK', 'MICRO_ASK']),
  donorPrinciples: Object.freeze([
    'SMYKM_CONTEXTUAL_RELEVANCE',
    'JOSH_BRAUN_ILLUMINATE_DONT_PITCH',
    'GONG_PROBLEM_BEFORE_PRODUCT_SHORT_FIRST_TOUCH',
    'JASON_BAY_OFFER_BASED_CTA',
    'NEW_INFORMATION_FOLLOWUPS',
    'ECONOMICALLY_CAUSAL_PERSONALIZATION_NOT_DECORATIVE_PERSONALIZATION'
  ]),
  firstTouch: Object.freeze({
    subjectWordRange: Object.freeze({ min: 2, max: 5 }),
    bodyWordTargetByResearchDepth: Object.freeze({ S: Object.freeze({ min: 65, max: 100 }), A: Object.freeze({ min: 55, max: 90 }), B: Object.freeze({ min: 51, max: 75 }) }),
    directMeetingAsk: 'DISALLOWED_BY_DEFAULT',
    preferredCta: 'SEND_ASSET',
    onePrimaryAsk: true,
    problemBeforeProduct: true,
    productHeavy: false
  }),
  followups: Object.freeze({
    defaultTouches: 4,
    evidenceConditionedMaximumTouches: 7,
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
    subjectWordCount: Math.min(5, Math.max(2, integer(prospect.proposedSubjectWordCount || 3))),
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
      subjectWordMin: 2,
      subjectWordMax: 5,
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
  if (subjectWords < 2 || subjectWords > 5) reasons.push('subject-must-be-2-to-5-words');
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

// A campaign may pin one of the four final commercial lanes. Pinning is
// deliberately stricter than automatic portfolio selection: the campaign
// owner has chosen the lane, but the researched prospect still has to fit it.
// This compiles preparation metadata only; it never creates contact or send
// authority.
export function compileUberReplyCampaignDecision({ offerId, prospect = {}, research = {}, sequencePosition = 1, minimumFit = 0.55 } = {}) {
  const offer = getUberReplyOffer(offerId);
  if (!offer) {
    return {
      ok: false,
      state: 'UBERREPLY_CAMPAIGN_DECISION_REFUSED',
      reasonCodes: ['known-offer-required'],
      externalEffectAuthority: 'NONE',
      businessEffectAuthority: 'NONE',
      version: UBERREPLY_FOUR_OFFER_GENOME_VERSION
    };
  }
  const fit = scoreUberReplyOfferFit(offer, prospect);
  if (fit.score < minimumFit) {
    return {
      ok: false,
      state: 'UBERREPLY_CAMPAIGN_DECISION_REFUSED',
      reasonCodes: ['pinned-offer-fit-below-threshold'],
      offer,
      fit,
      externalEffectAuthority: 'NONE',
      businessEffectAuthority: 'NONE',
      version: UBERREPLY_FOUR_OFFER_GENOME_VERSION,
      truthBoundary: 'A pinned offer lane never overrides weak prospect evidence. Fit is not consent, intent, willingness to pay, or permission to contact.'
    };
  }
  const policy = compileUberReplyMessagePolicy({ offerId: offer.offerId, prospect, research, sequencePosition });
  return {
    ok: policy.ok,
    state: policy.ok ? 'UBERREPLY_CAMPAIGN_DECISION_READY' : 'UBERREPLY_CAMPAIGN_DECISION_REFUSED',
    reasonCodes: policy.ok ? [] : ['message-policy-refused'],
    offer,
    fit,
    policy,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    version: UBERREPLY_FOUR_OFFER_GENOME_VERSION,
    truthBoundary: 'This binds a selected commercial lane to preparation output only. Recipient eligibility, authorization, suppression, sender health, and dispatch governance remain binding downstream.'
  };
}


export function compileUberReplyPreSendGate({
  offerId,
  prospect = {},
  evidence = {},
  eligibility = {},
  sender = {},
  artifact = {}
} = {}) {
  const offer = getUberReplyOffer(offerId);
  const reasons = [];
  if (!offer) reasons.push('known-offer-required');
  if (clamp01(prospect.problemEvidenceScore ?? evidence.problemEvidenceScore) < 0.55) reasons.push('problem-evidence-below-threshold');
  if (eligibility.legalEligible !== true) reasons.push('legal-eligibility-not-proven');
  if (eligibility.suppressed === true) reasons.push('recipient-suppressed');
  if (eligibility.validContactRoute !== true) reasons.push('valid-contact-route-not-proven');
  if (sender.healthy !== true) reasons.push('sender-health-not-green');
  if (artifact.prepared !== true) reasons.push('prework-artifact-not-prepared');
  if (!Array.isArray(evidence.refs) || evidence.refs.filter(Boolean).length < 1) reasons.push('evidence-reference-required');
  const ok = reasons.length === 0;
  return {
    ok,
    state: ok ? 'UBERREPLY_PRE_SEND_GATE_PASSED' : 'DO_NOT_SEND',
    offerId: offer?.offerId || upper(offerId),
    reasonCodes: uniq(reasons),
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'Passing this gate means the preparation packet is internally eligible for downstream review. It does not itself authorize dispatch.'
  };
}

export function scoreUberReplyMessageCandidate(candidate = {}) {
  const positive =
    (0.18 * clamp01(candidate.relevanceSpecificity)) +
    (0.15 * clamp01(candidate.problemClarity)) +
    (0.12 * clamp01(candidate.evidenceStrength)) +
    (0.11 * clamp01(candidate.offerUtility)) +
    (0.09 * clamp01(candidate.proofSimilarity)) +
    (0.08 * clamp01(candidate.ctaEase)) +
    (0.07 * clamp01(candidate.credibility)) +
    (0.06 * clamp01(candidate.consequenceFit)) +
    (0.05 * clamp01(candidate.cognitiveEase)) +
    (0.04 * clamp01(candidate.subjectFit)) +
    (0.03 * clamp01(candidate.toneFit)) +
    (0.02 * clamp01(candidate.novelty));
  const penalty =
    (0.12 * clamp01(candidate.unsupportedClaimPenalty)) +
    (0.10 * clamp01(candidate.hypePenalty)) +
    (0.09 * clamp01(candidate.creepyPersonalizationPenalty)) +
    (0.08 * clamp01(candidate.askCostPenalty)) +
    (0.08 * clamp01(candidate.cognitiveLoadPenalty)) +
    (0.06 * clamp01(candidate.genericnessPenalty));
  return Number(Math.max(0, Math.min(1, positive - penalty)).toFixed(6));
}

export function compileUberReplyCandidateTournament({
  offerId,
  prospect = {},
  research = {},
  candidates = [],
  explorationRate = 0.15
} = {}) {
  const policy = compileUberReplyMessagePolicy({ offerId, prospect, research, sequencePosition: 1 });
  if (!policy.ok) {
    return {
      ok: false,
      state: 'UBERREPLY_TOURNAMENT_REFUSED',
      reasonCodes: ['message-policy-refused'],
      externalEffectAuthority: 'NONE',
      businessEffectAuthority: 'NONE'
    };
  }
  const ranked = (Array.isArray(candidates) ? candidates : [])
    .map((candidate, index) => ({
      candidateId: clean(candidate.candidateId || `candidate-${index + 1}`, 200),
      score: scoreUberReplyMessageCandidate(candidate),
      candidate
    }))
    .sort((a, b) => b.score - a.score || a.candidateId.localeCompare(b.candidateId));
  if (!ranked.length) {
    return {
      ok: false,
      state: 'UBERREPLY_TOURNAMENT_REFUSED',
      reasonCodes: ['at-least-one-candidate-required'],
      policy,
      externalEffectAuthority: 'NONE',
      businessEffectAuthority: 'NONE'
    };
  }
  const rate = Math.max(0, Math.min(0.5, finite(explorationRate) ?? 0.15));
  return {
    ok: true,
    state: 'UBERREPLY_TOURNAMENT_READY',
    policy,
    champion: ranked[0],
    challengers: ranked.slice(1),
    explorationRate: rate,
    exploitationRate: Number((1 - rate).toFixed(4)),
    automaticDispatchAuthorized: false,
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    truthBoundary: 'Candidate scores are seed priors for controlled experimentation, not calibrated reply probabilities. Real randomized outcomes must replace these priors.'
  };
}

export function compileUberReplyAsyncCloseDecision({ offerId, replyState, qualification = {} } = {}) {
  const offer = getUberReplyOffer(offerId);
  if (!offer) return { ok: false, state: 'UNKNOWN_OFFER', reasonCodes: ['known-offer-required'] };
  const state = upper(replyState);
  const base = {
    ok: true,
    offerId: offer.offerId,
    publicName: offer.publicName,
    meetingDefault: 'NONE',
    externalEffectAuthority: 'NONE',
    businessEffectAuthority: 'NONE'
  };
  if (['NO', 'UNSUBSCRIBE', 'STOP'].includes(state)) {
    return { ...base, state: 'SUPPRESS_AND_STOP', nextAction: 'GLOBAL_SUPPRESSION', meetingAllowed: false };
  }
  if (state === 'AUTO_REPLY') {
    return { ...base, state: 'HOLD_FOR_HUMAN_RETURN', nextAction: 'NO_SALES_RESPONSE_TO_AUTOMATIC_REPLY', meetingAllowed: false };
  }
  if (state === 'WRONG_PERSON') {
    return { ...base, state: 'ASK_FOR_OWNER_OF_PROBLEM', nextAction: 'REQUEST_CORRECT_ROLE_ONLY', meetingAllowed: false };
  }
  if (state === 'NOT_NOW') {
    return { ...base, state: 'CLOSE_LOOP_OR_DEFER', nextAction: 'DEFER_UNTIL_GENUINELY_FRESH_TRIGGER', meetingAllowed: false };
  }
  if (['YES', 'SEND_IT', 'SEND_INFO'].includes(state)) {
    return { ...base, state: 'SEND_ARTIFACT_THEN_OFFER_ASYNC_SCOPE', nextAction: 'ARTIFACT_THEN_SCOPE_PRICE', meetingAllowed: false };
  }
  if (state === 'PRICE') {
    return {
      ...base,
      state: 'SEND_FIXED_PRICE_AND_SCOPE',
      nextAction: 'SCOPE_PRICE_PAYMENT_ONBOARDING',
      priceUsd: qualification.complexWorkflow === true && offer.complexWorkflowPriceUsd ? offer.complexWorkflowPriceUsd : offer.standardPriceUsd,
      meetingAllowed: false
    };
  }
  if (state === 'CALL') {
    return { ...base, state: 'BUYER_REQUESTED_CALL', nextAction: 'OFFER_ASYNC_SCOPE_FIRST_ONCE_THEN_ACCEPT_CALL', meetingAllowed: true };
  }
  return { ...base, state: 'CLASSIFY_BEFORE_CONTINUING', nextAction: 'NO_AUTOMATED_ESCALATION', meetingAllowed: false };
}
