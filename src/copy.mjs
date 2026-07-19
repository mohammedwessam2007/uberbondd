import { normalizeDomain } from './utils.mjs';

const QUALITY_THRESHOLD = 82;
const DEFAULT_OFFER = 'a concise evidence-backed implementation outline';
const DEFAULT_CTA = 'Would a concise implementation outline be useful?';
const SENTENCE_TYPES = Object.freeze(['greeting', 'disclosure', 'evidence', 'implication', 'offer', 'cta', 'optout', 'signature']);
const REQUIRED_BINDINGS = Object.freeze({
  greeting: [],
  disclosure: ['business_name', 'issue_title', 'affected_page', 'software_disclosure'],
  evidence: ['evidence_excerpt', 'affected_page'],
  implication: ['commercial_implication'],
  offer: ['campaign_offer', 'relevant_service'],
  cta: ['campaign_cta'],
  optout: ['optout'],
  signature: ['sender_identity']
});
const PROHIBITED_PATTERNS = Object.freeze([
  { code: 'guaranteed-outcome', pattern: /\b(?:guarantee(?:d)?|risk[- ]free)\s+(?:revenue|sales|rankings?|conversions?|growth|patients?|results?)\b/i },
  { code: 'unsupported-numerical-promise', pattern: /\b(?:increase|boost|grow|improve|raise|double|triple)\b[^.!?]{0,45}\b\d+(?:\.\d+)?\s*%/i },
  { code: 'fake-manual-review', pattern: /\b(?:I|we)\s+(?:personally|manually|carefully|hand)[ -]?(?:reviewed|audited|checked|inspected)\b/i },
  { code: 'fabricated-urgency', pattern: /\b(?:act now|last chance|limited time|urgent action|required immediately|before it is too late)\b/i },
  { code: 'medical-claim', pattern: /\b(?:will|guaranteed to|proven to)\s+(?:cure|diagnose|treat|prevent)\b|\bguarantee(?:d)?\s+patient\s+outcomes?\b/i },
  { code: 'generic-compliment-opening', pattern: /^(?:hi[^\n]*\n+)?\s*(?:I|we)\s+(?:love|admire|am impressed by|was impressed by)\b/i }
]);

function clean(value = '', maximum = 1000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function comparable(value = '') {
  return clean(value, 10000).toLowerCase().replace(/[“”‘’]/g, '"').replace(/[^a-z0-9%/@._:+-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function containsFact(text, fact) {
  const expected = comparable(fact);
  return Boolean(expected && comparable(text).includes(expected));
}

function sentence(id, type, text, bindingIds = [], use = 'statement') {
  return { id, type, text: String(text || '').trim(), bindingIds: [...new Set(bindingIds)], use };
}

function binding(id, kind, value, options = {}) {
  return {
    id,
    kind,
    value: clean(value, options.maximum || 1200),
    sourceUrl: String(options.sourceUrl || '').slice(0, 2000),
    evidenceExcerpt: clean(options.evidenceExcerpt || '', 500),
    required: options.required !== false,
    public: options.public !== false
  };
}

function pageLabel(url) {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`.slice(0, 180);
    return path === '/' ? 'the homepage' : path;
  } catch {
    return '';
  }
}

function safeTemplate(template, facts) {
  const allowed = {
    businessName: facts.businessName,
    issue: facts.issueTitle,
    service: facts.service,
    affectedPage: facts.affectedPage
  };
  const raw = clean(template, 160);
  if (!raw) return '';
  const rendered = raw.replace(/\{\{([a-zA-Z]+)\}\}/g, (match, key) => Object.hasOwn(allowed, key) ? allowed[key] : match);
  if (/\{\{[^}]+\}\}/.test(rendered)) return '';
  return clean(rendered, 160);
}

function sentenceText(sentences) {
  return sentences.map(item => item.text).join('\n\n').trim();
}

function wordCount(value) {
  return clean(value, 20000).split(/\s+/).filter(Boolean).length;
}

function valuesFor(context) {
  return Object.fromEntries((context.bindings || []).map(item => [item.id, item.value]));
}

function allowedNumbers(context) {
  const values = (context.bindings || []).map(item => item.value).join(' ');
  return new Set(values.match(/\b\d+(?:[.,]\d+)?%?\b/g) || []);
}

function prohibitedReasons(text, campaignClaims = []) {
  const reasons = PROHIBITED_PATTERNS.filter(item => item.pattern.test(text)).map(item => item.code);
  const normalized = comparable(text);
  for (const claim of campaignClaims || []) {
    const phrase = comparable(claim);
    if (phrase && normalized.includes(phrase)) reasons.push(`campaign-prohibited:${phrase.slice(0, 80)}`);
  }
  return [...new Set(reasons)];
}

function roleStyle(role = '', index = 0) {
  const normalized = String(role || '').toLowerCase();
  const base = /marketing|growth|brand/.test(normalized)
    ? 1
    : /doctor|dentist|practice|clinic|medical/.test(normalized) ? 2 : 0;
  return (base + index) % 3;
}

export function routeInbox(prospect, audit = []) {
  const hay = `${prospect.niche || ''} ${prospect.company || ''} ${audit.map(item => `${item.title} ${item.service}`).join(' ')}`.toLowerCase();
  return /(medical|clinic|doctor|dent|health|research|scient|university|campus|pharma|hospital)/.test(hay) ? 'A' : 'B';
}

export function createOutreachContext({ prospect = {}, issue = {}, contact = {}, sender = {}, campaign = {}, unsubscribeUrl = '' } = {}) {
  contact = contact || {};
  sender = sender || {};
  campaign = campaign || {};
  const businessName = clean(prospect.company, 160);
  const website = String(prospect.website || '').trim();
  const websiteDomain = normalizeDomain(website);
  const evidenceUrl = String(issue.evidenceUrl || '').trim();
  const evidenceDomain = normalizeDomain(evidenceUrl);
  const issueTitle = clean(issue.title, 220);
  const evidenceExcerpt = clean(issue.evidenceExcerpt, 500);
  const implication = clean(issue.implication, 500);
  const service = clean(issue.service, 220);
  const offer = clean(campaign.offer || DEFAULT_OFFER, 600);
  const callToAction = clean(campaign.callToAction || DEFAULT_CTA, 240);
  const affectedPage = pageLabel(evidenceUrl);
  const recipientFirstName = clean(contact.firstName, 80);
  const recipientRole = clean(contact.position || contact.role, 160);
  const senderName = clean(sender.name, 120);
  const senderCompany = clean(sender.company, 160);
  const senderAddress = clean(sender.address, 300);
  const validUnsubscribeUrl = String(unsubscribeUrl || '').startsWith('https://') ? String(unsubscribeUrl).slice(0, 2000) : '';
  const optout = validUnsubscribeUrl
    ? `If this is not relevant, reply “no” and I’ll stop; you can also opt out here: ${validUnsubscribeUrl}`
    : 'If this is not relevant, reply “no” and I’ll stop future messages.';
  const errors = [];
  if (!businessName) errors.push('business-name-missing');
  if (!websiteDomain) errors.push('verified-website-missing');
  if (!issueTitle || issue.safeForOutreach === false) errors.push('outreach-safe-issue-missing');
  if (!evidenceExcerpt) errors.push('evidence-excerpt-missing');
  if (!evidenceUrl || !affectedPage || evidenceDomain !== websiteDomain) errors.push('evidence-page-mismatch');
  if (!implication) errors.push('commercial-implication-missing');
  if (!service) errors.push('relevant-service-missing');
  if (!offer) errors.push('campaign-offer-missing');
  if (!callToAction) errors.push('campaign-cta-missing');
  if (!senderName || !senderCompany || !senderAddress) errors.push('sender-identity-incomplete');

  const bindings = [
    binding('business_name', 'business_identity', businessName, { sourceUrl: website }),
    binding('verified_website', 'verified_website', website, { sourceUrl: website }),
    binding('issue_title', 'selected_issue', issueTitle, { sourceUrl: evidenceUrl, evidenceExcerpt }),
    binding('evidence_excerpt', 'website_evidence', evidenceExcerpt, { sourceUrl: evidenceUrl, evidenceExcerpt }),
    binding('affected_page', 'affected_page', affectedPage, { sourceUrl: evidenceUrl, evidenceExcerpt }),
    binding('commercial_implication', 'audited_implication', implication, { sourceUrl: evidenceUrl, evidenceExcerpt }),
    binding('relevant_service', 'service', service),
    binding('campaign_offer', 'campaign_offer', offer),
    binding('campaign_cta', 'campaign_cta', callToAction),
    binding('recipient_name', 'public_recipient_name', recipientFirstName, { required: false }),
    binding('recipient_role', 'public_recipient_role', recipientRole, { required: false }),
    binding('software_disclosure', 'review_method', 'software-assisted review'),
    binding('optout', 'optout', optout, { public: false }),
    binding('sender_identity', 'sender_identity', [senderName, senderCompany, senderAddress].filter(Boolean).join(' — '), { public: false })
  ];
  return {
    version: 1,
    valid: errors.length === 0,
    errors,
    businessName,
    website,
    websiteDomain,
    evidenceUrl,
    issueTitle,
    evidenceExcerpt,
    implication,
    service,
    offer,
    callToAction,
    affectedPage,
    recipientFirstName,
    recipientRole,
    sender: { name: senderName, company: senderCompany, address: senderAddress },
    optout,
    validUnsubscribeUrl,
    prohibitedClaims: (campaign.prohibitedClaims || []).map(item => clean(item, 200)).filter(Boolean),
    subjectVariants: (campaign.subjectVariants || []).map(item => clean(item, 160)).filter(Boolean),
    messageVariants: (campaign.messageVariants || []).map(item => clean(item, 4000)).filter(Boolean),
    bindings
  };
}

export function outreachContextForAi(context = {}) {
  const allowedIds = new Set([
    'business_name', 'verified_website', 'issue_title', 'evidence_excerpt', 'affected_page',
    'commercial_implication', 'relevant_service', 'campaign_offer', 'campaign_cta',
    'recipient_role', 'software_disclosure'
  ]);
  return {
    version: context.version,
    bindings: (context.bindings || []).filter(item => allowedIds.has(item.id)).map(item => ({
      id: item.id, kind: item.kind, value: item.value, sourceUrl: item.sourceUrl, evidenceExcerpt: item.evidenceExcerpt
    })),
    requiredSentenceTypes: ['disclosure', 'evidence', 'implication', 'offer', 'cta'],
    prohibitedClaims: context.prohibitedClaims || [],
    rules: [
      'Use each supplied fact exactly; do not introduce people, numbers, results, urgency, or claims.',
      'State software assistance. Do not claim a manual review.',
      'Return structured sentences and binding IDs only.'
    ]
  };
}

function deterministicSubject(context, index) {
  const configured = context.subjectVariants[index % Math.max(1, context.subjectVariants.length)] || '';
  let subject = safeTemplate(configured, context);
  if (!subject) {
    subject = index % 2 === 0
      ? `${context.businessName}: one ${context.service.toLowerCase()} observation`
      : `${context.businessName}: evidence from ${context.affectedPage}`;
  }
  if (!containsFact(subject, context.businessName)) subject = `${subject} — ${context.businessName}`;
  if (![context.issueTitle, context.service, context.affectedPage].some(value => containsFact(subject, value))) {
    subject = `${subject} — ${context.service}`;
  }
  return clean(subject, 160);
}

function operationalSentences(context, prefix) {
  const greetingBindings = context.recipientFirstName ? ['recipient_name'] : [];
  const roleBinding = context.recipientRole ? ['recipient_role'] : [];
  return {
    greeting: sentence(`${prefix}-greeting`, 'greeting', context.recipientFirstName ? `Hi ${context.recipientFirstName},` : 'Hi there,', greetingBindings, 'salutation'),
    optout: sentence(`${prefix}-optout`, 'optout', context.optout, ['optout'], 'safety'),
    signature: sentence(
      `${prefix}-signature`,
      'signature',
      [context.sender.name, context.sender.company, context.sender.address].filter(Boolean).join('\n'),
      ['sender_identity'],
      'identity'
    ),
    roleBinding
  };
}

function deterministicSentences(context, style, prefix) {
  const operational = operationalSentences(context, prefix);
  const disclosure = sentence(
    `${prefix}-disclosure`,
    'disclosure',
    style === 1
      ? `UberBond's software-assisted review found one issue on ${context.businessName}'s public website: ${context.issueTitle} on ${context.affectedPage}.`
      : `A software-assisted review of ${context.businessName}'s public website flagged ${context.issueTitle} on ${context.affectedPage}.`,
    ['business_name', 'issue_title', 'affected_page', 'software_disclosure', ...operational.roleBinding],
    operational.roleBinding.length ? 'fact_and_role_relevance' : 'fact'
  );
  const evidence = sentence(
    `${prefix}-evidence`,
    'evidence',
    `The stored page evidence reads: “${context.evidenceExcerpt}”`,
    ['evidence_excerpt', 'affected_page'],
    'quoted_evidence'
  );
  const implication = sentence(
    `${prefix}-implication`,
    'implication',
    `Why it may matter: ${context.implication}`,
    ['commercial_implication'],
    'qualitative_implication'
  );
  const offer = sentence(
    `${prefix}-offer`,
    'offer',
    style === 2
      ? `The relevant service is ${context.service}; I can cover it through ${context.offer}.`
      : `I can address this through ${context.offer}, focused on ${context.service}.`,
    ['campaign_offer', 'relevant_service'],
    'campaign_offer'
  );
  const cta = sentence(`${prefix}-cta`, 'cta', context.callToAction, ['campaign_cta', ...operational.roleBinding], operational.roleBinding.length ? 'cta_and_role_relevance' : 'cta');
  const core = style === 2
    ? [evidence, disclosure, implication, offer, cta]
    : style === 1
      ? [disclosure, implication, evidence, offer, cta]
      : [disclosure, evidence, implication, offer, cta];
  return [operational.greeting, ...core, operational.optout, operational.signature];
}

function normalizeCandidate(candidate, context, index = 0) {
  const source = ['deterministic', 'ai', 'owner_edit'].includes(candidate?.source) ? candidate.source : 'ai';
  const prefix = clean(candidate?.id || `${source}-${index + 1}`, 80).replace(/[^a-z0-9_-]/gi, '-') || `${source}-${index + 1}`;
  const incoming = Array.isArray(candidate?.sentences) ? candidate.sentences : [];
  const byType = new Map();
  const normalizationErrors = [];
  for (const item of incoming) {
    const type = clean(item?.type, 40).toLowerCase();
    if (!SENTENCE_TYPES.includes(type)) { normalizationErrors.push(`unknown-sentence-type:${type || 'missing'}`); continue; }
    if (byType.has(type)) { normalizationErrors.push(`duplicate-sentence-type:${type}`); continue; }
    byType.set(type, sentence(`${prefix}-${type}`, type, String(item.text || '').slice(0, 2000), item.bindingIds || [], item.use || 'statement'));
  }
  const operations = operationalSentences(context, prefix);
  if (!byType.has('greeting')) byType.set('greeting', operations.greeting);
  if (!byType.has('optout')) byType.set('optout', operations.optout);
  if (!byType.has('signature')) byType.set('signature', operations.signature);
  const sentences = SENTENCE_TYPES.map(type => byType.get(type)).filter(Boolean);
  return {
    id: prefix,
    source,
    subject: clean(candidate?.subject, 160),
    sentences,
    body: sentenceText(sentences),
    campaignSubjectVariant: clean(candidate?.campaignSubjectVariant, 160),
    campaignMessageVariant: clean(candidate?.campaignMessageVariant, 500),
    normalizationErrors,
    bindings: context.bindings
  };
}

function allowedSentenceTexts(context, type) {
  const allowed = new Set();
  for (let style = 0; style < 3; style += 1) {
    for (const item of deterministicSentences(context, style, `allowed-${style}`)) {
      if (item.type === type) allowed.add(comparable(item.text));
    }
  }
  if (type === 'evidence') allowed.add(comparable(`Exact website evidence: “${context.evidenceExcerpt}”`));
  return allowed;
}

function allowedSubjectTexts(context) {
  const count = Math.max(4, context.subjectVariants?.length || 0);
  const allowed = new Set(Array.from({ length: count }, (_, index) => comparable(deterministicSubject(context, index))));
  allowed.add(comparable(`${context.businessName}: ${context.issueTitle}`));
  allowed.add(comparable(`${context.businessName}: ${context.service} evidence`));
  allowed.add(comparable(`${context.businessName}: evidence from ${context.affectedPage}`));
  return allowed;
}

export function validateOutreachCandidate(input = {}, context = {}) {
  const candidate = normalizeCandidate(input, context);
  const reasons = [...(context.errors || []), ...(candidate.normalizationErrors || [])];
  const values = valuesFor(context);
  const bindingIds = new Set((context.bindings || []).map(item => item.id));
  const grouped = new Map();
  for (const item of candidate.sentences) {
    if (!SENTENCE_TYPES.includes(item.type)) reasons.push(`unknown-sentence-type:${item.type}`);
    if (grouped.has(item.type)) reasons.push(`duplicate-sentence-type:${item.type}`);
    grouped.set(item.type, item);
    for (const id of item.bindingIds || []) if (!bindingIds.has(id)) reasons.push(`unknown-binding:${id}`);
    for (const id of REQUIRED_BINDINGS[item.type] || []) if (!item.bindingIds.includes(id)) reasons.push(`binding-missing:${item.type}:${id}`);
  }
  for (const type of SENTENCE_TYPES) if (!grouped.has(type)) reasons.push(`sentence-missing:${type}`);
  for (const [type, item] of grouped) {
    if (!allowedSentenceTexts(context, type).has(comparable(item.text))) reasons.push(`unsupported-sentence-text:${type}`);
  }

  const greeting = grouped.get('greeting')?.text || '';
  const disclosure = grouped.get('disclosure')?.text || '';
  const evidence = grouped.get('evidence')?.text || '';
  const implication = grouped.get('implication')?.text || '';
  const offer = grouped.get('offer')?.text || '';
  const cta = grouped.get('cta')?.text || '';
  const optout = grouped.get('optout')?.text || '';
  const signature = grouped.get('signature')?.text || '';

  if (context.recipientFirstName && !containsFact(greeting, context.recipientFirstName)) reasons.push('recipient-name-not-bound');
  if (!containsFact(disclosure, values.business_name) || !containsFact(disclosure, values.issue_title) || !containsFact(disclosure, values.affected_page)) reasons.push('disclosure-fact-mismatch');
  if (!/software[- ]assisted/i.test(disclosure)) reasons.push('software-disclosure-missing');
  if (!containsFact(evidence, values.evidence_excerpt)) reasons.push('evidence-excerpt-not-exact');
  if (!containsFact(implication, values.commercial_implication)) reasons.push('implication-not-exact');
  if (!containsFact(offer, values.campaign_offer) || !containsFact(offer, values.relevant_service)) reasons.push('offer-not-bound');
  if (!containsFact(cta, values.campaign_cta)) reasons.push('cta-not-bound');
  if (!/reply\s+[“"']?no|opt out|stop future messages/i.test(optout)) reasons.push('optout-missing');
  if (context.validUnsubscribeUrl && !optout.includes(context.validUnsubscribeUrl)) reasons.push('unsubscribe-url-missing');
  for (const value of [context.sender?.name, context.sender?.company, context.sender?.address].filter(Boolean)) {
    if (!containsFact(signature, value)) reasons.push('sender-identity-mismatch');
  }
  if (!containsFact(candidate.subject, context.businessName)) reasons.push('subject-business-missing');
  if (![context.issueTitle, context.service, context.affectedPage].some(value => containsFact(candidate.subject, value))) reasons.push('subject-specificity-low');
  if (!allowedSubjectTexts(context).has(comparable(candidate.subject))) reasons.push('unsupported-subject-text');

  const combined = `${candidate.subject}\n${candidate.body}`;
  reasons.push(...prohibitedReasons(combined, context.prohibitedClaims), ...prohibitedReasons(candidate.body, context.prohibitedClaims));
  if (/\b(?:another|second|third)\s+(?:issue|problem|observation)\b/i.test(candidate.body)) reasons.push('multiple-problems');
  const permittedNumbers = allowedNumbers(context);
  for (const value of combined.match(/\b\d+(?:[.,]\d+)?%?\b/g) || []) {
    if (!permittedNumbers.has(value)) reasons.push(`unsupported-number:${value}`);
  }

  const paragraphs = candidate.sentences.map(item => comparable(item.text)).filter(Boolean);
  const duplicateParagraphs = paragraphs.length - new Set(paragraphs).size;
  const factualChecks = [
    containsFact(disclosure, context.businessName), containsFact(disclosure, context.issueTitle),
    containsFact(disclosure, context.affectedPage), containsFact(evidence, context.evidenceExcerpt),
    containsFact(implication, context.implication), containsFact(offer, context.offer),
    containsFact(offer, context.service), containsFact(cta, context.callToAction)
  ];
  const specificityChecks = [
    containsFact(candidate.subject, context.businessName), containsFact(disclosure, context.issueTitle),
    containsFact(disclosure, context.affectedPage), containsFact(evidence, context.evidenceExcerpt),
    containsFact(offer, context.service), containsFact(offer, context.offer),
    !context.recipientRole || grouped.get('cta')?.bindingIds.includes('recipient_role') || grouped.get('disclosure')?.bindingIds.includes('recipient_role')
  ];
  const coreLengths = candidate.sentences.filter(item => !['signature', 'greeting'].includes(item.type)).map(item => wordCount(item.text));
  const longest = Math.max(0, ...coreLengths);
  const words = wordCount(candidate.body);
  const ctaWords = wordCount(cta);
  const questionMarks = (cta.match(/\?/g) || []).length;
  if (words < 40 || words > 210) reasons.push('length-out-of-range');
  if (longest > 45) reasons.push('sentence-too-complex');
  if (ctaWords > 32 || questionMarks > 1) reasons.push('cta-not-simple');
  if (duplicateParagraphs) reasons.push('duplicate-phrasing');
  const prohibited = [...new Set([
    ...prohibitedReasons(combined, context.prohibitedClaims),
    ...prohibitedReasons(candidate.body, context.prohibitedClaims)
  ])];
  const structuralReasons = reasons.filter(reason => /(?:fact-mismatch|not-exact|not-bound|unknown-binding|binding-missing|sentence-missing|sentence-type|unsupported-sentence|unsupported-subject|multiple-problems|unsupported-number|sender-identity|unsubscribe-url|software-disclosure)/.test(reason));
  const dimensions = {
    evidenceFidelity: Math.round(factualChecks.filter(Boolean).length / factualChecks.length * 100),
    specificity: Math.round(specificityChecks.filter(Boolean).length / specificityChecks.length * 100),
    clarity: longest <= 30 ? 100 : Math.max(0, 100 - (longest - 30) * 6),
    length: words >= 55 && words <= 180 ? 100 : words >= 40 && words <= 210 ? 75 : 20,
    ctaSimplicity: ctaWords > 0 && ctaWords <= 24 && questionMarks <= 1 ? 100 : ctaWords <= 32 && questionMarks <= 1 ? 70 : 20,
    prohibitedLanguageCompliance: prohibited.length ? 0 : 100,
    duplicatePhrasing: duplicateParagraphs ? 0 : 100,
    hallucinationRisk: structuralReasons.length ? 0 : 100
  };
  const score = Math.round(
    dimensions.evidenceFidelity * 0.25 + dimensions.specificity * 0.15 + dimensions.clarity * 0.1 +
    dimensions.length * 0.1 + dimensions.ctaSimplicity * 0.1 + dimensions.prohibitedLanguageCompliance * 0.15 +
    dimensions.duplicatePhrasing * 0.05 + dimensions.hallucinationRisk * 0.1
  );
  const uniqueReasons = [...new Set(reasons)];
  const criticalPass = dimensions.evidenceFidelity === 100 && dimensions.prohibitedLanguageCompliance === 100 && dimensions.hallucinationRisk === 100;
  const passed = context.valid === true && uniqueReasons.length === 0 && criticalPass && score >= QUALITY_THRESHOLD;
  return {
    ...candidate,
    quality: {
      passed,
      score,
      threshold: QUALITY_THRESHOLD,
      dimensions,
      reasons: uniqueReasons,
      wordCount: words,
      sentenceCount: candidate.sentences.length
    }
  };
}

function deterministicCandidates(context) {
  const count = Math.max(2, Math.min(4, Math.max(context.subjectVariants.length, context.messageVariants.length, 2)));
  return Array.from({ length: count }, (_, index) => {
    const style = roleStyle(context.recipientRole, index);
    const id = `deterministic-${index + 1}`;
    return {
      id,
      source: 'deterministic',
      subject: deterministicSubject(context, index),
      sentences: deterministicSentences(context, style, id),
      campaignSubjectVariant: context.subjectVariants[index % Math.max(1, context.subjectVariants.length)] || '',
      campaignMessageVariant: context.messageVariants[index % Math.max(1, context.messageVariants.length)] || '',
      roleInfluence: context.recipientRole ? { role: context.recipientRole, style } : null
    };
  });
}

export function stableOutreachVariantIndex(selectionKey = '', count = 0) {
  const size = Math.max(0, Math.floor(Number(count) || 0));
  if (!size) return -1;
  if (!selectionKey) return 0;
  let hash = 2166136261;
  for (const character of String(selectionKey)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % size;
}

export function composeOutreach(input = {}) {
  const context = input.context?.bindings ? input.context : createOutreachContext(input);
  const candidates = [
    ...deterministicCandidates(context),
    ...(Array.isArray(input.aiCandidates) ? input.aiCandidates.map((candidate, index) => ({ ...candidate, id: candidate.id || `ai-${index + 1}`, source: 'ai' })) : [])
  ];
  const seen = new Set();
  const approvedVariants = [];
  const rejectedVariants = [];
  for (const candidate of candidates) {
    const validated = validateOutreachCandidate(candidate, context);
    const fingerprint = `${comparable(validated.subject)}\n${comparable(validated.body)}`;
    if (seen.has(fingerprint)) {
      rejectedVariants.push({ id: validated.id, source: validated.source, reasons: ['duplicate-variant'] });
      continue;
    }
    seen.add(fingerprint);
    if (validated.quality.passed) approvedVariants.push(validated);
    else rejectedVariants.push({ id: validated.id, source: validated.source, reasons: validated.quality.reasons, quality: validated.quality });
  }
  const selectedIndex = approvedVariants.length >= 2
    ? stableOutreachVariantIndex(input.selectionKey, approvedVariants.length)
    : -1;
  const selected = selectedIndex >= 0 ? approvedVariants[selectedIndex] : null;
  return {
    version: 1,
    status: selected ? 'needs-review' : 'rejected',
    selected,
    selection: selected ? {
      strategy: input.selectionKey ? 'stable-prospect-hash-v1' : 'first-approved-v1',
      index: selectedIndex,
      variantId: selected.id,
      subjectVariant: selected.campaignSubjectVariant || '',
      messageVariant: selected.campaignMessageVariant || ''
    } : null,
    variants: approvedVariants,
    rejectedVariants,
    rejectionReasons: selected ? [] : [
      ...(context.errors || []),
      ...(approvedVariants.length < 2 ? ['fewer-than-two-quality-approved-variants'] : [])
    ],
    context,
    generatedAt: new Date().toISOString(),
    ownerApproval: 'pending',
    liveSendEligible: false
  };
}

function editedSentenceType(text, context) {
  if (/^(?:hi|hello|dear)\b/i.test(text)) return 'greeting';
  if (/software[- ]assisted/i.test(text) && containsFact(text, context.issueTitle)) return 'disclosure';
  if (containsFact(text, context.evidenceExcerpt)) return 'evidence';
  if (containsFact(text, context.implication)) return 'implication';
  if (containsFact(text, context.offer) && containsFact(text, context.service)) return 'offer';
  if (containsFact(text, context.callToAction)) return 'cta';
  if (/reply\s+[“"']?no|opt out|stop future messages/i.test(text)) return 'optout';
  if ([context.sender?.name, context.sender?.company, context.sender?.address].filter(Boolean).every(value => containsFact(text, value))) return 'signature';
  return '';
}

export function validateEditedOutreach({ subject = '', body = '' } = {}, context = {}) {
  const cleanSubject = String(subject || '').trim().slice(0, 160);
  const cleanBody = String(body || '').trim().slice(0, 12000);
  const paragraphs = cleanBody.split(/\n\s*\n/).map(item => item.trim()).filter(Boolean);
  const parsed = [];
  const unknown = [];
  for (const paragraph of paragraphs) {
    const type = editedSentenceType(paragraph, context);
    if (!type) { unknown.push(paragraph.slice(0, 80)); continue; }
    parsed.push(sentence(`owner-edit-${type}`, type, paragraph, [
      ...(REQUIRED_BINDINGS[type] || []),
      ...(context.recipientRole && ['disclosure', 'cta'].includes(type) ? ['recipient_role'] : []),
      ...(type === 'greeting' && context.recipientFirstName ? ['recipient_name'] : [])
    ], 'owner_edit'));
  }
  if (unknown.length) {
    return {
      id: 'owner-edit', source: 'owner_edit', subject: cleanSubject, body: cleanBody, sentences: parsed,
      quality: { passed: false, score: 0, threshold: QUALITY_THRESHOLD, dimensions: {}, reasons: ['unsupported-edited-sentence'], unknown, wordCount: wordCount(cleanBody), sentenceCount: parsed.length }
    };
  }
  return validateOutreachCandidate({ id: 'owner-edit', source: 'owner_edit', subject: cleanSubject, sentences: parsed }, context);
}

export function buildMessage({ prospect, issue, contact, sender, campaign = {}, followup = 0, unsubscribeUrl = '' }) {
  const first = contact?.firstName || prospect.contactName?.split(/\s+/)[0] || '';
  const greeting = first ? `Hi ${first},` : 'Hi there,';
  const optout = unsubscribeUrl
    ? `\n\nIf this is not relevant, reply “no” and I’ll stop; you can also opt out here: ${unsubscribeUrl}`
    : '\n\nIf this is not relevant, reply “no” and I’ll stop future messages.';
  if (followup > 1) return '';
  if (followup === 1) {
    return `${greeting}\n\nFollowing up once on the software-assisted observation about ${issue.title}: ${issue.implication}\n\n${campaign.callToAction || DEFAULT_CTA}${optout}\n\n${sender.name}\n${sender.company}\n${sender.address}`;
  }
  const composed = composeOutreach({ prospect, issue, contact, sender, campaign, unsubscribeUrl });
  if (composed.selected) return composed.selected.body;
  // Compatibility-only return for legacy previews. The pipeline and send gate
  // require a quality-approved `outreach.selected` record and will never send it.
  return `${greeting}\n\nA software-assisted review noted ${issue?.title || 'a website issue'} on ${prospect.company}'s public website. ${issue?.implication || ''}${optout}\n\n${sender.name}\n${sender.company}\n${sender.address}`;
}

export function buildSubject(prospect, issue, followup = 0) {
  if (followup) return `Re: ${prospect.company} — ${String(issue.service || 'website').toLowerCase()}`;
  return `${prospect.company}: one ${String(issue.service || 'website').toLowerCase()} observation`;
}
