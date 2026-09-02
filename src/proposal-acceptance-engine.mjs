import crypto from 'node:crypto';

export const PROPOSAL_ACCEPTANCE_ENGINE_VERSION = 'uberbond.proposal-acceptance-engine-1.0.0';

const AI_SLOP_PATTERNS = [
  /i hope this (email|message) finds you well/i,
  /in today'?s (fast[- ]paced|rapidly evolving) (world|landscape|environment)/i,
  /unlock (the )?(power|potential|value)/i,
  /game[- ]changer/i,
  /revolutioni[sz]e/i,
  /cutting[- ]edge/i,
  /seamless(?:ly)?/i,
  /leverage (our|the|this) /i,
  /not just .{1,80}, but /i
];

function text(value, max = 4000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function words(value) {
  return String(value ?? '').trim().split(/\s+/).filter(Boolean);
}

function sentences(value) {
  return String(value ?? '').split(/[.!?]+/).map(item => item.trim()).filter(Boolean);
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function missing(packet, key) {
  const value = packet?.[key];
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'boolean') return false;
  return !text(value, 10000);
}

export function inspectProposalEvidence(packet = {}) {
  const required = [
    'buyerName',
    'companyName',
    'stakeholderRole',
    'problemEvidence',
    'desiredOutcome',
    'scope',
    'timeline',
    'price',
    'currency',
    'nextStep'
  ];
  const missingFields = required.filter(key => missing(packet, key));
  const warnings = [];
  if (missing(packet, 'decisionAuthorityConfidence')) warnings.push('decision-authority-confidence-missing');
  if (!Array.isArray(packet.proofRefs) || packet.proofRefs.length === 0) warnings.push('proof-references-missing');
  if (!Array.isArray(packet.knownObjections)) warnings.push('known-objections-not-recorded');
  if (!Array.isArray(packet.buyerVocabulary)) warnings.push('buyer-vocabulary-not-recorded');
  return {
    ok: missingFields.length === 0,
    status: missingFields.length ? 'DISCOVERY_INCOMPLETE' : 'PROPOSAL_EVIDENCE_READY',
    missingFields,
    warnings
  };
}

export function auditHumanWriting(copy = '') {
  const body = String(copy ?? '');
  const wordList = words(body);
  const sentenceList = sentences(body);
  const findings = [];

  for (const pattern of AI_SLOP_PATTERNS) {
    if (pattern.test(body)) findings.push(`ai-slop:${pattern.source}`);
  }

  const emDashes = (body.match(/—/g) || []).length;
  if (emDashes > 2) findings.push('excessive-em-dashes');

  const headings = body.split('\n').filter(line => /:$/.test(line.trim()) && line.trim().length < 100).length;
  if (headings > 6) findings.push('excessive-colon-headings');

  const avgSentenceWords = sentenceList.length
    ? sentenceList.reduce((sum, sentence) => sum + words(sentence).length, 0) / sentenceList.length
    : 0;
  if (avgSentenceWords > 24) findings.push('sentences-too-long');

  const longWordShare = wordList.length
    ? wordList.filter(word => word.replace(/[^a-z]/gi, '').length >= 12).length / wordList.length
    : 0;
  if (longWordShare > 0.12) findings.push('abstract-or-complex-word-density-high');

  const uniqueSentenceLengths = new Set(sentenceList.map(sentence => words(sentence).length));
  if (sentenceList.length >= 6 && uniqueSentenceLengths.size <= 2) findings.push('cadence-too-uniform');

  const score = clamp(100 - findings.length * 10 - Math.max(0, avgSentenceWords - 18) * 1.5);
  return {
    ok: findings.length === 0,
    score: Math.round(score),
    findings,
    metrics: {
      words: wordList.length,
      sentences: sentenceList.length,
      averageSentenceWords: Number(avgSentenceWords.toFixed(1)),
      emDashes,
      headingCount: headings,
      longWordShare: Number(longWordShare.toFixed(3))
    }
  };
}

export function scoreProposalReadiness({ packet = {}, proposalText = '', stakeholderCount = 1 } = {}) {
  const evidence = inspectProposalEvidence(packet);
  const human = auditHumanWriting(proposalText);
  const reasons = [];

  let score = 100;
  if (!evidence.ok) {
    score -= evidence.missingFields.length * 8;
    reasons.push(...evidence.missingFields.map(field => `missing:${field}`));
  }
  score -= Math.min(20, evidence.warnings.length * 4);
  reasons.push(...evidence.warnings);

  if (!Number.isSafeInteger(stakeholderCount) || stakeholderCount < 1) {
    score -= 10;
    reasons.push('stakeholder-count-invalid');
  } else if (stakeholderCount === 1) {
    score -= 5;
    reasons.push('single-threaded-deal-risk');
  }

  const wordCount = words(proposalText).length;
  if (wordCount > 1200) {
    score -= 15;
    reasons.push('proposal-too-long');
  }
  if (wordCount > 0 && wordCount < 120) {
    score -= 8;
    reasons.push('proposal-may-be-under-specified');
  }

  score -= Math.max(0, 90 - human.score) * 0.4;
  reasons.push(...human.findings);

  const buyerSpecificTerms = [packet.companyName, packet.problemEvidence, ...(packet.buyerVocabulary || [])]
    .map(item => text(item, 200))
    .filter(Boolean);
  const lowercase = proposalText.toLowerCase();
  const buyerSpecificHits = buyerSpecificTerms.filter(term => lowercase.includes(term.toLowerCase())).length;
  if (buyerSpecificTerms.length && buyerSpecificHits === 0) {
    score -= 15;
    reasons.push('buyer-specific-evidence-not-reflected-in-copy');
  }

  const clearNextStep = packet.nextStep && proposalText.toLowerCase().includes(String(packet.nextStep).toLowerCase());
  if (!clearNextStep) {
    score -= 8;
    reasons.push('next-step-not-explicit-in-copy');
  }

  const finalScore = Math.round(clamp(score));
  return {
    ok: evidence.ok && finalScore >= 75,
    status: evidence.ok && finalScore >= 75 ? 'PROPOSAL_SEND_CANDIDATE' : 'PROPOSAL_REVISE_OR_DISCOVER',
    score: finalScore,
    reasons: [...new Set(reasons)],
    evidence,
    humanWriting: human,
    proposalDigest: digest(proposalText),
    businessEffectAuthority: 'NONE'
  };
}

export function buildProposalGenerationBrief(packet = {}) {
  const evidence = inspectProposalEvidence(packet);
  if (!evidence.ok) {
    return {
      ok: false,
      status: 'DISCOVERY_REQUIRED',
      missingFields: evidence.missingFields,
      businessEffectAuthority: 'NONE'
    };
  }

  return {
    ok: true,
    status: 'PROPOSAL_GENERATION_BRIEF_READY',
    brief: {
      opening: 'Start with the buyer-specific problem and desired outcome. Do not open with UberBond biography or generic praise.',
      executiveSummary: 'State the problem evidence, desired outcome, and proposed mechanism in plain language.',
      scope: packet.scope,
      timeline: packet.timeline,
      pricing: {
        amount: packet.price,
        currency: packet.currency,
        instruction: 'Separate scope from pricing. Explain price after value and evidence. Do not invent discounts or urgency.'
      },
      proof: Array.isArray(packet.proofRefs) ? packet.proofRefs : [],
      objections: Array.isArray(packet.knownObjections) ? packet.knownObjections : [],
      buyerVocabulary: Array.isArray(packet.buyerVocabulary) ? packet.buyerVocabulary : [],
      nextStep: packet.nextStep,
      writingRules: [
        'Use short concrete sentences and varied cadence.',
        'Prefer buyer vocabulary over vendor jargon.',
        'No unsupported superlatives, ROI claims, testimonials, urgency, scarcity, logos, or customer names.',
        'No generic AI filler or corporate throat-clearing.',
        'Every quantified claim must bind to evidence or be explicitly labeled an estimate/hypothesis.',
        'Keep the proposal compact enough to read quickly on mobile.',
        'Make one clear next action easy to accept.'
      ]
    },
    businessEffectAuthority: 'NONE'
  };
}

export function summarizeProposalOutcome({ status, sentAt, decidedAt, founderMinutes = 0, revenueCleared = 0, currency = null } = {}) {
  const normalized = String(status ?? '').trim().toUpperCase();
  if (!['WON', 'LOST', 'NO_DECISION', 'PENDING'].includes(normalized)) {
    return { ok: false, status: 'INVALID_PROPOSAL_OUTCOME' };
  }
  const daysToDecision = sentAt && decidedAt
    ? Math.max(0, (new Date(decidedAt).getTime() - new Date(sentAt).getTime()) / 86_400_000)
    : null;
  return {
    ok: true,
    status: normalized,
    commercialTruthEligible: normalized === 'WON' && revenueCleared > 0 && Boolean(currency),
    metrics: {
      daysToDecision: daysToDecision == null || !Number.isFinite(daysToDecision) ? null : Number(daysToDecision.toFixed(2)),
      founderMinutes: Number.isFinite(founderMinutes) && founderMinutes >= 0 ? founderMinutes : null,
      revenueCleared: Number.isFinite(revenueCleared) && revenueCleared >= 0 ? revenueCleared : null,
      currency: text(currency, 10)
    }
  };
}
