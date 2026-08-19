import { sha256 } from './omnia-v9/canonical.mjs';
import { normalizeDomain } from './utils.mjs';

export const LEAD_GENERATION_VERSION = 'uberbond.lead-generation.v1';

export const LEAD_SIGNAL_TYPES = Object.freeze([
  'job_change', 'new_hire', 'promotion', 'funding', 'news',
  'technology', 'website_change', 'public_pain_point', 'manual',
  'website_visit', 'form_submission', 'product_usage', 'community_activity',
  'job_listing', 'acquisition', 'partnership', 'product_launch',
  'traffic_surge', 'competitor_research', 'review_activity',
  'buying_intent', 'first_party_inquiry', 'relationship_path', 'champion_job_change'
]);

export const LEAD_SOURCE_TYPES = Object.freeze([
  'local_prospect', 'owner_import', 'public_website', 'csv_import',
  'provider_api', 'licensed_export', 'first_party_export'
]);

export const ENRICHMENT_FIELDS = Object.freeze([
  'company_profile', 'work_email', 'email_verification', 'phone',
  'technology', 'funding', 'news', 'job_change', 'website_evidence'
]);

export const LEAD_GENERATION_POLICY = Object.freeze({
  externalEffects: 0,
  providerCalls: 0,
  contactRule: 'Use an exact owner-supplied, first-party, licensed, or provider-returned business contact. Never invent a private email address.',
  sourceRule: 'Every signal and imported record must retain its source, observed time, and licensing/authority note.',
  linkedinRule: 'No LinkedIn scraping, browser automation, session reuse, or non-official data extraction.',
  handoffRule: 'Lead generation creates an owner plan. Outreach still requires its existing evidence, route, suppression, authorization, and V9 gates.'
});

const MAX_TEXT = 1000;
const NUMBER_FIELDS = new Set(['minEmployees', 'maxEmployees', 'minRevenueUsd', 'maxRevenueUsd', 'minScore', 'minEvidenceScore', 'minIntentScore', 'freshWithinDays', 'limit']);
const SORTS = new Set(['score', 'freshness', 'intent', 'fit']);
const SIGNAL_SET = new Set(LEAD_SIGNAL_TYPES);
const SOURCE_SET = new Set(LEAD_SOURCE_TYPES);
const FIELD_SET = new Set(ENRICHMENT_FIELDS);
const SIGNAL_WEIGHTS = Object.freeze({
  first_party_inquiry: 10, form_submission: 9, product_usage: 8, website_visit: 7,
  buying_intent: 7, competitor_research: 7, champion_job_change: 7,
  job_change: 6, acquisition: 6, funding: 6, product_launch: 6,
  job_listing: 5, new_hire: 5, promotion: 5, public_pain_point: 5,
  technology: 4, traffic_surge: 4, partnership: 4, community_activity: 4,
  review_activity: 3, website_change: 3, news: 3, relationship_path: 3, manual: 2
});
const SOURCE_TRUST = Object.freeze({
  first_party_export: 1, owner_import: 1, licensed_export: 0.95,
  provider_api: 0.85, public_website: 0.8, csv_import: 0.7, local_prospect: 0.65
});

function text(value, max = MAX_TEXT) { return String(value ?? '').trim().slice(0, max); }
function number(value, fallback, min, max) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
function integer(value, fallback, min, max) {
  const parsed = number(value, fallback, min, max);
  return parsed === null ? null : Math.round(parsed);
}
function unique(values, max = 40) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 160).toLowerCase()).filter(Boolean))].slice(0, max);
}
function uniqueOriginal(values, max = 40) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 160)).filter(Boolean))].slice(0, max);
}
function tokens(value) {
  return unique(String(value || '').toLowerCase().split(/[^a-z0-9@.+-]+/i).filter(token => token.length >= 2), 80);
}
function clamp01(value, fallback = 0) { return Math.max(0, Math.min(1, number(value, fallback, 0, 1))); }
function iso(value, fallback = new Date()) {
  const parsed = new Date(value || fallback);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date(fallback).toISOString();
}
function validHttps(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch { return false; }
}
function daysSince(value, now = new Date()) {
  const stamp = Date.parse(value || '');
  if (!Number.isFinite(stamp)) return Infinity;
  return Math.max(0, (new Date(now).getTime() - stamp) / 86400000);
}
function recencyFactor(value, now = new Date(), maxDays = 365) {
  const age = daysSince(value, now);
  if (!Number.isFinite(age)) return 0;
  return Math.max(0, 1 - age / Math.max(1, maxDays));
}
function candidateEmail(candidate) {
  return String(candidate?.contact?.email || candidate?.email || '').trim().toLowerCase();
}
function candidateDomain(candidate) {
  return normalizeDomain(candidate?.domain || candidate?.website || candidate?.organizationDomain || '');
}
function candidateText(candidate) {
  return [
    candidate?.company, candidate?.name, candidate?.domain, candidate?.website,
    candidate?.niche, candidate?.industry, candidate?.country, candidate?.city,
    candidate?.contact?.name, candidate?.contact?.title, candidate?.contactName,
    candidate?.notes, candidate?.issue?.title, candidate?.issue?.evidenceExcerpt,
    ...(Array.isArray(candidate?.technologies) ? candidate.technologies : []),
    ...(Array.isArray(candidate?.tags) ? candidate.tags : [])
  ].filter(Boolean).join(' ').toLowerCase();
}
function isOwned(candidate) {
  return Boolean(
    candidate?.priorContacted || candidate?.contactedAt || candidate?.repliedAt ||
    ['sent', 'replied', 'send-uncertain', 'suppressed'].includes(String(candidate?.status || '').toLowerCase()) ||
    ['sent', 'replied', 'uncertain'].includes(String(candidate?.sequenceState?.status || '').toLowerCase())
  );
}
function suppressionSet(suppressions = []) {
  return new Set(suppressions.map(item => text(item?.value, 320).toLowerCase()).filter(Boolean));
}
function suppressed(candidate, suppressions) {
  const email = candidateEmail(candidate);
  const domain = candidateDomain(candidate);
  return Boolean((email && suppressions.has(email)) || (domain && suppressions.has(domain)));
}
function selectedSignals(candidate, signalsByProspect = new Map()) {
  const stored = Array.isArray(signalsByProspect) ? signalsByProspect : signalsByProspect.get?.(candidate.id) || [];
  const embedded = Array.isArray(candidate?.leadSignals) ? candidate.leadSignals : Array.isArray(candidate?.signals) ? candidate.signals : [];
  const seen = new Set();
  return [...stored, ...embedded].filter(signal => {
    if (!signal) return false;
    const key = signal.digest || signal.id || `${signal.type}:${signal.observedAt}:${signal.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeLeadQuery(input = {}) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const prompt = text(raw.prompt || raw.query || '', MAX_TEXT);
  const sources = unique(raw.sources).filter(item => SOURCE_SET.has(item));
  const signalTypes = unique(raw.signalTypes || raw.signals).filter(item => SIGNAL_SET.has(item));
  const query = {
    prompt,
    keywords: uniqueOriginal(raw.keywords),
    industries: uniqueOriginal(raw.industries || raw.industry),
    countries: unique(raw.countries || raw.country),
    cities: unique(raw.cities || raw.city),
    roles: uniqueOriginal(raw.roles || raw.jobTitles || raw.jobTitle),
    technologies: uniqueOriginal(raw.technologies || raw.tech),
    minEmployees: integer(raw.minEmployees, null, 0, 10_000_000),
    maxEmployees: integer(raw.maxEmployees, null, 0, 10_000_000),
    minRevenueUsd: integer(raw.minRevenueUsd, null, 0, 1_000_000_000_000),
    maxRevenueUsd: integer(raw.maxRevenueUsd, null, 0, 1_000_000_000_000),
    signalTypes,
    sources,
    minScore: integer(raw.minScore, 55, 0, 100),
    minEvidenceScore: integer(raw.minEvidenceScore, 10, 0, 30),
    minIntentScore: integer(raw.minIntentScore, 0, 0, 15),
    requireEvidence: raw.requireEvidence !== false,
    requireContact: raw.requireContact !== false,
    skipOwned: raw.skipOwned !== false,
    freshWithinDays: integer(raw.freshWithinDays, 180, 1, 3650),
    sort: SORTS.has(String(raw.sort || '').toLowerCase()) ? String(raw.sort).toLowerCase() : 'score',
    limit: integer(raw.limit, 50, 1, 250)
  };
  if (query.minEmployees !== null && query.maxEmployees !== null && query.minEmployees > query.maxEmployees) {
    [query.minEmployees, query.maxEmployees] = [query.maxEmployees, query.minEmployees];
  }
  if (query.minRevenueUsd !== null && query.maxRevenueUsd !== null && query.minRevenueUsd > query.maxRevenueUsd) {
    [query.minRevenueUsd, query.maxRevenueUsd] = [query.maxRevenueUsd, query.minRevenueUsd];
  }
  return query;
}

export function normalizeLeadSignal(input = {}, { now = new Date() } = {}) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const type = text(raw.type, 60).toLowerCase();
  if (!SIGNAL_SET.has(type)) throw new Error(`Unsupported lead signal type: ${type || 'empty'}`);
  const sourceType = text(raw.sourceType || 'owner_import', 60).toLowerCase();
  if (!SOURCE_SET.has(sourceType)) throw new Error(`Unsupported lead signal source: ${sourceType}`);
  const sourceUrl = text(raw.sourceUrl, 500);
  if (sourceUrl && !validHttps(sourceUrl)) throw new Error('Lead signal sourceUrl must be an HTTPS URL');
  const observedAt = iso(raw.observedAt, now);
  const signal = {
    id: text(raw.id, 120), prospectId: text(raw.prospectId, 120), type,
    title: text(raw.title, 240), excerpt: text(raw.excerpt || raw.description, MAX_TEXT),
    sourceUrl, sourceType, sourceLicense: text(raw.sourceLicense, 240),
    observedAt, expiresAt: iso(raw.expiresAt, new Date(Date.parse(observedAt) + 90 * 86400000)),
    confidence: Number(clamp01(raw.confidence, 0.5).toFixed(3)),
    createdAt: iso(raw.createdAt, now), updatedAt: iso(raw.updatedAt, now)
  };
  if (!signal.prospectId) throw new Error('Lead signal prospectId is required');
  if (signal.title.length < 3 || signal.excerpt.length < 8) throw new Error('Lead signal needs a material title and excerpt');
  const digestInput = { ...signal };
  delete digestInput.id;
  delete digestInput.createdAt;
  delete digestInput.updatedAt;
  signal.digest = sha256(digestInput);
  if (!signal.id) signal.id = `leadsignal_${signal.digest.slice(0, 24)}`;
  return signal;
}

function matchArray(candidateTextValue, values) {
  if (!values.length) return { matched: false, hits: [] };
  const hits = values.filter(value => candidateTextValue.includes(String(value).toLowerCase()));
  return { matched: hits.length > 0, hits };
}

function fitScore(candidate, query) {
  const haystack = candidateText(candidate);
  const promptHits = tokens(query.prompt).filter(token => haystack.includes(token));
  const keywordHits = query.keywords.filter(value => haystack.includes(value.toLowerCase()));
  const industry = matchArray(haystack, query.industries.map(value => value.toLowerCase()));
  const country = matchArray(String(candidate?.country || '').toLowerCase(), query.countries);
  const city = matchArray(String(candidate?.city || '').toLowerCase(), query.cities);
  const role = matchArray(haystack, query.roles.map(value => value.toLowerCase()));
  const technology = matchArray(haystack, query.technologies.map(value => value.toLowerCase()));
  let score = query.prompt || query.keywords.length || query.industries.length || query.countries.length || query.cities.length || query.roles.length || query.technologies.length ? 0 : 18;
  const reasons = [];
  if (promptHits.length) { score += Math.min(10, promptHits.length * 2); reasons.push(`prompt match: ${promptHits.slice(0, 4).join(', ')}`); }
  if (keywordHits.length) { score += Math.min(8, keywordHits.length * 2); reasons.push(`keyword match: ${keywordHits.slice(0, 4).join(', ')}`); }
  if (industry.matched) { score += 8; reasons.push(`industry: ${industry.hits.slice(0, 3).join(', ')}`); }
  if (country.matched) { score += 5; reasons.push(`country: ${country.hits.slice(0, 2).join(', ')}`); }
  if (city.matched) { score += 3; reasons.push(`city: ${city.hits.slice(0, 2).join(', ')}`); }
  if (role.matched) { score += 4; reasons.push(`role: ${role.hits.slice(0, 3).join(', ')}`); }
  if (technology.matched) { score += 4; reasons.push(`technology: ${technology.hits.slice(0, 3).join(', ')}`); }
  const employees = Number(candidate?.employees || candidate?.employeeCount || candidate?.firmographics?.employees || 0);
  if (query.minEmployees !== null && employees >= query.minEmployees) { score += 2; reasons.push('employee minimum met'); }
  if (query.maxEmployees !== null && employees > 0 && employees <= query.maxEmployees) { score += 2; reasons.push('employee maximum met'); }
  const revenue = Number(candidate?.revenueUsd || candidate?.firmographics?.revenueUsd || 0);
  if (query.minRevenueUsd !== null && revenue >= query.minRevenueUsd) { score += 2; reasons.push('revenue minimum met'); }
  if (query.maxRevenueUsd !== null && revenue > 0 && revenue <= query.maxRevenueUsd) { score += 2; reasons.push('revenue maximum met'); }
  return { score: Math.min(40, score), reasons, hits: { promptHits, keywordHits, industry: industry.hits, country: country.hits, city: city.hits, role: role.hits, technology: technology.hits } };
}

function evidenceScore(candidate, now) {
  const issue = candidate?.issue || {};
  const audit = Array.isArray(candidate?.audit) ? candidate.audit : [];
  const base = number(candidate?.score?.total ?? candidate?.evidenceScore, 0, 0, 100);
  const hasUrl = Boolean(issue.evidenceUrl || issue.sourceUrl || candidate?.sourceUrl || candidate?.website);
  const hasExcerpt = String(issue.evidenceExcerpt || issue.excerpt || candidate?.notes || '').trim().length >= 16;
  const observedAt = candidate?.completedAt || issue.observedAt || candidate?.updatedAt || candidate?.createdAt;
  const ageDays = daysSince(observedAt, now);
  const freshness = recencyFactor(observedAt, now, 365);
  const score = Math.min(30, Math.round(base * 0.18) + (hasUrl ? 4 : 0) + (hasExcerpt ? 5 : 0) + (audit.length ? 3 : 0) + Math.round(freshness * 4));
  const reasons = [];
  if (hasUrl) reasons.push('source URL retained');
  if (hasExcerpt) reasons.push('material excerpt retained');
  if (audit.length) reasons.push(`${audit.length} audit observation(s)`);
  if (freshness >= 0.5) reasons.push('evidence is fresh');
  return { score, reasons, freshness: Math.round(freshness * 100), ageDays, sourceUrl: issue.evidenceUrl || issue.sourceUrl || candidate?.sourceUrl || candidate?.website || '', excerpt: issue.evidenceExcerpt || issue.excerpt || candidate?.notes || '' };
}

function intentScore(signals, query, now) {
  const relevant = signals.filter(signal => !query.signalTypes.length || query.signalTypes.includes(String(signal.type || '').toLowerCase()));
  const stack = buildLeadSignalStack({ signals: relevant, now });
  const score = Math.min(15, Math.round(stack.score / 2));
  return { score, stack, signals: stack.whyNow.map(item => ({ ...item, contribution: Math.min(7, Math.round(item.contribution)) })) };
}

function contactScore(candidate) {
  const email = candidateEmail(candidate);
  if (!email) return { score: 0, label: 'no selected business email' };
  const verified = String(candidate?.contact?.verified || candidate?.contact?.verificationStatus || '').toLowerCase();
  if (['valid', 'verified', 'deliverable'].includes(verified)) return { score: 10, label: 'verified business email' };
  if (['invalid', 'undeliverable', 'bounced'].includes(verified)) return { score: 0, label: 'contact marked invalid' };
  return { score: 6, label: 'business email selected; verification status unknown' };
}

function signalTrust(signal) {
  return SOURCE_TRUST[String(signal?.sourceType || 'local_prospect').toLowerCase()] || 0.6;
}

function signalContribution(signal, now) {
  const type = String(signal?.type || 'manual').toLowerCase();
  const age = daysSince(signal?.observedAt, now);
  const recency = recencyFactor(signal?.observedAt, now, type === 'first_party_inquiry' || type === 'form_submission' ? 90 : 365);
  const expiry = signal?.expiresAt && Date.parse(signal.expiresAt) <= new Date(now).getTime() ? 0 : 1;
  const confidence = clamp01(signal?.confidence, 0.5);
  const contribution = Math.round((SIGNAL_WEIGHTS[type] || 2) * confidence * recency * signalTrust(signal) * expiry * 10) / 10;
  return { signal, type, ageDays: Number.isFinite(age) ? Math.round(age * 10) / 10 : null, recency, contribution };
}

export function buildLeadSignalStack({ signals = [], now = new Date() } = {}) {
  const ranked = (signals || [])
    .filter(Boolean)
    .map(signal => signalContribution(signal, now))
    .filter(item => item.contribution > 0)
    .sort((a, b) => b.contribution - a.contribution || String(b.signal.observedAt || '').localeCompare(String(a.signal.observedAt || '')));
  const types = [...new Set(ranked.map(item => item.type))];
  const sourceTypes = [...new Set(ranked.map(item => String(item.signal.sourceType || 'local_prospect')))].sort();
  const weightedSignals = ranked.reduce((sum, item) => sum + item.contribution, 0);
  const diversityBonus = Math.min(6, Math.max(0, types.length - 1) * 1.5);
  const score = Math.min(30, Math.round((weightedSignals + diversityBonus) * 10) / 10);
  const hasDecisionSignal = types.some(type => ['first_party_inquiry', 'form_submission', 'product_usage'].includes(type));
  const hasActiveResearch = types.some(type => ['buying_intent', 'competitor_research', 'website_visit', 'funding', 'acquisition', 'job_listing', 'product_launch', 'champion_job_change'].includes(type));
  const stage = hasDecisionSignal ? 'decision' : score >= 14 || (hasActiveResearch && types.length >= 2) ? 'active-research' : score >= 5 ? 'research' : score > 0 ? 'awareness' : 'unknown';
  const whyNow = ranked.slice(0, 3).map(item => ({
    type: item.type, title: item.signal.title, excerpt: item.signal.excerpt,
    sourceUrl: item.signal.sourceUrl || '', sourceType: item.signal.sourceType || 'local_prospect',
    observedAt: item.signal.observedAt, confidence: item.signal.confidence, contribution: item.contribution,
    recency: Math.round(item.recency * 100)
  }));
  return {
    score, stage, signalCount: ranked.length, distinctSignalTypes: types.length,
    signalTypes: types, sourceTypes, diversityBonus: Math.round(diversityBonus * 10) / 10,
    stacked: types.length >= 2, whyNow, providerCalls: 0, externalEffects: 0
  };
}

export function scoreLeadCandidate({ candidate = {}, query: rawQuery = {}, signals = [], suppressions = [], now = new Date() } = {}) {
  const query = normalizeLeadQuery(rawQuery);
  const suppressionValues = suppressions instanceof Set ? suppressions : suppressionSet(suppressions);
  const owned = isOwned(candidate);
  const isBlockedBySuppression = suppressed(candidate, suppressionValues);
  const fit = fitScore(candidate, query);
  const evidence = evidenceScore(candidate, now);
  const intent = intentScore(signals, query, now);
  const contact = contactScore(candidate);
  const safety = isBlockedBySuppression ? 0 : owned && query.skipOwned ? 0 : 5;
  const blocks = [];
  if (isBlockedBySuppression) blocks.push('suppressed');
  if (owned && query.skipOwned) blocks.push('already-owned-or-contacted');
  if (query.requireEvidence && evidence.score < query.minEvidenceScore) blocks.push('evidence-below-threshold');
  if (query.requireContact && !candidateEmail(candidate)) blocks.push('no-selected-business-contact');
  if (query.minIntentScore > intent.score) blocks.push('intent-below-threshold');
  if (query.requireEvidence && query.freshWithinDays < 3650 && evidence.ageDays > query.freshWithinDays) blocks.push('evidence-stale');
  const total = Math.min(100, fit.score + evidence.score + intent.score + contact.score + safety);
  if (total < query.minScore) blocks.push('score-below-threshold');
  return {
    total, fit: fit.score, evidence: evidence.score, intent: intent.score,
    contactability: contact.score, safety, eligible: blocks.length === 0,
    blocks, reasons: [...fit.reasons, ...evidence.reasons, ...intent.signals.map(item => `${item.type}: ${item.title}`), contact.label],
    freshness: evidence.freshness, evidenceSourceUrl: evidence.sourceUrl,
    evidenceExcerpt: evidence.excerpt, intentSignals: intent.signals, signalStack: intent.stack,
    query
  };
}

function matchesQuery(candidate, query) {
  const haystack = candidateText(candidate);
  const values = [query.prompt, ...query.keywords, ...query.industries, ...query.roles, ...query.technologies].filter(Boolean);
  if (values.length && !values.some(value => tokens(value).some(token => haystack.includes(token)))) return false;
  if (query.countries.length && !query.countries.includes(String(candidate?.country || '').toLowerCase())) return false;
  if (query.cities.length && !query.cities.includes(String(candidate?.city || '').toLowerCase())) return false;
  if (query.sources.length && !query.sources.includes(String(candidate?.source || candidate?.sourceType || 'local_prospect').toLowerCase())) return false;
  if (query.minEmployees !== null && Number(candidate?.employees || candidate?.employeeCount || candidate?.firmographics?.employees || 0) < query.minEmployees) return false;
  if (query.maxEmployees !== null && Number(candidate?.employees || candidate?.employeeCount || candidate?.firmographics?.employees || 0) > query.maxEmployees) return false;
  if (query.minRevenueUsd !== null && Number(candidate?.revenueUsd || candidate?.firmographics?.revenueUsd || 0) < query.minRevenueUsd) return false;
  if (query.maxRevenueUsd !== null && Number(candidate?.revenueUsd || candidate?.firmographics?.revenueUsd || 0) > query.maxRevenueUsd) return false;
  return true;
}

export function searchLocalLeadCorpus({ prospects = [], signals = [], suppressions = [], query: rawQuery = {}, limit, now = new Date() } = {}) {
  const query = normalizeLeadQuery({ ...rawQuery, ...(limit === undefined ? {} : { limit }) });
  const byProspect = new Map();
  for (const signal of signals || []) {
    if (!signal?.prospectId) continue;
    const list = byProspect.get(signal.prospectId) || [];
    list.push(signal);
    byProspect.set(signal.prospectId, list);
  }
  const suppressionValues = suppressionSet(suppressions);
  const excluded = {};
  const rows = [];
  const dedupe = new Set();
  for (const candidate of prospects) {
    if (!matchesQuery(candidate, query)) { excluded.query_mismatch = (excluded.query_mismatch || 0) + 1; continue; }
    const signalsForCandidate = selectedSignals(candidate, byProspect);
    const score = scoreLeadCandidate({ candidate, query, signals: signalsForCandidate, suppressions: suppressionValues, now });
    if (score.blocks.includes('suppressed')) { excluded.suppressed = (excluded.suppressed || 0) + 1; continue; }
    if (query.skipOwned && score.blocks.includes('already-owned-or-contacted')) { excluded.already_owned = (excluded.already_owned || 0) + 1; continue; }
    if (query.requireEvidence && score.blocks.includes('evidence-below-threshold')) { excluded.evidence = (excluded.evidence || 0) + 1; continue; }
    if (query.requireContact && score.blocks.includes('no-selected-business-contact')) { excluded.contact = (excluded.contact || 0) + 1; continue; }
    const email = candidateEmail(candidate);
    const domain = candidateDomain(candidate);
    const keys = [email && `email:${email}`, domain && `domain:${domain}`].filter(Boolean);
    if (!keys.length) keys.push(`id:${candidate.id}`);
    if (keys.some(key => dedupe.has(key))) { excluded.duplicate = (excluded.duplicate || 0) + 1; continue; }
    keys.forEach(key => dedupe.add(key));
    rows.push({
      id: candidate.id, company: text(candidate.company || candidate.name, 180), domain,
      website: text(candidate.website, 500), country: text(candidate.country, 80), city: text(candidate.city, 80),
      niche: text(candidate.niche || candidate.industry, 120), contact: candidate.contact || null,
      source: text(candidate.source || 'local_prospect', 80), sourceUrl: text(candidate.sourceUrl, 500),
      issue: candidate.issue || null, status: candidate.status || 'unknown', tags: candidate.tags || [],
      accountKey: candidateDomain(candidate) || candidate.id,
      score, signals: signalsForCandidate.slice(0, 8), signalStack: score.signalStack,
      nextAction: score.eligible ? (score.signalStack?.stage === 'decision' ? 'Owner review → respond to first-party intent' : 'Owner review → build enrichment plan or sequence handoff') : `Resolve: ${score.blocks.join(', ')}`
    });
  }
  rows.sort((a, b) => {
    const primary = query.sort === 'intent' ? b.score.intent - a.score.intent : query.sort === 'fit' ? b.score.fit - a.score.fit : query.sort === 'freshness' ? b.score.freshness - a.score.freshness : b.score.total - a.score.total;
    return primary || b.score.total - a.score.total || a.company.localeCompare(b.company);
  });
  const results = rows.slice(0, query.limit);
  return {
    version: LEAD_GENERATION_VERSION, query, results, returned: results.length,
    totalScanned: prospects.length, totalMatched: rows.length, excluded,
    policy: LEAD_GENERATION_POLICY, providerCalls: 0, externalEffects: 0
  };
}

export function buildLeadAccountIntelligence({ prospects = [], signals = [], suppressions = [], query: rawQuery = {}, limit = 25, now = new Date() } = {}) {
  const query = normalizeLeadQuery({ ...rawQuery, limit: Math.min(250, limit) });
  const byProspect = new Map();
  for (const signal of signals || []) {
    if (!signal?.prospectId) continue;
    const list = byProspect.get(signal.prospectId) || [];
    list.push(signal);
    byProspect.set(signal.prospectId, list);
  }
  const groups = new Map();
  for (const prospect of prospects || []) {
    const key = candidateDomain(prospect) || `prospect:${prospect.id}`;
    const group = groups.get(key) || { key, domain: candidateDomain(prospect), prospects: [], signals: [] };
    const candidateSignals = selectedSignals(prospect, byProspect);
    const score = scoreLeadCandidate({ candidate: prospect, query, signals: candidateSignals, suppressions, now });
    group.prospects.push({ prospect, score });
    group.signals.push(...candidateSignals);
    groups.set(key, group);
  }
  const rows = [...groups.values()].map(group => {
    const uniqueSignals = [];
    const seen = new Set();
    for (const signal of group.signals) {
      const key = signal.digest || signal.id || `${signal.type}:${signal.observedAt}:${signal.title}`;
      if (!seen.has(key)) { seen.add(key); uniqueSignals.push(signal); }
    }
    const stack = buildLeadSignalStack({ signals: uniqueSignals, now });
    const best = [...group.prospects].sort((a, b) => b.score.total - a.score.total)[0];
    const verifiedContacts = group.prospects.filter(item => ['valid', 'verified', 'deliverable'].includes(String(item.prospect?.contact?.verified || item.prospect?.contact?.verificationStatus || '').toLowerCase())).length;
    const contactCoverage = Math.min(8, verifiedContacts * 2);
    const accountScore = Math.min(100, Math.round((best?.score.fit || 0) + Math.min(30, stack.score) + Math.min(30, best?.score.evidence || 0) + contactCoverage + (group.prospects.length > 1 ? 3 : 0)));
    const personas = [...new Set(group.prospects.map(item => item.prospect?.contact?.title || item.prospect?.contactName).filter(Boolean))].slice(0, 8);
    return {
      accountKey: group.key, domain: group.domain, company: best?.prospect?.company || group.domain || 'Unknown account',
      accountScore, buyingStage: stack.stage, stackedSignals: stack.stacked,
      contacts: group.prospects.length, verifiedContacts, personas,
      signalStack: stack, bestLead: best ? { id: best.prospect.id, score: best.score.total, email: candidateEmail(best.prospect) } : null,
      eligibleLeads: group.prospects.filter(item => item.score.eligible).length,
      nextAction: stack.stage === 'decision' ? 'Review first-party intent immediately' : stack.stacked ? 'Review stacked signals and select the right persona' : 'Add a second independent signal or improve evidence',
      providerCalls: 0, externalEffects: 0
    };
  }).sort((a, b) => b.accountScore - a.accountScore || a.company.localeCompare(b.company));
  return {
    version: LEAD_GENERATION_VERSION, query, accounts: rows.slice(0, Math.max(1, Math.min(100, limit))),
    totalAccounts: rows.length, totalProspects: prospects.length,
    policy: LEAD_GENERATION_POLICY, providerCalls: 0, externalEffects: 0
  };
}

export function buildLeadSearchRecord({ name = '', query = {}, owner = 'owner', now = new Date() } = {}) {
  const normalized = normalizeLeadQuery(query);
  const createdAt = iso(now, now);
  return {
    id: `leadsearch_${sha256({ name: text(name, 180), query: normalized, owner, createdAt }).slice(0, 20)}`,
    name: text(name || normalized.prompt || 'Saved lead search', 180), owner: text(owner, 120),
    query: normalized, status: 'saved', createdAt, updatedAt: createdAt
  };
}

export function buildEnrichmentPlan({ prospect = {}, fields = ENRICHMENT_FIELDS, providers = [], now = new Date() } = {}) {
  const requestedFields = unique(fields).filter(field => FIELD_SET.has(field));
  const configured = new Set(unique(providers));
  const email = candidateEmail(prospect);
  const domain = candidateDomain(prospect);
  const localAvailable = new Set(['company_profile', 'website_evidence']);
  const defaultProviders = [
    { id: 'local-evidence', label: 'UberBond local evidence', kind: 'local', fields: ['company_profile', 'website_evidence', 'technology'], status: 'available' },
    { id: 'owner-import', label: 'Owner-supplied or licensed import', kind: 'owner', fields: ['company_profile', 'work_email', 'email_verification', 'phone', 'technology', 'funding', 'news', 'job_change'], status: 'available' },
    { id: 'apollo', label: 'Apollo BYOK adapter', kind: 'byok', fields: ['company_profile', 'work_email', 'email_verification', 'phone', 'technology', 'funding', 'news'], status: configured.has('apollo') ? 'configured-plan-only' : 'not-configured' },
    { id: 'clay', label: 'Clay BYOK adapter', kind: 'byok', fields: ['company_profile', 'work_email', 'email_verification', 'phone', 'technology', 'funding', 'news', 'job_change'], status: configured.has('clay') ? 'configured-plan-only' : 'not-configured' },
    { id: 'instantly-supersearch', label: 'Instantly SuperSearch BYOK/export adapter', kind: 'byok', fields: ['company_profile', 'work_email', 'email_verification', 'technology', 'funding', 'news'], status: configured.has('instantly-supersearch') ? 'configured-plan-only' : 'not-configured' },
    { id: 'hunter', label: 'Hunter BYOK adapter', kind: 'byok', fields: ['work_email', 'email_verification'], status: configured.has('hunter') ? 'configured-plan-only' : 'not-configured' }
  ];
  const steps = requestedFields.map(field => {
    const providersForField = defaultProviders.filter(provider => provider.fields.includes(field));
    const existing = field === 'work_email' && email ? { status: 'present', value: email } : null;
    return {
      field, existing,
      waterfall: providersForField.map((provider, index) => ({
        order: index + 1, provider: provider.id, label: provider.label, kind: provider.kind,
        status: provider.status, action: provider.status === 'available' ? 'read-local-only' : 'awaiting-owner-BYOK-configuration',
        requiresProviderCall: provider.kind === 'byok'
      })),
      stopRule: field === 'work_email' ? 'Stop only on a provider-returned verified business email; never infer a private address.' : 'Stop on first source-backed non-empty result that passes field validation.'
    };
  });
  return {
    version: LEAD_GENERATION_VERSION, id: `enrich_${sha256({ prospectId: prospect.id, requestedFields, createdAt: iso(now, now) }).slice(0, 20)}`,
    prospectId: text(prospect.id, 120), company: text(prospect.company, 180), domain,
    requestedFields, steps, status: 'planned', createdAt: iso(now, now), updatedAt: iso(now, now),
    policy: LEAD_GENERATION_POLICY, providerCalls: 0, externalEffects: 0,
    summary: {
      localFields: steps.filter(step => step.waterfall.some(item => item.status === 'available')).length,
      byokFields: steps.filter(step => step.waterfall.some(item => item.kind === 'byok')).length,
      existingEmail: Boolean(email),
      exactDomain: Boolean(domain)
    }
  };
}

export function buildLeadGenerationWorkspace({ prospects = [], leadLists = [], searches = [], signals = [], enrichmentRuns = [], suppressions = [], now = new Date() } = {}) {
  const search = searchLocalLeadCorpus({ prospects, signals, suppressions, query: { limit: 10, minScore: 0, minEvidenceScore: 0, requireEvidence: false, requireContact: false }, now });
  const eligible = searchLocalLeadCorpus({ prospects, signals, suppressions, query: { limit: 250 }, now });
  const accounts = buildLeadAccountIntelligence({ prospects, signals, suppressions, query: { minScore: 0, minEvidenceScore: 0, requireEvidence: false, requireContact: false, skipOwned: false }, limit: 10, now });
  const sourceCounts = {};
  for (const prospect of prospects) {
    const source = text(prospect.source || 'local_prospect', 80);
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;
  }
  return {
    version: LEAD_GENERATION_VERSION,
    stats: {
      totalRecords: prospects.length, eligibleRecords: eligible.totalMatched,
      researchedRecords: prospects.filter(item => item.issue || item.audit || item.completedAt).length,
      withBusinessEmail: prospects.filter(item => candidateEmail(item)).length,
      savedSearches: searches.length, leadLists: leadLists.length,
      activeSignals: signals.filter(item => Date.parse(item.expiresAt || '') > new Date(now).getTime()).length,
      enrichmentRuns: enrichmentRuns.length, accountCount: accounts.totalAccounts,
      stackedAccounts: accounts.accounts.filter(item => item.stackedSignals).length, sourceCounts
    },
    topLeads: search.results,
    topAccounts: accounts.accounts,
    recentSignals: [...signals].sort((a, b) => String(b.observedAt || '').localeCompare(String(a.observedAt || ''))).slice(0, 8),
    recentSearches: [...searches].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).slice(0, 8),
    recentEnrichmentRuns: [...enrichmentRuns].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 8),
    providerContract: {
      providers: ['apollo', 'clay', 'instantly-supersearch', 'hunter'],
      mode: 'BYOK / owner-configured / plan-only',
      noProviderCalls: true,
      noLinkedInScraping: true
    },
    policy: LEAD_GENERATION_POLICY,
    providerCalls: 0, externalEffects: 0
  };
}

export function buildLeadHandoffPlan({ prospects = [], signals = [], suppressions = [], campaign = null, query = {}, now = new Date() } = {}) {
  const result = searchLocalLeadCorpus({ prospects, signals, suppressions, query: { ...query, limit: Math.min(250, query.limit || 250) }, now });
  const rows = result.results.map(row => ({
    prospectId: row.id, company: row.company, eligible: row.score.eligible,
    score: row.score.total, reasons: row.score.reasons, blocks: row.score.blocks,
    campaignId: campaign?.id || '', action: row.score.eligible ? 'owner-plan-ready' : 'blocked-until-resolved'
  }));
  return {
    campaign: campaign ? { id: campaign.id, name: campaign.name } : null,
    rows, counts: { eligible: rows.filter(row => row.eligible).length, blocked: rows.filter(row => !row.eligible).length, total: rows.length },
    policy: LEAD_GENERATION_POLICY, providerCalls: 0, externalEffects: 0
  };
}
