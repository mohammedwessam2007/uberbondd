import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const OPERATIONAL_WORLD_RESOURCE_ADMISSION_VERSION = 'uberbond.operational-world-resource-admission.v1';

const HUMAN = new Set(['HUMAN_EXPERT', 'HUMAN_OPERATOR', 'HUMAN_PARTNER']);
const EXECUTABLE = new Set(['API', 'MODEL', 'COMPUTE', 'SOFTWARE_TOOL', 'DATA_SERVICE']);
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone = value => structuredClone(value);
const unique = values => [...new Set(values.filter(Boolean))];
const iso = value => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

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
  if (!type) reasons.push('resource-type-required');
  if (!/^[a-f0-9]{64}$/.test(subjectDigest)) reasons.push('resource-subject-digest-required');

  if (!discoveryEvidence?.artifactRef) reasons.push('discovery-evidence-required');
  if (String(discoveryEvidence?.subjectDigest || '').toLowerCase() !== subjectDigest) reasons.push('discovery-subject-mismatch');

  const nowMs = new Date(now).getTime();
  const observedAt = iso(availabilityEvidence?.observedAt);
  const expiresAt = iso(availabilityEvidence?.expiresAt);
  if (!availabilityEvidence?.artifactRef || availabilityEvidence?.available !== true) reasons.push('fresh-availability-evidence-required');
  if (String(availabilityEvidence?.subjectDigest || '').toLowerCase() !== subjectDigest) reasons.push('availability-subject-mismatch');
  if (!observedAt || new Date(observedAt).getTime() > nowMs) reasons.push('availability-observation-must-not-be-future-dated');
  if (!expiresAt || new Date(expiresAt).getTime() < nowMs) reasons.push('availability-evidence-expired');

  if (HUMAN.has(type)) {
    if (consentEvidence?.consented !== true || !consentEvidence?.artifactRef) reasons.push('explicit-human-consent-required');
    if (String(consentEvidence?.subjectDigest || '').toLowerCase() !== subjectDigest) reasons.push('consent-subject-mismatch');
  }

  if (EXECUTABLE.has(type)) {
    if (capabilityAdmission?.decision !== 'ELIGIBLE') reasons.push('eligible-capability-admission-required');
    if (!capabilityAdmission?.admissionRef && !capabilityAdmission?.securityEvidenceDigest) reasons.push('capability-admission-evidence-required');
    if (capabilityAdmission?.revoked === true) reasons.push('capability-resource-revoked');
    if (capabilityAdmission?.subjectDigest && String(capabilityAdmission.subjectDigest).toLowerCase() !== subjectDigest) reasons.push('capability-admission-subject-mismatch');
  }

  if (usageTerms?.resolved !== true) reasons.push('usage-terms-or-license-unresolved');
  if (usageTerms?.jurisdictionRequired === true && usageTerms?.jurisdictionSatisfied !== true) reasons.push('jurisdiction-requirement-unresolved');

  const spendRequired = Number(procurement?.requiredSpendCents || 0);
  const spendAuthorized = Number(procurement?.authorizedSpendCents || 0);
  if (!Number.isSafeInteger(spendRequired) || spendRequired < 0 || !Number.isSafeInteger(spendAuthorized) || spendAuthorized < 0) reasons.push('valid-procurement-amounts-required');
  if (spendRequired > spendAuthorized) reasons.push('procurement-authority-insufficient');
  if (spendRequired > 0 && !procurement?.authorityRef) reasons.push('procurement-authority-evidence-required');

  const requestedCapacity = Number(requested?.capacity || 0);
  const provenCapacity = Number(availabilityEvidence?.capacity || 0);
  if (!Number.isFinite(requestedCapacity) || requestedCapacity < 0 || !Number.isFinite(provenCapacity) || provenCapacity < 0) reasons.push('valid-capacity-required');
  else if (requestedCapacity > provenCapacity) reasons.push('requested-capacity-exceeds-observed-capacity');

  const requestedPermissions = unique((requested?.permissions || []).map(String));
  const authorizedPermissions = new Set((authorized?.permissions || []).map(String));
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
