import { isEmail, normalizeDomain } from './utils.mjs';

export const FREE_PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'outlook.com', 'hotmail.com', 'live.com',
  'msn.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'mail.com',
  'zoho.com', 'fastmail.com', 'hey.com', 'tuta.com', 'tuta.io', 'tutanota.com', 'yandex.com',
  'yandex.ru', 'mail.ru', 'qq.com', '163.com'
]);

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const RISKY_LOCAL_PART = /^(?:no[._-]?reply|do[._-]?not[._-]?reply|donotreply|privacy|legal|abuse|security|webmaster|postmaster|mailer[._-]?daemon|unsubscribe|spam)(?:[._+-].*)?$/i;
const ROLE_MAILBOX = /^(?:info|contact|hello|admin|office|support|sales|marketing|team|enquiries|inquiries|reception|appointments?|bookings?|clinic|practice|care|customerservice|customer[._-]?service|help|owner|founder|director|partner|doctor|manager)(?:[._+-].*)?$/i;
const ROLE_SIGNALS = Object.freeze([
  { role: 'owner', pattern: /\b(?:business\s+)?owner\b/i, weight: 100 },
  { role: 'founder', pattern: /\b(?:co[- ]?)?founder\b/i, weight: 99 },
  { role: 'managing director', pattern: /\bmanaging\s+director\b/i, weight: 97 },
  { role: 'partner', pattern: /\b(?:managing\s+|senior\s+)?partner\b/i, weight: 95 },
  { role: 'marketing director', pattern: /\b(?:marketing\s+director|director\s+of\s+marketing|head\s+of\s+marketing|marketing\s+lead)\b/i, weight: 93 },
  { role: 'director', pattern: /\b(?:executive\s+|clinical\s+|medical\s+)?director\b/i, weight: 92 },
  { role: 'practice manager', pattern: /\bpractice\s+manager\b/i, weight: 90 },
  { role: 'doctor', pattern: /\b(?:doctor|dr\.?|physician|dentist|consultant)\b/i, weight: 87 },
  { role: 'manager', pattern: /\b(?:general\s+|operations\s+|clinic\s+|office\s+)?manager\b/i, weight: 78 }
]);
const ALLOWED_EXTRACTION_METHODS = new Set(['visible_text', 'mailto', 'structured_data', 'crawler_evidence']);

function cleanText(value = '', maximum = 360) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

export function normalizeEmail(value = '') {
  let raw = String(value || '').trim();
  if (/^mailto:/i.test(raw)) raw = raw.replace(/^mailto:/i, '').split('?')[0];
  try { raw = decodeURIComponent(raw); } catch { /* Keep the original value. */ }
  const match = raw.match(EMAIL_PATTERN);
  return match?.[0]?.toLowerCase() || '';
}

export function emailDomain(email = '') {
  return normalizeEmail(email).split('@')[1] || '';
}

export function isFreePersonalEmail(email = '') {
  return FREE_PERSONAL_EMAIL_DOMAINS.has(emailDomain(email));
}

export function isRiskyMailbox(email = '') {
  return RISKY_LOCAL_PART.test(normalizeEmail(email).split('@')[0] || '');
}

export function isSameBusinessDomain(email = '', business = '') {
  const contactDomain = emailDomain(email);
  const businessDomain = normalizeDomain(business);
  return Boolean(contactDomain && businessDomain && (
    contactDomain === businessDomain || contactDomain.endsWith(`.${businessDomain}`)
  ));
}

export function classifyMailbox(email = '') {
  const localPart = normalizeEmail(email).split('@')[0] || '';
  const mailboxType = ROLE_MAILBOX.test(localPart) ? 'role' : 'named';
  return { mailboxType, personal: mailboxType === 'named' };
}

function roleSignal(...values) {
  const text = values.map(value => cleanText(value, 600)).join(' ');
  return ROLE_SIGNALS.find(signal => signal.pattern.test(text)) || null;
}

function excerptAround(text, email) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  const index = normalized.toLowerCase().indexOf(email.toLowerCase());
  if (index < 0) return '';
  const start = Math.max(0, index - 120);
  const end = Math.min(normalized.length, index + email.length + 120);
  return cleanText(`${start > 0 ? '…' : ''}${normalized.slice(start, end)}${end < normalized.length ? '…' : ''}`);
}

function sourceContext(pageUrl = '', explicit = '') {
  if (explicit) return cleanText(explicit, 40).toLowerCase();
  let pathname = '';
  try { pathname = new URL(pageUrl).pathname; } catch { /* Ignore malformed page URLs. */ }
  if (/contact|reach|enquir|inquir|appointment|book/i.test(pathname)) return 'contact_page';
  if (/team|people|staff|doctor|dentist|leadership|about/i.test(pathname)) return 'team_page';
  return 'page';
}

function normalizePublishedEvidence(input = {}, page = {}) {
  const email = normalizeEmail(input.email || input.value || input.url || '');
  const sourceUrl = String(input.sourceUrl || page.url || '').trim();
  const sourceType = ALLOWED_EXTRACTION_METHODS.has(input.sourceType)
    ? input.sourceType
    : ALLOWED_EXTRACTION_METHODS.has(input.extractionMethod) ? input.extractionMethod : 'crawler_evidence';
  const evidenceExcerpt = cleanText(input.evidenceExcerpt || input.excerpt || input.text || '');
  return {
    email,
    sourceUrl,
    sourceType,
    extractionMethod: sourceType,
    evidenceExcerpt,
    context: sourceContext(sourceUrl, input.context),
    firstName: cleanText(input.firstName, 80),
    lastName: cleanText(input.lastName, 80),
    name: cleanText(input.name, 160),
    position: cleanText(input.position || input.jobTitle, 160),
    published: true
  };
}

function structuredEmailEvidence(raw, page) {
  let value;
  try { value = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return []; }
  const found = [];
  const seenObjects = new Set();
  function visit(node, inherited = {}) {
    if (!node || typeof node !== 'object' || seenObjects.has(node) || found.length >= 40) return;
    seenObjects.add(node);
    if (Array.isArray(node)) {
      for (const item of node) visit(item, inherited);
      return;
    }
    const identity = {
      name: typeof node.name === 'string' ? node.name : inherited.name || '',
      firstName: typeof node.givenName === 'string' ? node.givenName : inherited.firstName || '',
      lastName: typeof node.familyName === 'string' ? node.familyName : inherited.lastName || '',
      position: typeof node.jobTitle === 'string' ? node.jobTitle : inherited.position || ''
    };
    const values = Array.isArray(node.email) ? node.email : node.email ? [node.email] : [];
    for (const value of values) {
      const email = normalizeEmail(value);
      if (!email) continue;
      const evidenceExcerpt = cleanText([
        identity.name || [identity.firstName, identity.lastName].filter(Boolean).join(' '),
        identity.position,
        email
      ].filter(Boolean).join(' — '));
      found.push(normalizePublishedEvidence({
        email,
        sourceUrl: page.url,
        sourceType: 'structured_data',
        evidenceExcerpt,
        context: 'structured_data',
        ...identity
      }, page));
    }
    for (const child of Object.values(node)) visit(child, identity);
  }
  visit(value);
  return found;
}

export function extractPublishedContactEvidence(crawl = {}) {
  const evidence = [];
  for (const page of crawl.pages || []) {
    const typedEvidence = page.emailEvidence || [];
    for (const item of typedEvidence) evidence.push(normalizePublishedEvidence(item, page));

    if (typedEvidence.length) continue;

    for (const link of page.mailtoLinks || []) {
      if (link.visible === false) continue;
      const email = normalizeEmail(link.url || link.href || '');
      if (!email) continue;
      evidence.push(normalizePublishedEvidence({
        email,
        sourceUrl: page.url,
        sourceType: 'mailto',
        evidenceExcerpt: cleanText(`${link.text || 'Email'} — ${email}`),
        context: link.context || ''
      }, page));
    }

    const visibleText = String(page.bodyText || '');
    for (const match of visibleText.matchAll(EMAIL_PATTERN)) {
      const email = normalizeEmail(match[0]);
      evidence.push(normalizePublishedEvidence({
        email,
        sourceUrl: page.url,
        sourceType: 'visible_text',
        evidenceExcerpt: excerptAround(visibleText, email)
      }, page));
    }

    for (const raw of page.jsonLd || []) evidence.push(...structuredEmailEvidence(raw, page));
  }
  const unique = new Map();
  for (const item of evidence) {
    if (!item.email || !item.sourceUrl || !item.evidenceExcerpt) continue;
    const key = `${item.email}\n${item.sourceUrl}\n${item.sourceType}\n${item.evidenceExcerpt}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()];
}

function candidateEligibility(candidate, domain) {
  if (!candidate.email || !isEmail(candidate.email)) return { ok: false, reason: 'invalid-email' };
  if (isFreePersonalEmail(candidate.email)) return { ok: false, reason: 'free-mail-contact' };
  if (isRiskyMailbox(candidate.email)) return { ok: false, reason: 'risky-mailbox' };
  if (!isSameBusinessDomain(candidate.email, domain)) return { ok: false, reason: 'contact-domain-mismatch' };
  if (candidate.published) {
    const supported = (candidate.evidence || []).some(item =>
      item.published === true &&
      isSameBusinessDomain(candidate.email, domain) &&
      normalizeDomain(item.sourceUrl) === normalizeDomain(domain) &&
      cleanText(item.evidenceExcerpt).toLowerCase().includes(candidate.email)
    );
    if (!supported) return { ok: false, reason: 'published-evidence-missing' };
    return { ok: true, mode: 'published' };
  }
  if (candidate.externallyVerified === true && candidate.verificationStatus === 'valid') {
    return { ok: true, mode: 'externally_verified' };
  }
  return { ok: false, reason: 'contact-not-published-or-verified' };
}

export function rankContactCandidate(candidate = {}) {
  const mailbox = classifyMailbox(candidate.email);
  const signal = roleSignal(candidate.position, candidate.role, candidate.evidence?.map(item => item.evidenceExcerpt).join(' '), candidate.email.split('@')[0]);
  let score = signal?.weight || (mailbox.mailboxType === 'named' ? 70 : 48);
  if (candidate.published) score += 8;
  if (candidate.externallyVerified) score += 5;
  if ((candidate.evidence || []).some(item => ['contact_page', 'team_page', 'header', 'footer'].includes(item.context))) score += 3;
  return Math.min(100, score);
}

function mergeCandidate(map, candidate) {
  const existing = map.get(candidate.email);
  if (!existing) {
    map.set(candidate.email, candidate);
    return;
  }
  const evidence = [...(existing.evidence || []), ...(candidate.evidence || [])];
  const evidenceByKey = new Map(evidence.map(item => [
    `${item.sourceUrl}\n${item.sourceType}\n${item.evidenceExcerpt}`,
    item
  ]));
  const preferCandidateIdentity = candidate.published && !existing.published;
  map.set(candidate.email, {
    ...existing,
    ...(preferCandidateIdentity ? {
      firstName: candidate.firstName,
      lastName: candidate.lastName,
      name: candidate.name,
      position: candidate.position
    } : {}),
    firstName: existing.firstName || candidate.firstName || '',
    lastName: existing.lastName || candidate.lastName || '',
    name: existing.name || candidate.name || '',
    position: existing.position || candidate.position || '',
    source: existing.published || candidate.published ? 'website' : 'hunter',
    published: existing.published || candidate.published,
    externallyVerified: existing.externallyVerified || candidate.externallyVerified,
    verificationStatus: existing.verificationStatus === 'valid' || candidate.verificationStatus !== 'valid'
      ? existing.verificationStatus
      : candidate.verificationStatus,
    externalSources: [...(existing.externalSources || []), ...(candidate.externalSources || [])],
    evidence: [...evidenceByKey.values()]
  });
}

class ContactProviderError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ContactProviderError';
    this.code = code;
  }
}

async function hunterRequest(path, params, key, fetchImpl = fetch) {
  const url = new URL(`https://api.hunter.io/v2/${path}`);
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') url.searchParams.set(name, value);
  }
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { 'X-API-KEY': key, accept: 'application/json' },
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new ContactProviderError('hunter_network_error');
  }
  if (!response.ok) throw new ContactProviderError(`hunter_http_${response.status}`);
  try { return await response.json(); }
  catch { throw new ContactProviderError('hunter_invalid_response'); }
}

function hunterCandidate(record = {}) {
  const email = normalizeEmail(record.value || record.email || '');
  const verificationStatus = cleanText(record.verification?.status || record.status || 'unknown', 40).toLowerCase();
  const externalSources = (record.sources || []).slice(0, 20).map(source => ({
    uri: String(source.uri || source.url || '').slice(0, 1000),
    extractedOn: String(source.extracted_on || source.last_seen_on || '').slice(0, 40)
  })).filter(source => source.uri);
  return {
    email,
    firstName: cleanText(record.first_name, 80),
    lastName: cleanText(record.last_name, 80),
    name: cleanText([record.first_name, record.last_name].filter(Boolean).join(' '), 160),
    position: cleanText(record.position, 160),
    source: 'hunter',
    published: false,
    externallyVerified: verificationStatus === 'valid',
    verificationStatus,
    verified: verificationStatus,
    evidence: [],
    externalSources,
    guessed: false
  };
}

export async function discoverContacts(prospect, crawl, hunterKey = '', options = {}) {
  const domain = normalizeDomain(prospect.website || crawl.startUrl);
  const candidatesByEmail = new Map();
  const rejectedCounts = {};
  const reject = reason => { rejectedCounts[reason] = Number(rejectedCounts[reason] || 0) + 1; };

  for (const item of extractPublishedContactEvidence(crawl)) {
    const email = normalizeEmail(item.email);
    const basic = { email, published: true, externallyVerified: false, verificationStatus: 'unverified', evidence: [item] };
    const eligibility = candidateEligibility(basic, domain);
    if (!eligibility.ok) { reject(eligibility.reason); continue; }
    const mailbox = classifyMailbox(email);
    const signal = roleSignal(item.position, item.evidenceExcerpt, email.split('@')[0]);
    mergeCandidate(candidatesByEmail, {
      ...basic,
      firstName: item.firstName || '',
      lastName: item.lastName || '',
      name: item.name || '',
      position: item.position || signal?.role || '',
      role: signal?.role || '',
      source: 'website',
      verified: 'unverified',
      ...mailbox,
      guessed: false
    });
  }

  const providerErrors = [];
  if (hunterKey) {
    try {
      const result = await hunterRequest('domain-search', { domain, limit: 20 }, hunterKey, options.fetchImpl || fetch);
      for (const record of result.data?.emails || []) {
        const candidate = hunterCandidate(record);
        const eligibility = candidateEligibility(candidate, domain);
        if (!eligibility.ok && eligibility.reason !== 'contact-not-published-or-verified') {
          reject(eligibility.reason);
          continue;
        }
        const mailbox = classifyMailbox(candidate.email);
        const signal = roleSignal(candidate.position, candidate.email.split('@')[0]);
        mergeCandidate(candidatesByEmail, { ...candidate, ...mailbox, role: signal?.role || '' });
      }
    } catch (error) {
      providerErrors.push({ provider: 'hunter', code: error.code || 'hunter_error' });
    }
  }

  const candidates = [...candidatesByEmail.values()].map(candidate => {
    const eligibility = candidateEligibility(candidate, domain);
    const firstEvidence = candidate.evidence?.[0] || null;
    return {
      ...candidate,
      sourceUrl: firstEvidence?.sourceUrl || candidate.externalSources?.[0]?.uri || '',
      evidenceExcerpt: firstEvidence?.evidenceExcerpt || '',
      extractionMethod: firstEvidence?.sourceType || (candidate.source === 'hunter' ? 'hunter_domain_search' : ''),
      confidence: rankContactCandidate(candidate),
      automationEligible: eligibility.ok,
      eligibilityMode: eligibility.mode || '',
      eligibilityReason: eligibility.ok ? '' : eligibility.reason
    };
  }).sort((left, right) =>
    Number(right.automationEligible) - Number(left.automationEligible) ||
    right.confidence - left.confidence ||
    left.email.localeCompare(right.email)
  );

  return {
    domain,
    candidates,
    all: candidates,
    selected: candidates.find(candidate => candidate.automationEligible) || null,
    recommended: candidates[0] || null,
    rejected: rejectedCounts,
    providerErrors
  };
}

export async function verifyEmail(email, hunterKey = '', options = {}) {
  const normalized = normalizeEmail(email);
  if (!hunterKey || !isEmail(normalized)) {
    return { email: normalized, status: 'unverified', score: 0, externallyVerified: false };
  }
  const result = await hunterRequest('email-verifier', { email: normalized }, hunterKey, options.fetchImpl || fetch);
  const data = result.data || {};
  const status = cleanText(data.status || 'unknown', 40).toLowerCase();
  return {
    email: normalized,
    status,
    score: Number(data.score || 0),
    externallyVerified: status === 'valid'
  };
}
