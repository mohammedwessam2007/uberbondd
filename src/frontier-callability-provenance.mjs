import crypto from 'node:crypto';
import { ZERO_EXTERNAL_EFFECTS } from './effect-ledgers.mjs';
import { createModelExecutorFactory } from './agent-model-executor-factory.mjs';
import { redactSecrets } from './secret-patterns.mjs';

export const FRONTIER_CALLABILITY_PROVENANCE_VERSION = 'uberbond.frontier-callability-provenance-1.1.0';
export const FRONTIER_CALLABILITY_PROBE_SCHEMA = 'uberbond.frontier-callability-probe.v1';

const MAX_OBSERVATIONS = 256;
const liveReceipts = new WeakMap();
const nativeFetch = globalThis.fetch;

function text(value, max = 1000) {
  const out = String(value ?? '').trim();
  return out && out.length <= max && redactSecrets(out) === out ? out : null;
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
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
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

function buildReceipt({ observations, sourceRef, observedAt, simulationOnly }) {
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
  const receipt = {
    schemaVersion: FRONTIER_CALLABILITY_PROBE_SCHEMA,
    producerPolicyVersion: FRONTIER_CALLABILITY_PROVENANCE_VERSION,
    generatedAt: producerObservedAt,
    sourceRef: producerSourceRef,
    observations: normalized,
    simulationOnly: simulationOnly === true,
    truthBoundary: 'CALLABLE_NOW_REQUIRES_A_CANONICAL_RUNTIME_PROBE_RECEIPT_WITH_OBSERVED_IDENTITY_AND_PROVIDER_REQUEST_ID; CONFIG_OR_CALLER_LABELS_ARE_NOT_PROOF; SYNTHETIC_RECEIPTS_ARE_NEVER_LIVE_PROOF',
    businessEffectAuthority: 'NONE',
    externalEffectLedger: zeroEffects()
  };
  return { receipt, receiptDigest: sha256(receipt) };
}

// Public raw construction exists only for deterministic software fixtures. It can
// never mint live callability, even if every field and digest is internally valid.
export function buildFrontierCallabilityProbeReceipt({ observations = [], sourceRef, observedAt = new Date() } = {}) {
  const built = buildReceipt({ observations, sourceRef, observedAt, simulationOnly: true });
  if (!built.receipt) return built;
  freeze(built.receipt);
  return envelope({ ok: true, status: 'FRONTIER_CALLABILITY_SYNTHETIC_RECEIPT_READY', simulationOnly: true, ...built });
}

export function validateFrontierCallabilityProbeReceipt({ receipt, receiptDigest, allowSynthetic = true } = {}) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return failure(['probe-receipt-object-required']);
  if (receipt.schemaVersion !== FRONTIER_CALLABILITY_PROBE_SCHEMA || receipt.producerPolicyVersion !== FRONTIER_CALLABILITY_PROVENANCE_VERSION) return failure(['canonical-probe-receipt-schema-and-producer-required']);
  const expectedDigest = text(receiptDigest, 64)?.toLowerCase();
  const actualDigest = sha256(receipt);
  if (!expectedDigest || !/^[a-f0-9]{64}$/.test(expectedDigest) || expectedDigest !== actualDigest) return failure(['probe-receipt-digest-mismatch']);
  const simulationOnly = receipt.simulationOnly === true;
  if (simulationOnly && allowSynthetic !== true) return failure(['synthetic-probe-receipt-not-live-proof']);
  if (!simulationOnly && liveReceipts.get(receipt) !== actualDigest) return failure(['canonical-probe-producer-origin-required']);
  const sourceRef = text(receipt.sourceRef, 1000); const generatedAt = timestamp(receipt.generatedAt);
  if (!sourceRef || !generatedAt || receipt.truthBoundary !== 'CALLABLE_NOW_REQUIRES_A_CANONICAL_RUNTIME_PROBE_RECEIPT_WITH_OBSERVED_IDENTITY_AND_PROVIDER_REQUEST_ID; CONFIG_OR_CALLER_LABELS_ARE_NOT_PROOF; SYNTHETIC_RECEIPTS_ARE_NEVER_LIVE_PROOF') return failure(['canonical-probe-receipt-provenance-invalid']);
  if (!Array.isArray(receipt.observations) || receipt.observations.length === 0 || receipt.observations.length > MAX_OBSERVATIONS) return failure(['bounded-runtime-probe-observations-required']);
  const observations = []; const reasons = []; const ids = new Set();
  for (const [index, raw] of receipt.observations.entries()) {
    const item = normalizeObservation(raw, index);
    if (!item.ok) { reasons.push(...item.reasonCodes); continue; }
    if (ids.has(item.observation.profileId)) reasons.push(`duplicate-probe-profile:${item.observation.profileId}`);
    else { ids.add(item.observation.profileId); observations.push(item.observation); }
  }
  if (reasons.length) return failure(reasons);
  return envelope({
    ok: true,
    status: simulationOnly ? 'FRONTIER_CALLABILITY_SYNTHETIC_RECEIPT_VALID' : 'FRONTIER_CALLABILITY_PROBE_RECEIPT_VALID',
    simulationOnly,
    trustedForLiveExecution: !simulationOnly,
    sourceRef,
    generatedAt,
    receiptDigest: actualDigest,
    observations,
    observationByProfileId: new Map(observations.map(item => [item.profileId, item]))
  });
}

// Canonical live producer. This function itself performs bounded provider calls via
// UberBond's canonical executor factory. A response is live-callable only when the
// transport returns exact model identity AND an authoritative revision.
export async function probeFrontierCallability({ profiles = [], approved = false, costCeilingCents, maxTokens = 96 } = {}) {
  if (approved !== true) return failure(['explicit-inference-probe-approval-required']);
  if (!Array.isArray(profiles) || profiles.length === 0 || profiles.length > 64) return failure(['bounded-profile-list-required']);
  if (!Number.isSafeInteger(costCeilingCents) || costCeilingCents < 0 || costCeilingCents > 1_000_000) return failure(['bounded-probe-budget-required']);
  if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 1_000) return failure(['bounded-probe-output-required']);
  if (typeof nativeFetch !== 'function') return failure(['native-provider-transport-unavailable']);

  const normalizedProfiles = [];
  const ids = new Set();
  for (const raw of profiles) {
    const id = text(raw?.id, 120)?.toLowerCase();
    const provider = text(raw?.provider, 80)?.toLowerCase();
    const model = text(raw?.model, 120);
    const revision = text(raw?.revision, 240);
    const transportProvider = text(raw?.transportProvider, 80)?.toLowerCase();
    const transportModel = text(raw?.transportModel, 160);
    if (!id || ids.has(id) || !provider || !model || !revision || !transportProvider || !transportModel || raw?.enabled === false) return failure(['exact-enabled-frontier-profile-required']);
    ids.add(id);
    normalizedProfiles.push({ id, provider, model, revision, transportProvider, transportModel });
  }

  const reservation = Math.floor(costCeilingCents / normalizedProfiles.length);
  const observations = [];
  let providerCalls = 0;
  const factory = createModelExecutorFactory({ fetchImpl: async (...args) => { providerCalls += 1; return nativeFetch(...args); } });
  for (const profile of normalizedProfiles) {
    let result;
    try {
      const executor = factory({ provider: profile.transportProvider, model: profile.transportModel });
      result = await executor({
        task: { taskId: `frontier-probe-${profile.id}`, objective: 'Return JSON {"status":"AVENGER_READY"}.', consequenceClass: 'LOCAL_PREPARATION' },
        model: profile.transportModel,
        maxTokens,
        costCeilingCents: reservation
      });
    } catch {
      return failure(['canonical-probe-execution-failed'], undefined, { providerCalls });
    }
    if (!result?.ok || result.identityVerification !== 'OBSERVED' || result.model !== profile.transportModel || result.observedRevision !== profile.revision || result.result?.status !== 'AVENGER_READY') {
      return failure(['exact-provider-model-revision-probe-not-observed'], undefined, { providerCalls });
    }
    observations.push({
      profileId: profile.id,
      status: 'CALLABLE_NOW',
      observedProvider: profile.provider,
      observedModel: profile.model,
      observedRevision: result.observedRevision,
      observedTransportProvider: profile.transportProvider,
      observedTransportModel: result.model,
      observedAt: new Date().toISOString(),
      sourceRef: `provider-request://${result.providerRequestId}`,
      providerRequestId: result.providerRequestId,
      identityVerification: 'OBSERVED',
      evidenceClass: 'OBSERVED_RUNTIME'
    });
  }

  const registryDigest = sha256(normalizedProfiles);
  const built = buildReceipt({ observations, sourceRef: `frontier-registry://${registryDigest}`, observedAt: new Date(), simulationOnly: false });
  if (!built.receipt) return built;
  freeze(built.receipt);
  liveReceipts.set(built.receipt, built.receiptDigest);
  return envelope({
    ok: true,
    status: 'FRONTIER_CALLABILITY_PROBE_RECEIPT_READY',
    simulationOnly: false,
    providerCalls,
    receipt: built.receipt,
    receiptDigest: built.receiptDigest,
    externalEffectLedger: { ...zeroEffects(), providerCalls }
  });
}
