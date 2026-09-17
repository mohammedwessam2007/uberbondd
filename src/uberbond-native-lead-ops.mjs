import { sha256 } from './omnia-v9/canonical.mjs';
import { normalizeDomain } from './utils.mjs';
import {
  ENRICHMENT_FIELDS,
  LEAD_GENERATION_POLICY,
  buildEnrichmentPlan,
  normalizeLeadQuery,
  searchLocalLeadCorpus
} from './lead-generation.mjs';
import { runLocalEnrichment } from './lead-intelligence-v3.mjs';
import { buildLeadFieldLedger, normalizeTargetProfile } from './lead-operations.mjs';

export const UBERBOND_NATIVE_LEAD_OPS_VERSION = 'uberbond.native-lead-ops.v1';

export const UBERBOND_NATIVE_LEAD_OPS_POLICY = Object.freeze({
  ...LEAD_GENERATION_POLICY,
  cleanRoomRule: 'Reproduce operator jobs and state transitions, never proprietary code, databases, protected networks, or vendor records.',
  corpusRule: 'Only owner-supplied, first-party, licensed, or explicitly permitted public records may enter a durable list.',
  listRule: 'A prepared list is not contact authority. Every external effect still requires its existing recipient, suppression, sender, route, and approval gates.',
  enrichmentRule: 'Local enrichment may run without a provider. External enrichment is plan-only until a separately authorized, terms-compliant adapter is configured.',
  capacityRule: 'A capacity plan is arithmetic and readiness planning, never proof of deliverability, permission, provider approval, or revenue.',
  identityRule: 'Canonical account dedupe uses a normalized domain where present; person identity uses an exact normalized business email only.'
});

const SOURCE_RANK = Object.freeze({
  first_party_export: 100,
  owner_import: 100,
  licensed_export: 95,
  provider_api: 85,
  public_website: 80,
  openstreetmap: 75,
  csv_import: 70,
  local_prospect: 65
});

const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const lower = (value, max = 500) => text(value, max).toLowerCase();
const iso = (value, fallback = new Date()) => {
  const parsed = new Date(value || fallback);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date(fallback).toISOString();
};
const integer = (value, fallback, min, max) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.floor(parsed))) : fallback;
};
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
const emailOf = record => lower(record?.contact?.email || record?.email, 320);
const domainOf = record => normalizeDomain(record?.domain || record?.website || record?.organizationDomain || '');
const sourceOf = record => lower(record?.source || record?.contact?.source || 'local_prospect', 80);

function companyKey(record) {
  const company = lower(record?.company || record?.name, 180)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
  return company ? `company:${company}` : `record:${text(record?.id, 120) || sha256(record).slice(0, 24)}`;
}

function freshnessScore(record, now) {
  const observed = Date.parse(record?.contact?.observedAt || record?.issue?.evidenceObservedAt || record?.updatedAt || record?.createdAt || '');
  if (!Number.isFinite(observed)) return 0;
  return Math.max(0, Math.min(20, Math.round((1 - Math.max(0, Date.parse(now) - observed) / 864000000) * 20)));
}

function evidenceScore(record) {
  const issue = record?.issue || {};
  const hasUrl = Boolean(issue.evidenceUrl || issue.sourceUrl || record?.sourceUrl || record?.website);
  const hasExcerpt = String(issue.evidenceExcerpt || issue.excerpt || '').trim().length >= 16;
  return (hasUrl ? 10 : 0) + (hasExcerpt ? 20 : 0);
}

function contactScore(record) {
  const email = emailOf(record);
  if (!email || !validEmail(email)) return 0;
  const contact = record?.contact || {};
  const verified = ['valid', 'verified', 'deliverable'].includes(lower(contact.verified || contact.verificationStatus, 40));
  return verified ? 30 : 10;
}

function recordQuality(record, now) {
  return (SOURCE_RANK[sourceOf(record)] || 50) + evidenceScore(record) + contactScore(record) + freshnessScore(record, now);
}

function suppressionValues(suppressions = []) {
  return new Set((Array.isArray(suppressions) ? suppressions : [])
    .map(item => lower(typeof item === 'string' ? item : item?.value, 320))
    .filter(Boolean));
}

function suppressionReason(record, values) {
  const email = emailOf(record);
  const domain = domainOf(record);
  if (email && values.has(email)) return 'suppressed-email';
  if (domain && values.has(domain)) return 'suppressed-domain';
  return '';
}

export function canonicalLeadIdentity(record = {}) {
  const email = emailOf(record);
  const domain = domainOf(record);
  const accountKey = domain ? `domain:${domain}` : companyKey(record);
  return {
    accountKey,
    contactKey: email && validEmail(email) ? `email:${email}` : null,
    domain: domain || null,
    email: email && validEmail(email) ? email : null,
    identityQuality: domain ? 'canonical-domain' : 'normalized-company-fallback'
  };
}

export function deduplicateLeadCorpus({ prospects = [], suppressions = [], now = new Date() } = {}) {
  const suppressedSet = suppressionValues(suppressions);
  const groups = new Map();
  const excluded = [];
  for (const record of Array.isArray(prospects) ? prospects : []) {
    if (!record || typeof record !== 'object') continue;
    const identity = canonicalLeadIdentity(record);
    const suppressedReason = suppressionReason(record, suppressedSet);
    if (suppressedReason) {
      excluded.push({ id: record.id || null, company: text(record.company || record.name, 180), reason: suppressedReason, identity });
      continue;
    }
    const row = { record, identity, quality: recordQuality(record, now) };
    const existing = groups.get(identity.accountKey) || [];
    existing.push(row);
    groups.set(identity.accountKey, existing);
  }

  const selected = [];
  const duplicates = [];
  for (const [accountKey, rows] of groups) {
    rows.sort((left, right) => right.quality - left.quality || String(left.record.id || '').localeCompare(String(right.record.id || '')));
    const winner = rows[0];
    const lineage = rows.map(row => ({
      id: row.record.id || null,
      source: sourceOf(row.record),
      sourceUrl: text(row.record.sourceUrl || row.record.contact?.sourceUrl, 600),
      quality: row.quality,
      selected: row === winner
    }));
    selected.push({
      ...winner.record,
      nativeIdentity: winner.identity,
      nativeListLineage: lineage,
      nativeQuality: winner.quality
    });
    for (const duplicate of rows.slice(1)) {
      duplicates.push({
        id: duplicate.record.id || null,
        accountKey,
        winnerId: winner.record.id || null,
        reason: 'canonical-account-duplicate',
        quality: duplicate.quality
      });
    }
  }

  return {
    version: UBERBOND_NATIVE_LEAD_OPS_VERSION,
    records: selected,
    duplicates,
    excluded,
    stats: {
      input: Array.isArray(prospects) ? prospects.length : 0,
      canonicalAccounts: selected.length,
      duplicateRecords: duplicates.length,
      suppressedRecords: excluded.length,
      exactEmails: selected.filter(record => canonicalLeadIdentity(record).contactKey).length,
      verifiedEmails: selected.filter(record => ['valid', 'verified', 'deliverable'].includes(lower(record.contact?.verified || record.contact?.verificationStatus, 40))).length
    },
    providerCalls: 0,
    externalEffects: 0,
    policy: UBERBOND_NATIVE_LEAD_OPS_POLICY
  };
}

export function buildNativeTargetProfileRecord({ name = '', profile = {}, owner = 'owner', now = new Date() } = {}) {
  const normalized = normalizeTargetProfile({ ...profile, name: name || profile.name, owner });
  const digest = sha256({ name: normalized.name, profile: normalized, owner: text(owner, 120) });
  const createdAt = iso(now, now);
  return {
    id: normalized.id || `targetprofile_${digest.slice(0, 24)}`,
    kind: 'target-profile',
    name: normalized.name,
    owner: text(owner, 120) || 'owner',
    status: 'saved',
    query: normalized.query,
    profile: normalized,
    digest,
    createdAt,
    updatedAt: createdAt,
    providerCalls: 0,
    externalEffects: 0,
    policy: UBERBOND_NATIVE_LEAD_OPS_POLICY
  };
}

export function compileNativeLeadList({
  name = '',
  profile = {},
  prospects = [],
  signals = [],
  suppressions = [],
  campaignId = '',
  limit = 50,
  idempotencyKey = '',
  now = new Date()
} = {}) {
  const normalizedProfile = normalizeTargetProfile(profile || {});
  const deduped = deduplicateLeadCorpus({ prospects, suppressions, now });
  const query = normalizeLeadQuery({
    ...normalizedProfile.query,
    limit: integer(limit, normalizedProfile.query.limit, 1, 250),
    requireEvidence: normalizedProfile.query.requireEvidence,
    requireContact: normalizedProfile.query.requireContact,
    skipOwned: normalizedProfile.query.skipOwned
  });
  const search = searchLocalLeadCorpus({
    prospects: deduped.records,
    signals,
    suppressions: [],
    query,
    now
  });
  const rows = search.results.map(row => ({
    prospectId: row.id,
    accountKey: row.accountKey,
    company: row.company,
    domain: row.domain,
    website: row.website,
    country: row.country,
    city: row.city,
    niche: row.niche,
    source: row.source,
    score: row.score,
    signalStack: row.signalStack,
    evidenceUrl: row.issue?.evidenceUrl || row.sourceUrl || '',
    evidenceExcerpt: row.issue?.evidenceExcerpt || row.issue?.excerpt || '',
    contact: row.contact || null,
    handoffState: row.score.eligible ? 'OWNER_PLAN_READY_NOT_AUTHORIZED' : 'BLOCKED_UNTIL_RESOLVED'
  }));
  const digest = sha256({
    name: text(name || normalizedProfile.name, 180),
    profile: normalizedProfile,
    campaignId: text(campaignId, 120),
    idempotencyKey: text(idempotencyKey, 200),
    prospectIds: rows.map(row => row.prospectId)
  });
  return {
    id: `leadlist_${digest.slice(0, 24)}`,
    name: text(name || normalizedProfile.name || 'UberBond governed lead list', 180),
    kind: 'native-governed-lead-list',
    status: 'prepared',
    campaignId: text(campaignId, 120),
    idempotencyKey: text(idempotencyKey, 200),
    digest,
    profile: normalizedProfile,
    query,
    prospectIds: rows.map(row => row.prospectId),
    rows,
    stats: {
      ...deduped.stats,
      scannedAfterDedupe: deduped.records.length,
      matchedBeforeLimit: search.totalMatched,
      selected: rows.length,
      eligible: rows.filter(row => row.handoffState === 'OWNER_PLAN_READY_NOT_AUTHORIZED').length,
      blocked: rows.filter(row => row.handoffState !== 'OWNER_PLAN_READY_NOT_AUTHORIZED').length
    },
    exclusions: { duplicateRecords: deduped.duplicates, suppressedRecords: deduped.excluded, searchExcluded: search.excluded },
    sourceAuthority: 'owner-supplied, first-party, licensed, or explicitly permitted public records only',
    providerCalls: 0,
    externalEffects: 0,
    businessEffectAuthority: 'NONE',
    handoff: {
      campaignId: text(campaignId, 120) || null,
      enrollment: 'NOT_PERFORMED',
      send: 'NOT_AUTHORIZED',
      payment: 'NOT_PROVEN'
    },
    createdAt: iso(now, now),
    updatedAt: iso(now, now),
    policy: UBERBOND_NATIVE_LEAD_OPS_POLICY
  };
}

export function compileNativeEnrichmentPlan({ prospect = {}, fields = ENRICHMENT_FIELDS, providers = [], now = new Date() } = {}) {
  const plan = buildEnrichmentPlan({ prospect, fields, providers, now });
  const stablePlanId = `enrichplan_${sha256({
    prospectId: text(prospect.id, 120),
    fields: plan.requestedFields,
    providers: Array.isArray(providers) ? providers : []
  }).slice(0, 24)}`;
  return {
    ...plan,
    version: UBERBOND_NATIVE_LEAD_OPS_VERSION,
    planId: stablePlanId,
    status: 'planned',
    execution: 'LOCAL_ONLY_UNTIL_ADAPTER_AUTHORIZED',
    businessEffectAuthority: 'NONE',
    policy: UBERBOND_NATIVE_LEAD_OPS_POLICY
  };
}

export function compileNativeLocalEnrichment({ prospect = {}, fields = ENRICHMENT_FIELDS, signals = [], now = new Date() } = {}) {
  const result = runLocalEnrichment({ prospect, fields, signals, now });
  const fieldResults = result.results.map(row => ({
    id: `fieldresult_${sha256({ prospectId: prospect.id, field: row.field, observedAt: row.observedAt, value: row.value }).slice(0, 24)}`,
    prospectId: text(prospect.id, 120),
    field: row.field,
    provider: 'local-evidence',
    status: row.status,
    observedAt: row.observedAt,
    result: row,
    providerCalls: 0,
    externalEffects: 0,
    createdAt: iso(now, now),
    updatedAt: iso(now, now)
  }));
  const runDigest = sha256({ prospectId: prospect.id, fields: result.requestedFields, results: result.results });
  return {
    id: `enrichrun_${runDigest.slice(0, 24)}`,
    planId: `local_${runDigest.slice(0, 24)}`,
    prospectId: text(prospect.id, 120),
    provider: 'local-evidence',
    status: 'completed',
    result,
    fieldResults,
    ledger: buildLeadFieldLedger({ prospect, signals, now }),
    digest: runDigest,
    providerCalls: 0,
    externalEffects: 0,
    businessEffectAuthority: 'NONE',
    createdAt: iso(now, now),
    updatedAt: iso(now, now),
    policy: UBERBOND_NATIVE_LEAD_OPS_POLICY
  };
}

export function buildNativeCapacityPlan({
  monthlyMessages = 100000,
  activeDaysPerMonth = 30,
  senderCells = [],
  targetReplyRate = 0.02,
  targetCloseRate = 0.05,
  averagePriceUsd = 450,
  now = new Date()
} = {}) {
  const monthly = integer(monthlyMessages, 100000, 1, 10000000);
  const activeDays = integer(activeDaysPerMonth, 30, 1, 31);
  const daily = Math.ceil(monthly / activeDays);
  const cells = (Array.isArray(senderCells) ? senderCells : []).slice(0, 100).map((cell, index) => ({
    id: text(cell?.id || `cell-${index + 1}`, 80),
    provider: text(cell?.provider || 'unconfigured-provider', 120),
    dailyCapacity: integer(cell?.dailyCapacity, 0, 0, 1000000),
    authenticatedDomain: cell?.authenticatedDomain === true,
    termsVerified: cell?.termsVerified === true,
    warmupComplete: cell?.warmupComplete === true
  }));
  const suppliedDaily = cells.reduce((sum, cell) => sum + cell.dailyCapacity, 0);
  const requiredCells = Math.max(1, Math.ceil(daily / Math.max(1, cells.reduce((max, cell) => Math.max(max, cell.dailyCapacity), 0))));
  const blockers = [
    'provider-terms-and-capacity-evidence-required',
    'authenticated-sender-domains-and-reputation-evidence-required',
    'lawful-verified-deduplicated-unsuppressed-recipient-corpus-required',
    'bounce-complaint-unsubscribe-pause-and-reconciliation-controls-required',
    'cleared-payment-and-accepted-delivery-loop-not-proven'
  ];
  if (!cells.length) blockers.unshift('no-sender-cells-supplied');
  if (cells.length && suppliedDaily < daily) blockers.unshift('planned-daily-capacity-below-target');
  if (cells.length && cells.some(cell => !cell.authenticatedDomain || !cell.termsVerified || !cell.warmupComplete)) blockers.unshift('sender-cell-evidence-incomplete');
  const projectedReplies = Math.floor(monthly * Math.max(0, Math.min(1, Number(targetReplyRate) || 0)));
  const projectedWins = Math.floor(projectedReplies * Math.max(0, Math.min(1, Number(targetCloseRate) || 0)));
  return {
    version: UBERBOND_NATIVE_LEAD_OPS_VERSION,
    state: 'CAPACITY_PLAN_ONLY',
    monthlyMessages: monthly,
    activeDaysPerMonth: activeDays,
    requiredDailyMessages: daily,
    suppliedDailyCapacity: suppliedDaily,
    capacityGap: Math.max(0, daily - suppliedDaily),
    requiredCells,
    senderCells: cells,
    projectedReplies,
    projectedWins,
    projectedGrossRevenueUsd: projectedWins * Math.max(0, Number(averagePriceUsd) || 0),
    blockers: [...new Set(blockers)],
    providerCalls: 0,
    externalEffects: 0,
    businessEffectAuthority: 'NONE',
    generatedAt: iso(now, now),
    truthBoundary: 'Arithmetic planning is not provider approval, deliverability, consent, customer demand, cleared revenue, or a 100K/month certification.',
    policy: UBERBOND_NATIVE_LEAD_OPS_POLICY
  };
}

function csv(value) {
  const string = String(value ?? '');
  return /[",\n\r]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
}

export function nativeLeadListCsv(list = {}) {
  const headers = ['prospect_id', 'account_key', 'company', 'domain', 'website', 'country', 'city', 'niche', 'email', 'contact_title', 'score', 'handoff_state', 'evidence_url', 'evidence_excerpt', 'source'];
  const lines = [headers.join(',')];
  for (const row of Array.isArray(list.rows) ? list.rows : []) {
    lines.push([
      row.prospectId, row.accountKey, row.company, row.domain, row.website, row.country, row.city, row.niche,
      row.contact?.email || '', row.contact?.title || '', row.score?.total || 0, row.handoffState,
      row.evidenceUrl, row.evidenceExcerpt, row.source
    ].map(csv).join(','));
  }
  return `${lines.join('\n')}\n`;
}
