import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';

export const FRONTIER_CALLABILITY_PROVENANCE_VERSION = 'uberbond.frontier-callability-provenance-1.0.0';
export const FRONTIER_CALLABILITY_PROBE_SCHEMA = 'uberbond.frontier-callability-probe.v1';

const MAX_OBSERVATIONS = 256;

function text(value, max = 1000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max ? out : null;
}
function timestamp(value) {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
function sha256(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function zeroEffects() { return structuredClone(ZERO_EXTERNAL_EFFECTS); }
function envelope(extra = {}) {
  return { policyVersion: FRONTIER_CALLABILITY_PROVENANCE_VERSION, businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects(), ...extra };
}
function failure(reasonCodes, status = 'FRONTIER_CALLABILITY_PROVENANCE_BLOCKED', extra = {}) {
  return envelope({ ok: false, status, reasonCodes: [...new Set((reasonCodes || []).filter(Boolean))], ...extra });
}
function normalizeObservation(raw = {}, index = 0) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reasonCodes: [`probe-observation-object-required:${index}`] };
  const profileId = text(raw.profileId, 120)?.toLowerCase();
  const status = text(raw.status, 80)?.toUpperCase();
  const observedProvider = text(raw.observedProvider, 80)?.toLowerCase();
  const observedModel = text(raw.observedModel, 120);
  const observedRevision = text(raw.observedRevision, 240);
  const observedTransportProvider = text(raw.observedTransportProvider, 80)?.toLowerCase();
  const observedTransportModel = text(raw.observedTransportModel, 160);
  const observedAt = timestamp(raw.observedAt);
  const sourceRef = text(raw.sourceRef, 1000);
  const providerRequestId = text(raw.providerRequestId, 1000);
  const identityVerification = text(raw.identityVerification, 80)?.toUpperCase();
  const evidenceClass = text(raw.evidenceClass, 80)?.toUpperCase();
  const reasons = [];
  if (!profileId) reasons.push(`profile-id-required:${index}`);
  if (status !== 'CALLABLE_NOW') reasons.push(`callable-now-status-required:${profileId ?? index}`);
  if (!observedProvider || !observedModel || !observedRevision) reasons.push(`complete-cognitive-identity-required:${profileId ?? index}`);
  if (!observedTransportProvider || !observedTransportModel) reasons.push(`complete-transport-identity-required:${profileId ?? index}`);
  if (!observedAt || !sourceRef || !providerRequestId) reasons.push(`runtime-probe-pointer-time-request-id-required:${profileId ?? index}`);
  if (identityVerification !== 'OBSERVED') reasons.push(`observed-identity-verification-required:${profileId ?? index}`);
  if (evidenceClass !== 'OBSERVED_RUNTIME') reasons.push(`observed-runtime-evidence-class-required:${profileId ?? index}`);
  if (reasons.length) return { ok: false, reasonCodes: reasons };
  return { ok: true, observation: { profileId, status, observedProvider, observedModel, observedRevision, observedTransportProvider, observedTransportModel, observedAt, sourceRef, providerRequestId, identityVerification, evidenceClass } };
}
export function buildFrontierCallabilityProbeReceipt({ observations = [], sourceRef, observedAt = new Date() } = {}) {
  if (!Array.isArray(observations) || observations.length === 0 || observations.length > MAX_OBSERVATIONS) return failure(['bounded-runtime-probe-observations-required']);
  const producerSourceRef = text(sourceRef, 1000);
  const producerObservedAt = timestamp(observedAt);
  if (!producerSourceRef || !producerObservedAt) return failure(['producer-source-ref-and-time-required']);
  const normalized = []; const reasons = []; const ids = new Set();
  for (const [index, raw] of observations.entries()) {
    const item = normalizeObservation(raw, index);
    if (!item.ok) { reasons.push(...item.reasonCodes); continue; }
    if (ids.has(item.observation.profileId)) reasons.push(`duplicate-probe-profile:${item.observation.profileId}`);
    else { ids.add(item.observation.profileId); normalized.push(item.observation); }
  }
  if (reasons.length) return failure(reasons);
  const receipt = { schemaVersion: FRONTIER_CALLABILITY_PROBE_SCHEMA, producerPolicyVersion: FRONTIER_CALLABILITY_PROVENANCE_VERSION, generatedAt: producerObservedAt, sourceRef: producerSourceRef, observations: normalized, truthBoundary: 'CALLABLE_NOW_REQUIRES_A_CANONICAL_RUNTIME_PROBE_RECEIPT_WITH_OBSERVED_IDENTITY_AND_PROVIDER_REQUEST_ID; CONFIG_OR_CALLER_LABELS_ARE_NOT_PROOF', businessEffectAuthority: 'NONE', externalEffectLedger: zeroEffects() };
  return envelope({ ok: true, status: 'FRONTIER_CALLABILITY_PROBE_RECEIPT_READY', receipt, receiptDigest: sha256(receipt) });
}
export function validateFrontierCallabilityProbeReceipt({ receipt, receiptDigest } = {}) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return failure(['probe-receipt-object-required']);
  if (receipt.schemaVersion !== FRONTIER_CALLABILITY_PROBE_SCHEMA || receipt.producerPolicyVersion !== FRONTIER_CALLABILITY_PROVENANCE_VERSION) return failure(['canonical-probe-receipt-schema-and-producer-required']);
  const expectedDigest = text(receiptDigest, 64)?.toLowerCase();
  const actualDigest = sha256(receipt);
  if (!expectedDigest || !/^[a-f0-9]{64}$/.test(expectedDigest) || expectedDigest !== actualDigest) return failure(['probe-receipt-digest-mismatch']);
  const sourceRef = text(receipt.sourceRef, 1000); const generatedAt = timestamp(receipt.generatedAt);
  if (!sourceRef || !generatedAt || receipt.truthBoundary !== 'CALLABLE_NOW_REQUIRES_A_CANONICAL_RUNTIME_PROBE_RECEIPT_WITH_OBSERVED_IDENTITY_AND_PROVIDER_REQUEST_ID; CONFIG_OR_CALLER_LABELS_ARE_NOT_PROOF') return failure(['canonical-probe-receipt-provenance-invalid']);
  if (!Array.isArray(receipt.observations) || receipt.observations.length === 0 || receipt.observations.length > MAX_OBSERVATIONS) return failure(['bounded-runtime-probe-observations-required']);
  const observations = []; const reasons = []; const ids = new Set();
  for (const [index, raw] of receipt.observations.entries()) {
    const item = normalizeObservation(raw, index);
    if (!item.ok) { reasons.push(...item.reasonCodes); continue; }
    if (ids.has(item.observation.profileId)) reasons.push(`duplicate-probe-profile:${item.observation.profileId}`);
    else { ids.add(item.observation.profileId); observations.push(item.observation); }
  }
  if (reasons.length) return failure(reasons);
  return envelope({ ok: true, status: 'FRONTIER_CALLABILITY_PROBE_RECEIPT_VALID', sourceRef, generatedAt, receiptDigest: actualDigest, observations, observationByProfileId: new Map(observations.map(item => [item.profileId, item])) });
}
