import { id, isEmail, now, normalizeDomain } from './utils.mjs';
import { ConflictError } from './store.mjs';

const CONTACT_SOURCES = new Set(['owner_import', 'licensed_export', 'first_party_export', 'public_website', 'website', 'provider_api', 'csv_import']);
const CONTACT_STATUSES = new Set(['valid', 'invalid', 'accept_all', 'unverified', 'unknown', 'deliverable', 'undeliverable']);

function firstValue(...values) {
  return values.map(value => String(value ?? '').trim()).find(Boolean) || '';
}

function clamp(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

function percentage(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(clamp(parsed > 1 ? parsed / 100 : parsed) * 100);
}

function isoOrEmpty(value) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
}

export function normalizeImportedContact(raw = {}) {
  const candidate = raw.contact && typeof raw.contact === 'object' && !Array.isArray(raw.contact) ? raw.contact : {};
  const email = firstValue(
    candidate.email, raw.businessEmail, raw.business_email, raw.workEmail,
    raw.work_email, raw.contactEmail, raw.contact_email, raw.email, raw.email_address
  ).toLowerCase();
  if (!email) return { contact: null, warnings: [] };
  if (!isEmail(email)) return { contact: null, warnings: ['invalid_business_email_omitted'] };
  const rawSource = firstValue(
    candidate.source, raw.contactSource, raw.contact_source,
    raw.emailSource, raw.email_source
  ).toLowerCase().replace(/[^a-z0-9_ -]/g, '_').replace(/\s+/g, '_');
  const source = CONTACT_SOURCES.has(rawSource) ? rawSource : 'owner_import';
  const rawStatus = firstValue(
    candidate.verified, candidate.verificationStatus, candidate.verification_status,
    raw.emailVerificationStatus, raw.email_verification_status, raw.verificationStatus,
    raw.verification_status, raw.verified
  ).toLowerCase();
  const verified = CONTACT_STATUSES.has(rawStatus) ? rawStatus : 'unknown';
  const contact = {
    email,
    name: firstValue(candidate.name, raw.contactName, raw.contact_name, raw.fullName, raw.full_name).slice(0, 160),
    title: firstValue(candidate.title, candidate.position, raw.contactTitle, raw.contact_title, raw.jobTitle, raw.job_title).slice(0, 160),
    source,
    sourceUrl: firstValue(candidate.sourceUrl, raw.contactSourceUrl, raw.contact_source_url, raw.emailSourceUrl, raw.email_source_url, raw.sourceUrl).slice(0, 600),
    sourceLicense: firstValue(candidate.sourceLicense, raw.contactSourceLicense, raw.contact_source_license, raw.sourceLicense).slice(0, 180),
    observedAt: isoOrEmpty(candidate.observedAt || raw.contactObservedAt || raw.contact_observed_at || raw.observedAt),
    verified,
    verificationScore: percentage(candidate.verificationScore ?? raw.verificationScore),
    exact: true,
    inferred: false
  };
  return { contact, warnings: [] };
}

export function normalizeImportedEvidence(raw = {}) {
  const candidate = raw.issue && typeof raw.issue === 'object' && !Array.isArray(raw.issue) ? raw.issue : {};
  const evidenceUrl = firstValue(candidate.evidenceUrl, candidate.sourceUrl, raw.evidenceUrl, raw.evidence_url);
  const title = firstValue(candidate.title, raw.evidenceTitle, raw.evidence_title);
  const excerpt = firstValue(candidate.evidenceExcerpt, candidate.excerpt, raw.evidenceExcerpt, raw.evidence_excerpt);
  if (!evidenceUrl || !title || excerpt.length < 8) return { issue: null, warnings: [] };
  let parsed;
  try { parsed = new URL(evidenceUrl); }
  catch { return { issue: null, warnings: ['invalid_evidence_url_omitted'] }; }
  if (parsed.protocol !== 'https:') return { issue: null, warnings: ['non_https_evidence_url_omitted'] };
  return {
    issue: {
      code: firstValue(candidate.code, raw.evidenceCode) || 'imported-evidence',
      title: title.slice(0, 240), evidenceUrl: evidenceUrl.slice(0, 600),
      evidenceExcerpt: excerpt.slice(0, 1000),
      evidenceObservedAt: isoOrEmpty(candidate.evidenceObservedAt || candidate.observedAt || raw.evidenceObservedAt || raw.evidence_observed_at || raw.observedAt) || now(),
      confidence: Number(clamp(candidate.confidence ?? raw.evidenceConfidence, 0.75).toFixed(2)),
      service: firstValue(candidate.service, raw.evidenceService) || 'Owner-reviewed lead opportunity',
      safeForOutreach: false,
      imported: true,
      sourceLicense: firstValue(candidate.sourceLicense, raw.sourceLicense).slice(0, 180)
    },
    warnings: []
  };
}

export function validateProspect(raw, campaignId = '') {
  const company = String(raw.company || raw.company_name || '').trim();
  const website = String(raw.website || raw.website_url || raw.url || '').trim();
  if (!company || !website) return null;
  const importedContact = normalizeImportedContact(raw);
  const importedEvidence = normalizeImportedEvidence(raw);
  const importWarnings = [...importedContact.warnings, ...importedEvidence.warnings];
  const sourceMetadata = raw.sourceMetadata && typeof raw.sourceMetadata === 'object' ? { ...raw.sourceMetadata } : {};
  if (importWarnings.length) sourceMetadata.importWarnings = [...new Set([...(Array.isArray(sourceMetadata.importWarnings) ? sourceMetadata.importWarnings : []), ...importWarnings])];
  sourceMetadata.intakeVersion = 'uberbond.prospect-import.v2';
  return {
    company: company.slice(0, 180), website,
    niche: String(raw.niche || raw.industry || '').slice(0, 120),
    country: String(raw.country || '').slice(0, 80), city: String(raw.city || '').slice(0, 80),
    contactName: String(raw.contactName || raw.contact_name || '').slice(0, 120),
    campaignId: String(raw.campaignId || raw.campaign_id || campaignId || ''),
    abilityToPay: Number(raw.abilityToPay || raw.ability_to_pay || 8),
    serviceFit: Number(raw.serviceFit || raw.service_fit || 0),
    marketAdvantage: Number(raw.marketAdvantage || raw.market_advantage || 0),
    notes: String(raw.notes || '').slice(0, 1000), source: String(raw.source || 'outbound').slice(0, 80),
    sourceUrl: String(raw.sourceUrl || '').slice(0, 500),
    sourceRecordId: String(raw.sourceRecordId || '').slice(0, 120),
    sourceLicense: String(raw.sourceLicense || '').slice(0, 160),
    sourceMetadata,
    ...(importedContact.contact ? { contact: importedContact.contact } : {}),
    ...(importedEvidence.issue ? { issue: importedEvidence.issue } : {}),
    ...(importWarnings.length ? { importWarnings } : {})
  };
}

export async function importProspects(store, config, items, campaignId = '') {
  const added = [];
  const skipped = [];
  for (const raw of items.slice(0, Math.max(100, config.maxBatch * 10))) {
    const clean = validateProspect(raw, campaignId);
    if (!clean) { skipped.push({ reason: 'company and website required', row: raw.__row }); continue; }
    const domain = normalizeDomain(clean.website);
    if (!domain) { skipped.push({ reason: 'invalid domain', row: raw.__row }); continue; }
    const prospect = { id: id('pros'), ...clean, domain, status: 'queued', source: clean.source || 'outbound', createdAt: now() };
    try {
      await store.add('prospects', prospect);
      added.push(prospect);
    } catch (error) {
      if (error instanceof ConflictError) { skipped.push({ reason: 'duplicate', company: clean.company, domain }); continue; }
      throw error;
    }
  }
  return { added, skipped };
}
