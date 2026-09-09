import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OPERATIONAL_WORLD_RESOURCE_ADMISSION_VERSION = 'uberbond.operational-world-resource-admission.v1.1';

const HUMAN = new Set(['HUMAN_EXPERT', 'HUMAN_OPERATOR', 'HUMAN_PARTNER']);
const EXECUTABLE = new Set(['API', 'MODEL', 'COMPUTE', 'SOFTWARE_TOOL', 'DATA_SERVICE']);
const PASSIVE = new Set(['PUBLIC_DATA', 'HARDWARE', 'SENSOR', 'INSTITUTION', 'LAB', 'FACILITY', 'PROFESSIONAL_SERVICE']);
const RESOURCE_TYPES = new Set([...HUMAN, ...EXECUTABLE, ...PASSIVE]);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone = value => structuredClone(value);
const unique = values => [...new Set(values.filter(Boolean))];
const iso = value => {
  const date = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
const sha256 = value => /^[a-f0-9]{64}$/.test(String(value || '').trim().toLowerCase());
const strictNonnegativeInteger = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const strictNonnegativeFinite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const supplied = (object, key) => Boolean(object) && typeof object === 'object' && Object.hasOwn(object, key);

function deny(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: OPERATIONAL_WORLD_RESOURCE_ADMISSION_VERSION,
    decision: 'BLOCKED',
    reasonCodes: unique(reasonCodes),
    executionAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

function secretMaterial(value) {
  let text;
  try { text = JSON.stringify(value ?? {}); } catch { return true; }
  return /(?:sk-[A-Za-z0-9_-]{16,}|api[_-]?key["']?\s*[:=]\s*["'][^"']{8,}|password["']?\s*[:=]\s*["'][^"']+|bearer\s+[A-Za-z0-9._~-]{12,})/i.test(text);
}

export function admitOperationalWorldResource({
  resource,
  discoveryEvidence,
  availabilityEvidence,
  consentEvidence = null,
  capabilityAdmission = null,
  usageTerms = {},
  procurement = {},
  requested = {},
  authorized = {},
  now = new Date()
} = {}) {
  if (secretMaterial({ resource, discoveryEvidence, availabilityEvidence, consentEvidence, capabilityAdmission, usageTerms, procurement, requested, authorized })) {
    return deny(['raw-secret-material-prohibited']);
  }

  const reasons = [];
  const id = String(resource?.id || '').trim();
  const type = String(resource?.type || '').trim().toUpperCase();
  const subjectDigest = String(resource?.subjectDigest || '').trim().toLowerCase();
  if (!id) reasons.push('resource-id-required');
  if (!RESOURCE_TYPES.has(type)) reasons.push(type ? 'recognized-resource-type-required' : 'resource-type-required');
  if (!sha256(subjectDigest)) reasons.push('resource-subject-digest-required');

  if (!discoveryEvidence?.artifactRef) reasons.push('discovery-evidence-required');
  if (String(discoveryEvidence?.subjectDigest || '').toLowerCase() !== subjectDigest) reasons.push('discovery-subject-mismatch');

  const nowIso = iso(now);
  const nowMs = nowIso ? new Date(nowIso).getTime() : NaN;
  if (!nowIso) reasons.push('valid-admission-clock-required');
  const observedAt = iso(availabilityEvidence?.observedAt);
  const expiresAt = iso(availabilityEvidence?.expiresAt);
  if (!availabilityEvidence?.artifactRef || availabilityEvidence?.available !== true) reasons.push('fresh-availability-evidence-required');
  if (String(availabilityEvidence?.subjectDigest || '').toLowerCase() !== subjectDigest) reasons.push('availability-subject-mismatch');
  if (!observedAt || (Number.isFinite(nowMs) && new Date(observedAt).getTime() > nowMs)) reasons.push('availability-observation-must-not-be-future-dated');
  if (!expiresAt || (Number.isFinite(nowMs) && new Date(expiresAt).getTime() < nowMs)) reasons.push('availability-evidence-expired');
  if (observedAt && expiresAt && new Date(expiresAt).getTime() <= new Date(observedAt).getTime()) reasons.push('availability-expiry-must-follow-observation');

  if (HUMAN.has(type)) {
    if (consentEvidence?.consented !== true || !consentEvidence?.artifactRef) reasons.push('explicit-human-consent-required');
    if (String(consentEvidence?.subjectDigest || '').toLowerCase() !== subjectDigest) reasons.push('consent-subject-mismatch');
  }

  if (EXECUTABLE.has(type)) {
    if (capabilityAdmission?.decision !== 'ELIGIBLE') reasons.push('eligible-capability-admission-required');
    if (!capabilityAdmission?.admissionRef && !capabilityAdmission?.securityEvidenceDigest) reasons.push('capability-admission-evidence-required');
    if (capabilityAdmission?.securityEvidenceDigest && !sha256(capabilityAdmission.securityEvidenceDigest)) reasons.push('valid-capability-security-evidence-digest-required');
    if (capabilityAdmission?.revoked === true) reasons.push('capability-resource-revoked');
    if (String(capabilityAdmission?.subjectDigest || '').toLowerCase() !== subjectDigest) reasons.push('capability-admission-subject-mismatch');
  }

  if (usageTerms?.resolved !== true) reasons.push('usage-terms-or-license-unresolved');
  if (usageTerms?.jurisdictionRequired === true && usageTerms?.jurisdictionSatisfied !== true) reasons.push('jurisdiction-requirement-unresolved');

  const spendRequired = supplied(procurement, 'requiredSpendCents') ? procurement.requiredSpendCents : 0;
  const spendAuthorized = supplied(procurement, 'authorizedSpendCents') ? procurement.authorizedSpendCents : 0;
  if (!strictNonnegativeInteger(spendRequired) || !strictNonnegativeInteger(spendAuthorized)) reasons.push('valid-procurement-amounts-required');
  else if (spendRequired > spendAuthorized) reasons.push('procurement-authority-insufficient');
  if (strictNonnegativeInteger(spendRequired) && spendRequired > 0 && !procurement?.authorityRef) reasons.push('procurement-authority-evidence-required');

  const requestedCapacity = supplied(requested, 'capacity') ? requested.capacity : 0;
  const provenCapacity = supplied(availabilityEvidence, 'capacity') ? availabilityEvidence.capacity : 0;
  if (!strictNonnegativeFinite(requestedCapacity) || !strictNonnegativeFinite(provenCapacity)) reasons.push('valid-capacity-required');
  else if (requestedCapacity > provenCapacity) reasons.push('requested-capacity-exceeds-observed-capacity');

  const requestedPermissionInput = requested?.permissions ?? [];
  const authorizedPermissionInput = authorized?.permissions ?? [];
  if (!Array.isArray(requestedPermissionInput) || !Array.isArray(authorizedPermissionInput)) reasons.push('permission-arrays-required');
  const requestedPermissions = Array.isArray(requestedPermissionInput) ? unique(requestedPermissionInput.map(String)) : [];
  const authorizedPermissions = new Set(Array.isArray(authorizedPermissionInput) ? authorizedPermissionInput.map(String) : []);
  const unauthorizedPermissions = requestedPermissions.filter(permission => !authorizedPermissions.has(permission));
  if (unauthorizedPermissions.length) reasons.push('resource-permission-not-authorized');

  if (reasons.length) return deny(reasons, { resourceId: id || null, resourceType: type || null, unauthorizedPermissions });

  const admissionBasis = {
    resource: { id, type, subjectDigest },
    discovery: { artifactRef: discoveryEvidence.artifactRef, subjectDigest },
    availability: { artifactRef: availabilityEvidence.artifactRef, subjectDigest, observedAt, expiresAt, capacity: provenCapacity },
    consent: HUMAN.has(type) ? { artifactRef: consentEvidence.artifactRef, consented: true, subjectDigest } : null,
    capability: EXECUTABLE.has(type) ? {
      decision: capabilityAdmission.decision,
      admissionRef: capabilityAdmission.admissionRef || null,
      securityEvidenceDigest: capabilityAdmission.securityEvidenceDigest || null,
      subjectDigest
    } : null,
    usageTerms: { resolved: true, jurisdictionSatisfied: usageTerms.jurisdictionRequired === true ? true : null },
    procurement: { requiredSpendCents: spendRequired, authorizedSpendCents: spendAuthorized, authorityRef: procurement.authorityRef || null },
    requested: { capacity: requestedCapacity, permissions: requestedPermissions.sort() },
    authorized: { permissions: [...authorizedPermissions].sort() }
  };

  return {
    ok: true,
    policyVersion: OPERATIONAL_WORLD_RESOURCE_ADMISSION_VERSION,
    decision: 'OPERATIONALLY_ADMISSIBLE',
    resourceId: id,
    resourceType: type,
    admissionDigest: digest(admissionBasis),
    admissionBasis,
    truthBoundary: 'DISCOVERY_OR_AVAILABILITY_DOES_NOT_GRANT_EXECUTION;_A_SEPARATE_INTENT_AND_EFFECT_AUTHORITY_GATE_IS_ALWAYS_REQUIRED',
    executionAuthority: 'NONE',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}
