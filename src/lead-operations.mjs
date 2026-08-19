import { sha256 } from './omnia-v9/canonical.mjs';
import { normalizeDomain } from './utils.mjs';
import {
  ENRICHMENT_FIELDS,
  LEAD_GENERATION_POLICY,
  LEAD_SIGNAL_TYPES,
  buildLeadAccountIntelligence,
  normalizeLeadQuery,
  scoreLeadCandidate,
  searchLocalLeadCorpus
} from './lead-generation.mjs';

export const LEAD_OPERATIONS_VERSION = 'uberbond.lead-operations.v2';

export const LEAD_OPERATIONS_POLICY = Object.freeze({
  ...LEAD_GENERATION_POLICY,
  dataBoundary: 'Local, owner-supplied, first-party, licensed, or provider-returned records only.',
  provenanceRule: 'Every material field must retain source type, source URL when available, observed time, authority note and confidence.',
  conflictRule: 'Conflicting values are visible and blocked from high-confidence handoff until an owner resolves them.',
  providerRule: 'External providers are BYOK and budget-gated. A preflight can plan calls but never performs one.',
  identityRule: 'Identity is resolved to a canonical account key; person-level resolution stays exact and provider-bound.',
  aiRule: 'AI may propose a research field or next action only when the result remains cited or explicitly unknown.'
});

const MAX_TEXT = 500;
const FIELD_SET = new Set(ENRICHMENT_FIELDS);
const SIGNAL_SET = new Set(LEAD_SIGNAL_TYPES);
const SOURCE_TRUST = Object.freeze({
  first_party_export: 1,
  owner_import: 1,
  licensed_export: 0.95,
  provider_api: 0.85,
  public_website: 0.8,
  csv_import: 0.7,
  local_prospect: 0.65,
  owner: 1,
  local: 0.8
});

const PROVIDER_FIELDS = Object.freeze({
  'local-evidence': ['company_profile', 'website_evidence', 'technology'],
  'owner-import': [...ENRICHMENT_FIELDS],
  apollo: ['company_profile', 'work_email', 'email_verification', 'phone', 'technology', 'funding', 'news'],
  clay: [...ENRICHMENT_FIELDS],
  'instantly-supersearch': ['company_profile', 'work_email', 'email_verification', 'technology', 'funding', 'news'],
  hunter: ['work_email', 'email_verification'],
  zerobounce: ['email_verification'],
  dropcontact: ['company_profile', 'work_email', 'email_verification'],
  cognism: ['company_profile', 'work_email', 'email_verification', 'phone'],
  'common-room': ['company_profile', 'job_change', 'funding', 'news', 'website_evidence'],
  '6sense': ['company_profile', 'funding', 'news', 'job_change'],
  hubspot: ['company_profile', 'work_email', 'news', 'website_evidence']
});

export const LEAD_PROVIDER_CATALOG = Object.freeze([
  { id: 'local-evidence', label: 'UberBond local evidence', kind: 'local', external: false, status: 'available', fields: PROVIDER_FIELDS['local-evidence'], pattern: 'evidence and website QA' },
  { id: 'owner-import', label: 'Owner / licensed import', kind: 'owner', external: false, status: 'available', fields: PROVIDER_FIELDS['owner-import'], pattern: 'exact source-controlled intake' },
  { id: 'apollo', label: 'Apollo BYOK', kind: 'database', external: true, status: 'not-configured', fields: PROVIDER_FIELDS.apollo, pattern: 'target builder and B2B coverage' },
  { id: 'clay', label: 'Clay BYOK', kind: 'orchestration', external: true, status: 'not-configured', fields: PROVIDER_FIELDS.clay, pattern: 'field waterfalls and custom research' },
  { id: 'instantly-supersearch', label: 'Instantly SuperSearch BYOK/export', kind: 'database', external: true, status: 'not-configured', fields: PROVIDER_FIELDS['instantly-supersearch'], pattern: 'search to campaign handoff' },
  { id: 'hunter', label: 'Hunter BYOK', kind: 'verification', external: true, status: 'not-configured', fields: PROVIDER_FIELDS.hunter, pattern: 'source-backed professional email discovery' },
  { id: 'zerobounce', label: 'ZeroBounce BYOK', kind: 'verification', external: true, status: 'not-configured', fields: PROVIDER_FIELDS.zerobounce, pattern: 'bulk email risk validation' },
  { id: 'dropcontact', label: 'Dropcontact BYOK', kind: 'enrichment', external: true, status: 'not-configured', fields: PROVIDER_FIELDS.dropcontact, pattern: 'database-minimizing enrichment' },
  { id: 'cognism', label: 'Cognism BYOK', kind: 'database', external: true, status: 'not-configured', fields: PROVIDER_FIELDS.cognism, pattern: 'phone and EMEA coverage' },
  { id: 'common-room', label: 'Common Room BYOK', kind: 'signals', external: true, status: 'not-configured', fields: PROVIDER_FIELDS['common-room'], pattern: 'signal fusion and identity context' },
  { id: '6sense', label: '6sense BYOK', kind: 'intent', external: true, status: 'not-configured', fields: PROVIDER_FIELDS['6sense'], pattern: 'predictive stage and buying groups' },
  { id: 'hubspot', label: 'HubSpot BYOK', kind: 'inbound', external: true, status: 'not-configured', fields: PROVIDER_FIELDS.hubspot, pattern: 'capture, scoring and routing' }
]);

const PROVIDER_BY_ID = new Map(LEAD_PROVIDER_CATALOG.map(provider => [provider.id, provider]));
const DEFAULT_PROVIDER_IDS = ['local-evidence', 'owner-import', 'apollo', 'clay', 'instantly-supersearch', 'hunter', 'zerobounce'];

const ROLE_GROUPS = Object.freeze([
  { key: 'economic_buyer', label: 'Economic buyer', terms: ['founder', 'owner', 'ceo', 'chief executive', 'president', 'partner', 'principal', 'director'] },
  { key: 'champion', label: 'Champion / marketing owner', terms: ['marketing', 'growth', 'business development', 'sales', 'commercial', 'brand'] },
  { key: 'operator', label: 'Operational owner', terms: ['operations', 'project manager', 'client success', 'account manager', 'office manager', 'administrator'] },
  { key: 'technical', label: 'Technical evaluator', terms: ['developer', 'engineering', 'technical', 'cto', 'it ', 'webmaster', 'product'] },
  { key: 'user', label: 'Daily user / subject-matter owner', terms: ['qa', 'quality', 'designer', 'content', 'analyst', 'practitioner', 'manager'] }
]);
const ROLE_BY_KEY = new Map(ROLE_GROUPS.map(role => [role.key, role]));

function text(value, max = MAX_TEXT) { return String(value ?? '').trim().slice(0, max); }
function unique(values, max = 20) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(value => text(value, 160)).filter(Boolean))].slice(0, max);
}
function lowerUnique(values, max = 20) { return unique(values, max).map(value => value.toLowerCase()); }
function number(value, fallback, min, max) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
function integer(value, fallback, min, max) { return Math.round(number(value, fallback, min, max)); }
function iso(value, fallback = new Date()) {
  const parsed = new Date(value || fallback);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date(fallback).toISOString();
}
function daysSince(value, now = new Date()) {
  const stamp = Date.parse(value || '');
  if (!Number.isFinite(stamp)) return Infinity;
  return Math.max(0, (new Date(now).getTime() - stamp) / 86400000);
}
function freshness(value, now, maxDays = 365) {
  const age = daysSince(value, now);
  return Number.isFinite(age) ? Math.max(0, Math.min(1, 1 - age / Math.max(1, maxDays))) : 0;
}
function emailOf(prospect) { return String(prospect?.contact?.email || prospect?.email || '').trim().toLowerCase(); }
function domainOf(prospect) { return normalizeDomain(prospect?.domain || prospect?.website || prospect?.organizationDomain || ''); }
function candidateSource(prospect) { return text(prospect?.source || prospect?.contact?.source || 'local_prospect', 80).toLowerCase(); }
function sourceUrlOf(prospect) { return text(prospect?.sourceUrl || prospect?.contact?.sourceUrl || prospect?.website || '', 600); }
function observedAtOf(prospect, fallback = new Date()) { return iso(prospect?.updatedAt || prospect?.completedAt || prospect?.createdAt, fallback); }
function trustOf(sourceType) { return SOURCE_TRUST[String(sourceType || '').toLowerCase()] || 0.6; }
function isVerified(contact) { return ['valid', 'verified', 'deliverable'].includes(String(contact?.verified || contact?.verificationStatus || '').toLowerCase()); }
function isOwned(prospect) {
  return Boolean(prospect?.priorContacted || prospect?.contactedAt || prospect?.repliedAt || ['sent', 'replied', 'send-uncertain', 'suppressed'].includes(String(prospect?.status || '').toLowerCase()));
}
function suppressionValues(suppressions = []) { return new Set((suppressions || []).map(item => text(item?.value, 320).toLowerCase()).filter(Boolean)); }
function suppressed(prospect, suppressions) {
  const email = emailOf(prospect);
  const domain = domainOf(prospect);
  return Boolean((email && suppressions.has(email)) || (domain && suppressions.has(domain)));
}
function tokenSet(value) {
  return new Set(String(value || '').toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length >= 3));
}
function overlap(left, right) {
  const a = left instanceof Set ? left : tokenSet(left);
  const b = right instanceof Set ? right : tokenSet(right);
  let count = 0;
  for (const value of a) if (b.has(value)) count += 1;
  return count;
}
function roleGroup(value) {
  const haystack = String(value || '').toLowerCase();
  return ROLE_GROUPS.find(role => role.terms.some(term => haystack.includes(term)))?.key || '';
}
function sourceKind(value) {
  const normalized = String(value || '').toLowerCase();
  return PROVIDER_BY_ID.has(normalized) ? PROVIDER_BY_ID.get(normalized).kind : normalized || 'unknown';
}

export function normalizeTargetProfile(input = {}) {
  const raw = input?.profile && typeof input.profile === 'object' ? input.profile : input;
  const querySource = raw?.query && typeof raw.query === 'object' ? raw.query : raw;
  const query = normalizeLeadQuery(querySource || {});
  const requiredPersonas = unique(raw.requiredPersonas || raw.personas || query.roles, 12);
  const requiredSignalTypes = lowerUnique(raw.requiredSignalTypes || raw.signalTypes, 16).filter(type => SIGNAL_SET.has(type));
  const requiredFields = lowerUnique(raw.requiredFields || ['company_profile', 'website_evidence', 'work_email', 'email_verification'], 12).filter(field => FIELD_SET.has(field));
  return {
    id: text(raw.id, 120),
    name: text(raw.name || query.prompt || 'Website QA target profile', 180),
    query,
    requiredPersonas,
    requiredSignalTypes,
    requiredFields: requiredFields.length ? requiredFields : ['company_profile', 'website_evidence', 'work_email', 'email_verification'],
    targetAccounts: integer(raw.targetAccounts, 25, 1, 100000),
    targetLeads: integer(raw.targetLeads, 50, 1, 100000),
    minStackedSignals: integer(raw.minStackedSignals, 2, 1, 10),
    freshWithinDays: integer(raw.freshWithinDays || query.freshWithinDays, 180, 1, 3650),
    segmentBy: lowerUnique(raw.segmentBy || ['country', 'industry'], 4),
    owner: text(raw.owner || 'owner', 120),
    status: text(raw.status || 'draft', 40).toLowerCase()
  };
}

export function buildTargetProfileRecord({ name = '', profile = {}, owner = 'owner', now = new Date() } = {}) {
  const normalized = normalizeTargetProfile({ ...profile, name: name || profile.name, owner });
  const createdAt = iso(now, now);
  const digest = sha256({ name: normalized.name, profile: normalized, owner, createdAt });
  return {
    id: normalized.id || `targetprofile_${digest.slice(0, 20)}`,
    kind: 'target-profile', name: normalized.name, owner: text(owner, 120), status: 'saved',
    query: normalized.query, profile: normalized, createdAt, updatedAt: createdAt,
    providerCalls: 0, externalEffects: 0
  };
}

function addObservation(rows, field, value, { sourceType, sourceUrl, sourceLicense, observedAt, confidence = 0.5, verified = false, exact = true, inferred = false } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') return;
  rows.push({
    field: text(field, 120), value: text(value, 1000), sourceType: text(sourceType || 'unknown', 80).toLowerCase(),
    sourceKind: sourceKind(sourceType), sourceUrl: text(sourceUrl, 600), sourceLicense: text(sourceLicense || 'not-recorded', 200),
    observedAt: iso(observedAt), confidence: Number(Math.max(0, Math.min(1, Number(confidence) || 0)).toFixed(3)),
    verified: Boolean(verified), exact: exact !== false, inferred: Boolean(inferred)
  });
}

export function buildLeadFieldLedger({ prospect = {}, signals = [], now = new Date(), freshWithinDays = 180 } = {}) {
  const rows = [];
  const sourceType = candidateSource(prospect);
  const sourceUrl = sourceUrlOf(prospect);
  const observedAt = observedAtOf(prospect, now);
  const sourceLicense = text(prospect?.sourceLicense || prospect?.contact?.sourceLicense || prospect?.issue?.sourceLicense || 'not-recorded', 200);
  const base = { sourceType, sourceUrl, sourceLicense, observedAt, confidence: trustOf(sourceType) };

  addObservation(rows, 'account.company', prospect.company || prospect.name, base);
  addObservation(rows, 'account.domain', domainOf(prospect), { ...base, confidence: Math.min(1, base.confidence + 0.1) });
  addObservation(rows, 'account.website', prospect.website, base);
  addObservation(rows, 'account.industry', prospect.industry || prospect.niche, base);
  addObservation(rows, 'contact.name', prospect.contact?.name || prospect.contactName, { ...base, sourceType: prospect.contact?.source || sourceType, sourceUrl: prospect.contact?.sourceUrl || sourceUrl, observedAt: prospect.contact?.observedAt || observedAt });
  addObservation(rows, 'contact.title', prospect.contact?.title || prospect.contactName && prospect.contactTitle, { ...base, sourceType: prospect.contact?.source || sourceType, sourceUrl: prospect.contact?.sourceUrl || sourceUrl, observedAt: prospect.contact?.observedAt || observedAt });
  addObservation(rows, 'contact.email', emailOf(prospect), {
    ...base, sourceType: prospect.contact?.source || sourceType, sourceUrl: prospect.contact?.sourceUrl || sourceUrl,
    sourceLicense: prospect.contact?.sourceLicense || sourceLicense, observedAt: prospect.contact?.observedAt || observedAt,
    confidence: isVerified(prospect.contact) ? 1 : base.confidence, verified: isVerified(prospect.contact), exact: prospect.contact?.exact !== false, inferred: prospect.contact?.inferred === true
  });
  const issue = prospect.issue || {};
  addObservation(rows, 'evidence.primary', issue.title, { sourceType: issue.imported ? 'licensed_export' : 'public_website', sourceUrl: issue.evidenceUrl || issue.sourceUrl || sourceUrl, sourceLicense: issue.sourceLicense || sourceLicense, observedAt: issue.evidenceObservedAt || issue.observedAt || observedAt, confidence: issue.confidence ?? 0.5 });
  addObservation(rows, 'evidence.excerpt', issue.evidenceExcerpt || issue.excerpt, { sourceType: issue.imported ? 'licensed_export' : 'public_website', sourceUrl: issue.evidenceUrl || issue.sourceUrl || sourceUrl, sourceLicense: issue.sourceLicense || sourceLicense, observedAt: issue.evidenceObservedAt || issue.observedAt || observedAt, confidence: issue.confidence ?? 0.5 });

  for (const observation of Array.isArray(prospect.fieldObservations) ? prospect.fieldObservations.slice(0, 100) : []) {
    if (!observation || typeof observation !== 'object') continue;
    addObservation(rows, observation.field, observation.value, {
      sourceType: observation.sourceType || observation.source || 'unknown', sourceUrl: observation.sourceUrl,
      sourceLicense: observation.sourceLicense, observedAt: observation.observedAt || now,
      confidence: observation.confidence ?? 0.5, verified: observation.verified, exact: observation.exact, inferred: observation.inferred
    });
  }

  const grouped = new Map();
  for (const row of rows) {
    const list = grouped.get(row.field) || [];
    list.push(row);
    grouped.set(row.field, list);
  }
  const fields = [];
  const conflicts = [];
  for (const [field, observations] of grouped.entries()) {
    const values = [...new Set(observations.map(row => row.value.toLowerCase()))];
    const latest = [...observations].sort((a, b) => String(b.observedAt).localeCompare(String(a.observedAt)))[0];
    const ageDays = daysSince(latest.observedAt, now);
    const stale = ageDays > freshWithinDays;
    const blocked = field === 'contact.email' && (latest.inferred || !latest.exact);
    const conflict = values.length > 1;
    const status = conflict ? 'conflict' : blocked ? 'blocked-inferred' : latest.verified ? 'verified' : stale ? 'stale' : 'source-backed';
    const quality = Math.round(Math.max(0, Math.min(100, latest.confidence * 55 + trustOf(latest.sourceType) * 25 + (latest.sourceUrl ? 10 : 0) + (latest.verified ? 10 : 0) - (stale ? 25 : 0) - (blocked ? 100 : 0))));
    const fieldRow = { field, value: latest.value, status, quality, sourceType: latest.sourceType, sourceKind: latest.sourceKind, sourceUrl: latest.sourceUrl, sourceLicense: latest.sourceLicense, observedAt: latest.observedAt, ageDays: Number.isFinite(ageDays) ? Math.round(ageDays * 10) / 10 : null, confidence: latest.confidence, verified: latest.verified, exact: latest.exact, inferred: latest.inferred, observationCount: observations.length };
    fields.push(fieldRow);
    if (conflict) conflicts.push({ field, values: observations.map(row => ({ value: row.value, sourceType: row.sourceType, sourceUrl: row.sourceUrl, observedAt: row.observedAt })), resolution: 'Owner review required before high-confidence handoff' });
  }
  const fieldMap = new Map(fields.map(field => [field.field, field]));
  const critical = ['account.company', 'account.domain', 'account.website', 'contact.email', 'evidence.primary'];
  const blockers = [];
  for (const field of critical) {
    const row = fieldMap.get(field);
    if (!row) blockers.push(`missing:${field}`);
    else if (row.status === 'stale') blockers.push(`stale:${field}`);
    else if (row.status === 'conflict') blockers.push(`conflict:${field}`);
    else if (row.status === 'blocked-inferred') blockers.push(`inferred:${field}`);
  }
  const score = fields.length ? Math.round(fields.reduce((sum, field) => sum + field.quality, 0) / fields.length) : 0;
  const signalRows = (signals || []).filter(signal => signal?.prospectId === prospect.id || !signal?.prospectId).slice(0, 12);
  return {
    version: LEAD_OPERATIONS_VERSION, prospectId: text(prospect.id, 120), company: text(prospect.company || prospect.name || 'Unknown company', 180),
    accountKey: domainOf(prospect) || text(prospect.id, 120), fields: fields.sort((a, b) => b.quality - a.quality || a.field.localeCompare(b.field)), conflicts,
    blockers, qualityScore: score, signalCount: signalRows.length,
    freshness: { freshWithinDays, freshestObservedAt: fields.map(field => field.observedAt).sort().at(-1) || null, staleFields: fields.filter(field => field.status === 'stale').map(field => field.field) },
    policy: LEAD_OPERATIONS_POLICY, providerCalls: 0, externalEffects: 0
  };
}

function accountSegment(prospect, profile) {
  const values = [];
  for (const dimension of profile.segmentBy) {
    if (dimension === 'country') values.push(String(prospect.country || 'unknown').toLowerCase());
    else if (dimension === 'city') values.push(String(prospect.city || 'unknown').toLowerCase());
    else if (dimension === 'industry' || dimension === 'niche') values.push(String(prospect.industry || prospect.niche || 'unknown').toLowerCase());
    else if (dimension === 'technology') values.push((Array.isArray(prospect.technologies) ? prospect.technologies[0] : prospect.technology) || 'unknown');
  }
  return values.map(value => text(value, 80)).join(' · ') || 'unsegmented';
}

export function buildLeadCoverageMap({ prospects = [], signals = [], suppressions = [], profile: rawProfile = {}, now = new Date() } = {}) {
  const profile = normalizeTargetProfile(rawProfile);
  const suppressionSet = suppressionValues(suppressions);
  const scoreQuery = { ...profile.query, minScore: 0, minEvidenceScore: 0, minIntentScore: 0, requireEvidence: false, requireContact: false, skipOwned: false };
  const byProspect = new Map();
  for (const signal of signals || []) {
    if (!signal?.prospectId) continue;
    const list = byProspect.get(signal.prospectId) || [];
    list.push(signal);
    byProspect.set(signal.prospectId, list);
  }
  const segments = new Map();
  const totals = { records: prospects.length, accounts: new Set(), researched: 0, evidence: 0, contacts: 0, verifiedContacts: 0, eligible: 0, stacked: 0, staleEvidence: 0, owned: 0, suppressed: 0, missingSignals: 0 };
  for (const prospect of prospects || []) {
    const signalsForProspect = byProspect.get(prospect.id) || prospect.leadSignals || prospect.signals || [];
    const score = scoreLeadCandidate({ candidate: prospect, query: scoreQuery, signals: signalsForProspect, suppressions: suppressionSet, now });
    const domain = domainOf(prospect) || `prospect:${prospect.id}`;
    totals.accounts.add(domain);
    const researched = Boolean(prospect.issue || prospect.audit || prospect.completedAt);
    const evidence = Boolean(prospect.issue?.evidenceUrl && (prospect.issue?.evidenceExcerpt || prospect.issue?.excerpt));
    const email = emailOf(prospect);
    const verified = isVerified(prospect.contact);
    const owned = isOwned(prospect);
    const isSuppressed = suppressed(prospect, suppressionSet);
    if (researched) totals.researched += 1;
    if (evidence) totals.evidence += 1;
    if (email) totals.contacts += 1;
    if (verified) totals.verifiedContacts += 1;
    if (score.eligible && !owned && !isSuppressed) totals.eligible += 1;
    if (score.signalStack?.stacked) totals.stacked += 1;
    if (score.blocks.includes('evidence-stale')) totals.staleEvidence += 1;
    if (owned) totals.owned += 1;
    if (isSuppressed) totals.suppressed += 1;
    if (!score.signalStack?.signalCount) totals.missingSignals += 1;
    const key = accountSegment(prospect, profile);
    const segment = segments.get(key) || { key, records: 0, accounts: new Set(), researched: 0, evidence: 0, contacts: 0, verifiedContacts: 0, eligible: 0, stacked: 0 };
    segment.records += 1; segment.accounts.add(domain); if (researched) segment.researched += 1; if (evidence) segment.evidence += 1; if (email) segment.contacts += 1; if (verified) segment.verifiedContacts += 1; if (score.eligible && !owned && !isSuppressed) segment.eligible += 1; if (score.signalStack?.stacked) segment.stacked += 1;
    segments.set(key, segment);
  }
  const segmentRows = [...segments.values()].map(segment => ({ ...segment, accounts: segment.accounts.size, coveragePercent: profile.targetAccounts ? Math.min(100, Math.round(segment.accounts.size / profile.targetAccounts * 100)) : 0, contactCoveragePercent: segment.records ? Math.round(segment.contacts / segment.records * 100) : 0, evidenceCoveragePercent: segment.records ? Math.round(segment.evidence / segment.records * 100) : 0 })).sort((a, b) => b.eligible - a.eligible || a.key.localeCompare(b.key));
  const accountCount = totals.accounts.size;
  const bottlenecks = [
    { key: 'missing_evidence', label: 'Evidence coverage', count: Math.max(0, totals.records - totals.evidence), action: 'Run or import source-backed website evidence before handoff.' },
    { key: 'missing_contact', label: 'Selected business contact', count: Math.max(0, totals.records - totals.contacts), action: 'Use an owner/licensed import or a configured provider-returned business contact.' },
    { key: 'unverified_contact', label: 'Contact verification', count: Math.max(0, totals.contacts - totals.verifiedContacts), action: 'Verify the selected business email; syntax alone is not enough.' },
    { key: 'missing_signal', label: 'Why-now signal', count: totals.missingSignals, action: 'Record a public or first-party signal, or keep the account in research rather than forcing urgency.' },
    { key: 'stale_evidence', label: 'Freshness', count: totals.staleEvidence, action: 'Refresh stale evidence before the owner reviews a handoff.' },
    { key: 'owned_or_suppressed', label: 'Owned or suppressed', count: totals.owned + totals.suppressed, action: 'Preserve the tombstone; do not recycle the account into a new sequence.' }
  ].filter(item => item.count > 0).sort((a, b) => b.count - a.count);
  return {
    version: LEAD_OPERATIONS_VERSION, profile, totals: { ...totals, accounts: accountCount, targetAccounts: profile.targetAccounts, targetLeads: profile.targetLeads, accountCoveragePercent: Math.min(100, Math.round(accountCount / profile.targetAccounts * 100)), leadCoveragePercent: Math.min(100, Math.round(totals.eligible / profile.targetLeads * 100)) },
    segments: segmentRows.slice(0, 50), bottlenecks, recommendedActions: bottlenecks.slice(0, 4).map(item => item.action), policy: LEAD_OPERATIONS_POLICY, providerCalls: 0, externalEffects: 0
  };
}

export function buildBuyingGroupPlan({ accounts = [], prospects = [], requiredRoles = [], now = new Date() } = {}) {
  const inputAccounts = accounts.length ? accounts : buildLeadAccountIntelligence({ prospects, query: { minScore: 0, minEvidenceScore: 0, requireEvidence: false, requireContact: false, skipOwned: false }, limit: 100, now }).accounts;
  const requested = lowerUnique(requiredRoles).map(value => ROLE_BY_KEY.has(value) ? value : roleGroup(value)).filter(Boolean);
  const required = [...new Set(requested.length ? requested : ['economic_buyer', 'champion', 'operator'])];
  const rows = inputAccounts.map(account => {
    const personas = unique(account.personas || [], 12);
    const present = [...new Set(personas.map(roleGroup).filter(Boolean))];
    const missing = required.filter(key => !present.includes(key));
    const coveragePercent = Math.round((required.length - missing.length) / required.length * 100);
    const nextAction = missing.length ? `Add ${missing.map(key => ROLE_BY_KEY.get(key).label).join(', ')} at ${account.company || account.domain}` : 'Owner review the buying group and choose the best route';
    return { accountKey: account.accountKey, company: account.company, domain: account.domain, requiredRoles: required.map(key => ROLE_BY_KEY.get(key).label), presentRoles: present.map(key => ROLE_BY_KEY.get(key).label), missingRoles: missing.map(key => ROLE_BY_KEY.get(key).label), personas, coveragePercent, nextAction, accountScore: account.accountScore, buyingStage: account.buyingStage };
  }).sort((a, b) => a.coveragePercent - b.coveragePercent || b.accountScore - a.accountScore);
  return {
    version: LEAD_OPERATIONS_VERSION, requiredRoles: required.map(key => ROLE_BY_KEY.get(key).label), accounts: rows,
    summary: { accounts: rows.length, complete: rows.filter(row => row.coveragePercent === 100).length, gaps: rows.filter(row => row.missingRoles.length).length, averageCoveragePercent: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.coveragePercent, 0) / rows.length) : 0 },
    policy: LEAD_OPERATIONS_POLICY, providerCalls: 0, externalEffects: 0
  };
}

function lookalikeFeatures(prospect) {
  return {
    industry: tokenSet(prospect.industry || prospect.niche), country: tokenSet(prospect.country), city: tokenSet(prospect.city),
    technology: tokenSet([...(Array.isArray(prospect.technologies) ? prospect.technologies : []), prospect.technology].filter(Boolean).join(' ')),
    tags: tokenSet((prospect.tags || []).join(' ')), issue: tokenSet(prospect.issue?.title || prospect.issue?.code || ''),
    size: Number(prospect.employees || prospect.employeeCount || prospect.firmographics?.employees || 0) > 0 ? Math.floor(Number(prospect.employees || prospect.employeeCount || prospect.firmographics?.employees) / 50) : -1
  };
}

export function buildLookalikePlan({ seeds = [], candidates = [], signals = [], suppressions = [], query = {}, limit = 25, now = new Date() } = {}) {
  const seedIds = new Set(seeds.map(seed => seed.id));
  if (!seeds.length) return { version: LEAD_OPERATIONS_VERSION, status: 'blocked', reason: 'Select at least one owner-approved seed account', seeds: [], results: [], providerCalls: 0, externalEffects: 0, policy: LEAD_OPERATIONS_POLICY };
  const seedVectors = seeds.map(lookalikeFeatures);
  const weights = { industry: 25, country: 15, city: 10, technology: 20, tags: 10, issue: 15, size: 5 };
  const suppressSet = suppressionValues(suppressions);
  const rows = [];
  for (const candidate of candidates) {
    if (seedIds.has(candidate.id)) continue;
    const vector = lookalikeFeatures(candidate);
    const perSeed = seedVectors.map(seed => {
      let score = 0;
      const reasons = [];
      for (const [feature, weight] of Object.entries(weights)) {
        const match = feature === 'size' ? seed[feature] >= 0 && vector[feature] >= 0 && Math.abs(seed[feature] - vector[feature]) <= 1 : overlap(seed[feature], vector[feature]) > 0;
        if (match) { score += weight; reasons.push(feature); }
      }
      return { score, reasons };
    }).sort((a, b) => b.score - a.score)[0];
    const signalRows = signals.filter(signal => signal.prospectId === candidate.id);
    const score = scoreLeadCandidate({ candidate, query: { ...query, minScore: 0, minEvidenceScore: 0, requireEvidence: false, requireContact: false, skipOwned: false }, signals: signalRows, suppressions: suppressSet, now });
    const isBlocked = suppressed(candidate, suppressSet) || isOwned(candidate);
    rows.push({ id: candidate.id, company: text(candidate.company || candidate.name, 180), domain: domainOf(candidate), similarity: perSeed?.score || 0, similarityReasons: perSeed?.reasons || [], localScore: score.total, eligible: !isBlocked, blockedReason: suppressed(candidate, suppressSet) ? 'suppressed' : isOwned(candidate) ? 'already-owned-or-contacted' : '', nextAction: isBlocked ? 'Keep excluded' : 'Owner review → verify evidence and contact before handoff' });
  }
  rows.sort((a, b) => b.similarity - a.similarity || b.localScore - a.localScore || a.company.localeCompare(b.company));
  return { version: LEAD_OPERATIONS_VERSION, status: 'ready', seeds: seeds.map(seed => ({ id: seed.id, company: seed.company, domain: domainOf(seed) })), results: rows.slice(0, Math.max(1, Math.min(100, limit))), policy: LEAD_OPERATIONS_POLICY, providerCalls: 0, externalEffects: 0 };
}

export function buildProviderPreflight({ fields = [], providers = DEFAULT_PROVIDER_IDS, configuredProviders = [], volume = 1, maxProviderCalls = 0 } = {}) {
  const requestedFields = lowerUnique(fields.length ? fields : ['work_email', 'email_verification'], 12).filter(field => FIELD_SET.has(field));
  const selectedProviders = lowerUnique(providers.length ? providers : DEFAULT_PROVIDER_IDS, 20).filter(provider => PROVIDER_BY_ID.has(provider));
  const configured = new Set(lowerUnique(configuredProviders, 20));
  const routes = requestedFields.map(field => {
    const providersForField = selectedProviders.map(id => PROVIDER_BY_ID.get(id)).filter(provider => provider.fields.includes(field));
    const local = providersForField.find(provider => !provider.external);
    const external = providersForField.filter(provider => provider.external);
    return { field, providers: providersForField.map(provider => ({ id: provider.id, label: provider.label, kind: provider.kind, external: provider.external, configured: !provider.external || configured.has(provider.id), status: !provider.external ? 'available' : configured.has(provider.id) ? 'configured-plan-only' : 'not-configured' })), localFallback: local?.id || null, externalProviders: external.map(provider => provider.id), stopRule: field === 'work_email' ? 'Stop only on a provider-returned verified business email; never infer a private address.' : 'Stop on the first source-backed value that passes field validation.' };
  });
  const blockedProviders = [...new Set(routes.flatMap(route => route.providers.filter(provider => provider.external && !provider.configured).map(provider => provider.id)))];
  const externalConfigured = [...new Set(routes.flatMap(route => route.providers.filter(provider => provider.external && provider.configured).map(provider => provider.id)))];
  const fieldWithoutLocal = routes.filter(route => !route.localFallback).map(route => route.field);
  const worstCaseAttempts = routes.reduce((sum, route) => sum + Math.max(1, route.providers.length) * Math.max(1, volume), 0);
  const bestCaseAttempts = routes.reduce((sum, route) => sum + Math.max(1, route.localFallback ? 0 : 1) * Math.max(1, volume), 0);
  const blockingReasons = [];
  if (blockedProviders.length) blockingReasons.push(`BYOK configuration required: ${blockedProviders.join(', ')}`);
  if (maxProviderCalls > 0 && worstCaseAttempts > maxProviderCalls) blockingReasons.push(`Worst-case provider attempts ${worstCaseAttempts} exceed owner cap ${maxProviderCalls}`);
  if (fieldWithoutLocal.length) blockingReasons.push(`No local fallback for: ${fieldWithoutLocal.join(', ')}`);
  return {
    version: LEAD_OPERATIONS_VERSION, requestedFields, selectedProviders, configuredProviders: externalConfigured, volume: Math.max(1, Math.min(100000, volume)), routes,
    estimate: { bestCaseAttempts, worstCaseAttempts, creditExposure: 'Unknown until the selected provider tariff/credit schedule is supplied; this plan never assumes a price.' },
    safeToRun: blockingReasons.length === 0, blockingReasons, policy: LEAD_OPERATIONS_POLICY, providerCalls: 0, externalEffects: 0
  };
}

export function buildLeadControlTower({ prospects = [], signals = [], suppressions = [], searches = [], enrichmentRuns = [], targetProfiles = [], profile = null, now = new Date() } = {}) {
  const records = targetProfiles.length ? targetProfiles : searches.filter(item => item.kind === 'target-profile');
  const selectedRecord = profile || records.find(item => item.status === 'saved')?.profile || records[0]?.profile || {};
  const targetProfile = normalizeTargetProfile(selectedRecord);
  const coverage = buildLeadCoverageMap({ prospects, signals, suppressions, profile: targetProfile, now });
  const accounts = buildLeadAccountIntelligence({ prospects, signals, suppressions, query: { minScore: 0, minEvidenceScore: 0, requireEvidence: false, requireContact: false, skipOwned: false }, limit: 100, now });
  const buyingGroups = buildBuyingGroupPlan({ accounts: accounts.accounts, requiredRoles: targetProfile.requiredPersonas, now });
  const ledgers = prospects.slice().sort((a, b) => String(b.updatedAt || b.completedAt || '').localeCompare(String(a.updatedAt || a.completedAt || ''))).slice(0, 12).map(prospect => buildLeadFieldLedger({ prospect, signals, now, freshWithinDays: targetProfile.freshWithinDays }));
  const fieldQuality = { average: ledgers.length ? Math.round(ledgers.reduce((sum, ledger) => sum + ledger.qualityScore, 0) / ledgers.length) : 0, conflicts: ledgers.reduce((sum, ledger) => sum + ledger.conflicts.length, 0), blockers: ledgers.reduce((sum, ledger) => sum + ledger.blockers.length, 0), records: ledgers.length };
  const preflight = buildProviderPreflight({ fields: targetProfile.requiredFields, providers: DEFAULT_PROVIDER_IDS, volume: targetProfile.targetLeads });
  const search = searchLocalLeadCorpus({ prospects, signals, suppressions, query: { ...targetProfile.query, minScore: 0, minEvidenceScore: 0, requireEvidence: false, requireContact: false, skipOwned: true, limit: 12 }, now });
  return {
    version: LEAD_OPERATIONS_VERSION, profile: targetProfile, savedProfiles: records.slice(0, 20), coverage, buyingGroups, fieldQuality, fieldLedgers: ledgers,
    providerPreflight: preflight, priorityQueue: search.results.map(row => ({ id: row.id, company: row.company, score: row.score.total, intentStage: row.signalStack?.stage || 'unknown', nextAction: row.nextAction })),
    stats: { searches: searches.length, enrichmentRuns: enrichmentRuns.length, savedProfiles: records.length }, policy: LEAD_OPERATIONS_POLICY, providerCalls: 0, externalEffects: 0
  };
}

