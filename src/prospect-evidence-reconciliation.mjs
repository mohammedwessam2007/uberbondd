import { sha256 } from './omnia-v9/canonical.mjs';

export const PROSPECT_EVIDENCE_VERSION = 'uberbond.prospect-evidence-reconciliation.v1';

export const CONTACT_VERIFICATION_STATES = Object.freeze([
  'VALID', 'INVALID', 'CATCH_ALL', 'RISKY', 'UNKNOWN',
  'TEMPORARY_FAILURE', 'SUPPRESSED', 'STALE'
]);

export const PROSPECT_SOURCE_TYPES = Object.freeze([
  'first_party', 'owner_import', 'public_website', 'public_profile',
  'search_engine', 'licensed_provider', 'provider_api', 'model_inference'
]);

export const EVIDENCE_CLASSES = Object.freeze([
  'DIRECT_FIRST_PARTY', 'DIRECT_PUBLIC', 'LICENSED_PROVIDER',
  'ATTRIBUTED', 'MODEL_INFERENCE'
]);

const VERIFICATION_SET = new Set(CONTACT_VERIFICATION_STATES);
const SOURCE_SET = new Set(PROSPECT_SOURCE_TYPES);
const EVIDENCE_SET = new Set(EVIDENCE_CLASSES);
const DIRECT_CLASSES = new Set(['DIRECT_FIRST_PARTY', 'DIRECT_PUBLIC', 'LICENSED_PROVIDER']);

const SOURCE_WEIGHT = Object.freeze({
  first_party: 100,
  owner_import: 90,
  public_website: 80,
  public_profile: 70,
  licensed_provider: 65,
  provider_api: 60,
  search_engine: 45,
  model_inference: 10
});

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}
function number(value, fallback = 0, min = 0, max = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
function iso(value, fallback = null) {
  const parsed = new Date(value || fallback || '');
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
function https(value) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.toString() : '';
  } catch { return ''; }
}
function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}
function canonicalValue(value) {
  if (typeof value === 'string') return value.trim().toLowerCase();
  return JSON.stringify(value ?? null);
}
function normalizeSourceType(value) {
  const sourceType = text(value, 60).toLowerCase();
  if (!SOURCE_SET.has(sourceType)) throw new Error(`Unsupported prospect source type: ${sourceType || 'empty'}`);
  return sourceType;
}
// The strongest evidence class each source is capable of supporting.
//
// sourceType and evidenceClass were two independent strings a caller set, so a
// search-engine snippet could be filed as DIRECT_FIRST_PARTY -- the class
// reserved for the subject telling us directly -- and thereby enter the set of
// direct evidence, outrank a company's own team page, and manufacture a
// conflict against it. A class is a claim about where something came from, and
// the source already says where it came from.
//
// A caller may still declare a weaker class than the source allows: choosing to
// trust something less is always permitted. Declaring a stronger one is
// laundering, and is clamped.
const MAX_EVIDENCE_CLASS_BY_SOURCE = Object.freeze({
  first_party: 'DIRECT_FIRST_PARTY',
  owner_import: 'DIRECT_FIRST_PARTY',
  public_website: 'DIRECT_PUBLIC',
  public_profile: 'DIRECT_PUBLIC',
  licensed_provider: 'LICENSED_PROVIDER',
  provider_api: 'LICENSED_PROVIDER',
  search_engine: 'ATTRIBUTED',
  model_inference: 'MODEL_INFERENCE'
});

// Weakest to strongest. Position is the whole point: clamping compares here.
const EVIDENCE_CLASS_STRENGTH = Object.freeze([
  'MODEL_INFERENCE',
  'ATTRIBUTED',
  'LICENSED_PROVIDER',
  'DIRECT_PUBLIC',
  'DIRECT_FIRST_PARTY'
]);

/**
 * Clamp a declared evidence class to what its source can support.
 *
 * @returns {{evidenceClass: string, clamped: boolean, declared: string}}
 */
export function clampEvidenceClassToSource(sourceType, declaredClass) {
  const ceiling = MAX_EVIDENCE_CLASS_BY_SOURCE[sourceType] || 'MODEL_INFERENCE';
  const declaredIndex = EVIDENCE_CLASS_STRENGTH.indexOf(declaredClass);
  const ceilingIndex = EVIDENCE_CLASS_STRENGTH.indexOf(ceiling);
  if (declaredIndex < 0) return { evidenceClass: ceiling, clamped: false, declared: declaredClass };
  if (declaredIndex <= ceilingIndex) return { evidenceClass: declaredClass, clamped: false, declared: declaredClass };
  return { evidenceClass: ceiling, clamped: true, declared: declaredClass };
}

function normalizeEvidenceClass(value) {
  const evidenceClass = text(value, 60).toUpperCase();
  if (!EVIDENCE_SET.has(evidenceClass)) throw new Error(`Unsupported evidence class: ${evidenceClass || 'empty'}`);
  return evidenceClass;
}

export function normalizePersonCandidate(input = {}, { now = new Date() } = {}) {
  const sourceType = normalizeSourceType(input.sourceType || input.source || 'public_website');
  const declaredClass = normalizeEvidenceClass(input.evidenceClass || (sourceType === 'model_inference' ? 'MODEL_INFERENCE' : sourceType === 'licensed_provider' || sourceType === 'provider_api' ? 'LICENSED_PROVIDER' : sourceType === 'first_party' ? 'DIRECT_FIRST_PARTY' : 'DIRECT_PUBLIC'));
  const { evidenceClass, clamped: evidenceClassClamped } = clampEvidenceClassToSource(sourceType, declaredClass);
  const name = text(input.name || input.fullName, 180);
  const companyId = text(input.companyId || input.accountId, 160);
  const role = text(input.role || input.title, 180);
  const publicProfileUrl = https(input.publicProfileUrl || input.profileUrl || input.sourceUrl);
  if (!name && !publicProfileUrl) throw new Error('Person candidate needs a name or HTTPS public profile URL');
  if (!companyId) throw new Error('Person candidate needs companyId');
  const observedAt = iso(input.observedAt, now);
  const expiresAt = iso(input.expiresAt);
  const digest = sha256({ name, companyId, role, publicProfileUrl, sourceType, evidenceClass, observedAt });
  return {
    version: PROSPECT_EVIDENCE_VERSION,
    personId: text(input.personId, 160) || `person_${digest.slice(0, 24)}`,
    companyId, name, role,
    seniority: text(input.seniority, 80),
    department: text(input.department, 100),
    publicProfileUrl,
    sourceType,
    sourceUrl: https(input.sourceUrl || publicProfileUrl),
    evidenceClass,
    declaredEvidenceClass: declaredClass,
    evidenceClassClamped,
    confidence: Number(number(input.confidence, 0.5).toFixed(3)),
    observedAt,
    expiresAt,
    exactIdentity: input.exactIdentity === true,
    inferred: input.inferred === true || evidenceClass === 'MODEL_INFERENCE',
    providerCalls: 0,
    externalEffects: 0,
    businessEffectAuthority: 'NONE'
  };
}

export function normalizeEnrichmentObservation(input = {}, { now = new Date() } = {}) {
  const field = text(input.field, 100).toLowerCase();
  if (!field) throw new Error('Enrichment observation needs field');
  const sourceType = normalizeSourceType(input.sourceType || input.source || 'provider_api');
  const declaredClass = normalizeEvidenceClass(input.evidenceClass || (sourceType === 'model_inference' ? 'MODEL_INFERENCE' : sourceType === 'first_party' ? 'DIRECT_FIRST_PARTY' : sourceType === 'public_website' || sourceType === 'public_profile' ? 'DIRECT_PUBLIC' : 'LICENSED_PROVIDER'));
  const { evidenceClass, clamped: evidenceClassClamped } = clampEvidenceClassToSource(sourceType, declaredClass);
  const observedAt = iso(input.observedAt, now);
  const expiresAt = iso(input.expiresAt);
  const value = input.value === undefined ? null : input.value;
  const provider = text(input.provider || sourceType, 120);
  const digest = sha256({ field, value, sourceType, evidenceClass, provider, observedAt, sourceRecordId: text(input.sourceRecordId, 180) });
  return {
    version: PROSPECT_EVIDENCE_VERSION,
    observationId: text(input.observationId, 160) || `enrich_${digest.slice(0, 24)}`,
    prospectId: text(input.prospectId, 160),
    personId: text(input.personId, 160),
    field, value,
    provider,
    sourceType,
    sourceUrl: https(input.sourceUrl),
    sourceRecordId: text(input.sourceRecordId, 180),
    evidenceClass,
    declaredEvidenceClass: declaredClass,
    evidenceClassClamped,
    confidence: Number(number(input.confidence, 0.5).toFixed(3)),
    exact: input.exact !== false,
    inferred: input.inferred === true || evidenceClass === 'MODEL_INFERENCE',
    observedAt,
    expiresAt,
    providerCostCents: Math.max(0, Math.round(Number(input.providerCostCents) || 0)),
    externalEffects: 0,
    businessEffectAuthority: 'NONE'
  };
}

export function reconcileFieldObservations(observations = [], { now = new Date() } = {}) {
  const normalized = observations.map(item => item?.version === PROSPECT_EVIDENCE_VERSION ? { ...item } : normalizeEnrichmentObservation(item, { now }));
  if (!normalized.length) return { status: 'NO_EVIDENCE', preferred: null, conflicts: [], observations: [] };
  const field = normalized[0].field;
  if (normalized.some(item => item.field !== field)) throw new Error('Cannot reconcile observations for different fields');
  const active = normalized.filter(item => !item.expiresAt || Date.parse(item.expiresAt) > new Date(now).getTime());
  const stale = normalized.filter(item => item.expiresAt && Date.parse(item.expiresAt) <= new Date(now).getTime());
  if (!active.length) return { status: 'STALE_ONLY', preferred: null, conflicts: [], stale, observations: normalized };

  const direct = active.filter(item => DIRECT_CLASSES.has(item.evidenceClass) && item.inferred !== true);
  const values = new Map();
  for (const item of direct) {
    const key = canonicalValue(item.value);
    if (!values.has(key)) values.set(key, []);
    values.get(key).push(item);
  }
  if (values.size > 1) {
    return {
      status: 'CONFLICT', preferred: null,
      conflicts: [...values.values()].map(group => ({ value: group[0].value, observationIds: group.map(item => item.observationId), evidenceClasses: [...new Set(group.map(item => item.evidenceClass))] })),
      stale, observations: normalized
    };
  }

  const candidates = direct.length ? direct : active;
  const sorted = [...candidates].sort((a, b) => {
    const sourceDelta = (SOURCE_WEIGHT[b.sourceType] || 0) - (SOURCE_WEIGHT[a.sourceType] || 0);
    if (sourceDelta) return sourceDelta;
    const confidenceDelta = b.confidence - a.confidence;
    if (confidenceDelta) return confidenceDelta;
    return String(b.observedAt || '').localeCompare(String(a.observedAt || ''));
  });
  const preferred = sorted[0] || null;
  return {
    status: values.size === 1 && direct.length > 1 ? 'CONSENSUS' : direct.length ? 'DIRECT_EVIDENCE' : 'WEAK_EVIDENCE_ONLY',
    preferred,
    conflicts: [], stale, observations: normalized
  };
}

export function normalizeContactVerification(input = {}, { now = new Date() } = {}) {
  const route = text(input.route || input.email, 320).toLowerCase();
  if (!validEmail(route)) throw new Error('Contact verification requires a syntactically valid email route');
  const rawState = text(input.state || input.status || 'UNKNOWN', 60).toUpperCase().replace(/[- ]/g, '_');
  if (!VERIFICATION_SET.has(rawState)) throw new Error(`Unsupported contact verification state: ${rawState}`);
  const checkedAt = iso(input.checkedAt || input.observedAt, now);
  const expiresAt = iso(input.expiresAt);
  const provider = text(input.provider || 'unknown-provider', 120);
  const evidenceClass = normalizeEvidenceClass(input.evidenceClass || 'LICENSED_PROVIDER');
  const digest = sha256({ route, rawState, checkedAt, expiresAt, provider, sourceRecordId: text(input.sourceRecordId, 180) });
  return {
    version: PROSPECT_EVIDENCE_VERSION,
    verificationId: text(input.verificationId, 160) || `verify_${digest.slice(0, 24)}`,
    route,
    state: rawState,
    provider,
    sourceUrl: https(input.sourceUrl),
    sourceRecordId: text(input.sourceRecordId, 180),
    evidenceClass,
    confidence: Number(number(input.confidence, rawState === 'VALID' || rawState === 'INVALID' ? 0.9 : 0.5).toFixed(3)),
    checkedAt,
    expiresAt,
    riskFlags: [...new Set((Array.isArray(input.riskFlags) ? input.riskFlags : []).map(item => text(item, 100)).filter(Boolean))].slice(0, 30),
    providerCostCents: Math.max(0, Math.round(Number(input.providerCostCents) || 0)),
    providerCalls: 0,
    externalEffects: 0,
    businessEffectAuthority: 'NONE'
  };
}

// Domains where the mailbox provider ignores dots in the local part, so
// `b.uyer@` and `buyer@` are one person with one inbox and one unsubscribe.
const DOT_INSENSITIVE_DOMAINS = new Set(['gmail.com', 'googlemail.com']);

// Risk flags that are a person telling us to stop, not a deliverability score.
const REFUSAL_RISK_FLAGS = new Set([
  'spam-complaint', 'complaint', 'unsubscribe', 'unsubscribed',
  'opt-out', 'opted-out', 'do-not-contact', 'dnc', 'abuse-report'
]);

/**
 * The address as the receiving mailbox sees it.
 *
 * Suppression is matched on this, never on the raw string. Someone who
 * unsubscribes as `buyer@example.com` has not consented to be contacted at
 * `buyer+news@example.com`, and an enrichment provider handing back the tagged
 * form is the ordinary way a suppressed contact gets resurrected. Over-matching
 * costs a lead; under-matching costs a complaint we were told not to earn, so
 * this deliberately errs wide.
 */
export function canonicalContactRoute(value) {
  const route = text(value, 320).toLowerCase();
  const at = route.lastIndexOf('@');
  if (at <= 0) return route;
  let local = route.slice(0, at);
  const domain = route.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  if (DOT_INSENSITIVE_DOMAINS.has(domain)) local = local.replaceAll('.', '');
  return `${local}@${domain}`;
}

function suppressionMatches(route, suppression = {}) {
  const raw = text(suppression.value || suppression.email || suppression.route, 320).toLowerCase();
  if (!raw) return false;
  const domain = route.split('@')[1] || '';
  // A bare domain entry suppresses the whole domain.
  if (raw === domain || raw === `@${domain}`) return true;
  return canonicalContactRoute(raw) === canonicalContactRoute(route);
}

export function evaluateContactRoute({ route, verifications = [], suppressions = [], now = new Date() } = {}) {
  const email = text(route, 320).toLowerCase();
  if (!validEmail(email)) throw new Error('evaluateContactRoute requires a syntactically valid email');
  const matchingSuppressions = (suppressions || []).filter(item => suppressionMatches(email, item));
  if (matchingSuppressions.length) {
    return {
      route: email, status: 'BLOCKED_SUPPRESSED', usableForHandoff: false,
      reasonCodes: ['suppression-dominates-verification'],
      suppressionCount: matchingSuppressions.length,
      businessEffectAuthority: 'NONE', externalEffects: 0
    };
  }
  const normalized = (verifications || []).map(item => item?.version === PROSPECT_EVIDENCE_VERSION ? { ...item } : normalizeContactVerification({ ...item, route: item.route || email }, { now })).filter(item => item.route === email);
  if (!normalized.length) return { route: email, status: 'NEEDS_VERIFICATION', usableForHandoff: false, reasonCodes: ['no-verification-evidence'], businessEffectAuthority: 'NONE', externalEffects: 0 };
  const ordered = [...normalized].sort((a, b) => String(b.checkedAt).localeCompare(String(a.checkedAt)));

  // Suppression is sticky, and it is not a data point that a later provider
  // gets to outvote. An unsubscribe recorded as a SUPPRESSED verification used
  // to be overridden by any fresher VALID check -- which is precisely how an
  // enrichment run resurrects somebody who asked to be left alone.
  const everSuppressed = normalized.find(item => item.state === 'SUPPRESSED');
  if (everSuppressed) {
    return {
      route: email, status: 'BLOCKED_SUPPRESSED', usableForHandoff: false,
      verification: everSuppressed,
      reasonCodes: ['suppression-dominates-verification'],
      businessEffectAuthority: 'NONE', externalEffects: 0
    };
  }

  // A complaint or opt-out recorded as a risk flag is the same refusal wearing
  // a different field name.
  const refusalFlagged = normalized.find(item =>
    (item.riskFlags || []).some(flag => REFUSAL_RISK_FLAGS.has(text(flag, 100).toLowerCase())));
  if (refusalFlagged) {
    return {
      route: email, status: 'BLOCKED_SUPPRESSED', usableForHandoff: false,
      verification: refusalFlagged,
      reasonCodes: ['contact-refusal-flag-present'],
      businessEffectAuthority: 'NONE', externalEffects: 0
    };
  }

  const latest = ordered[0];
  const expired = latest.expiresAt && Date.parse(latest.expiresAt) <= new Date(now).getTime();
  if (expired || latest.state === 'STALE') return { route: email, status: 'REVERIFY_REQUIRED', usableForHandoff: false, verification: latest, reasonCodes: ['verification-stale'], businessEffectAuthority: 'NONE', externalEffects: 0 };
  if (latest.state === 'INVALID') return { route: email, status: 'BLOCKED_INVALID', usableForHandoff: false, verification: latest, reasonCodes: ['verification-invalid'], businessEffectAuthority: 'NONE', externalEffects: 0 };
  if (latest.state === 'SUPPRESSED') return { route: email, status: 'BLOCKED_SUPPRESSED', usableForHandoff: false, verification: latest, reasonCodes: ['verification-suppressed'], businessEffectAuthority: 'NONE', externalEffects: 0 };
  if (latest.state === 'TEMPORARY_FAILURE') return { route: email, status: 'DEFER_TEMPORARY_FAILURE', usableForHandoff: false, verification: latest, reasonCodes: ['temporary-verifier-failure'], businessEffectAuthority: 'NONE', externalEffects: 0 };
  if (['CATCH_ALL', 'RISKY', 'UNKNOWN'].includes(latest.state)) return { route: email, status: 'NEEDS_REVIEW', usableForHandoff: false, verification: latest, reasonCodes: [`verification-${latest.state.toLowerCase()}`], businessEffectAuthority: 'NONE', externalEffects: 0 };
  return { route: email, status: 'VERIFIED_ROUTE', usableForHandoff: latest.state === 'VALID', verification: latest, reasonCodes: [], businessEffectAuthority: 'NONE', externalEffects: 0 };
}

export function buildProspectEvidenceBundle({ prospectId = '', personCandidates = [], enrichmentObservations = [], contactRoutes = [], suppressions = [], now = new Date() } = {}) {
  const normalizedPeople = personCandidates.map(item => item?.version === PROSPECT_EVIDENCE_VERSION ? { ...item } : normalizePersonCandidate(item, { now }));
  const normalizedObservations = enrichmentObservations.map(item => item?.version === PROSPECT_EVIDENCE_VERSION ? { ...item } : normalizeEnrichmentObservation(item, { now }));
  const fields = [...new Set(normalizedObservations.map(item => item.field))];
  const reconciledFields = Object.fromEntries(fields.map(field => [field, reconcileFieldObservations(normalizedObservations.filter(item => item.field === field), { now })]));
  const routes = contactRoutes.map(item => {
    const route = typeof item === 'string' ? item : item.route || item.email;
    const verifications = typeof item === 'string' ? [] : item.verifications || [];
    return evaluateContactRoute({ route, verifications, suppressions, now });
  });
  const conflicts = Object.entries(reconciledFields).filter(([, result]) => result.status === 'CONFLICT').map(([field]) => field);
  return {
    version: PROSPECT_EVIDENCE_VERSION,
    prospectId: text(prospectId, 160),
    people: normalizedPeople,
    reconciledFields,
    routes,
    summary: {
      people: normalizedPeople.length,
      fields: fields.length,
      conflicts,
      verifiedRoutes: routes.filter(item => item.status === 'VERIFIED_ROUTE').length,
      blockedRoutes: routes.filter(item => item.status.startsWith('BLOCKED_')).length,
      reviewRoutes: routes.filter(item => ['NEEDS_REVIEW', 'NEEDS_VERIFICATION', 'REVERIFY_REQUIRED', 'DEFER_TEMPORARY_FAILURE'].includes(item.status)).length
    },
    generatedAt: iso(now, now),
    providerCalls: 0,
    externalEffects: 0,
    businessEffectAuthority: 'NONE',
    note: 'This bundle reconciles prospect evidence only. It cannot authorize outreach or any other business-world effect.'
  };
}
