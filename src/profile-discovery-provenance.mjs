import { sha256 } from './omnia-v9/canonical.mjs';

export const PROFILE_DISCOVERY_VERSION = 'uberbond.profile-discovery-provenance.v1';

export const PROFILE_DISCOVERY_SOURCE_TYPES = Object.freeze([
  'public_search', 'public_profile', 'public_website',
  'licensed_export', 'provider_api', 'owner_import'
]);

const SOURCE_SET = new Set(PROFILE_DISCOVERY_SOURCE_TYPES);
const DIRECT_PUBLIC = new Set(['public_profile', 'public_website']);
const LICENSED = new Set(['licensed_export', 'provider_api']);

function text(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function clamp(value, fallback = 0.5) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : fallback;
}

function iso(value, fallback = new Date()) {
  const parsed = new Date(value || fallback);
  if (!Number.isFinite(parsed.getTime())) throw new Error('Profile discovery observedAt must be a valid timestamp');
  return parsed.toISOString();
}

function https(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function sourceType(value) {
  const normalized = text(value, 60).toLowerCase();
  if (!SOURCE_SET.has(normalized)) throw new Error(`Unsupported profile discovery source type: ${normalized || 'empty'}`);
  return normalized;
}

function evidenceClass(source) {
  if (DIRECT_PUBLIC.has(source)) return 'DIRECT_PUBLIC';
  if (LICENSED.has(source)) return 'LICENSED_PROVIDER';
  if (source === 'owner_import') return 'OWNER_ATTESTED';
  return 'ATTRIBUTED_DISCOVERY';
}

function sourceRank(source) {
  return {
    public_profile: 80,
    public_website: 75,
    licensed_export: 70,
    provider_api: 65,
    owner_import: 60,
    public_search: 35
  }[source] || 0;
}

export function normalizeProfileDiscoveryRecord(input = {}, { now = new Date() } = {}) {
  const source = sourceType(input.sourceType || input.source || 'public_search');
  const sourceUrl = https(input.sourceUrl || input.resultUrl || input.profileUrl);
  if (!sourceUrl) throw new Error('Profile discovery requires an HTTPS source URL');

  const companyId = text(input.companyId || input.accountId, 160);
  if (!companyId) throw new Error('Profile discovery requires companyId');

  const name = text(input.name || input.fullName, 180);
  const role = text(input.role || input.title || input.headline, 180);
  const profileUrl = https(input.profileUrl || (source === 'public_profile' ? sourceUrl : ''));
  if (!name && !profileUrl) throw new Error('Profile discovery requires a name or HTTPS public profile URL');

  const observedAt = iso(input.observedAt, now);
  const sourceLicense = text(input.sourceLicense || input.license, 220);
  if (LICENSED.has(source) && !sourceLicense) throw new Error('Licensed/provider profile discovery requires sourceLicense');

  const providerCostCents = Math.max(0, Math.round(Number(input.providerCostCents) || 0));
  const digest = sha256({
    source, sourceUrl, companyId, name, role, profileUrl,
    observedAt, sourceRecordId: text(input.sourceRecordId, 180)
  });

  return {
    version: PROFILE_DISCOVERY_VERSION,
    discoveryId: text(input.discoveryId, 160) || `profiledisc_${digest.slice(0, 24)}`,
    companyId,
    name,
    role,
    seniority: text(input.seniority, 80),
    department: text(input.department, 100),
    profileUrl,
    sourceType: source,
    sourceUrl,
    sourceRecordId: text(input.sourceRecordId, 180),
    sourceLicense,
    evidenceClass: evidenceClass(source),
    confidence: Number(clamp(input.confidence, source === 'public_search' ? 0.35 : 0.65).toFixed(3)),
    observedAt,
    identityStatus: 'UNVERIFIED_PERSON_CANDIDATE',
    contactAuthority: 'NONE',
    outreachEligible: false,
    providerCostCents,
    providerCalls: 0,
    externalEffects: 0,
    businessEffectAuthority: 'NONE',
    retainedContactFields: [],
    note: 'Discovery evidence identifies a candidate only. It is not person verification, contact verification, consent, or outreach authority.'
  };
}

function identityKey(record) {
  if (record.profileUrl) return `profile:${record.profileUrl.toLowerCase()}`;
  return `name-company:${record.name.toLowerCase()}::${record.companyId.toLowerCase()}`;
}

export function reconcileProfileDiscovery(records = [], { now = new Date() } = {}) {
  const normalized = records.map(record => record?.version === PROFILE_DISCOVERY_VERSION ? { ...record } : normalizeProfileDiscoveryRecord(record, { now }));
  const groups = new Map();
  for (const record of normalized) {
    const key = identityKey(record);
    const group = groups.get(key) || [];
    group.push(record);
    groups.set(key, group);
  }

  const candidates = [];
  for (const [key, group] of groups) {
    const roles = [...new Set(group.map(item => item.role.trim().toLowerCase()).filter(Boolean))];
    const companyIds = [...new Set(group.map(item => item.companyId.trim().toLowerCase()).filter(Boolean))];
    const conflictReasons = [];
    if (companyIds.length > 1) conflictReasons.push('company-identity-conflict');
    if (roles.length > 1 && group.filter(item => item.evidenceClass === 'DIRECT_PUBLIC').length > 1) conflictReasons.push('direct-role-conflict');

    const preferred = [...group].sort((a, b) => {
      const rank = sourceRank(b.sourceType) - sourceRank(a.sourceType);
      if (rank) return rank;
      const confidence = b.confidence - a.confidence;
      if (confidence) return confidence;
      return String(b.observedAt).localeCompare(String(a.observedAt));
    })[0];

    candidates.push({
      identityKey: key,
      status: conflictReasons.length ? 'CONFLICT' : group.length > 1 ? 'CORROBORATED_CANDIDATE' : 'SINGLE_SOURCE_CANDIDATE',
      preferred,
      observations: group,
      conflictReasons,
      identityVerified: false,
      contactAuthority: 'NONE',
      outreachEligible: false,
      externalEffects: 0,
      businessEffectAuthority: 'NONE'
    });
  }

  candidates.sort((a, b) => {
    const aConflict = a.status === 'CONFLICT' ? 1 : 0;
    const bConflict = b.status === 'CONFLICT' ? 1 : 0;
    return aConflict - bConflict || b.observations.length - a.observations.length || a.identityKey.localeCompare(b.identityKey);
  });

  return {
    version: PROFILE_DISCOVERY_VERSION,
    candidates,
    summary: {
      observations: normalized.length,
      candidates: candidates.length,
      conflicts: candidates.filter(item => item.status === 'CONFLICT').length,
      corroborated: candidates.filter(item => item.status === 'CORROBORATED_CANDIDATE').length,
      verifiedPeople: 0,
      contactAuthorized: 0
    },
    providerCalls: 0,
    externalEffects: 0,
    businessEffectAuthority: 'NONE'
  };
}

export function buildProfileDiscoveryHandoff(records = [], options = {}) {
  const reconciled = reconcileProfileDiscovery(records, options);
  return {
    ...reconciled,
    handoff: reconciled.candidates.map(candidate => ({
      identityKey: candidate.identityKey,
      status: candidate.status,
      companyId: candidate.preferred?.companyId || '',
      name: candidate.preferred?.name || '',
      role: candidate.preferred?.role || '',
      publicProfileUrl: candidate.preferred?.profileUrl || '',
      sourceType: candidate.preferred?.sourceType || '',
      sourceUrl: candidate.preferred?.sourceUrl || '',
      evidenceClass: candidate.preferred?.evidenceClass || '',
      confidence: candidate.preferred?.confidence ?? 0,
      exactIdentity: false,
      inferred: candidate.preferred?.sourceType === 'public_search',
      contactAuthority: 'NONE',
      outreachEligible: false,
      nextAction: candidate.status === 'CONFLICT'
        ? 'Resolve contradictory public/licensed evidence before enrichment.'
        : 'Pass candidate to evidence reconciliation; do not treat discovery as verified identity or a contact route.'
    })),
    note: 'This handoff is intentionally weaker than a verified PersonCandidate. Discovery may nominate who to investigate, never who to contact.'
  };
}
