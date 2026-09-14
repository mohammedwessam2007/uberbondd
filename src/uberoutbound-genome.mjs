import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const UBEROUTBOUND_GENOME_VERSION = 'uberbond.uberoutbound-genome.v1';

export const UBEROUTBOUND_EVIDENCE_STATES = Object.freeze({
  PROVEN_NORMATIVE: 'PROVEN_NORMATIVE',
  PROBABLE: 'PROBABLE',
  SPECULATIVE: 'SPECULATIVE',
  UNKNOWN: 'UNKNOWN'
});

export const UBEROUTBOUND_V1_PRIORS = Object.freeze({
  firstTouchMaxWords: Object.freeze({ value: 100, evidenceState: 'PROBABLE' }),
  firstTouchSentenceRange: Object.freeze({ min: 3, max: 4, evidenceState: 'PROBABLE' }),
  preferredColdCtas: Object.freeze({ value: ['OFFER', 'INTEREST'], evidenceState: 'PROBABLE' }),
  directMeetingAskFirstTouch: Object.freeze({ value: 'CHALLENGER_ONLY', evidenceState: 'PROBABLE' }),
  problemBeforeProduct: Object.freeze({ value: true, evidenceState: 'PROBABLE' }),
  personalizationBySeniority: Object.freeze({ value: true, evidenceState: 'PROBABLE' }),
  relevantProofOverPrestigeProof: Object.freeze({ value: true, evidenceState: 'PROBABLE' }),
  multiTouchNeeded: Object.freeze({ value: true, evidenceState: 'PROBABLE' }),
  exactTriggerHierarchy: Object.freeze({ value: null, evidenceState: 'SPECULATIVE' }),
  exactIndustryWinner: Object.freeze({ value: null, evidenceState: 'SPECULATIVE' }),
  universalOptimalDailyVolume: Object.freeze({ value: null, evidenceState: 'UNKNOWN' })
});

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;

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

function normalizedSeniority(value) {
  const raw = clean(value, 80).toUpperCase();
  if (['CEO', 'CFO', 'COO', 'CMO', 'CRO', 'CTO', 'CIO', 'CHRO', 'C_SUITE', 'EXECUTIVE'].includes(raw)) return 'C_SUITE';
  if (raw.includes('VP') || raw.includes('VICE PRESIDENT') || raw === 'HEAD') return 'VP_HEAD';
  if (raw.includes('DIRECTOR')) return 'DIRECTOR';
  if (raw.includes('MANAGER')) return 'MANAGER';
  return raw ? 'IC_OR_OTHER' : 'UNKNOWN';
}

function personalizationPrior(seniority) {
  switch (normalizedSeniority(seniority)) {
    case 'C_SUITE': return ['COMPANY', 'ACTIVITY', 'EXECUTIVE_PRIORITY'];
    case 'VP_HEAD': return ['COMPANY', 'ROLE', 'ACTIVITY'];
    case 'DIRECTOR': return ['COMPANY', 'ROLE', 'WORKFLOW'];
    case 'MANAGER': return ['WORKFLOW', 'ROLE', 'COMPANY'];
    case 'IC_OR_OTHER': return ['WORKFLOW', 'INDIVIDUAL', 'ROLE'];
    default: return ['COMPANY', 'ROLE'];
  }
}

function hardGateReasons({ prospect = {}, sender = {}, authorization = {} } = {}) {
  const reasons = [];
  if (prospect.legalEligible !== true) reasons.push('jurisdiction-legal-basis-required');
  if (prospect.suppressed === true || prospect.unsubscribed === true) reasons.push('suppression-dominates');
  if (prospect.safeForOutreach !== true) reasons.push('safe-for-outreach-required');
  if (!['VERIFIED', 'SAFE', 'OWNER_CONFIRMED'].includes(clean(prospect.verificationStatus, 80).toUpperCase())) reasons.push('verified-contact-route-required');
  if (!['GREEN', 'READY'].includes(clean(sender.status, 80).toUpperCase())) reasons.push('healthy-sender-required');
  if (sender.authenticationReady !== true) reasons.push('sender-authentication-required');
  if (sender.providerBudgetAvailable !== true) reasons.push('recipient-provider-budget-required');
  if (authorization.outreachAuthorized !== true) reasons.push('separate-outreach-authorization-required');
  return reasons;
}

function triggerPrior(trigger = {}) {
  const type = clean(trigger.type, 120).toUpperCase();
  const confidence = Math.max(0, Math.min(1, finite(trigger.confidence) ?? 0));
  const problemLinked = trigger.problemLinked === true;
  const direct = ['DIRECT_ENGAGEMENT', 'INTENT', 'OBSERVED_PROBLEM', 'EXPLICIT_PRIORITY'].includes(type);
  const medium = ['HIRING', 'JOB_POST', 'EXPANSION', 'TECH_CHANGE', 'REGULATION', 'LEADERSHIP_CHANGE'].includes(type);
  const weak = ['FUNDING', 'SOCIAL_POST', 'AWARD', 'PODCAST_APPEARANCE', 'TRIVIA'].includes(type);

  let tier = 'UNKNOWN';
  let score = 0.25;
  if (direct) { tier = 'A'; score = 0.85; }
  else if (medium) { tier = 'B'; score = 0.65; }
  else if (weak) { tier = 'C'; score = 0.4; }
  if (type === 'SOCIAL_POST' || type === 'AWARD' || type === 'TRIVIA') { tier = 'D'; score = 0.2; }
  if (problemLinked) score = Math.min(1, score + 0.1);
  score *= (0.5 + (confidence * 0.5));
  return { type: type || null, tier, score: Number(score.toFixed(4)), problemLinked, confidence };
}

function strategyPrior(message = {}, prospect = {}) {
  const reasons = [];
  let score = 0.5;
  const wordCount = Math.max(0, Math.floor(finite(message.wordCount) || 0));
  const sentenceCount = Math.max(0, Math.floor(finite(message.sentenceCount) || 0));
  const cta = clean(message.ctaType, 80).toUpperCase();
  const firstTouch = Math.max(1, Math.floor(finite(message.sequencePosition) || 1)) === 1;

  if (firstTouch && wordCount > 0 && wordCount <= 100) { score += 0.08; reasons.push('probable-short-first-touch-prior'); }
  if (firstTouch && sentenceCount >= 3 && sentenceCount <= 4) { score += 0.06; reasons.push('probable-3-to-4-sentence-prior'); }
  if (message.problemBeforeProduct === true) { score += 0.08; reasons.push('probable-problem-before-product-prior'); }
  if (message.relevantProof === true) { score += 0.06; reasons.push('probable-relevant-proof-prior'); }
  if (firstTouch && ['OFFER', 'INTEREST', 'SEND_ASSET', 'BENCHMARK'].includes(cta)) { score += 0.08; reasons.push('probable-low-friction-cta-prior'); }
  if (firstTouch && cta === 'MEETING') { score -= 0.08; reasons.push('direct-meeting-ask-is-challenger-on-cold-first-touch'); }

  const preferredPersonalization = new Set(personalizationPrior(prospect.seniority));
  if (preferredPersonalization.has(clean(message.personalizationClass, 80).toUpperCase())) {
    score += 0.05;
    reasons.push('seniority-conditioned-personalization-prior');
  }

  score = Math.max(0, Math.min(1, score));
  return { score: Number(score.toFixed(4)), reasonCodes: reasons };
}

/**
 * Compile a zero-authority outbound decision packet from the evidence-backed
 * research genome. Normative/legal/suppression/provider constraints are hard
 * gates. Messaging findings remain priors and experiment candidates, never
 * irreversible truth.
 */
export function compileUberOutboundGenomeDecision({
  prospect = {},
  sender = {},
  authorization = {},
  messageCandidates = [],
  experiment = null,
  now = new Date()
} = {}) {
  const blockers = hardGateReasons({ prospect, sender, authorization });
  const trigger = triggerPrior(prospect.trigger || {});
  const preferredPersonalization = personalizationPrior(prospect.seniority);

  const candidates = (Array.isArray(messageCandidates) ? messageCandidates : []).map((message, index) => {
    const prior = strategyPrior(message, prospect);
    return {
      candidateId: clean(message.candidateId || `candidate-${index + 1}`, 160),
      priorScore: prior.score,
      priorReasonCodes: prior.reasonCodes,
      wordCount: Math.max(0, Math.floor(finite(message.wordCount) || 0)),
      sentenceCount: Math.max(0, Math.floor(finite(message.sentenceCount) || 0)),
      ctaType: clean(message.ctaType, 80).toUpperCase() || null,
      personalizationClass: clean(message.personalizationClass, 80).toUpperCase() || null,
      problemBeforeProduct: message.problemBeforeProduct === true,
      relevantProof: message.relevantProof === true,
      sequencePosition: Math.max(1, Math.floor(finite(message.sequencePosition) || 1))
    };
  }).sort((a, b) => b.priorScore - a.priorScore || a.candidateId.localeCompare(b.candidateId));

  let experimentAssignment = null;
  if (experiment && Array.isArray(experiment.arms) && experiment.arms.length >= 2) {
    const accountKey = clean(prospect.accountId || prospect.companyDomain || prospect.contactId || prospect.email, 320);
    const experimentId = clean(experiment.experimentId, 160);
    const arms = experiment.arms.map(arm => clean(arm, 160)).filter(Boolean);
    if (accountKey && experimentId && arms.length >= 2) {
      const u = hashUnit(`${experimentId}:${accountKey}`);
      const selectedIndex = Math.min(arms.length - 1, Math.floor(u * arms.length));
      experimentAssignment = {
        experimentId,
        unit: 'ACCOUNT_OR_RECIPIENT_KEY',
        accountKey,
        arm: arms[selectedIndex],
        deterministic: true,
        treatmentAuthorityCreated: false
      };
    }
  }

  return noEffects({
    ok: true,
    generatedAt: new Date(now).toISOString(),
    state: blockers.length ? 'OUTBOUND_GENOME_BLOCKED' : 'READY_FOR_GOVERNED_MESSAGE_EXPERIMENT',
    blockers,
    evidencePolicy: {
      hardGates: ['LEGAL_ELIGIBILITY', 'SUPPRESSION', 'VERIFIED_CONTACT', 'SENDER_HEALTH', 'AUTHENTICATION', 'RECIPIENT_PROVIDER_BUDGET', 'SEPARATE_AUTHORIZATION'],
      priorsAreNotHardGates: true,
      terminalObjective: 'QUALIFIED_PIPELINE_AND_CLEARED_CONTRIBUTION_PROFIT_SUBJECT_TO_REPUTATION_AND_COMPLIANCE_CONSTRAINTS',
      openRateTerminalMetric: false
    },
    triggerPrior: trigger,
    preferredPersonalization,
    messageCandidates: candidates,
    recommendedCandidateId: candidates[0]?.candidateId || null,
    experimentAssignment,
    priors: UBEROUTBOUND_V1_PRIORS,
    messagesSent: 0,
    providerCalls: 0,
    truthBoundary: 'This compiler converts the 2026-09-14 research corpus into evidence-weighted priors and hard governance gates. It does not prove a universal best template, create legal eligibility, authorize outreach, send messages, or claim causal lift.'
  });
}
