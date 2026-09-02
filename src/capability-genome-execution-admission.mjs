import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { normalizeCapability } from './capability-genome-schema.mjs';
import { capabilityExecutionReceipt } from './capability-genome-runtime.mjs';

export const CAPABILITY_GENOME_EXECUTION_ADMISSION_VERSION = 'capability-genome-execution-admission-1.0.0';

function clone(value) { return structuredClone(value); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function text(value, max = 500) { const result = String(value ?? '').trim(); return result && result.length <= max ? result : null; }
function fail(reasonCodes, extra = {}) {
  return {
    ok: false,
    policyVersion: CAPABILITY_GENOME_EXECUTION_ADMISSION_VERSION,
    status: 'CAPABILITY_EXECUTION_STATE_REJECTED',
    reasonCodes: [...new Set(reasonCodes.filter(Boolean))],
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS),
    ...extra
  };
}

function normalizeCurrentCapabilities(capabilities) {
  if (!Array.isArray(capabilities)) return null;
  const normalized = [];
  for (const raw of capabilities) {
    const result = normalizeCapability(raw);
    if (!result.ok) return null;
    normalized.push(result.capability);
  }
  return normalized;
}

export function validateCapabilityExecutionState({
  capabilityId,
  capabilityRevision,
  currentCapabilities = [],
  selectedBundleIds = [],
  route,
  maxStateAgeMinutes = 1440,
  now = new Date()
} = {}) {
  const reasons = [];
  const id = text(capabilityId, 200)?.toLowerCase();
  const revision = text(capabilityRevision, 240);
  const bundleIds = [...new Set((Array.isArray(selectedBundleIds) ? selectedBundleIds : []).map(item => String(item).trim().toLowerCase()).filter(Boolean))];
  const normalized = normalizeCurrentCapabilities(currentCapabilities);
  const observedNow = new Date(now);

  if (!id || !revision) reasons.push('capability-id-and-revision-required');
  if (!normalized) reasons.push('valid-current-capability-state-required');
  if (!bundleIds.length) reasons.push('selected-bundle-ids-required');
  if (!route || typeof route !== 'object' || Array.isArray(route)) reasons.push('selected-route-required');
  if (!Number.isFinite(observedNow.getTime())) reasons.push('valid-current-time-required');
  if (reasons.length) return fail(reasons);

  const byId = new Map(normalized.map(capability => [capability.id, capability]));
  const target = byId.get(id);
  if (!target) reasons.push('capability-missing-from-current-state');
  if (!bundleIds.includes(id)) reasons.push('capability-not-in-selected-bundle');

  const selectedRoute = route.selected && typeof route.selected === 'object' ? route.selected : route;
  if (String(selectedRoute.capabilityId || '').trim().toLowerCase() !== id) reasons.push('route-capability-mismatch');
  if (!text(selectedRoute.modelId, 240) || !text(selectedRoute.providerId, 240)) reasons.push('route-model-provider-identity-required');
  if (selectedRoute.revoked === true) reasons.push('route-explicitly-revoked');
  if (selectedRoute.available !== true || selectedRoute.securityPassed !== true || selectedRoute.providerIdentityObservable !== true) reasons.push('route-no-longer-execution-eligible');

  const ageLimit = Math.max(1, Number(maxStateAgeMinutes) || 1440);
  for (const bundleId of bundleIds) {
    const capability = byId.get(bundleId);
    if (!capability) {
      reasons.push(`bundle-capability-missing:${bundleId}`);
      continue;
    }
    if (capability.promotionState === 'REVOKED' || capability.revocationState?.revoked) reasons.push(`bundle-capability-revoked:${bundleId}`);
    if (!['APPROVED', 'ACTIVE'].includes(capability.promotionState)) reasons.push(`bundle-capability-not-approved-or-active:${bundleId}`);
    const evaluatedAt = new Date(capability.lastEvaluatedAt);
    const ageMinutes = Number.isFinite(evaluatedAt.getTime()) ? (observedNow.getTime() - evaluatedAt.getTime()) / 60_000 : Number.POSITIVE_INFINITY;
    if (ageMinutes < 0 || ageMinutes > ageLimit) reasons.push(`bundle-capability-state-stale:${bundleId}`);
    for (const dependency of capability.dependencies || []) {
      const dependencyId = String(dependency).trim().toLowerCase();
      if (!bundleIds.includes(dependencyId)) reasons.push(`dependency-not-in-selected-bundle:${bundleId}->${dependencyId}`);
      const dependencyCapability = byId.get(dependencyId);
      if (!dependencyCapability) reasons.push(`dependency-missing-from-current-state:${bundleId}->${dependencyId}`);
      else if (dependencyCapability.promotionState === 'REVOKED' || dependencyCapability.revocationState?.revoked) reasons.push(`dependency-revoked:${bundleId}->${dependencyId}`);
    }
  }

  if (target && target.sourceRevision !== revision) reasons.push('capability-revision-no-longer-current');
  if (reasons.length) return fail(reasons, { capabilityId: id, selectedBundleIds: bundleIds });

  const state = {
    capabilityId: id,
    capabilityRevision: revision,
    selectedBundleIds: [...bundleIds].sort(),
    route: {
      capabilityId: String(selectedRoute.capabilityId),
      modelId: String(selectedRoute.modelId),
      providerId: String(selectedRoute.providerId)
    },
    checkedAt: observedNow.toISOString(),
    maxStateAgeMinutes: ageLimit,
    truthBoundary: 'FRESH_CURRENT_STATE_CHECK_REQUIRED_AT_EXECUTION_TIME'
  };
  return {
    ok: true,
    policyVersion: CAPABILITY_GENOME_EXECUTION_ADMISSION_VERSION,
    status: 'CAPABILITY_EXECUTION_STATE_ELIGIBLE',
    state,
    stateDigest: digest(state),
    businessEffectAuthority: 'NONE',
    externalEffectLedger: clone(ZERO_EXTERNAL_EFFECTS)
  };
}

export function guardedCapabilityExecutionReceipt({
  currentCapabilities = [],
  selectedBundleIds = [],
  route,
  maxStateAgeMinutes = 1440,
  now = new Date(),
  ...receiptInput
} = {}) {
  const admission = validateCapabilityExecutionState({
    capabilityId: receiptInput.capabilityId,
    capabilityRevision: receiptInput.capabilityRevision,
    currentCapabilities,
    selectedBundleIds,
    route,
    maxStateAgeMinutes,
    now
  });
  if (!admission.ok) return admission;

  const evidenceRefs = [...new Set([...(receiptInput.evidenceRefs || []), `capability-state://${admission.stateDigest}`])];
  const receipt = capabilityExecutionReceipt({ ...receiptInput, evidenceRefs, now });
  if (!receipt.ok) return receipt;
  return {
    ...receipt,
    status: 'GUARDED_CAPABILITY_EXECUTION_RECORDED',
    executionAdmission: admission.state,
    executionAdmissionDigest: admission.stateDigest,
    truthBoundary: 'RECEIPT_REQUIRES_FRESH_NON_REVOKED_CURRENT_CAPABILITY_STATE'
  };
}
