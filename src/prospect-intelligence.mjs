// Prospect intelligence: discovery, enrichment, and the reconciliation that
// decides what the system actually believes about a person.
//
// The workflows this replaces all share one shape -- scrape a platform, push
// rows into a spreadsheet, treat the last write as truth -- and all three
// parts of that shape are wrong here. The platform becomes a hard dependency
// the moment it is named in the architecture; the spreadsheet becomes a second
// database nobody migrates; and last-write-wins means a pattern generator can
// overwrite the company's own team page because it ran second.
//
// So: adapters are interfaces, state is UberBond's, and reconciliation is by
// provenance strength with conflicts kept explicit.

import crypto from 'node:crypto';
import {
  evidenceStrength,
  isKnownEvidenceClass,
  isSendableEvidenceClass,
  cappedConfidence
} from './prospect-evidence.mjs';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledger.mjs';

export const PROSPECT_INTELLIGENCE_POLICY_VERSION = 'prospect-intelligence-1.0.0';

export const PROSPECT_SOURCE_TYPES = Object.freeze([
  'SEARCH_ENGINE',
  'COMPANY_WEBSITE',
  'PUBLIC_REGISTRY',
  'LICENSED_ENRICHMENT',
  'PUBLIC_PROFILE_DIRECTORY',
  'PARTNER_REFERRAL',
  'INBOUND_DECLARED',
  'IMPORTED_FILE'
]);

// Fields any adapter may assert about a person. Anything not on this list is
// dropped rather than stored, so a chatty provider cannot quietly widen the
// record into somewhere data-protection rules start to matter.
export const PERSON_FIELDS = Object.freeze([
  'name', 'role', 'seniority', 'department', 'publicProfileUrl',
  'companyId', 'companyName', 'companyDomain', 'location', 'timeZone'
]);

export const COMPANY_FIELDS = Object.freeze([
  'name', 'domain', 'industry', 'employeeCount', 'country', 'websiteUrl', 'description'
]);

const MAX_OBSERVATIONS = 500;
const MAX_CANDIDATES = 1000;

function text(value, max = 300) {
  return String(value ?? '').trim().slice(0, max);
}
function parseTime(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  const ms = Date.parse(String(value ?? ''));
  return Number.isFinite(ms) ? ms : null;
}
function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: PROSPECT_INTELLIGENCE_POLICY_VERSION,
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS },
    ...extra
  };
}

function normalizeDomain(value) {
  const raw = text(value, 253).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(raw) ? raw : '';
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

export const ADAPTER_KINDS = Object.freeze([
  'PROSPECT_DISCOVERY',
  'PERSON_ENRICHMENT',
  'CONTACT_VERIFIER',
  'MODEL_SCORING'
]);

/**
 * Describe an adapter without binding to a vendor.
 *
 * `costPerCallCents` and the measured fields exist so a provider can be
 * replaced on evidence rather than on preference: an adapter that is cheaper
 * per useful record wins, and none of them is named anywhere in the pipeline.
 */
export function compileProspectAdapter({
  adapterId = '',
  kind = '',
  provider = '',
  evidenceClass = '',
  sourceType = '',
  costPerCallCents = null,
  externalCallsRequired = true,
  fields = []
} = {}) {
  const reasons = [];
  const id = text(adapterId, 120);
  const normalizedKind = text(kind, 60).toUpperCase();
  const normalizedSource = text(sourceType, 60).toUpperCase();
  if (!id) reasons.push('adapter-id-required');
  if (!ADAPTER_KINDS.includes(normalizedKind)) reasons.push('known-adapter-kind-required');
  if (!text(provider, 120)) reasons.push('adapter-provider-required');
  if (!isKnownEvidenceClass(evidenceClass)) reasons.push('known-evidence-class-required');
  if (!PROSPECT_SOURCE_TYPES.includes(normalizedSource)) reasons.push('known-source-type-required');
  const cost = Number(costPerCallCents);
  if (costPerCallCents != null && (!Number.isFinite(cost) || cost < 0)) reasons.push('non-negative-cost-required');
  if (reasons.length) return fail(reasons);
  return {
    ok: true,
    policyVersion: PROSPECT_INTELLIGENCE_POLICY_VERSION,
    adapterId: id,
    kind: normalizedKind,
    provider: text(provider, 120),
    evidenceClass: text(evidenceClass, 60).toUpperCase(),
    sourceType: normalizedSource,
    // Unknown cost stays unknown. A provider recorded as free is a provider
    // the allocator will always prefer, so "we did not measure it" must never
    // be written down as zero.
    costPerCallCents: costPerCallCents == null ? null : cost,
    externalCallsRequired: externalCallsRequired !== false,
    fields: [...new Set((Array.isArray(fields) ? fields : []).map(f => text(f, 60)).filter(Boolean))].slice(0, 40),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export function compileCompanyCandidate({
  companyId = '', name = '', domain = '', sourceType = '', sourceUrl = '',
  evidenceClass = '', discoveredAt = null, confidence = null, expiresAt = null, fields = {}
} = {}) {
  const normalizedDomain = normalizeDomain(domain);
  const normalizedSource = text(sourceType, 60).toUpperCase();
  const discoveredMs = parseTime(discoveredAt);
  const reasons = [];
  if (!text(name, 200) && !normalizedDomain) reasons.push('company-name-or-domain-required');
  if (!PROSPECT_SOURCE_TYPES.includes(normalizedSource)) reasons.push('known-source-type-required');
  if (!isKnownEvidenceClass(evidenceClass)) reasons.push('known-evidence-class-required');
  if (discoveredMs === null) reasons.push('discovered-at-required');
  if (reasons.length) return fail(reasons);
  const identity = { name: text(name, 200).toLowerCase(), domain: normalizedDomain };
  return {
    ok: true,
    policyVersion: PROSPECT_INTELLIGENCE_POLICY_VERSION,
    companyId: text(companyId, 120) || `company_${digest(identity).slice(0, 24)}`,
    name: text(name, 200),
    domain: normalizedDomain || null,
    sourceType: normalizedSource,
    sourceUrl: text(sourceUrl, 500) || null,
    evidenceClass: text(evidenceClass, 60).toUpperCase(),
    discoveredAt: new Date(discoveredMs).toISOString(),
    expiresAt: parseTime(expiresAt) === null ? null : new Date(parseTime(expiresAt)).toISOString(),
    confidence: cappedConfidence(evidenceClass, confidence ?? 0),
    fields: Object.fromEntries(
      Object.entries(fields || {}).filter(([key]) => COMPANY_FIELDS.includes(key)).map(([key, value]) => [key, text(value, 500)])
    ),
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

export function compilePersonCandidate({
  personId = '', companyId = '', name = '', role = '', seniority = '', department = '',
  publicProfileUrl = '', sourceType = '', sourceUrl = '', evidenceClass = '',
  discoveredAt = null, confidence = null, expiresAt = null
} = {}) {
  const normalizedSource = text(sourceType, 60).toUpperCase();
  const discoveredMs = parseTime(discoveredAt);
  const reasons = [];
  if (!text(name, 200)) reasons.push('person-name-required');
  if (!text(companyId, 120)) reasons.push('company-id-required');
  if (!PROSPECT_SOURCE_TYPES.includes(normalizedSource)) reasons.push('known-source-type-required');
  if (!isKnownEvidenceClass(evidenceClass)) reasons.push('known-evidence-class-required');
  if (discoveredMs === null) reasons.push('discovered-at-required');
  if (reasons.length) return fail(reasons);
  const identity = { name: text(name, 200).toLowerCase(), companyId: text(companyId, 120) };
  return {
    ok: true,
    policyVersion: PROSPECT_INTELLIGENCE_POLICY_VERSION,
    personId: text(personId, 120) || `person_${digest(identity).slice(0, 24)}`,
    companyId: text(companyId, 120),
    name: text(name, 200),
    role: text(role, 200) || null,
    seniority: text(seniority, 60).toUpperCase() || null,
    department: text(department, 100) || null,
    publicProfileUrl: text(publicProfileUrl, 500) || null,
    sourceType: normalizedSource,
    sourceUrl: text(sourceUrl, 500) || null,
    evidenceClass: text(evidenceClass, 60).toUpperCase(),
    discoveredAt: new Date(discoveredMs).toISOString(),
    expiresAt: parseTime(expiresAt) === null ? null : new Date(parseTime(expiresAt)).toISOString(),
    confidence: cappedConfidence(evidenceClass, confidence ?? 0),
    // Contact routes are never inferred here. A person candidate is a person,
    // not a mailbox; the route needs its own provenance.
    contactRoutes: [],
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

// ---------------------------------------------------------------------------
// Enrichment observations and reconciliation
// ---------------------------------------------------------------------------

export function compileEnrichmentObservation({
  subjectId = '', field = '', value = '', provider = '', sourceType = '',
  sourceUrl = '', evidenceClass = '', observedAt = null, confidence = null,
  expiresAt = null, costCents = null
} = {}) {
  const normalizedField = text(field, 60);
  const normalizedSource = text(sourceType, 60).toUpperCase();
  const observedMs = parseTime(observedAt);
  const reasons = [];
  if (!text(subjectId, 120)) reasons.push('subject-id-required');
  if (!PERSON_FIELDS.includes(normalizedField) && !COMPANY_FIELDS.includes(normalizedField)) reasons.push('known-enrichment-field-required');
  if (!text(provider, 120)) reasons.push('enrichment-provider-required');
  if (!PROSPECT_SOURCE_TYPES.includes(normalizedSource)) reasons.push('known-source-type-required');
  if (!isKnownEvidenceClass(evidenceClass)) reasons.push('known-evidence-class-required');
  if (observedMs === null) reasons.push('observed-at-required');
  const cost = Number(costCents);
  if (costCents != null && (!Number.isFinite(cost) || cost < 0)) reasons.push('non-negative-cost-required');
  if (reasons.length) return fail(reasons);
  return {
    ok: true,
    policyVersion: PROSPECT_INTELLIGENCE_POLICY_VERSION,
    observationId: `obs_${digest({ subjectId, field: normalizedField, provider, observedAt: observedMs, value: text(value, 500) }).slice(0, 24)}`,
    subjectId: text(subjectId, 120),
    field: normalizedField,
    value: text(value, 500),
    provider: text(provider, 120),
    sourceType: normalizedSource,
    sourceUrl: text(sourceUrl, 500) || null,
    evidenceClass: text(evidenceClass, 60).toUpperCase(),
    observedAt: new Date(observedMs).toISOString(),
    expiresAt: parseTime(expiresAt) === null ? null : new Date(parseTime(expiresAt)).toISOString(),
    confidence: cappedConfidence(evidenceClass, confidence ?? 0),
    costCents: costCents == null ? null : cost,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

/**
 * Decide what the system believes about one field.
 *
 * Rules, in order:
 *   1. An expired observation is not evidence.
 *   2. Stronger provenance wins outright.
 *   3. Among equal provenance, newest wins.
 *   4. Equal provenance that disagrees stays a conflict: the value is kept,
 *      the disagreement is recorded, and confidence is halved. It is never
 *      silently resolved and the losing values are never discarded.
 *   5. Nothing at all means UNKNOWN. Unknown is a real answer.
 */
export function reconcileEnrichmentField({ observations = [], now = new Date() } = {}) {
  const nowMs = parseTime(now);
  if (nowMs === null) return fail(['valid-current-time-required']);
  const usable = (Array.isArray(observations) ? observations : [])
    .filter(item => item?.ok === true && item.field)
    .slice(0, MAX_OBSERVATIONS);
  const live = usable.filter(item => item.expiresAt === null || parseTime(item.expiresAt) > nowMs);
  const expired = usable.filter(item => item.expiresAt !== null && parseTime(item.expiresAt) <= nowMs);

  if (!live.length) {
    return {
      ok: true,
      policyVersion: PROSPECT_INTELLIGENCE_POLICY_VERSION,
      field: usable[0]?.field ?? null,
      value: null,
      known: false,
      evidenceClass: null,
      confidence: 0,
      conflict: false,
      contributing: [],
      supersededBy: null,
      expiredCount: expired.length,
      reasonCodes: [usable.length ? 'all-observations-expired' : 'no-observation-on-record']
    };
  }

  const ranked = [...live].sort((a, b) => {
    const strength = evidenceStrength(b.evidenceClass) - evidenceStrength(a.evidenceClass);
    if (strength !== 0) return strength;
    const time = parseTime(b.observedAt) - parseTime(a.observedAt);
    if (time !== 0) return time;
    return a.observationId.localeCompare(b.observationId);
  });
  const best = ranked[0];
  const peers = ranked.filter(item => evidenceStrength(item.evidenceClass) === evidenceStrength(best.evidenceClass));
  const distinctValues = new Set(peers.map(item => item.value));
  const conflict = distinctValues.size > 1;
  const weaker = ranked.filter(item => evidenceStrength(item.evidenceClass) < evidenceStrength(best.evidenceClass) && item.value !== best.value);

  return {
    ok: true,
    policyVersion: PROSPECT_INTELLIGENCE_POLICY_VERSION,
    field: best.field,
    value: best.value,
    known: Boolean(best.value),
    evidenceClass: best.evidenceClass,
    provider: best.provider,
    observedAt: best.observedAt,
    confidence: conflict ? Number((best.confidence * 0.5).toFixed(4)) : best.confidence,
    conflict,
    conflictingValues: conflict ? [...distinctValues] : [],
    contributing: ranked.map(item => ({
      observationId: item.observationId,
      provider: item.provider,
      evidenceClass: item.evidenceClass,
      value: item.value,
      observedAt: item.observedAt
    })),
    // What a weaker source claimed is kept, not deleted. History is how a
    // provider's quality gets measured later.
    supersededBy: weaker.length ? best.observationId : null,
    supersededObservations: weaker.map(item => item.observationId),
    expiredCount: expired.length,
    reasonCodes: conflict ? ['provider-disagreement-lowers-confidence'] : []
  };
}

/**
 * Run the enrichment waterfall for one subject.
 *
 * The waterfall stops as soon as a field is known at or above the acceptance
 * threshold, so a paid provider is never called for something the company's
 * own site already answered. Adapters are not invoked here -- this compiles
 * the plan; whoever holds the budget executes it.
 */
export function planEnrichmentWaterfall({
  subjectId = '',
  requiredFields = [],
  existingObservations = [],
  adapters = [],
  acceptEvidenceAtOrAbove = 'PUBLIC_STRUCTURED',
  now = new Date()
} = {}) {
  if (!text(subjectId, 120)) return fail(['subject-id-required']);
  const threshold = evidenceStrength(acceptEvidenceAtOrAbove);
  if (threshold < 0) return fail(['known-evidence-class-required']);
  const fields = [...new Set((Array.isArray(requiredFields) ? requiredFields : []).map(f => text(f, 60)).filter(Boolean))];
  if (!fields.length) return fail(['required-fields-required']);

  const usableAdapters = (Array.isArray(adapters) ? adapters : [])
    .filter(adapter => adapter?.ok === true && adapter.kind === 'PERSON_ENRICHMENT')
    // Cheapest strong source first: sort by provenance descending, then by
    // known cost ascending. An adapter with unknown cost sorts last among
    // equals rather than first -- not measuring is not the same as free.
    .sort((a, b) => {
      const strength = evidenceStrength(b.evidenceClass) - evidenceStrength(a.evidenceClass);
      if (strength !== 0) return strength;
      const aCost = a.costPerCallCents ?? Number.MAX_SAFE_INTEGER;
      const bCost = b.costPerCallCents ?? Number.MAX_SAFE_INTEGER;
      return aCost - bCost;
    });

  const steps = [];
  const satisfied = [];
  let estimatedCostCents = 0;
  let costKnown = true;

  for (const field of fields) {
    const resolved = reconcileEnrichmentField({
      observations: (Array.isArray(existingObservations) ? existingObservations : []).filter(obs => obs?.field === field && obs?.subjectId === subjectId),
      now
    });
    if (resolved.known && evidenceStrength(resolved.evidenceClass) >= threshold && !resolved.conflict) {
      satisfied.push({ field, value: resolved.value, evidenceClass: resolved.evidenceClass, reason: 'already-known-at-sufficient-strength' });
      continue;
    }
    const candidates = usableAdapters.filter(adapter => !adapter.fields.length || adapter.fields.includes(field));
    if (!candidates.length) {
      steps.push({ field, adapterId: null, action: 'NO_ADAPTER_AVAILABLE', reasonCodes: ['field-remains-unknown'] });
      continue;
    }
    for (const adapter of candidates) {
      steps.push({
        field,
        adapterId: adapter.adapterId,
        provider: adapter.provider,
        evidenceClass: adapter.evidenceClass,
        costPerCallCents: adapter.costPerCallCents,
        action: 'CALL_IF_STILL_UNKNOWN',
        stopWhenEvidenceAtOrAbove: acceptEvidenceAtOrAbove
      });
      if (adapter.costPerCallCents == null) costKnown = false;
      else estimatedCostCents += adapter.costPerCallCents;
    }
  }

  return {
    ok: true,
    policyVersion: PROSPECT_INTELLIGENCE_POLICY_VERSION,
    subjectId: text(subjectId, 120),
    steps: steps.slice(0, MAX_CANDIDATES),
    satisfied,
    estimatedCostCents: costKnown ? estimatedCostCents : null,
    costKnown,
    // Compiling a plan calls nobody and spends nothing.
    executed: false,
    businessEffectAuthority: 'NONE',
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}

/**
 * Everything known about one prospect, with every claim's provenance attached.
 *
 * This is the only object downstream scoring is allowed to read, precisely so
 * scoring cannot see a bare string and mistake it for a fact.
 */
export function buildProspectEvidenceBundle({
  person = null,
  company = null,
  observations = [],
  contactRoutes = [],
  now = new Date()
} = {}) {
  if (!person?.ok) return fail(['valid-person-candidate-required']);
  const nowMs = parseTime(now);
  if (nowMs === null) return fail(['valid-current-time-required']);

  const byField = new Map();
  for (const field of PERSON_FIELDS) {
    const forField = (Array.isArray(observations) ? observations : [])
      .filter(obs => obs?.ok === true && obs.field === field && obs.subjectId === person.personId);
    if (forField.length) byField.set(field, reconcileEnrichmentField({ observations: forField, now }));
  }

  const routes = (Array.isArray(contactRoutes) ? contactRoutes : [])
    .filter(route => route && typeof route === 'object')
    .map(route => ({
      route: text(route.route, 320).toLowerCase(),
      kind: text(route.kind, 40).toUpperCase() || 'EMAIL',
      evidenceClass: text(route.evidenceClass, 60).toUpperCase(),
      discoveredVia: text(route.discoveredVia, 120) || null,
      discoveredAt: parseTime(route.discoveredAt) === null ? null : new Date(parseTime(route.discoveredAt)).toISOString(),
      sourceUrl: text(route.sourceUrl, 500) || null,
      // A route inherits nothing. Whether it can be sent to is decided by
      // contact-verification against this route's own provenance.
      sendableEvidenceClass: isSendableEvidenceClass(route.evidenceClass)
    }))
    .filter(route => route.route);

  const conflicts = [...byField.values()].filter(item => item.conflict).map(item => item.field);
  const unknownFields = PERSON_FIELDS.filter(field => !byField.get(field)?.known);

  return {
    ok: true,
    policyVersion: PROSPECT_INTELLIGENCE_POLICY_VERSION,
    personId: person.personId,
    companyId: person.companyId,
    company: company?.ok ? { companyId: company.companyId, name: company.name, domain: company.domain, evidenceClass: company.evidenceClass } : null,
    fields: Object.fromEntries([...byField.entries()].map(([field, resolved]) => [field, {
      value: resolved.value,
      known: resolved.known,
      evidenceClass: resolved.evidenceClass,
      confidence: resolved.confidence,
      conflict: resolved.conflict
    }])),
    contactRoutes: routes,
    conflicts,
    unknownFields,
    // The bundle's own confidence is its weakest load-bearing link, not an
    // average: averaging lets a pile of cheap agreeing sources outvote the one
    // field nobody actually knows.
    weakestConfidence: byField.size ? Math.min(...[...byField.values()].map(item => item.confidence)) : 0,
    externalEffectLedger: { ...ZERO_EXTERNAL_EFFECTS }
  };
}
