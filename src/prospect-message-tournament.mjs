// Generic prework + V5 message tournament for a VERIFIED prospect.
//
// It composes the canonical UberReply machinery instead of competing with it:
//   - compileUberReplyPreworkArtifact   (does the evidence-backed artifact exist?)
//   - compileUberReplyMessagePolicy     (offer, research depth, word targets, genotype)
//   - validateUberReplyRenderedMessage  (structural/first-touch rules)
//   - scoreUberReplyMessageCandidate    (the seed-prior scorer)
// and adds only what was missing: a deterministic candidate generator from
// grounded evidence slots, hard critics for unsupported claims, and a winner
// selection that is recomputable from its inputs.
//
// STATUS: pure. It sends nothing, mints no approval and NO final effect digest
// (identity participates in the final message). A "winner" is a conditional
// preparation result, never a send decision.
import { createHash } from 'node:crypto';
import {
  compileUberReplyMessagePolicy, validateUberReplyRenderedMessage, scoreUberReplyMessageCandidate, getUberReplyOffer
} from './uberreply-four-offer-genome.mjs';
import { compileUberReplyPreworkArtifact } from './uberreply-prework-artifact.mjs';
import { CONTACT_HISTORY_RUNTIME_PROVENANCE } from './prospect-contact-history.mjs';

export const PROSPECT_MESSAGE_TOURNAMENT_VERSION = 'uberbond.prospect-message-tournament.v1';
export const V5_GENOTYPE = 'SELECT -> PROVE -> TIME -> MATCH -> PRE-WORK -> COMPRESS -> MICRO-ASK -> ASYNC-CLOSE';
export const V5_CTA = 'Want me to send it?';
export const V5_LIMITS = Object.freeze({ subjectWords: [2, 5], bodyWords: [51, 100], sentencesExcludingGreeting: [3, 4] });

// Hard language critics. Anything that asserts money, causation, urgency,
// flattery, a meeting, tracking, or an unverifiable claim about the recipient.
export const BANNED_LANGUAGE = Object.freeze([
  /\blosing\b/i, /\bcosting\b/i, /\brevenue\b/i, /\$\s?\d/, /\bdefinite(ly)?\b/i, /\burgent\b/i, /\bimpressive\b/i,
  /\bgreat (work|client)\b/i, /\bjust bumping\b/i, /\bquick question\b/i, /\bcalendar\b/i, /\bmeeting\b/i, /\bcall\b/i,
  /\btrack(ing)?\b/i, /\bprobably already\b/i, /^re:/i, /\bbecause\b/i, /\bcaused\b/i, /\bmistake\b/i, /\bbroken\b/i,
  /\bfail(ed|ing|ure)\b/i, /\blost\b/i, /customers? (are|were|complain)/i, /\bguarantee/i, /\bfree\b/i, /\bwe found\b/i
]);

// Per-offer defaults for the buyer-altitude and artifact phrasing. Slots from
// the evidence lane override them; nothing here is invented evidence.
const ALTITUDE_BY_OFFER = Object.freeze({
  LEAD_TO_BOOKING_LEAK_AUDIT: 'client reporting',
  AI_AGENT_RELEASE_GATE: 'release review',
  CLIENT_ROI_PROOF_SPRINT: 'client QA',
  BILINGUAL_BOOKING_LEAK_AUDIT: 'booking QA'
});

const clean = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const words = value => clean(value, 20000).split(/\s+/).filter(Boolean).length;
const sentencesOf = body => clean(body, 20000).split(/\n\n/).slice(1).join(' ').split(/(?<=[.!?])\s+/).filter(Boolean);
const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])]));
  return value;
};
const sha = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const possessive = name => (/s$/i.test(name) ? `${name}'` : `${name}'s`);

function clientShort(name) {
  return clean(name, 120).split(/\s+/)[0] || '';
}

/**
 * The evidence lane supplies grounded slots; this checks them mechanically.
 * Every grounding phrase must occur verbatim (case-insensitively) in the
 * retained observation excerpt AND in the sentence text that will carry it.
 */
export function validateMessageSlots({ slots = {}, observationExcerpt = '' } = {}) {
  const reasons = [];
  const excerpt = clean(observationExcerpt, 4000).toLowerCase();
  const clause = clean(slots.observationClause, 600);
  const corroboration = clean(slots.corroborationSentence, 300);
  const phrases = Array.isArray(slots.groundingPhrases) ? slots.groundingPhrases.map(p => clean(p, 200)).filter(Boolean) : [];
  if (!clause) reasons.push('observation-clause-required');
  if (!clean(slots.subjectNoun, 60)) reasons.push('subject-noun-required');
  if (!phrases.length) reasons.push('grounding-phrases-required');
  for (const phrase of phrases) {
    if (!excerpt.includes(phrase.toLowerCase())) reasons.push(`grounding-phrase-not-in-observation-excerpt:${phrase}`);
    if (!`${clause} ${corroboration}`.toLowerCase().includes(phrase.toLowerCase())) reasons.push(`grounding-phrase-not-in-message-text:${phrase}`);
  }
  for (const text of [clause, corroboration]) {
    if (BANNED_LANGUAGE.some(rule => rule.test(text))) reasons.push('slot-text-contains-banned-language');
  }
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function compilePreworkSpec({ intake, record, slots = {}, artifactPrepared = false, artifactRef = null } = {}) {
  const offerId = intake?.offerId;
  const offer = getUberReplyOffer(offerId);
  const observation = record?.clientEvidence?.observation || {};
  const prework = offer ? compileUberReplyPreworkArtifact({
    offerId,
    prospect: { company: record?.company, website: record?.website },
    issue: {
      code: clean(slots.issueCode || 'observed-public-inconsistency', 120),
      title: clean(observation.text, 300),
      service: clean(record?.clientEvidence?.clientName, 240),
      evidenceUrl: clean(observation.sourceUrl, 1000),
      evidenceExcerpt: clean(observation.excerpt, 1000),
      confidence: 0.8,
      safeForOutreach: true
    }
  }) : { ok: false, reasonCodes: ['known-offer-required'] };
  const slotCheck = validateMessageSlots({ slots, observationExcerpt: observation.excerpt });
  return {
    offerId: offer?.offerId || null,
    prework,
    slots: {
      observationClause: clean(slots.observationClause, 600),
      corroborationSentence: clean(slots.corroborationSentence, 300),
      groundingPhrases: (slots.groundingPhrases || []).map(p => clean(p, 200)),
      subjectNoun: clean(slots.subjectNoun, 60),
      artifactPhrase: clean(slots.artifactPhrase, 120) || (prework.publicLabel ? `a one-page ${prework.publicLabel}` : ''),
      altitudePhrase: clean(slots.altitudePhrase, 120) || ALTITUDE_BY_OFFER[offer?.offerId] || '',
      relationshipBasis: clean(slots.relationshipBasis, 120) || (intake?.observationSubjectType === 'PROSPECT_SYSTEM' ? 'published production workflow' : 'publicly named'),
      unsupportedPatterns: (Array.isArray(slots.unsupportedPatterns) ? slots.unsupportedPatterns : []).map(p => ({ pattern: clean(p.pattern, 200), flags: clean(p.flags, 8), reason: clean(p.reason, 300) }))
    },
    slotCheck,
    artifact: { prepared: artifactPrepared === true && prework.ok === true, ref: artifactRef ? clean(artifactRef, 500) : null }
  };
}

/** Deterministic candidate generation from grounded slots. */
export function generateV5Candidates({ record, intake, spec } = {}) {
  const client = clean(record?.clientEvidence?.clientName, 160);
  const prospect = clean(record?.company, 160).replace(/\s+(Consulting Group|Group|LLC|Inc\.?|Ltd\.?)$/i, '');
  const { observationClause: clause, corroborationSentence: corro, artifactPhrase: artifact, altitudePhrase: altitude, subjectNoun } = spec.slots;
  const subject = `${clientShort(client)} ${subjectNoun}`.trim();
  const noticed = `I noticed one of ${possessive(prospect)} publicly named clients, ${client}, ${clause}.`;
  const put = `I put the exact wording into ${artifact} for ${altitude}.`;
  const make = (id, framing, sentences, subj = subject) => ({ id, framing, subject: subj, body: `Hi there,\n\n${sentences.join(' ')} ${V5_CTA}` });
  // First-party AI product evidence must never invent a client relationship.
  // The intake derives this type from matching company/name/own-site evidence.
  if (intake?.observationSubjectType === 'PROSPECT_SYSTEM') {
    const observed = `${client}'s published production workflow ${clause}.`;
    return [
      make('FULL', 'first-party workflow evidence + prepared release-review artifact', [observed, corro, put].filter(Boolean)),
      make('COMPACT', 'first-party workflow evidence + artifact', [observed, `I put the exact wording into ${artifact}.`]),
      make('HEADS_UP', 'first-party workflow evidence + artifact', [observed, corro, `I wrote the exact wording up as ${artifact}.`].filter(Boolean)),
      make('ALTITUDE_FIRST', 'first-party release-review evidence', [`For ${altitude} at ${prospect}: its published workflow ${clause}.`, corro, `I put the exact wording into ${artifact}.`].filter(Boolean)),
      make('CORROBORATION_FIRST', 'first-party corroboration + observation', [corro, observed, put].filter(Boolean))
    ];
  }
  return [
    make('FULL', 'verified observation + corroboration + artifact + buyer altitude', [noticed, corro, put].filter(Boolean)),
    make('COMPACT', 'observation + artifact, no corroboration', [noticed, `I put the exact wording into ${artifact}.`]),
    make('HEADS_UP', 'plain heads-up, artifact offered without buyer altitude', [`${client} is a publicly named ${prospect} client, and it ${clause}.`, corro, `I wrote the exact wording up as ${artifact}.`].filter(Boolean)),
    make('ALTITUDE_FIRST', 'buyer altitude leads', [`For ${altitude} at ${prospect}: ${client} ${clause}.`, corro, `I put the exact wording into ${artifact}.`].filter(Boolean)),
    make('CORROBORATION_FIRST', 'corroboration leads, observation second', [corro, `${client}, one of ${possessive(prospect)} publicly named clients, also ${clause}.`, put].filter(Boolean))
  ];
}

function critique({ candidate, spec, policy, prospectName, clientName, evidenceRefs }) {
  const failures = [];
  const text = `${candidate.subject}\n${candidate.body}`;
  const subjectWords = words(candidate.subject);
  const bodyWords = words(candidate.body);
  const sentences = sentencesOf(candidate.body);
  const target = policy.constraints?.bodyWordTarget || { min: V5_LIMITS.bodyWords[0], max: V5_LIMITS.bodyWords[1] };
  const minBody = Math.max(V5_LIMITS.bodyWords[0], Number(target.min) || 0);
  const maxBody = Math.min(V5_LIMITS.bodyWords[1], Number(target.max) || 999);
  if (subjectWords < V5_LIMITS.subjectWords[0] || subjectWords > V5_LIMITS.subjectWords[1]) failures.push('subject-word-count');
  if (bodyWords < minBody || bodyWords > maxBody) failures.push('body-word-count');
  if (sentences.length < V5_LIMITS.sentencesExcludingGreeting[0] || sentences.length > V5_LIMITS.sentencesExcludingGreeting[1]) failures.push('sentence-count');
  // Header-injection and invisible-character guard: a subject is one visible line; a body may contain newlines only.
  if (/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060\ufeff]/.test(candidate.subject) || /[\u0000-\u0009\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060\ufeff]/.test(candidate.body)) failures.push('control-or-invisible-characters');
  if (!candidate.body.trim().endsWith(V5_CTA)) failures.push('cta-must-end-the-message');
  if ((candidate.body.match(/\?/g) || []).length !== 1) failures.push('exactly-one-question-the-cta');
  if (/https?:\/\/|www\./i.test(text)) failures.push('no-links-in-first-touch');
  for (const rule of BANNED_LANGUAGE) if (rule.test(candidate.subject) || rule.test(candidate.body)) { failures.push('banned-language'); break; }
  for (const unsupported of spec.slots.unsupportedPatterns) {
    // Literal, case-insensitive match. Patterns arrive in a request body, so they are never compiled as regular expressions.
    if (unsupported.pattern && text.toLowerCase().includes(unsupported.pattern.toLowerCase())) failures.push(`unsupported-claim:${unsupported.reason || unsupported.pattern}`);
  }
  // Numeric grounding: any digit-bearing token must come from grounded text.
  const grounded = `${spec.slots.observationClause} ${spec.slots.corroborationSentence} ${clientName} ${prospectName} ${spec.slots.artifactPhrase} ${spec.slots.altitudePhrase}`.toLowerCase();
  for (const token of (candidate.body.match(/\S*\d\S*/g) || [])) {
    if (!grounded.includes(token.replace(/[.,;:!?]+$/g, '').toLowerCase())) { failures.push('ungrounded-number'); break; }
  }
  if (!candidate.body.includes(clientName)) failures.push('named-client-required');
  // The message must say why this recipient is being told about this client,
  // and its first sentence must name the client (a sentence that opens with a
  // pronoun has no antecedent in a first touch).
  if (!candidate.body.toLowerCase().includes(spec.slots.relationshipBasis.toLowerCase())) failures.push('relationship-basis-not-stated');
  if (!(sentences[0] || '').includes(clientName)) failures.push('first-sentence-must-name-the-client');
  // Every first touch offers a prepared artifact ("Want me to send it?"). If it
  // does not exist, the message promises something that is not there.
  if (spec.artifact.prepared !== true) failures.push('described-artifact-not-prepared');
  const render = validateUberReplyRenderedMessage({ policy, subject: candidate.subject, body: candidate.body, evidenceRefs, primaryAskCount: 1, artifactPrepared: spec.artifact.prepared });
  if (!render.ok) failures.push(...render.reasonCodes.map(code => `uberreply:${code}`));
  return { failures: [...new Set(failures)], subjectWords, bodyWords, sentenceCount: sentences.length };
}

function featuresFor({ candidate, spec, prospectName, clientName, evidenceRefs }) {
  const body = candidate.body;
  const has = text => Boolean(text) && body.includes(text);
  const anchors = [
    body.includes(clientName), body.includes(prospectName), has(spec.slots.observationClause),
    has(spec.slots.corroborationSentence) || /\balso\b/i.test(body), has(spec.slots.artifactPhrase) || /one-page/i.test(body),
    has(spec.slots.altitudePhrase)
  ];
  const coverage = anchors.filter(Boolean).length / anchors.length;
  const askCost = /\?/.test(body) ? 0 : 0.2;
  return {
    relevanceSpecificity: coverage,
    problemClarity: has(spec.slots.observationClause) ? 0.9 : 0.4,
    evidenceStrength: Math.min(1, evidenceRefs.length / 2),
    offerUtility: has(spec.slots.artifactPhrase) || /one-page/i.test(body) ? 0.8 : 0.4,
    proofSimilarity: 0.7,
    ctaEase: body.trim().endsWith(V5_CTA) ? 0.9 : 0.3,
    credibility: 0.8,
    consequenceFit: has(spec.slots.altitudePhrase) ? 0.8 : 0.4,
    cognitiveEase: Math.max(0, 1 - Math.max(0, words(body) - 60) / 80),
    subjectFit: words(candidate.subject) <= 3 ? 0.9 : 0.6,
    toneFit: 0.8,
    novelty: 0.5,
    unsupportedClaimPenalty: 0, hypePenalty: 0, creepyPersonalizationPenalty: 0,
    askCostPenalty: askCost, cognitiveLoadPenalty: Math.max(0, (words(body) - 85) / 100), genericnessPenalty: coverage < 0.5 ? 0.5 : 0
  };
}

/**
 * @param {object} input
 * @param {object} input.intake  result of compileProspectVerification (must be VERIFIED_CANDIDATE with RUNTIME_RECEIPT contact history)
 * @param {object} input.record  the evidence record that produced the intake
 * @param {object} input.slots   grounded message slots from the evidence lane
 * @param {boolean} input.artifactPrepared whether the described artifact really exists
 * @param {object[]} [input.extraCandidates] additional externally authored candidates; same critics apply
 */
export function runProspectMessageTournament({ intake, record, slots, artifactPrepared = false, artifactRef = null, extraCandidates = [], now = new Date() } = {}) {
  const generatedAt = new Date(now).toISOString();
  const refuse = reasonCodes => ({
    version: PROSPECT_MESSAGE_TOURNAMENT_VERSION, status: 'DO_NOT_SEND', generatedAt, reasonCodes,
    winner: null, sendAuthority: false, externalEffectAuthority: 'NONE', finalEffectDigest: null
  });
  const reasons = [];
  if (!intake || intake.status !== 'VERIFIED_CANDIDATE') reasons.push('prospect-not-verified-candidate');
  if (intake && intake.contactHistoryProvenance !== CONTACT_HISTORY_RUNTIME_PROVENANCE) reasons.push('contact-history-not-a-runtime-receipt');
  if (!record) reasons.push('evidence-record-missing');
  if (reasons.length) return refuse(reasons);

  const spec = compilePreworkSpec({ intake, record, slots, artifactPrepared, artifactRef });
  if (!spec.offerId) return refuse(['known-offer-required']);
  if (!spec.prework.ok) return refuse(['prework-artifact-insufficient-evidence', ...(spec.prework.reasonCodes || [])]);
  if (!spec.slotCheck.ok) return refuse(spec.slotCheck.reasons.map(r => `slots:${r}`));

  const prospectName = clean(record.company, 160).replace(/\s+(Consulting Group|Group|LLC|Inc\.?|Ltd\.?)$/i, '');
  const clientName = clean(record.clientEvidence.clientName, 160);
  const evidenceRefs = spec.prework.evidenceRefs;
  const evidenceCount = evidenceRefs.length + 1; // client observation page + the recipient publication page
  const policy = compileUberReplyMessagePolicy({
    offerId: spec.offerId,
    // A bucket, not the continuous age: the policy output is bound into the
    // frozen effect digest, which must not drift minute to minute inside the
    // window. The intake already refuses a stale claim, so a measured in-window
    // observation is 1 and an intake that did not measure freshness is 0.
    prospect: { company: record.company, website: record.website, sourceCount: evidenceCount, sourceFreshness: intake?.evidenceFreshness?.recheckRequired === false ? 1 : 0, proposedSubjectWordCount: 2 },
    research: { accountValueScore: 0.5, signalStrength: 0.8, artifactFeasibility: spec.artifact.prepared ? 1 : 0, evidenceDensity: Math.min(1, evidenceCount / 4), estimatedResearchMinutes: 0 }
  });
  if (!policy.ok) return refuse(['message-policy-refused']);

  const generated = generateV5Candidates({ record, intake, spec });
  const supplied = (Array.isArray(extraCandidates) ? extraCandidates : []).map((c, index) => ({
    id: clean(c.id || `EXTRA_${index + 1}`, 80), framing: clean(c.framing || 'externally authored', 200), subject: clean(c.subject, 200), body: clean(c.body, 5000)
  }));
  const all = [...generated, ...supplied];
  const evaluated = all.map(candidate => {
    const critic = critique({ candidate, spec, policy, prospectName, clientName, evidenceRefs });
    const eligible = critic.failures.length === 0;
    const score = eligible ? scoreUberReplyMessageCandidate(featuresFor({ candidate, spec, prospectName, clientName, evidenceRefs })) : null;
    return { id: candidate.id, framing: candidate.framing, subject: candidate.subject, body: candidate.body, eligible, failures: critic.failures, subjectWords: critic.subjectWords, bodyWords: critic.bodyWords, sentenceCount: critic.sentenceCount, score };
  });
  const eligible = evaluated.filter(c => c.eligible).sort((a, b) => b.score - a.score || a.bodyWords - b.bodyWords || a.id.localeCompare(b.id));
  const candidateSetDigest = sha(evaluated.map(c => ({ id: c.id, subject: c.subject, body: c.body })));
  if (!eligible.length) {
    // Name the failures every candidate shares: those are the blockers to fix.
    const shared = evaluated.length ? evaluated[0].failures.filter(code => evaluated.every(c => c.failures.includes(code))) : [];
    return { ...refuse(['no-candidate-passed-the-critics', ...shared]), candidates: evaluated, candidateSetDigest };
  }
  const winner = eligible[0];
  const runnerUp = eligible[1] || null;
  return {
    version: PROSPECT_MESSAGE_TOURNAMENT_VERSION,
    status: 'WINNER_SELECTED',
    conditional: true,
    generatedAt,
    genotype: V5_GENOTYPE,
    winner: { id: winner.id, subject: winner.subject, body: winner.body, wordCount: winner.bodyWords, subjectWordCount: winner.subjectWords, sentenceCount: winner.sentenceCount, cta: V5_CTA, score: winner.score },
    candidates: evaluated,
    challengers: eligible.slice(1).map(c => ({ id: c.id, score: c.score })),
    selectionRationale: `Highest UberReply seed-prior score among ${eligible.length} critic-eligible candidates (${evaluated.length} generated); ties go to fewer words then earlier id${runnerUp ? `; runner-up ${runnerUp.id} scored ${runnerUp.score}` : ''}. Scores are priors, not measured reply probabilities.`,
    claimValidation: { slotsGrounded: true, groundingPhrases: spec.slots.groundingPhrases, bannedLanguageChecked: true, numericGroundingChecked: true, artifactPrepared: spec.artifact.prepared, artifactRef: spec.artifact.ref },
    bindings: {
      prospect: { company: record.company, website: record.website, recipient: record.recipient.email, domain: record.recipient.email.split('@')[1] },
      offerId: spec.offerId,
      evidenceSnapshot: {
        digest: sha({ recipient: record.recipient, observation: record.clientEvidence, notices: record.notices }),
        recipientSourceUrl: record.recipient.sourceUrl, observationSourceUrl: record.clientEvidence.observation.sourceUrl,
        observedAt: { recipient: record.recipient.observedAt, observation: record.clientEvidence.observation.observedAt },
        contactHistoryReceiptDigest: intake.contactHistoryReceiptDigest
      },
      subject: winner.subject, body: winner.body, cta: V5_CTA, genotype: V5_GENOTYPE,
      experimentCellId: policy.experimentCellId, researchDepth: policy.researchDepth.depth,
      coreMessageDigest: sha({ subject: winner.subject, body: winner.body }),
      candidateSetDigest,
      tournamentVersion: PROSPECT_MESSAGE_TOURNAMENT_VERSION
    },
    freshness: { generatedAt, mustRecheckContactHistoryBeforeApproval: true, contactHistoryReceiptMaxAgeMinutes: 15 },
    finalEffectDigest: null,
    finalEffectDigestReason: 'identity (legal sender name, postal footer), sender allocation, provider and unsubscribe participate in the final digest and are not final',
    sendAuthority: false,
    externalEffectAuthority: 'NONE',
    truthBoundary: 'A tournament winner is a conditional preparation result. It is not an approval, not a send decision, and not evidence the message will earn a reply.'
  };
}
