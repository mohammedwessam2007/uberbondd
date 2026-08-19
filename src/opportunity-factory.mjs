import { sha256 } from './omnia-v9/canonical.mjs';
import {
  createOutreachRouteEvidence,
  normalizeOutreachEmail,
  providerRoutePolicy
} from './outreach-governance.mjs';

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const CLOCK_SKEW_MS = 5 * 60_000;

export const OPPORTUNITY_SCHEMA_VERSION = 'uberbond.opportunity.v1';
export const PROFILE_SCHEMA_VERSION = 'uberbond.opportunity-profile.v1';
export const PACKET_SCHEMA_VERSION = 'uberbond.opportunity-packet.v1';

export const SUBMISSION_MECHANISMS = Object.freeze([
  'EMAIL',
  'MANUAL_FORM',
  'PLATFORM',
  'NONE'
]);

export const REQUIREMENT_KINDS = Object.freeze([
  'MIN_RELEVANT_YEARS',
  'REQUIRED_LANGUAGE',
  'B2B_LEGAL_ABILITY',
  'REQUIRED_CLAIM',
  'REQUIRED_ASSET',
  'RESIDENCE_COUNTRY',
  'OWNER_JUDGMENT'
]);

export const OPPORTUNITY_DECISIONS = Object.freeze([
  'READY_FOR_OWNER_REVIEW',
  'BLOCKED_PRIOR_CONTACT',
  'BLOCKED_SOURCE_RECHECK',
  'REJECT_REQUIREMENT_MISMATCH',
  'HOLD_EXTERNAL_REQUIREMENT',
  'HOLD_MATERIALS',
  'REJECT_CLAIM_RISK',
  'HOLD_PROVIDER_ROUTE',
  'HOLD_LOW_PRIORITY',
  'HOLD_NO_SUBMISSION_ROUTE',
  'REJECT_INVALID'
]);

const SUBMISSION_SET = new Set(SUBMISSION_MECHANISMS);
const REQUIREMENT_SET = new Set(REQUIREMENT_KINDS);
const ROUTE_SET = new Set([
  'SOLICITED_APPLICATION',
  'EXPLICIT_CONSENT',
  'REQUESTED_INFORMATION'
]);
const PERMISSION_SET = new Set([
  'JOB_APPLICATION',
  'CONTRACTOR_APPLICATION',
  'SERVICE_INFORMATION'
]);
const STRATEGY_LANES = new Set([
  'DIAGNOSTIC_WEDGE',
  'QA_CONTRACT',
  'FREELANCE_NETWORK',
  'SIDE_INCOME'
]);
const CLAIM_STATUSES = new Set(['EVIDENCED', 'UNVERIFIED', 'PROHIBITED']);
const ASSET_STATUSES = new Set(['VERIFIED_PRESENT', 'MISSING', 'BROKEN', 'STALE']);
const B2B_STATUSES = new Set(['VERIFIED', 'UNVERIFIED', 'DENIED']);

const OPPORTUNITY_FIELDS = new Set([
  'schemaVersion', 'id', 'organization', 'organizationDomain', 'title',
  'sourceUrl', 'sourceExcerpt', 'sourceObservedAt', 'sourceExpiresAt',
  'jurisdiction', 'routeType', 'permissionScope', 'submissionMechanism',
  'recipientEmail', 'recipientName', 'subject', 'body', 'requirements',
  'fitSignals', 'requiredAssetIds', 'claimIds', 'strategyLane', 'notes'
]);
const FIT_FIELDS = new Set([
  'qaExplicit', 'freelanceExplicit', 'remoteExplicit', 'agencyContext',
  'websiteScopeExplicit', 'medicalContext', 'fixedDiagnosticFit',
  'estimatedDecisionDays', 'applicationMinutes'
]);
const REQUIREMENT_FIELDS = new Set(['id', 'kind', 'mandatory', 'value', 'note']);
const PROFILE_FIELDS = new Set([
  'schemaVersion', 'id', 'relevantExperienceYears', 'languages',
  'residenceCountry', 'b2bContractStatus', 'b2bEvidenceDigest', 'claims',
  'prohibitedPhrases'
]);
const CLAIM_FIELDS = new Set(['id', 'status', 'text', 'evidenceAssetIds']);
const ASSET_FIELDS = new Set(['id', 'kind', 'label', 'digest', 'status', 'observedAt']);
const TOMBSTONE_FIELDS = new Set([
  'id', 'organizationDomain', 'recipientEmail', 'sourceUrl', 'contactedAt',
  'status', 'messageDigest', 'threadId', 'note'
]);
const EVENT_FIELDS = new Set([
  'id', 'opportunityId', 'eventType', 'occurredAt', 'valueUsd', 'receiptDigest'
]);

const TRANSITIONS = Object.freeze({
  DISCOVERED: new Set(['EVALUATED']),
  EVALUATED: new Set(['REJECTED', 'HELD', 'READY_FOR_OWNER_REVIEW']),
  READY_FOR_OWNER_REVIEW: new Set(['OWNER_APPROVED_PREPARATION', 'OWNER_REJECTED']),
  OWNER_APPROVED_PREPARATION: new Set(['EXTERNAL_SUBMISSION_PENDING']),
  EXTERNAL_SUBMISSION_PENDING: new Set(['SUBMITTED', 'UNCERTAIN', 'OWNER_CANCELLED']),
  SUBMITTED: new Set(['REPLIED', 'BOUNCED', 'NO_REPLY', 'WITHDRAWN']),
  REPLIED: new Set(['PAID_DIAGNOSTIC', 'LOST', 'OWNER_CANCELLED']),
  PAID_DIAGNOSTIC: new Set(['DELIVERED', 'REFUNDED', 'DISPUTED']),
  DELIVERED: new Set(['ACCEPTED', 'REWORK_REQUIRED', 'DISPUTED'])
});

export class OpportunityFactoryError extends Error {
  constructor(message, code = 'OPPORTUNITY_FACTORY_ERROR', detail = {}) {
    super(message);
    this.name = 'OpportunityFactoryError';
    this.code = code;
    this.detail = detail;
  }
}

function text(value) {
  return String(value ?? '').trim();
}

function uniqueStrings(values, { lower = false } = {}) {
  if (!Array.isArray(values)) return [];
  const normalized = values
    .map(value => text(value))
    .filter(Boolean)
    .map(value => lower ? value.toLowerCase() : value);
  return [...new Set(normalized)];
}

function validHttpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function normalizeDomain(value) {
  let candidate = text(value).toLowerCase();
  if (!candidate) return '';
  try {
    if (!candidate.includes('://')) candidate = `https://${candidate}`;
    const host = new URL(candidate).hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return '';
  }
}

function isoMs(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OpportunityFactoryError(`${name} must be an object`, 'INVALID_SHAPE', { name });
  }
  return value;
}

function assertClosed(value, allowedFields, name) {
  requireObject(value, name);
  const unknown = Object.keys(value).find(key => !allowedFields.has(key));
  if (unknown) {
    throw new OpportunityFactoryError(`${name} contains unknown field: ${unknown}`, 'UNKNOWN_FIELD', { name, unknown });
  }
}

function boundedBoolean(value) {
  return value === true;
}

function boundedInteger(value, min, max, field) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new OpportunityFactoryError(`${field} must be an integer from ${min} to ${max}`, 'INVALID_NUMBER', { field });
  }
  return number;
}

function normalizeRequirement(input, index) {
  assertClosed(input, REQUIREMENT_FIELDS, `requirements[${index}]`);
  const requirement = {
    id: text(input.id),
    kind: text(input.kind).toUpperCase(),
    mandatory: input.mandatory !== false,
    value: Array.isArray(input.value)
      ? uniqueStrings(input.value)
      : typeof input.value === 'number'
        ? input.value
        : text(input.value),
    note: text(input.note).slice(0, 1000)
  };
  if (!requirement.id) throw new OpportunityFactoryError('Every requirement needs an id', 'REQUIREMENT_ID_MISSING');
  if (!REQUIREMENT_SET.has(requirement.kind)) {
    throw new OpportunityFactoryError(`Unsupported requirement kind: ${requirement.kind}`, 'REQUIREMENT_KIND_INVALID');
  }
  if (requirement.kind === 'MIN_RELEVANT_YEARS') {
    requirement.value = boundedInteger(input.value, 0, 80, `${requirement.id}.value`);
  }
  return requirement;
}

function normalizeFitSignals(input = {}) {
  assertClosed(input, FIT_FIELDS, 'fitSignals');
  return {
    qaExplicit: boundedBoolean(input.qaExplicit),
    freelanceExplicit: boundedBoolean(input.freelanceExplicit),
    remoteExplicit: boundedBoolean(input.remoteExplicit),
    agencyContext: boundedBoolean(input.agencyContext),
    websiteScopeExplicit: boundedBoolean(input.websiteScopeExplicit),
    medicalContext: boundedBoolean(input.medicalContext),
    fixedDiagnosticFit: boundedBoolean(input.fixedDiagnosticFit),
    estimatedDecisionDays: boundedInteger(input.estimatedDecisionDays ?? 90, 0, 3650, 'estimatedDecisionDays'),
    applicationMinutes: boundedInteger(input.applicationMinutes ?? 240, 1, 10_000, 'applicationMinutes')
  };
}

export function normalizeOpportunity(input = {}) {
  assertClosed(input, OPPORTUNITY_FIELDS, 'opportunity');
  const sourceExcerpt = String(input.sourceExcerpt || '').trim();
  if (sourceExcerpt.length < 16) {
    throw new OpportunityFactoryError('A non-empty, material source excerpt is required', 'SOURCE_EXCERPT_EMPTY');
  }
  const organizationDomain = normalizeDomain(input.organizationDomain);
  if (!organizationDomain) throw new OpportunityFactoryError('organizationDomain is invalid', 'DOMAIN_INVALID');
  if (!validHttpsUrl(input.sourceUrl)) throw new OpportunityFactoryError('sourceUrl must be a credential-free HTTPS URL', 'SOURCE_URL_INVALID');
  const sourceHost = normalizeDomain(input.sourceUrl);
  if (sourceHost !== organizationDomain && !sourceHost.endsWith(`.${organizationDomain}`)) {
    throw new OpportunityFactoryError('sourceUrl must be on the declared organization domain', 'SOURCE_AUTHORITY_MISMATCH', {
      sourceHost,
      organizationDomain
    });
  }
  const observedMs = isoMs(input.sourceObservedAt);
  const expiresMs = isoMs(input.sourceExpiresAt);
  if (!Number.isFinite(observedMs) || !Number.isFinite(expiresMs) || observedMs >= expiresMs) {
    throw new OpportunityFactoryError('sourceObservedAt and sourceExpiresAt must form a valid interval', 'SOURCE_TIME_INVALID');
  }
  const submissionMechanism = text(input.submissionMechanism).toUpperCase();
  if (!SUBMISSION_SET.has(submissionMechanism)) throw new OpportunityFactoryError('submissionMechanism is invalid', 'SUBMISSION_INVALID');
  const routeType = text(input.routeType).toUpperCase();
  if (!ROUTE_SET.has(routeType)) throw new OpportunityFactoryError('routeType is not a permission-bearing route', 'ROUTE_TYPE_INVALID');
  const permissionScope = text(input.permissionScope).toUpperCase();
  if (!PERMISSION_SET.has(permissionScope)) throw new OpportunityFactoryError('permissionScope is invalid', 'PERMISSION_SCOPE_INVALID');
  const recipientEmail = normalizeOutreachEmail(input.recipientEmail);
  if (submissionMechanism === 'EMAIL' && !EMAIL_RE.test(recipientEmail)) {
    throw new OpportunityFactoryError('EMAIL opportunities require an exact valid recipient', 'RECIPIENT_REQUIRED');
  }
  const strategyLane = text(input.strategyLane).toUpperCase();
  if (!STRATEGY_LANES.has(strategyLane)) throw new OpportunityFactoryError('strategyLane is invalid', 'STRATEGY_LANE_INVALID');
  const requirements = Array.isArray(input.requirements)
    ? input.requirements.map(normalizeRequirement)
    : [];
  const duplicateRequirement = requirements.find((item, index) => requirements.findIndex(other => other.id === item.id) !== index);
  if (duplicateRequirement) throw new OpportunityFactoryError('Requirement ids must be unique', 'REQUIREMENT_DUPLICATE');

  const base = {
    schemaVersion: OPPORTUNITY_SCHEMA_VERSION,
    id: text(input.id),
    organization: text(input.organization).slice(0, 180),
    organizationDomain,
    title: text(input.title).slice(0, 240),
    sourceUrl: text(input.sourceUrl),
    sourceExcerpt,
    sourceObservedAt: new Date(observedMs).toISOString(),
    sourceExpiresAt: new Date(expiresMs).toISOString(),
    jurisdiction: text(input.jurisdiction).toUpperCase(),
    routeType,
    permissionScope,
    submissionMechanism,
    recipientEmail,
    recipientName: text(input.recipientName).slice(0, 160),
    subject: String(input.subject || '').trim(),
    body: String(input.body || '').trim(),
    requirements,
    fitSignals: normalizeFitSignals(input.fitSignals || {}),
    requiredAssetIds: uniqueStrings(input.requiredAssetIds),
    claimIds: uniqueStrings(input.claimIds),
    strategyLane,
    notes: text(input.notes).slice(0, 2000)
  };
  if (input.schemaVersion !== OPPORTUNITY_SCHEMA_VERSION) {
    throw new OpportunityFactoryError('opportunity schemaVersion is invalid', 'SCHEMA_VERSION_INVALID');
  }
  if (!base.id || !base.organization || !base.title) {
    throw new OpportunityFactoryError('id, organization, and title are required', 'IDENTITY_FIELDS_MISSING');
  }
  if (!/^[A-Z]{2}$/.test(base.jurisdiction)) throw new OpportunityFactoryError('jurisdiction must be ISO alpha-2', 'JURISDICTION_INVALID');
  return {
    ...base,
    sourceExcerptDigest: sha256(sourceExcerpt),
    opportunityDigest: sha256(base)
  };
}

export function normalizeOpportunityProfile(input = {}) {
  assertClosed(input, PROFILE_FIELDS, 'profile');
  if (input.schemaVersion !== PROFILE_SCHEMA_VERSION) {
    throw new OpportunityFactoryError('profile schemaVersion is invalid', 'PROFILE_VERSION_INVALID');
  }
  if (!Array.isArray(input.claims)) throw new OpportunityFactoryError('profile.claims must be an array', 'PROFILE_CLAIMS_INVALID');
  const claims = input.claims.map((claim, index) => {
    assertClosed(claim, CLAIM_FIELDS, `claims[${index}]`);
    const normalized = {
      id: text(claim.id),
      status: text(claim.status).toUpperCase(),
      text: text(claim.text).slice(0, 1000),
      evidenceAssetIds: uniqueStrings(claim.evidenceAssetIds)
    };
    if (!normalized.id || !CLAIM_STATUSES.has(normalized.status)) {
      throw new OpportunityFactoryError('Every claim needs a unique id and valid status', 'CLAIM_INVALID');
    }
    if (normalized.status === 'EVIDENCED' && normalized.evidenceAssetIds.length === 0) {
      throw new OpportunityFactoryError('EVIDENCED claims require at least one evidence asset id', 'CLAIM_EVIDENCE_MISSING');
    }
    return normalized;
  });
  if (new Set(claims.map(item => item.id)).size !== claims.length) {
    throw new OpportunityFactoryError('Claim ids must be unique', 'CLAIM_DUPLICATE');
  }
  const b2bContractStatus = text(input.b2bContractStatus).toUpperCase();
  if (!B2B_STATUSES.has(b2bContractStatus)) throw new OpportunityFactoryError('b2bContractStatus is invalid', 'B2B_STATUS_INVALID');
  const b2bEvidenceDigest = text(input.b2bEvidenceDigest).toLowerCase();
  if (b2bContractStatus === 'VERIFIED' && !SHA256_HEX.test(b2bEvidenceDigest)) {
    throw new OpportunityFactoryError('VERIFIED B2B status requires an evidence digest', 'B2B_EVIDENCE_REQUIRED');
  }
  if (b2bEvidenceDigest && !SHA256_HEX.test(b2bEvidenceDigest)) {
    throw new OpportunityFactoryError('b2bEvidenceDigest is invalid', 'B2B_EVIDENCE_INVALID');
  }
  const residenceCountry = text(input.residenceCountry).toUpperCase();
  if (!/^[A-Z]{2}$/.test(residenceCountry)) throw new OpportunityFactoryError('residenceCountry must be ISO alpha-2', 'PROFILE_COUNTRY_INVALID');
  return {
    schemaVersion: PROFILE_SCHEMA_VERSION,
    id: text(input.id),
    relevantExperienceYears: boundedInteger(input.relevantExperienceYears ?? 0, 0, 80, 'relevantExperienceYears'),
    languages: uniqueStrings(input.languages, { lower: true }),
    residenceCountry,
    b2bContractStatus,
    b2bEvidenceDigest,
    claims,
    prohibitedPhrases: uniqueStrings(input.prohibitedPhrases, { lower: true })
  };
}

export function normalizeOpportunityAssets(input = []) {
  if (!Array.isArray(input)) throw new OpportunityFactoryError('assets must be an array', 'ASSETS_INVALID');
  const assets = input.map((asset, index) => {
    assertClosed(asset, ASSET_FIELDS, `assets[${index}]`);
    const observedMs = isoMs(asset.observedAt);
    const normalized = {
      id: text(asset.id),
      kind: text(asset.kind).toUpperCase(),
      label: text(asset.label).slice(0, 240),
      digest: text(asset.digest).toLowerCase(),
      status: text(asset.status).toUpperCase(),
      observedAt: Number.isFinite(observedMs) ? new Date(observedMs).toISOString() : ''
    };
    if (!normalized.id || !normalized.kind || !normalized.label || !SHA256_HEX.test(normalized.digest) || !ASSET_STATUSES.has(normalized.status) || !normalized.observedAt) {
      throw new OpportunityFactoryError('Asset record is invalid', 'ASSET_RECORD_INVALID', { index });
    }
    return normalized;
  });
  if (new Set(assets.map(item => item.id)).size !== assets.length) throw new OpportunityFactoryError('Asset ids must be unique', 'ASSET_DUPLICATE');
  return assets;
}

function normalizeTombstones(input = []) {
  if (!Array.isArray(input)) throw new OpportunityFactoryError('tombstones must be an array', 'TOMBSTONES_INVALID');
  return input.map((record, index) => {
    assertClosed(record, TOMBSTONE_FIELDS, `tombstones[${index}]`);
    const messageDigest = text(record.messageDigest).toLowerCase();
    if (messageDigest && !SHA256_HEX.test(messageDigest)) throw new OpportunityFactoryError('Tombstone messageDigest is invalid', 'TOMBSTONE_DIGEST_INVALID');
    const normalized = {
      id: text(record.id),
      organizationDomain: normalizeDomain(record.organizationDomain),
      recipientEmail: normalizeOutreachEmail(record.recipientEmail),
      sourceUrl: text(record.sourceUrl),
      contactedAt: text(record.contactedAt),
      status: text(record.status).toUpperCase(),
      messageDigest,
      threadId: text(record.threadId),
      note: text(record.note).slice(0, 1000)
    };
    const hasIdentity = normalized.organizationDomain || normalized.recipientEmail || normalized.sourceUrl || normalized.messageDigest;
    if (!normalized.id || !normalized.status || !hasIdentity || !Number.isFinite(isoMs(normalized.contactedAt))) {
      throw new OpportunityFactoryError('Tombstone must have id, status, timestamp, and a collision identity', 'TOMBSTONE_RECORD_INVALID', { index });
    }
    if (normalized.recipientEmail && !EMAIL_RE.test(normalized.recipientEmail)) {
      throw new OpportunityFactoryError('Tombstone recipientEmail is invalid', 'TOMBSTONE_RECIPIENT_INVALID', { index });
    }
    if (normalized.sourceUrl && !validHttpsUrl(normalized.sourceUrl)) {
      throw new OpportunityFactoryError('Tombstone sourceUrl is invalid', 'TOMBSTONE_SOURCE_INVALID', { index });
    }
    return normalized;
  });
}

export function scoreOpportunity(opportunity) {
  const signals = opportunity.fitSignals;
  const components = {
    qaExplicit: signals.qaExplicit ? 20 : 0,
    freelanceExplicit: signals.freelanceExplicit ? 10 : 0,
    remoteExplicit: signals.remoteExplicit ? 5 : 0,
    agencyContext: signals.agencyContext ? 10 : 0,
    websiteScopeExplicit: signals.websiteScopeExplicit ? 10 : 0,
    medicalContext: signals.medicalContext ? 5 : 0,
    fixedDiagnosticFit: signals.fixedDiagnosticFit ? 10 : 0,
    timeToDecision: signals.estimatedDecisionDays <= 7 ? 15 : signals.estimatedDecisionDays <= 30 ? 10 : 4,
    applicationEffort: signals.applicationMinutes <= 15 ? 15 : signals.applicationMinutes <= 45 ? 10 : 5
  };
  const total = Object.values(components).reduce((sum, value) => sum + value, 0);
  return { total, components, methodology: 'uberbond.opportunity-score.v1' };
}

function evaluateRequirement(requirement, profile, assetsById, claimsById) {
  const result = { id: requirement.id, kind: requirement.kind, mandatory: requirement.mandatory, status: 'UNKNOWN', reason: '' };
  switch (requirement.kind) {
    case 'MIN_RELEVANT_YEARS':
      result.status = profile.relevantExperienceYears >= requirement.value ? 'PASS' : 'FAIL';
      result.reason = `${profile.relevantExperienceYears}-years-declared-vs-${requirement.value}-required`;
      break;
    case 'REQUIRED_LANGUAGE':
      result.status = profile.languages.includes(text(requirement.value).toLowerCase()) ? 'PASS' : 'FAIL';
      result.reason = result.status === 'PASS' ? 'language-declared' : 'required-language-not-declared';
      break;
    case 'B2B_LEGAL_ABILITY':
      result.status = profile.b2bContractStatus === 'VERIFIED' ? 'PASS' : profile.b2bContractStatus === 'DENIED' ? 'FAIL' : 'UNKNOWN';
      result.reason = `b2b-contract-status-${profile.b2bContractStatus.toLowerCase()}`;
      break;
    case 'REQUIRED_CLAIM': {
      const claim = claimsById.get(text(requirement.value));
      result.status = claim?.status === 'EVIDENCED' ? 'PASS' : claim?.status === 'PROHIBITED' ? 'FAIL' : 'UNKNOWN';
      result.reason = claim ? `claim-${claim.status.toLowerCase()}` : 'claim-not-registered';
      break;
    }
    case 'REQUIRED_ASSET': {
      const asset = assetsById.get(text(requirement.value));
      result.status = asset?.status === 'VERIFIED_PRESENT' ? 'PASS' : asset ? 'FAIL' : 'UNKNOWN';
      result.reason = asset ? `asset-${asset.status.toLowerCase()}` : 'asset-not-registered';
      break;
    }
    case 'RESIDENCE_COUNTRY': {
      const allowed = Array.isArray(requirement.value)
        ? requirement.value.map(value => text(value).toUpperCase())
        : [text(requirement.value).toUpperCase()];
      result.status = allowed.includes('GLOBAL') || allowed.includes(profile.residenceCountry) ? 'PASS' : 'FAIL';
      result.reason = result.status === 'PASS' ? 'residence-country-allowed' : 'residence-country-not-allowed';
      break;
    }
    case 'OWNER_JUDGMENT':
      result.status = 'UNKNOWN';
      result.reason = 'owner-judgment-required';
      break;
    default:
      result.status = 'FAIL';
      result.reason = 'unsupported-requirement';
  }
  return result;
}

function priorContactCollision(opportunity, tombstones) {
  const bodyDigest = opportunity.body ? sha256(opportunity.body) : '';
  const sourceUrl = opportunity.sourceUrl.replace(/\/$/, '');
  for (const record of tombstones) {
    const match = [];
    if (record.organizationDomain && record.organizationDomain === opportunity.organizationDomain) match.push('organization-domain');
    if (record.recipientEmail && record.recipientEmail === opportunity.recipientEmail) match.push('recipient-email');
    if (record.sourceUrl && record.sourceUrl.replace(/\/$/, '') === sourceUrl) match.push('source-url');
    if (record.messageDigest && bodyDigest && record.messageDigest === bodyDigest) match.push('message-digest');
    if (match.length) return { collision: true, tombstoneId: record.id, match, status: record.status, contactedAt: record.contactedAt };
  }
  return { collision: false };
}

function materialState(opportunity, profile, assets) {
  const assetsById = new Map(assets.map(asset => [asset.id, asset]));
  const claimsById = new Map(profile.claims.map(claim => [claim.id, claim]));
  const requiredAssetFailures = opportunity.requiredAssetIds.filter(id => assetsById.get(id)?.status !== 'VERIFIED_PRESENT');
  const unprovenClaims = opportunity.claimIds.filter(id => {
    const claim = claimsById.get(id);
    return claim?.status !== 'EVIDENCED'
      || claim.evidenceAssetIds.length === 0;
  });
  const claimEvidenceAssetFailures = opportunity.claimIds.flatMap(id => {
    const claim = claimsById.get(id);
    if (claim?.status !== 'EVIDENCED') return [];
    return claim.evidenceAssetIds.filter(assetId => assetsById.get(assetId)?.status !== 'VERIFIED_PRESENT');
  });
  const missingAssets = [...new Set([...requiredAssetFailures, ...claimEvidenceAssetFailures])];
  const prohibitedPhrase = profile.prohibitedPhrases.find(phrase => phrase && opportunity.body.toLowerCase().includes(phrase));
  const messageMissing = !opportunity.body || (opportunity.submissionMechanism === 'EMAIL' && !opportunity.subject);
  return { assetsById, claimsById, missingAssets, unprovenClaims, prohibitedPhrase, messageMissing };
}

export function evaluateOpportunity({ opportunity: input, profile: rawProfile, assets: rawAssets = [], tombstones: rawTombstones = [], now = new Date(), maxEvidenceAgeDays = 7 } = {}) {
  try {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new OpportunityFactoryError('now must be a valid Date', 'NOW_INVALID');
    const opportunity = normalizeOpportunity(input);
    const profile = normalizeOpportunityProfile(rawProfile);
    const assets = normalizeOpportunityAssets(rawAssets);
    const tombstones = normalizeTombstones(rawTombstones);
    const score = scoreOpportunity(opportunity);
    const collision = priorContactCollision(opportunity, tombstones);
    const materials = materialState(opportunity, profile, assets);
    const requirements = opportunity.requirements.map(requirement => evaluateRequirement(requirement, profile, materials.assetsById, materials.claimsById));
    const mandatoryFailures = requirements.filter(result => result.mandatory && result.status === 'FAIL');
    const mandatoryUnknowns = requirements.filter(result => result.mandatory && result.status === 'UNKNOWN');
    const observedMs = isoMs(opportunity.sourceObservedAt);
    const expiresMs = isoMs(opportunity.sourceExpiresAt);
    const evidenceStale = observedMs > now.getTime() + CLOCK_SKEW_MS
      || expiresMs <= now.getTime()
      || now.getTime() - observedMs > Math.max(1, Number(maxEvidenceAgeDays || 7)) * 86400000;
    const result = {
      schemaVersion: 'uberbond.opportunity-evaluation.v1',
      opportunityId: opportunity.id,
      organization: opportunity.organization,
      opportunityDigest: opportunity.opportunityDigest,
      sourceExcerptDigest: opportunity.sourceExcerptDigest,
      profileDigest: sha256(profile),
      assetRegistryDigest: sha256(assets),
      tombstoneRegistryDigest: sha256(tombstones),
      evaluatedAt: now.toISOString(),
      score,
      requirements,
      missingAssets: materials.missingAssets,
      unprovenClaims: materials.unprovenClaims,
      priorContact: collision,
      submissionMechanism: opportunity.submissionMechanism,
      decision: '',
      reasons: [],
      nextAction: '',
      externalActionAuthorized: false
    };

    if (collision.collision) {
      result.decision = 'BLOCKED_PRIOR_CONTACT';
      result.reasons.push(`prior-contact:${collision.match.join(',')}`);
      result.nextAction = 'Reconcile the existing thread or provider record; this compiler cannot authorize a retry or follow-up.';
      return result;
    }
    if (evidenceStale) {
      result.decision = 'BLOCKED_SOURCE_RECHECK';
      result.reasons.push('source-evidence-stale-expired-or-future');
      result.nextAction = 'Re-open the official source and capture a new bounded evidence record.';
      return result;
    }
    if (mandatoryFailures.length) {
      result.decision = 'REJECT_REQUIREMENT_MISMATCH';
      result.reasons.push(...mandatoryFailures.map(item => `${item.id}:${item.reason}`));
      result.nextAction = 'Do not apply or misstate qualifications.';
      return result;
    }
    if (mandatoryUnknowns.length) {
      result.decision = 'HOLD_EXTERNAL_REQUIREMENT';
      result.reasons.push(...mandatoryUnknowns.map(item => `${item.id}:${item.reason}`));
      result.nextAction = 'Resolve the external or owner-only requirement before preparing an application.';
      return result;
    }
    if (materials.prohibitedPhrase || materials.unprovenClaims.length) {
      result.decision = 'REJECT_CLAIM_RISK';
      if (materials.prohibitedPhrase) result.reasons.push(`prohibited-phrase:${materials.prohibitedPhrase}`);
      result.reasons.push(...materials.unprovenClaims.map(id => `claim-not-evidenced:${id}`));
      result.nextAction = 'Remove or evidence every claim, then re-evaluate from source.';
      return result;
    }
    if (materials.messageMissing || materials.missingAssets.length) {
      result.decision = 'HOLD_MATERIALS';
      if (materials.messageMissing) result.reasons.push('message-or-subject-missing');
      result.reasons.push(...materials.missingAssets.map(id => `asset-not-ready:${id}`));
      result.nextAction = 'Complete and hash the exact application materials; no submission is authorized.';
      return result;
    }
    if (opportunity.submissionMechanism === 'EMAIL') {
      const policy = providerRoutePolicy('gmail-api', opportunity.routeType);
      if (!policy.ok) {
        result.decision = 'HOLD_PROVIDER_ROUTE';
        result.reasons.push(policy.reason);
        result.nextAction = 'Use an explicitly supported solicited route or an owner-manual official form.';
        return result;
      }
    }
    if (opportunity.submissionMechanism === 'NONE') {
      result.decision = 'HOLD_NO_SUBMISSION_ROUTE';
      result.reasons.push('no-official-submission-mechanism');
      result.nextAction = 'Wait for a current official invitation; do not guess a recipient.';
      return result;
    }
    if (score.total < 60) {
      result.decision = 'HOLD_LOW_PRIORITY';
      result.reasons.push(`transparent-score-below-60:${score.total}`);
      result.nextAction = 'Spend no owner time until higher-fit solicited opportunities are exhausted.';
      return result;
    }
    result.decision = 'READY_FOR_OWNER_REVIEW';
    result.reasons.push('source-current', 'requirements-pass', 'materials-hashed', 'claims-evidenced');
    result.nextAction = opportunity.submissionMechanism === 'EMAIL'
      ? 'Owner reviews the exact packet; V9 approval remains a separate one-use step.'
      : 'Owner reviews and, if authorized, manually submits through the official form or platform.';
    return result;
  } catch (error) {
    return {
      schemaVersion: 'uberbond.opportunity-evaluation.v1',
      opportunityId: text(input?.id),
      evaluatedAt: now instanceof Date && Number.isFinite(now.getTime()) ? now.toISOString() : '',
      decision: 'REJECT_INVALID',
      reasons: [`${error?.code || 'ERROR'}:${error?.message || String(error)}`],
      nextAction: 'Repair the evidence record; never infer or auto-correct consequence-bearing fields.',
      externalActionAuthorized: false
    };
  }
}

export function compileOpportunityPacket({ opportunity: input, evaluation, profile: rawProfile, assets: rawAssets = [], tombstones: rawTombstones = [] } = {}) {
  if (evaluation?.decision !== 'READY_FOR_OWNER_REVIEW') {
    throw new OpportunityFactoryError('Only READY_FOR_OWNER_REVIEW opportunities can be compiled', 'OPPORTUNITY_NOT_READY');
  }
  const opportunity = normalizeOpportunity(input);
  const profile = normalizeOpportunityProfile(rawProfile);
  const assets = normalizeOpportunityAssets(rawAssets);
  const tombstones = normalizeTombstones(rawTombstones);
  if (evaluation.opportunityDigest !== opportunity.opportunityDigest) {
    throw new OpportunityFactoryError('Evaluation does not bind the exact opportunity', 'EVALUATION_DIGEST_MISMATCH');
  }
  if (evaluation.profileDigest !== sha256(profile)
    || evaluation.assetRegistryDigest !== sha256(assets)
    || evaluation.tombstoneRegistryDigest !== sha256(tombstones)) {
    throw new OpportunityFactoryError('Evaluation does not bind the exact profile, assets, and tombstones', 'EVALUATION_REGISTRY_MISMATCH');
  }
  const claims = opportunity.claimIds.map(id => profile.claims.find(claim => claim.id === id));
  if (claims.some(claim => !claim || claim.status !== 'EVIDENCED')) {
    throw new OpportunityFactoryError('Packet claims changed after evaluation', 'PACKET_CLAIM_MISMATCH');
  }
  const packetAssetIds = [...new Set([
    ...opportunity.requiredAssetIds,
    ...claims.flatMap(claim => claim.evidenceAssetIds)
  ])];
  const selectedAssets = packetAssetIds.map(id => assets.find(asset => asset.id === id));
  if (selectedAssets.some(asset => !asset || asset.status !== 'VERIFIED_PRESENT')) {
    throw new OpportunityFactoryError('Packet assets changed after evaluation', 'PACKET_ASSET_MISMATCH');
  }
  const base = {
    schemaVersion: PACKET_SCHEMA_VERSION,
    opportunityId: opportunity.id,
    organization: opportunity.organization,
    organizationDomain: opportunity.organizationDomain,
    strategyLane: opportunity.strategyLane,
    opportunityDigest: opportunity.opportunityDigest,
    profileDigest: evaluation.profileDigest,
    assetRegistryDigest: evaluation.assetRegistryDigest,
    tombstoneRegistryDigest: evaluation.tombstoneRegistryDigest,
    sourceUrl: opportunity.sourceUrl,
    sourceExcerptDigest: opportunity.sourceExcerptDigest,
    routeType: opportunity.routeType,
    permissionScope: opportunity.permissionScope,
    submissionMechanism: opportunity.submissionMechanism,
    recipientEmail: opportunity.recipientEmail,
    recipientName: opportunity.recipientName,
    subject: opportunity.subject,
    body: opportunity.body,
    messageDigest: sha256({
      recipientEmail: opportunity.recipientEmail,
      subject: opportunity.subject,
      body: opportunity.body,
      submissionMechanism: opportunity.submissionMechanism
    }),
    assets: selectedAssets.map(asset => ({ id: asset.id, label: asset.label, digest: asset.digest })),
    claims: claims.map(claim => ({ id: claim.id, text: claim.text, evidenceAssetIds: claim.evidenceAssetIds })),
    approvalStatus: 'NOT_REQUESTED',
    externalActionAuthorized: false
  };
  return { ...base, packetDigest: sha256(base) };
}

export function compileCanaryProspectDraft({ opportunity: input, evaluation, profile, assets, tombstones = [], campaignId, inbox = 'A', unsubscribeUrl = '', provider = 'gmail-api', now = new Date() } = {}) {
  const opportunity = normalizeOpportunity(input);
  if (opportunity.submissionMechanism !== 'EMAIL') {
    throw new OpportunityFactoryError('Manual forms and platforms cannot be converted into Gmail prospects', 'MANUAL_ROUTE_ONLY');
  }
  const packet = compileOpportunityPacket({ opportunity: input, evaluation, profile, assets, tombstones });
  const route = createOutreachRouteEvidence({
    routeType: opportunity.routeType,
    recipientEmail: opportunity.recipientEmail,
    sourceUrl: opportunity.sourceUrl,
    sourceExcerpt: opportunity.sourceExcerpt,
    sourceObservedAt: opportunity.sourceObservedAt,
    sourceExpiresAt: opportunity.sourceExpiresAt,
    jurisdiction: opportunity.jurisdiction,
    permissionScope: opportunity.permissionScope,
    relevantToRecipientRole: true,
    noUnsolicitedStatementPresent: false,
    provider,
    evidenceNote: `Compiled by Opportunity Factory from ${opportunity.id}`
  }, now);
  return {
    id: opportunity.id,
    company: opportunity.organization,
    website: `https://${opportunity.organizationDomain}`,
    domain: opportunity.organizationDomain,
    country: opportunity.jurisdiction,
    campaignId: text(campaignId),
    inbox: text(inbox),
    status: 'owner-review',
    source: 'solicited-opportunity-factory',
    sourceUrl: opportunity.sourceUrl,
    contact: { email: opportunity.recipientEmail, source: 'official-solicited-route' },
    subject: opportunity.subject,
    body: '',
    draft: opportunity.body,
    oneClickUnsubscribeUrl: text(unsubscribeUrl),
    outreachRoute: route,
    outreachApproval: null,
    opportunityPacketDigest: packet.packetDigest,
    externalActionAuthorized: false
  };
}

export function transitionOpportunityState({ currentState, nextState, actorKind = 'SYSTEM', evidenceDigest = '' } = {}) {
  const current = text(currentState).toUpperCase();
  const next = text(nextState).toUpperCase();
  if (!TRANSITIONS[current]?.has(next)) {
    throw new OpportunityFactoryError(`Illegal opportunity transition: ${current} -> ${next}`, 'STATE_TRANSITION_INVALID');
  }
  if (next.startsWith('OWNER_') && text(actorKind).toUpperCase() !== 'OWNER') {
    throw new OpportunityFactoryError('Owner transitions require an owner actor', 'OWNER_AUTHORITY_REQUIRED');
  }
  if (['SUBMITTED', 'PAID_DIAGNOSTIC', 'DELIVERED', 'ACCEPTED'].includes(next) && !SHA256_HEX.test(text(evidenceDigest))) {
    throw new OpportunityFactoryError(`${next} requires an external evidence digest`, 'EXTERNAL_EVIDENCE_REQUIRED');
  }
  return { currentState: current, nextState: next, actorKind: text(actorKind).toUpperCase(), evidenceDigest: text(evidenceDigest).toLowerCase() };
}

export function buildOpportunityFunnel(events = []) {
  if (!Array.isArray(events)) throw new OpportunityFactoryError('events must be an array', 'EVENTS_INVALID');
  const normalized = events.map((event, index) => {
    assertClosed(event, EVENT_FIELDS, `events[${index}]`);
    const receiptDigest = text(event.receiptDigest).toLowerCase();
    if (receiptDigest && !SHA256_HEX.test(receiptDigest)) throw new OpportunityFactoryError('event receiptDigest is invalid', 'EVENT_RECEIPT_INVALID');
    const normalizedEvent = {
      id: text(event.id),
      opportunityId: text(event.opportunityId),
      eventType: text(event.eventType).toUpperCase(),
      occurredAt: text(event.occurredAt),
      valueUsd: Math.max(0, Number(event.valueUsd || 0)),
      receiptDigest
    };
    if (!normalizedEvent.id || !normalizedEvent.opportunityId || !normalizedEvent.eventType || !Number.isFinite(isoMs(normalizedEvent.occurredAt))) {
      throw new OpportunityFactoryError('Event identity or timestamp is invalid', 'EVENT_RECORD_INVALID', { index });
    }
    return normalizedEvent;
  });
  if (new Set(normalized.map(event => event.id)).size !== normalized.length) {
    throw new OpportunityFactoryError('Event ids must be unique', 'EVENT_ID_DUPLICATE');
  }
  const unique = type => new Set(normalized.filter(event => event.eventType === type).map(event => event.opportunityId)).size;
  const discovered = unique('DISCOVERED');
  const reviewed = unique('OWNER_REVIEWED');
  const submitted = unique('SUBMITTED');
  const replied = unique('REPLIED');
  const paidByReceipt = new Map();
  for (const event of normalized.filter(item => item.eventType === 'PAYMENT_CLEARED' && SHA256_HEX.test(item.receiptDigest))) {
    const previous = paidByReceipt.get(event.receiptDigest);
    if (previous && (previous.opportunityId !== event.opportunityId || previous.valueUsd !== event.valueUsd)) {
      throw new OpportunityFactoryError('One payment receipt cannot assert conflicting revenue facts', 'EVENT_RECEIPT_CONFLICT');
    }
    if (!previous) paidByReceipt.set(event.receiptDigest, event);
  }
  const paidEvents = [...paidByReceipt.values()];
  const paid = new Set(paidEvents.map(event => event.opportunityId)).size;
  const revenueUsd = paidEvents.reduce((sum, event) => sum + event.valueUsd, 0);
  const rate = (numerator, denominator) => denominator ? Number((numerator / denominator).toFixed(4)) : 0;
  let recommendation = 'INSUFFICIENT_DATA';
  if (paid >= 1) recommendation = 'CONTINUE_BOUNDED';
  else if (submitted >= 10 && replied === 0) recommendation = 'REVIEW_POSITIONING_AND_TARGETING';
  else if (replied >= 3 && paid === 0) recommendation = 'REVIEW_OFFER_AND_PAYMENT_FRICTION';
  return {
    schemaVersion: 'uberbond.opportunity-funnel.v1',
    discovered,
    reviewed,
    submitted,
    replied,
    paid,
    revenueUsd: Number(revenueUsd.toFixed(2)),
    reviewRate: rate(reviewed, discovered),
    submissionRate: rate(submitted, reviewed),
    replyRate: rate(replied, submitted),
    paidRate: rate(paid, submitted),
    recommendation,
    automaticPriceChangeAuthorized: false,
    automaticVolumeIncreaseAuthorized: false
  };
}
